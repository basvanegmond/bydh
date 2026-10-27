import type { Floor, Id, Vec2, Wall } from '../schema/types';
import { intersectLines } from '../geometry/segment';
import { add, angleOf, distance, dot, normalize, perpLeft, scale, sub } from '../geometry/vec2';
import { nodePosition, wallLength } from './walls';

/**
 * Wall footprints with mitred joins. "Left" and "right" are in the wall's own frame,
 * looking from its start node to its end node.
 */
export interface WallOutline {
  wallId: Id;
  startLeft: Vec2;
  startRight: Vec2;
  endLeft: Vec2;
  endRight: Vec2;
  /** Counter-clockwise: startRight → endRight → endLeft → startLeft. */
  polygon: [Vec2, Vec2, Vec2, Vec2];
}

/** How far the wall extends to its left and right of the node line. */
export function wallExtents(wall: Wall): { left: number; right: number } {
  switch (wall.justification) {
    case 'left':
      return { left: 0, right: wall.thickness };
    case 'right':
      return { left: wall.thickness, right: 0 };
    default:
      return { left: wall.thickness / 2, right: wall.thickness / 2 };
  }
}

interface Incidence {
  wall: Wall;
  isStart: boolean;
  /** Unit direction pointing away from the node along the wall. */
  dir: Vec2;
  /** Length of the wall (mm). */
  length: number;
  /** Extents relative to the outgoing direction. */
  left: number;
  right: number;
}

/** Mitre corners further than this × the thicker wall from the node fall back to square ends. */
const MITRE_LIMIT = 4;

/** Walls touching each node, built once per floor so corner joins do not rescan every wall. */
function wallsByNode(floor: Floor): Map<Id, Wall[]> {
  const byNode = new Map<Id, Wall[]>();
  for (const wall of Object.values(floor.walls)) {
    for (const nodeId of [wall.startNodeId, wall.endNodeId]) {
      const list = byNode.get(nodeId);
      if (list) list.push(wall);
      else byNode.set(nodeId, [wall]);
    }
  }
  return byNode;
}

function incidencesAt(floor: Floor, nodeId: Id, walls: Wall[]): Incidence[] {
  const origin = nodePosition(floor, nodeId);
  const result: Incidence[] = [];
  for (const wall of walls) {
    const isStart = wall.startNodeId === nodeId;
    if (!isStart && wall.endNodeId !== nodeId) continue;
    const other = nodePosition(floor, isStart ? wall.endNodeId : wall.startNodeId);
    const { left, right } = wallExtents(wall);
    result.push({
      wall,
      isStart,
      dir: normalize(sub(other, origin)),
      length: wallLength(floor, wall),
      left: isStart ? left : right,
      right: isStart ? right : left,
    });
  }
  return result.sort((a, b) => angleOf(a.dir) - angleOf(b.dir));
}

type Corners = Partial<Omit<WallOutline, 'wallId' | 'polygon'>>;

function assign(corners: Map<Id, Corners>, inc: Incidence, side: 'left' | 'right', p: Vec2): void {
  const entry = corners.get(inc.wall.id) ?? {};
  // Outgoing-left at the start node is the wall's left; at the end node it is the wall's right.
  if (inc.isStart) entry[side === 'left' ? 'startLeft' : 'startRight'] = p;
  else entry[side === 'left' ? 'endRight' : 'endLeft'] = p;
  corners.set(inc.wall.id, entry);
}

const leftEdgePoint = (n: Vec2, inc: Incidence) => add(n, scale(perpLeft(inc.dir), inc.left));
const rightEdgePoint = (n: Vec2, inc: Incidence) => add(n, scale(perpLeft(inc.dir), -inc.right));

function joinNode(floor: Floor, nodeId: Id, walls: Wall[], corners: Map<Id, Corners>): void {
  const n = nodePosition(floor, nodeId);
  const incs = incidencesAt(floor, nodeId, walls);
  if (incs.length === 1) {
    assign(corners, incs[0]!, 'left', leftEdgePoint(n, incs[0]!));
    assign(corners, incs[0]!, 'right', rightEdgePoint(n, incs[0]!));
    return;
  }
  // Between each wall and its counter-clockwise neighbour, its left edge meets the neighbour's right edge.
  for (let i = 0; i < incs.length; i++) {
    const current = incs[i]!;
    const next = incs[(i + 1) % incs.length]!;
    const leftStart = leftEdgePoint(n, current);
    const rightStart = rightEdgePoint(n, next);
    const corner = intersectLines(leftStart, current.dir, rightStart, next.dir);
    const limit = MITRE_LIMIT * Math.max(current.wall.thickness, next.wall.thickness);
    // A mitre corner lying past the far end of a short wall would invert its outline.
    const reach = (inc: Incidence) => (corner ? dot(sub(corner, n), inc.dir) : 0);
    const withinWalls = reach(current) <= current.length && reach(next) <= next.length;
    if (corner && withinWalls && distance(corner, n) <= limit) {
      assign(corners, current, 'left', corner);
      assign(corners, next, 'right', corner);
    } else {
      assign(corners, current, 'left', leftStart);
      assign(corners, next, 'right', rightStart);
    }
  }
}

export function computeWallOutlines(floor: Floor): Record<Id, WallOutline> {
  const corners = new Map<Id, Corners>();
  const byNode = wallsByNode(floor);
  for (const nodeId of Object.keys(floor.wallNodes)) {
    const walls = byNode.get(nodeId);
    if (walls) joinNode(floor, nodeId, walls, corners);
  }
  const outlines: Record<Id, WallOutline> = {};
  for (const wall of Object.values(floor.walls)) {
    const c = corners.get(wall.id);
    if (!c?.startLeft || !c.startRight || !c.endLeft || !c.endRight) continue;
    outlines[wall.id] = {
      wallId: wall.id,
      startLeft: c.startLeft,
      startRight: c.startRight,
      endLeft: c.endLeft,
      endRight: c.endRight,
      polygon: [c.startRight, c.endRight, c.endLeft, c.startLeft],
    };
  }
  return outlines;
}

import { newId } from '../schema/factories';
import type { Floor, FloorFinish, Id, Polygon, Room, Vec2 } from '../schema/types';
import {
  area,
  dedupe,
  interiorPoint,
  pointInPolygon,
  pointInPolygonWithHoles,
  signedArea,
} from '../geometry/polygon';
import { angleOf, sub } from '../geometry/vec2';
import { computeWallOutlines } from './outlines';
import type { WallOutline } from './outlines';
import { nodePosition } from './walls';

/** Enclosed spaces smaller than this (mm², 0.25 m²) are gaps between walls, not rooms. */
export const MIN_ROOM_AREA = 250_000;

export const DEFAULT_FLOOR_FINISH: FloorFinish = {
  materialId: 'oak-plank',
  pattern: 'plank',
  module: { length: 1800, width: 190 },
  rotationDeg: 0,
};

interface HalfEdge {
  from: Id;
  to: Id;
  wallId: Id;
}

/** A face of the wall graph. Positive faces are enclosed spaces; negative ones are outer boundaries. */
interface Face {
  edges: HalfEdge[];
  /** Polygon through the node positions (tiles the plane; used to match room anchors). */
  nodeLoop: Polygon;
  /** Polygon along the wall faces (the visible floor area). */
  interior: Polygon;
  signedNodeArea: number;
  /** Connected group of walls this face belongs to. */
  component: Id;
}

export interface RoomFace {
  nodeLoop: Polygon;
  holeLoops: Polygon[];
  polygon: Polygon;
  holes: Polygon[];
  /** Net floor area in mm² (walls and islands excluded). */
  area: number;
}

export interface RoomGeometry extends RoomFace {
  roomId: Id;
  labelPoint: Vec2;
}

function outgoingEdges(floor: Floor): Map<Id, (HalfEdge & { angle: number })[]> {
  const out = new Map<Id, (HalfEdge & { angle: number })[]>();
  const push = (from: Id, to: Id, wallId: Id) => {
    const angle = angleOf(sub(nodePosition(floor, to), nodePosition(floor, from)));
    out.set(from, [...(out.get(from) ?? []), { from, to, wallId, angle }]);
  };
  for (const wall of Object.values(floor.walls)) {
    push(wall.startNodeId, wall.endNodeId, wall.id);
    push(wall.endNodeId, wall.startNodeId, wall.id);
  }
  for (const list of out.values()) list.sort((a, b) => a.angle - b.angle);
  return out;
}

/** The two corners of the wall face that lies to the left of a half-edge. */
function faceSide(edge: HalfEdge, outline: WallOutline, floor: Floor): [Vec2, Vec2] {
  const forward = floor.walls[edge.wallId]!.startNodeId === edge.from;
  return forward ? [outline.startLeft, outline.endLeft] : [outline.endRight, outline.startRight];
}

/** Union-find over nodes: maps every node to a representative of its connected wall group. */
function components(floor: Floor): Map<Id, Id> {
  const parent = new Map<Id, Id>();
  const find = (id: Id): Id => {
    let root = id;
    while (parent.get(root) !== undefined && parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  for (const id of Object.keys(floor.wallNodes)) parent.set(id, id);
  for (const wall of Object.values(floor.walls)) parent.set(find(wall.startNodeId), find(wall.endNodeId));
  const result = new Map<Id, Id>();
  for (const id of Object.keys(floor.wallNodes)) result.set(id, find(id));
  return result;
}

/** Traces every face by always taking the next edge clockwise, keeping the face on the left. */
function traceFaces(floor: Floor): Face[] {
  const out = outgoingEdges(floor);
  const componentOf = components(floor);
  const outlines = computeWallOutlines(floor);
  const visited = new Set<string>();
  const key = (e: HalfEdge) => `${e.from}>${e.to}>${e.wallId}`;
  const faces: Face[] = [];

  for (const list of out.values()) {
    for (const first of list) {
      if (visited.has(key(first))) continue;
      const edges: HalfEdge[] = [];
      let edge: HalfEdge = first;
      while (!visited.has(key(edge))) {
        visited.add(key(edge));
        edges.push(edge);
        const atTo = out.get(edge.to)!;
        const back = atTo.findIndex((e) => e.to === edge.from && e.wallId === edge.wallId);
        edge = atTo[(back - 1 + atTo.length) % atTo.length]!;
      }
      const nodeLoop = edges.map((e) => nodePosition(floor, e.from));
      const interior = dedupe(
        edges.flatMap((e) => {
          const outline = outlines[e.wallId];
          return outline ? faceSide(e, outline, floor) : [];
        }),
      );
      faces.push({
        edges,
        nodeLoop,
        interior,
        signedNodeArea: signedArea(nodeLoop),
        component: componentOf.get(first.from)!,
      });
    }
  }
  return faces;
}

/** Enclosed spaces of a floor, with free-standing wall islands cut out as holes. */
export function detectRoomFaces(floor: Floor): RoomFace[] {
  const faces = traceFaces(floor);
  const enclosed = faces.filter((f) => f.signedNodeArea > 0 && signedArea(f.interior) > MIN_ROOM_AREA);
  const result: (RoomFace & { component: Id })[] = enclosed.map((f) => ({
    component: f.component,
    nodeLoop: f.nodeLoop,
    holeLoops: [],
    polygon: f.interior,
    holes: [],
    area: signedArea(f.interior),
  }));
  // Each connected group of walls has one negative (outer) face. If it sits inside a room of
  // another group, it is an island (e.g. a free-standing cupboard block) and becomes a hole.
  for (const outer of faces.filter((f) => f.signedNodeArea < 0)) {
    const probe = outer.nodeLoop[0];
    if (!probe) continue;
    const host = result
      .filter((r) => r.component !== outer.component && pointInPolygon(probe, r.nodeLoop))
      .sort((a, b) => area(a.nodeLoop) - area(b.nodeLoop))[0];
    if (!host) continue;
    host.holeLoops.push(outer.nodeLoop);
    host.holes.push(outer.interior);
    host.area -= area(outer.interior);
  }
  return result.map(({ component, ...face }) => face);
}

const faceContains = (face: RoomFace, p: Vec2) => pointInPolygonWithHoles(p, face.nodeLoop, face.holeLoops);

/**
 * Keeps floor.rooms in step with the walls: every enclosed space has exactly one room.
 * A room keeps its identity (name, finish) while its anchor stays inside its space; when a wall
 * splits a space, the half without the anchor becomes a new room; when spaces merge, the first
 * room wins; rooms whose space disappeared are removed.
 */
export function syncRooms(floor: Floor, defaultFinish: FloorFinish = DEFAULT_FLOOR_FINISH): void {
  const faces = detectRoomFaces(floor);
  const kept = new Set<Id>();
  for (const face of faces) {
    const candidates = Object.values(floor.rooms).filter(
      (r) => !kept.has(r.id) && faceContains(face, r.anchor),
    );
    const keeper = candidates[0];
    if (keeper) {
      kept.add(keeper.id);
      if (!pointInPolygonWithHoles(keeper.anchor, face.polygon, face.holes)) {
        keeper.anchor = interiorPoint(face.polygon, face.holes);
      }
      continue;
    }
    const room: Room = {
      id: newId(),
      name: '',
      anchor: interiorPoint(face.polygon, face.holes),
      floorFinish: structuredClone(defaultFinish),
    };
    floor.rooms[room.id] = room;
    kept.add(room.id);
  }
  for (const id of Object.keys(floor.rooms)) if (!kept.has(id)) delete floor.rooms[id];
}

/** Geometry for each room of a floor (derived; never stored). */
export function computeRoomGeometry(floor: Floor): Record<Id, RoomGeometry> {
  const faces = detectRoomFaces(floor);
  const result: Record<Id, RoomGeometry> = {};
  for (const room of Object.values(floor.rooms)) {
    const face = faces.find((f) => faceContains(f, room.anchor));
    if (!face) continue;
    result[room.id] = { ...face, roomId: room.id, labelPoint: interiorPoint(face.polygon, face.holes) };
  }
  return result;
}

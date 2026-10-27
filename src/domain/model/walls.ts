import { newId } from '../schema/factories';
import type { Floor, Id, Opening, Vec2, Wall } from '../schema/types';
import { closestPointOnSegment, intersectSegments, projectParam } from '../geometry/segment';
import { add, almostEqual, distance, EPSILON_MM, normalize, scale, sub } from '../geometry/vec2';

/**
 * Wall-graph operations. They mutate a Floor in place, so they work on plain objects in tests
 * and on Immer drafts in the store. Invariant kept by every operation: walls only meet at shared
 * nodes (T and X junctions are split), so the plan stays a planar graph for room detection.
 */

export type WallProps = Pick<Wall, 'thickness' | 'justification'> & Partial<Pick<Wall, 'height' | 'sides'>>;

export const DEFAULT_WALL: WallProps = { thickness: 100, justification: 'center' };

/** Deep copy that also works on Immer drafts (structuredClone rejects proxies). */
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function nodePosition(floor: Floor, nodeId: Id): Vec2 {
  const node = floor.wallNodes[nodeId];
  if (!node) throw new Error(`Unknown wall node ${nodeId}`);
  return node.position;
}

export function wallEnds(floor: Floor, wall: Wall): { a: Vec2; b: Vec2 } {
  return { a: nodePosition(floor, wall.startNodeId), b: nodePosition(floor, wall.endNodeId) };
}

export function wallLength(floor: Floor, wall: Wall): number {
  const { a, b } = wallEnds(floor, wall);
  return distance(a, b);
}

export function wallsAtNode(floor: Floor, nodeId: Id): Wall[] {
  return Object.values(floor.walls).filter((w) => w.startNodeId === nodeId || w.endNodeId === nodeId);
}

export function findNodeAt(floor: Floor, p: Vec2, tolerance = EPSILON_MM): Id | null {
  let best: { id: Id; d: number } | null = null;
  for (const node of Object.values(floor.wallNodes)) {
    const d = distance(node.position, p);
    if (d <= tolerance && (!best || d < best.d)) best = { id: node.id, d };
  }
  return best?.id ?? null;
}

function createNode(floor: Floor, p: Vec2): Id {
  const id = newId();
  floor.wallNodes[id] = { id, position: { x: p.x, y: p.y } };
  return id;
}

function wallBetween(floor: Floor, n1: Id, n2: Id): Wall | undefined {
  return Object.values(floor.walls).find(
    (w) => (w.startNodeId === n1 && w.endNodeId === n2) || (w.startNodeId === n2 && w.endNodeId === n1),
  );
}

function createWall(floor: Floor, start: Id, end: Id, props: WallProps): Id {
  const id = newId();
  floor.walls[id] = {
    id,
    startNodeId: start,
    endNodeId: end,
    thickness: props.thickness,
    justification: props.justification,
    ...(props.height !== undefined ? { height: props.height } : {}),
    sides: props.sides ? clone(props.sides) : { left: {}, right: {} },
  };
  return id;
}

/** Openings narrower than the wall piece they sit on are shifted to fit; pieces shorter than this drop them. */
const MIN_OPENING_HOST_MM = 100;

/** Shrinks/shifts an opening so it lies fully within a wall of the given length; false if it cannot fit. */
function fitOpening(opening: Opening, wallLen: number): boolean {
  if (wallLen < MIN_OPENING_HOST_MM) return false;
  if (opening.width > wallLen) opening.width = wallLen;
  const half = opening.width / 2;
  opening.offset = Math.min(Math.max(opening.offset, half), wallLen - half);
  return true;
}

/** Keeps every opening within its wall (after walls were shortened, split or merged). */
export function fitOpenings(floor: Floor): void {
  for (const opening of Object.values(floor.openings)) {
    const wall = floor.walls[opening.wallId];
    if (!wall || !floor.wallNodes[wall.startNodeId] || !floor.wallNodes[wall.endNodeId]) continue;
    if (!fitOpening(opening, wallLength(floor, wall))) delete floor.openings[opening.id];
  }
}

/** Splits a wall at an existing node lying on it; openings follow the piece holding their centre. */
export function splitWallAtNode(floor: Floor, wallId: Id, nodeId: Id): void {
  const wall = floor.walls[wallId];
  if (!wall) throw new Error(`Unknown wall ${wallId}`);
  const { a } = wallEnds(floor, wall);
  const splitAt = distance(a, nodePosition(floor, nodeId));
  const newWallId = newId();
  floor.walls[newWallId] = { ...clone(wall), id: newWallId, startNodeId: nodeId };
  wall.endNodeId = nodeId;
  for (const opening of Object.values(floor.openings)) {
    if (opening.wallId === wallId && opening.offset > splitAt) {
      opening.wallId = newWallId;
      opening.offset -= splitAt;
    }
  }
  fitOpenings(floor);
}

/** Splits a wall at the point closest to `p`; openings move to the piece holding their centre. */
export function splitWall(floor: Floor, wallId: Id, p: Vec2): Id {
  const wall = floor.walls[wallId];
  if (!wall) throw new Error(`Unknown wall ${wallId}`);
  const { a, b } = wallEnds(floor, wall);
  const { point } = closestPointOnSegment(p, a, b);
  if (almostEqual(point, a)) return wall.startNodeId;
  if (almostEqual(point, b)) return wall.endNodeId;
  const nodeId = createNode(floor, point);
  splitWallAtNode(floor, wallId, nodeId);
  return nodeId;
}

/** Existing node near p, else a split point on a wall near p, else a new node. */
export function ensureNodeAt(floor: Floor, p: Vec2, tolerance = EPSILON_MM): Id {
  const existing = findNodeAt(floor, p, tolerance);
  if (existing) return existing;
  for (const wall of Object.values(floor.walls)) {
    const { a, b } = wallEnds(floor, wall);
    const { point, t } = closestPointOnSegment(p, a, b);
    if (t > 0 && t < 1 && distance(point, p) <= tolerance) return splitWall(floor, wall.id, point);
  }
  return createNode(floor, p);
}

/**
 * Adds a straight wall from a to b. Endpoints snap onto nodes or walls within `tolerance`;
 * the new wall is split wherever it crosses or touches existing walls and nodes.
 * Returns the ids of the created wall pieces (empty when a == b or all pieces already existed).
 */
export function addWall(
  floor: Floor,
  a: Vec2,
  b: Vec2,
  props: WallProps = DEFAULT_WALL,
  tolerance = EPSILON_MM,
): Id[] {
  const startId = ensureNodeAt(floor, a, tolerance);
  const endId = ensureNodeAt(floor, b, tolerance);
  if (startId === endId) return [];
  const start = nodePosition(floor, startId);
  const end = nodePosition(floor, endId);

  const stops: { t: number; nodeId: Id }[] = [
    { t: 0, nodeId: startId },
    { t: 1, nodeId: endId },
  ];
  // Existing nodes lying on the new segment.
  for (const node of Object.values(floor.wallNodes)) {
    if (node.id === startId || node.id === endId) continue;
    const { point, t } = closestPointOnSegment(node.position, start, end);
    if (t > 0 && t < 1 && distance(point, node.position) <= tolerance) stops.push({ t, nodeId: node.id });
  }
  // Crossings with existing walls (not touching our own endpoints).
  for (const wall of Object.values(floor.walls)) {
    if ([wall.startNodeId, wall.endNodeId].some((n) => n === startId || n === endId)) continue;
    const ends = wallEnds(floor, wall);
    const hit = intersectSegments(start, end, ends.a, ends.b, tolerance);
    if (!hit || hit.t <= 0 || hit.t >= 1) continue;
    if (stops.some((s) => almostEqual(nodePosition(floor, s.nodeId), hit.point, tolerance))) continue;
    stops.push({ t: hit.t, nodeId: splitWall(floor, wall.id, hit.point) });
  }

  stops.sort((s1, s2) => s1.t - s2.t);
  const created: Id[] = [];
  for (let i = 0; i + 1 < stops.length; i++) {
    const from = stops[i]!.nodeId;
    const to = stops[i + 1]!.nodeId;
    if (from === to || wallBetween(floor, from, to)) continue;
    created.push(createWall(floor, from, to, props));
  }
  return created;
}

/**
 * Removes walls of zero length and duplicate walls between the same pair of nodes.
 * Openings of a removed duplicate move to the wall that is kept.
 */
export function cleanupWalls(floor: Floor): void {
  const kept = new Map<string, Wall>();
  for (const wall of Object.values(floor.walls)) {
    const key = [wall.startNodeId, wall.endNodeId].sort().join('|');
    const twin = kept.get(key);
    if (wall.startNodeId === wall.endNodeId) {
      removeWallOnly(floor, wall.id);
    } else if (twin) {
      const reversed = twin.startNodeId !== wall.startNodeId;
      const len = wallLength(floor, twin);
      for (const opening of Object.values(floor.openings)) {
        if (opening.wallId !== wall.id) continue;
        opening.wallId = twin.id;
        if (reversed) opening.offset = len - opening.offset;
      }
      removeWallOnly(floor, wall.id);
    } else {
      kept.set(key, wall);
    }
  }
  fitOpenings(floor);
}

function removeWallOnly(floor: Floor, wallId: Id): void {
  delete floor.walls[wallId];
  for (const opening of Object.values(floor.openings)) {
    if (opening.wallId === wallId) delete floor.openings[opening.id];
  }
}

export function removeOrphanNodes(floor: Floor): void {
  const used = new Set(Object.values(floor.walls).flatMap((w) => [w.startNodeId, w.endNodeId]));
  for (const id of Object.keys(floor.wallNodes)) if (!used.has(id)) delete floor.wallNodes[id];
}

/** Moves a node; when it lands on another node (within tolerance) the two are merged. */
export function moveNode(floor: Floor, nodeId: Id, p: Vec2, mergeTolerance = EPSILON_MM): Id {
  const node = floor.wallNodes[nodeId];
  if (!node) throw new Error(`Unknown wall node ${nodeId}`);
  node.position = { x: p.x, y: p.y };
  const other = Object.values(floor.wallNodes).find(
    (n) => n.id !== nodeId && distance(n.position, p) <= mergeTolerance,
  );
  if (!other) {
    fitOpenings(floor);
    return nodeId;
  }
  for (const wall of Object.values(floor.walls)) {
    if (wall.startNodeId === nodeId) wall.startNodeId = other.id;
    if (wall.endNodeId === nodeId) wall.endNodeId = other.id;
  }
  delete floor.wallNodes[nodeId];
  cleanupWalls(floor);
  return other.id;
}

/** Translates a wall (both its nodes); walls sharing those nodes stretch along. */
export function moveWall(floor: Floor, wallId: Id, delta: Vec2): void {
  const wall = floor.walls[wallId];
  if (!wall) throw new Error(`Unknown wall ${wallId}`);
  for (const nodeId of [wall.startNodeId, wall.endNodeId]) {
    const node = floor.wallNodes[nodeId]!;
    node.position = add(node.position, delta);
  }
  fitOpenings(floor);
}

/** Sets a wall's length by moving its end node along the wall direction. */
export function setWallLength(floor: Floor, wallId: Id, length: number): void {
  const wall = floor.walls[wallId];
  if (!wall || length <= 0) return;
  const { a, b } = wallEnds(floor, wall);
  const dir = normalize(sub(b, a));
  floor.wallNodes[wall.endNodeId]!.position = add(a, scale(dir, length));
  fitOpenings(floor);
}

/** Deletes a wall, its openings and any nodes left without walls. */
export function deleteWall(floor: Floor, wallId: Id): void {
  removeWallOnly(floor, wallId);
  removeOrphanNodes(floor);
}

/** Position along a wall (mm from its start node) of the projection of p. */
export function offsetAlongWall(floor: Floor, wall: Wall, p: Vec2): number {
  const { a, b } = wallEnds(floor, wall);
  return projectParam(p, a, b) * distance(a, b);
}

import type { Floor, Id, Wall } from '../schema/types';
import { closestPointOnSegment, intersectSegments } from '../geometry/segment';
import { distance, EPSILON_MM } from '../geometry/vec2';
import { newId } from '../schema/factories';
import { cleanupWalls, fitOpenings, removeOrphanNodes, splitWallAtNode, wallEnds } from './walls';

/** Merges nodes closer than `tolerance` (the earliest node wins). */
function mergeCoincidentNodes(floor: Floor, tolerance: number): void {
  const kept: Id[] = [];
  for (const node of Object.values(floor.wallNodes)) {
    const target = kept.find((id) => distance(floor.wallNodes[id]!.position, node.position) <= tolerance);
    if (!target) {
      kept.push(node.id);
      continue;
    }
    for (const wall of Object.values(floor.walls)) {
      if (wall.startNodeId === node.id) wall.startNodeId = target;
      if (wall.endNodeId === node.id) wall.endNodeId = target;
    }
    delete floor.wallNodes[node.id];
  }
}

/** Splits one wall at a node lying on its interior; true when something changed. */
function splitNodeOnWall(floor: Floor, tolerance: number): boolean {
  for (const wall of Object.values(floor.walls)) {
    const { a, b } = wallEnds(floor, wall);
    for (const node of Object.values(floor.wallNodes)) {
      if (node.id === wall.startNodeId || node.id === wall.endNodeId) continue;
      const { point, t } = closestPointOnSegment(node.position, a, b);
      if (t > 0 && t < 1 && distance(point, node.position) <= tolerance) {
        splitWallAtNode(floor, wall.id, node.id);
        return true;
      }
    }
  }
  return false;
}

const interior = (t: number, len: number, tolerance: number) =>
  t * len > tolerance && (1 - t) * len > tolerance;

function crossingOf(floor: Floor, w1: Wall, w2: Wall, tolerance: number) {
  if ([w1.startNodeId, w1.endNodeId].some((n) => n === w2.startNodeId || n === w2.endNodeId)) return null;
  const e1 = wallEnds(floor, w1);
  const e2 = wallEnds(floor, w2);
  const hit = intersectSegments(e1.a, e1.b, e2.a, e2.b, tolerance);
  if (!hit) return null;
  if (!interior(hit.t, distance(e1.a, e1.b), tolerance)) return null;
  if (!interior(hit.u, distance(e2.a, e2.b), tolerance)) return null;
  return hit;
}

/** Splits one pair of crossing walls at a new shared node; true when something changed. */
function splitOneCrossing(floor: Floor, tolerance: number): boolean {
  const walls = Object.values(floor.walls);
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      const hit = crossingOf(floor, walls[i]!, walls[j]!, tolerance);
      if (!hit) continue;
      const id = newId();
      floor.wallNodes[id] = { id, position: { x: hit.point.x, y: hit.point.y } };
      splitWallAtNode(floor, walls[i]!.id, id);
      splitWallAtNode(floor, walls[j]!.id, id);
      return true;
    }
  }
  return false;
}

/**
 * Restores the wall-graph invariant "walls meet only at shared nodes": merges coincident nodes,
 * splits walls at nodes lying on them and at wall-wall crossings, drops duplicate and zero-length
 * walls (their openings move to the surviving wall) and keeps openings within their walls.
 * Mutates the floor in place; idempotent. Call before syncRooms after any node/wall move.
 */
export function normalizeFloor(floor: Floor, tolerance: number = EPSILON_MM): void {
  mergeCoincidentNodes(floor, tolerance);
  cleanupWalls(floor);
  for (let i = 0; i < 10_000; i++) {
    if (!splitNodeOnWall(floor, tolerance) && !splitOneCrossing(floor, tolerance)) break;
    cleanupWalls(floor);
  }
  removeOrphanNodes(floor);
  fitOpenings(floor);
}

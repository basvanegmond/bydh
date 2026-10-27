import type { Floor, Id, Opening, Vec2, Wall } from '../schema/types';
import { closestPointOnSegment } from '../geometry/segment';
import { add, distance, normalize, perpLeft, scale, sub } from '../geometry/vec2';
import { wallExtents } from './outlines';
import { wallEnds, wallLength } from './walls';

/** Wall kept free on both sides of an opening placed by the tools. */
export const OPENING_END_MARGIN_MM = 100;

/** Walls shorter than this cannot host an opening in the tools (margins plus a minimal opening). */
export const MIN_HOST_WALL_MM = 2 * OPENING_END_MARGIN_MM + 200;

/** What a tool places: an Opening without identity or position. */
export interface OpeningSpec {
  width: number;
  height: number;
  sillHeight: number;
  spec: Opening['spec'];
}

/** The result of placing a spec: a complete Opening apart from its id. */
export type PlacedOpening = Omit<Opening, 'id'>;

export const DEFAULT_DOOR: OpeningSpec = {
  width: 930,
  height: 2315,
  sillHeight: 0,
  spec: { type: 'door', operation: 'swing', hinge: 'left', opensTo: 'left' },
};

export const DEFAULT_WINDOW: OpeningSpec = {
  width: 1200,
  height: 1200,
  sillHeight: 900,
  spec: { type: 'window', operation: 'casement' },
};

/** A solid rectangle of a wall in wall-local coordinates (along the axis, and vertical), in mm. */
export interface WallPiece {
  kind: 'full' | 'below' | 'above';
  x0: number;
  x1: number;
  z0: number;
  /** Top at x0. */
  z1: number;
  /** Top at x1 (differs from z1 only where a ceiling hook slopes the wall top). */
  z1End: number;
}

export type CeilingHeightAt = (alongMm: number) => number;

export function defaultWallHeight(floor: Floor, wall: Wall): number {
  return wall.height ?? floor.height - floor.slabThickness;
}

interface Span {
  start: number;
  end: number;
  opening: Opening;
}

function openingSpans(openings: Opening[], length: number): Span[] {
  return openings
    .map((opening) => ({
      start: Math.max(0, opening.offset - opening.width / 2),
      end: Math.min(length, opening.offset + opening.width / 2),
      opening,
    }))
    .filter((s) => s.end > s.start)
    .sort((a, b) => a.start - b.start);
}

function makePiece(
  kind: WallPiece['kind'],
  x0: number,
  x1: number,
  z0: number,
  tops: [number, number],
): WallPiece | null {
  const [t0, t1] = tops;
  if (x1 - x0 <= 0 || (t0 <= z0 && t1 <= z0)) return null;
  return { kind, x0, x1, z0, z1: Math.max(t0, z0), z1End: Math.max(t1, z0) };
}

/**
 * Solid parts of a wall in wall-local coordinates: full-height pieces between openings, a piece below
 * each sill and a piece above each head. `ceilingHeightAt` caps the wall top (default: constant height).
 */
export function wallPieces(
  floor: Floor,
  wallOrId: Wall | Id,
  openings: Opening[] = Object.values(floor.openings),
  ceilingHeightAt?: CeilingHeightAt,
): WallPiece[] {
  const wall = typeof wallOrId === 'string' ? floor.walls[wallOrId] : wallOrId;
  if (!wall) return [];
  const length = wallLength(floor, wall);
  const wallHeight = defaultWallHeight(floor, wall);
  const topAt = (x: number) => Math.min(wallHeight, ceilingHeightAt ? ceilingHeightAt(x) : wallHeight);
  const tops = (x0: number, x1: number): [number, number] => [topAt(x0), topAt(x1)];
  const spans = openingSpans(
    openings.filter((o) => o.wallId === wall.id),
    length,
  );
  const pieces: (WallPiece | null)[] = [];
  let cursor = 0;
  for (const { start, end, opening } of spans) {
    pieces.push(makePiece('full', cursor, start, 0, tops(cursor, start)));
    pieces.push(makePiece('below', start, end, 0, [opening.sillHeight, opening.sillHeight]));
    const head = opening.sillHeight + opening.height;
    pieces.push(makePiece('above', start, end, head, tops(start, end)));
    cursor = Math.max(cursor, end);
  }
  pieces.push(makePiece('full', cursor, length, 0, tops(cursor, length)));
  return pieces.filter((p): p is WallPiece => p !== null);
}

/** Opening rectangle in plot space; corners counter-clockwise: startRight, endRight, endLeft, startLeft. */
export function openingRect(floor: Floor, opening: Opening): [Vec2, Vec2, Vec2, Vec2] | null {
  const wall = floor.walls[opening.wallId];
  if (!wall || !floor.wallNodes[wall.startNodeId] || !floor.wallNodes[wall.endNodeId]) return null;
  const { a, b } = wallEnds(floor, wall);
  const dir = normalize(sub(b, a));
  const left = perpLeft(dir);
  const { left: extLeft, right: extRight } = wallExtents(wall);
  const at = (along: number, side: number) => add(add(a, scale(dir, along)), scale(left, side));
  const s = opening.offset - opening.width / 2;
  const e = opening.offset + opening.width / 2;
  return [at(s, -extRight), at(e, -extRight), at(e, extLeft), at(s, extLeft)];
}

export interface WallHit {
  wallId: Id;
  /** Distance along the wall from its start node to the projected point. */
  offset: number;
  distance: number;
}

/** Closest wall to a point within the tolerance; walls too short to host an opening are ignored. */
export function nearestWall(floor: Floor, point: Vec2, toleranceMm: number): WallHit | null {
  let best: WallHit | null = null;
  for (const wall of Object.values(floor.walls)) {
    if (!floor.wallNodes[wall.startNodeId] || !floor.wallNodes[wall.endNodeId]) continue;
    const length = wallLength(floor, wall);
    if (length < MIN_HOST_WALL_MM) continue;
    const { a, b } = wallEnds(floor, wall);
    const { point: closest, t } = closestPointOnSegment(point, a, b);
    const d = distance(point, closest);
    if (d <= toleranceMm && (!best || d < best.distance))
      best = { wallId: wall.id, offset: t * length, distance: d };
  }
  return best;
}

/** Free stretches of a wall: between the end margins and the other openings, in order along the wall. */
function freeGaps(floor: Floor, wallId: Id, length: number, ignoreId?: Id): [number, number][] {
  const taken = Object.values(floor.openings)
    .filter((o) => o.wallId === wallId && o.id !== ignoreId)
    .map((o): [number, number] => [o.offset - o.width / 2, o.offset + o.width / 2])
    .sort((p, q) => p[0] - q[0]);
  const gaps: [number, number][] = [];
  let cursor = OPENING_END_MARGIN_MM;
  for (const [s, e] of taken) {
    if (s > cursor) gaps.push([cursor, s]);
    cursor = Math.max(cursor, e);
  }
  if (length - OPENING_END_MARGIN_MM > cursor) gaps.push([cursor, length - OPENING_END_MARGIN_MM]);
  return gaps;
}

/**
 * Places a spec on a wall as close to `offset` (the centre) as possible: never overlapping another
 * opening, keeping OPENING_END_MARGIN_MM of wall at both ends. Null when no free position fits.
 * Pass `ignoreId` when moving an existing opening so it does not block itself.
 */
export function placeOpening(
  floor: Floor,
  spec: OpeningSpec,
  wallId: Id,
  offset: number,
  ignoreId?: Id,
): PlacedOpening | null {
  const wall = floor.walls[wallId];
  if (!wall || !floor.wallNodes[wall.startNodeId] || !floor.wallNodes[wall.endNodeId]) return null;
  const half = spec.width / 2;
  let best: number | null = null;
  for (const [g0, g1] of freeGaps(floor, wallId, wallLength(floor, wall), ignoreId)) {
    if (g1 - g0 < spec.width) continue;
    const centre = Math.min(Math.max(offset, g0 + half), g1 - half);
    if (best === null || Math.abs(centre - offset) < Math.abs(best - offset)) best = centre;
  }
  if (best === null) return null;
  return {
    wallId,
    offset: best,
    width: spec.width,
    height: spec.height,
    sillHeight: spec.sillHeight,
    spec: { ...spec.spec },
  };
}

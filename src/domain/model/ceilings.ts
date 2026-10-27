import { area, pointInPolygon, signedArea } from '../geometry/polygon';
import { dot, normalize, perpLeft, sub, toRadians } from '../geometry/vec2';
import { newId } from '../schema/factories';
import type { CeilingPlane, Floor, Polygon, Vec2, Wall } from '../schema/types';
import { floorGeometry } from './floorGeometry';
import { wallExtents } from './outlines';
import { detectRoomFaces } from './rooms';
import { wallEnds, wallLength } from './walls';

/** Flat ceiling height of a floor without sloped planes (floor-to-floor height minus the slab). */
export const flatCeilingHeight = (floor: Pick<Floor, 'height' | 'slabThickness'>): number =>
  floor.height - floor.slabThickness;

/** Unit normal pointing to the rising side of the plane eave line. */
function risingNormal(plane: CeilingPlane): Vec2 {
  const n = perpLeft(normalize(sub(plane.eave.b, plane.eave.a)));
  return plane.risesToward === 'left' ? n : { x: -n.x, y: -n.y };
}

/** Signed distance (mm) from the eave line toward the rising side; negative on the low side. */
export function distanceFromEave(plane: CeilingPlane, point: Vec2): number {
  return dot(sub(point, plane.eave.a), risingNormal(plane));
}

/** True when the plane applies at the point: on the rising side of the eave line and inside `extent`. */
export function planeCovers(plane: CeilingPlane, point: Vec2): boolean {
  if (distanceFromEave(plane, point) < 0) return false;
  return !plane.extent || plane.extent.length < 3 || pointInPolygon(point, plane.extent);
}

/** Height (mm, from the floor level) of the plane surface at the point; ignores coverage. */
export function planeHeightAt(plane: CeilingPlane, point: Vec2): number {
  return plane.kneeHeight + Math.tan(toRadians(plane.slopeDeg)) * distanceFromEave(plane, point);
}

/** Lowest height over the covering planes, else the flat ceiling `height - slabThickness`. */
export function ceilingHeightAt(floor: Floor, point: Vec2): number {
  let result = flatCeilingHeight(floor);
  for (const plane of Object.values(floor.ceilingPlanes)) {
    if (planeCovers(plane, point)) result = Math.min(result, planeHeightAt(plane, point));
  }
  return result;
}

/** Top of a wall (mm) at `alongMm` from its start node, clipped by the ceiling planes. */
export function wallTopAt(floor: Floor, wall: Wall, alongMm: number): number {
  return wallCeilingHook(floor, wall, wallEnds(floor, wall))(alongMm);
}

/**
 * Hook for wall pieces: `(alongMm) => top` for one wall, sampled on the wall axis between `nodes.a`
 * (start) and `nodes.b` (end). The top is the wall own `height` (default: the flat ceiling height),
 * lowered by every ceiling plane that covers the sampled point.
 */
export function wallCeilingHook(
  floor: Floor,
  wall: Pick<Wall, 'height'>,
  nodes: { a: Vec2; b: Vec2 },
): (alongMm: number) => number {
  const planes = Object.values(floor.ceilingPlanes);
  const base = wall.height ?? flatCeilingHeight(floor);
  const length = Math.hypot(nodes.b.x - nodes.a.x, nodes.b.y - nodes.a.y);
  const ux = length > 0 ? (nodes.b.x - nodes.a.x) / length : 0;
  const uy = length > 0 ? (nodes.b.y - nodes.a.y) / length : 0;
  return (alongMm) => {
    const t = Math.min(Math.max(alongMm, 0), length);
    const p = { x: nodes.a.x + ux * t, y: nodes.a.y + uy * t };
    let top = base;
    for (const plane of planes) if (planeCovers(plane, p)) top = Math.min(top, planeHeightAt(plane, p));
    return top;
  };
}

/* ---------- Half-plane clipping ---------- */

/** Keeps points where `dot(n, p) - c >= 0`. */
interface HalfPlane {
  n: Vec2;
  c: number;
}

const side = (h: HalfPlane, p: Vec2): number => dot(h.n, p) - h.c;

/** Sutherland-Hodgman clip of a polygon (convex or not) against one half-plane. */
export function clipHalfPlane(polygon: Polygon, h: HalfPlane): Polygon {
  const out: Polygon = [];
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const sp = side(h, p);
    const sq = side(h, q);
    if (sp >= 0) out.push(p);
    if (sp >= 0 !== sq >= 0) {
      const t = sp / (sp - sq);
      out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
    }
  }
  return out;
}

const flip = (h: HalfPlane): HalfPlane => ({ n: { x: -h.n.x, y: -h.n.y }, c: -h.c });

/** Half-planes of the (convex) region where the plane applies and its ceiling is below `thresholdMm`. */
function lowRegion(plane: CeilingPlane, thresholdMm: number): HalfPlane[] | null {
  if (thresholdMm <= plane.kneeHeight) return null;
  const n = risingNormal(plane);
  const base = dot(n, plane.eave.a);
  const dMax = (thresholdMm - plane.kneeHeight) / Math.tan(toRadians(plane.slopeDeg));
  const region: HalfPlane[] = [
    { n, c: base },
    { n: { x: -n.x, y: -n.y }, c: -(base + dMax) },
  ];
  const extent = plane.extent;
  if (extent && extent.length >= 3) {
    const sign = signedArea(extent) >= 0 ? 1 : -1;
    extent.forEach((a, i) => {
      const b = extent[(i + 1) % extent.length]!;
      const inward = perpLeft(normalize(sub(b, a)));
      const m = { x: inward.x * sign, y: inward.y * sign };
      region.push({ n: m, c: dot(m, a) });
    });
  }
  return region;
}

const clipAll = (polygon: Polygon, region: HalfPlane[]): Polygon =>
  region.reduce((poly, h) => (poly.length < 3 ? poly : clipHalfPlane(poly, h)), polygon);

/** polygon minus a convex region, as disjoint pieces. */
function subtractConvex(polygon: Polygon, region: HalfPlane[]): Polygon[] {
  const pieces: Polygon[] = [];
  let inside = polygon;
  for (const h of region) {
    const outside = clipHalfPlane(inside, flip(h));
    if (outside.length >= 3) pieces.push(outside);
    inside = clipHalfPlane(inside, h);
    if (inside.length < 3) break;
  }
  return pieces;
}

const MIN_AREA_MM2 = 1;
const significant = (polygons: Polygon[]): Polygon[] =>
  polygons.filter((p) => p.length >= 3 && area(p) > MIN_AREA_MM2);

/** Room outlines (inside the walls) of a floor, from the shared floor geometry. */
function roomPolygons(floor: Floor): Polygon[] {
  return Object.values(floorGeometry(floor).rooms).map((room) => room.polygon);
}

/**
 * Parts of the floor footprint (the room polygons) where the ceiling is lower than `thresholdMm`.
 * The low region of one plane is a half-plane strip, so each plane region is clipped out of every
 * room by Sutherland-Hodgman. Polygons are returned per plane and per room, NOT unioned: where two
 * planes' low regions overlap (a very narrow attic) the results overlap too. `usableArea` is exact.
 * Hole islands in a room are ignored. If the flat ceiling itself is below the threshold, the whole
 * footprint is returned. An `extent` polygon on a plane must be convex.
 */
export function headroomAreas(floor: Floor, thresholdMm: number): Polygon[] {
  const rooms = roomPolygons(floor);
  if (flatCeilingHeight(floor) < thresholdMm) return significant(rooms);
  const result: Polygon[] = [];
  for (const plane of Object.values(floor.ceilingPlanes)) {
    const region = lowRegion(plane, thresholdMm);
    if (!region) continue;
    for (const room of rooms) result.push(clipAll(room, region));
  }
  return significant(result);
}

/** Area (mm²) of a room polygon where the ceiling is at least `minHeightMm` (room area minus headroom). */
export function usableArea(roomPolygon: Polygon, floor: Floor, minHeightMm: number): number {
  if (flatCeilingHeight(floor) < minHeightMm) return 0;
  let pieces: Polygon[] = [roomPolygon];
  for (const plane of Object.values(floor.ceilingPlanes)) {
    const region = lowRegion(plane, minHeightMm);
    if (!region) continue;
    pieces = pieces.flatMap((piece) => subtractConvex(piece, region));
  }
  return significant(pieces).reduce((sum, p) => sum + area(p), 0);
}

/* ---------- Roof from walls ---------- */

interface OuterWall {
  a: Vec2;
  b: Vec2;
  dir: Vec2;
  /** Unit normal pointing into the building. */
  inward: Vec2;
  /** Wall thickness on the outer side of the node line. */
  outerExtent: number;
  length: number;
}

const PARALLEL_SIN = Math.sin(toRadians(10));

/** Walls with a room on exactly one side. */
function outerWalls(floor: Floor): OuterWall[] {
  const loops = detectRoomFaces(floor).map((f) => f.nodeLoop);
  const insideAny = (p: Vec2) => loops.some((loop) => pointInPolygon(p, loop));
  const result: OuterWall[] = [];
  for (const wall of Object.values(floor.walls)) {
    const { a, b } = wallEnds(floor, wall);
    const length = wallLength(floor, wall);
    if (length <= 0) continue;
    const dir = normalize(sub(b, a));
    const left = perpLeft(dir);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const reach = wall.thickness + 50;
    const leftIn = insideAny({ x: mid.x + left.x * reach, y: mid.y + left.y * reach });
    const rightIn = insideAny({ x: mid.x - left.x * reach, y: mid.y - left.y * reach });
    if (leftIn === rightIn) continue;
    const ext = wallExtents(wall);
    result.push({
      a,
      b,
      dir,
      inward: leftIn ? left : { x: -left.x, y: -left.y },
      outerExtent: leftIn ? ext.right : ext.left,
      length,
    });
  }
  return result;
}

const midOf = (w: OuterWall): Vec2 => ({ x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 });

function facing(p: OuterWall, q: OuterWall): boolean {
  const parallel = Math.abs(p.dir.x * q.dir.y - p.dir.y * q.dir.x) <= PARALLEL_SIN;
  return parallel && dot(p.inward, q.inward) < 0 && dot(sub(midOf(q), midOf(p)), p.inward) > 0;
}

function eavePlane(w: OuterWall, kneeHeight: number, slopeDeg: number): CeilingPlane {
  const shift = (v: Vec2): Vec2 => ({
    x: v.x - w.inward.x * w.outerExtent,
    y: v.y - w.inward.y * w.outerExtent,
  });
  return {
    id: newId(),
    eave: { a: shift(w.a), b: shift(w.b) },
    kneeHeight,
    slopeDeg,
    risesToward: dot(perpLeft(w.dir), w.inward) > 0 ? 'left' : 'right',
  };
}

/**
 * Saddle roof: two planes along the longest pair of roughly parallel (within 10 degrees) outer walls
 * that face each other ("longest" = the pair whose shorter wall is longest). Eave lines sit on the
 * outer wall faces, each plane rising towards the other. Returns [] when there is no closed outer
 * boundary or no such pair.
 */
export function saddleRoofFromWalls(floor: Floor, kneeHeight: number, slopeDeg: number): CeilingPlane[] {
  const walls = outerWalls(floor);
  let best: OuterWall[] = [];
  let bestScore = 0;
  walls.forEach((p, i) => {
    for (const q of walls.slice(i + 1)) {
      const score = Math.min(p.length, q.length);
      if (score > bestScore && facing(p, q) && facing(q, p)) {
        best = [p, q];
        bestScore = score;
      }
    }
  });
  return best.map((w) => eavePlane(w, kneeHeight, slopeDeg));
}

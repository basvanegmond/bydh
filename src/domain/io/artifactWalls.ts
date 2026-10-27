import type { Polygon, Vec2 } from '../schema/types';
import { signedArea } from '../geometry/polygon';
import { add, cross, dot, length, normalize, perpLeft, scale, sub } from '../geometry/vec2';

/*
 * Wall centrelines from room interiors. The input lists every room as its net (interior) polygon,
 * so walls sit in the gaps between polygons. Edges of different polygons that face each other
 * (anti-parallel, close, overlapping) share a wall: centreline midway, thickness = the gap. Edges
 * left over are exterior: the wall lies outside the room, as thick as the gap to the outer face
 * of a house shell when one matches, else a default. Coordinates are plan millimetres.
 */

export interface ShellRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface WallSegment {
  a: Vec2;
  b: Vec2;
  thickness: number;
  /** Index of the input polygon on the wall's left / right (walking a to b), when known. */
  leftPoly?: number;
  rightPoly?: number;
}

export interface WallDeriveOptions {
  /** Closest two polygon edges may be to count as one shared wall (mm). */
  minGapMm: number;
  /** Thickness of a wall between two polygons that touch (gap below minGapMm) (mm). */
  touchingThicknessMm: number;
  /** Furthest apart two polygon edges may be to count as one shared wall (mm). */
  maxGapMm: number;
  exteriorThicknessMm: number;
  diagonalThicknessMm: number;
  /** Shortest leftover stretch of an outer edge that gets its own wall (mm). */
  minExteriorSegmentMm: number;
  /** Shortest stretch of shared wall worth creating (mm). */
  minSegmentMm: number;
  /** Axis-aligned walls closer than this are treated as one line (mm). */
  snapToleranceMm: number;
  /** Furthest a wall end is stretched to meet a crossing wall (mm). */
  maxExtensionMm: number;
}

export const DEFAULT_WALL_DERIVE: WallDeriveOptions = {
  minGapMm: 30,
  touchingThicknessMm: 100,
  maxGapMm: 600,
  exteriorThicknessMm: 250,
  diagonalThicknessMm: 200,
  minExteriorSegmentMm: 300,
  minSegmentMm: 100,
  snapToleranceMm: 60,
  maxExtensionMm: 400,
};

/** Polygons overlapping by up to this much still count as touching (mm). */
const TOUCH_SLACK_MM = 20;

type Interval = [number, number];

interface Edge {
  poly: number;
  a: Vec2;
  dir: Vec2;
  len: number;
  /** Unit normal pointing away from the polygon's interior. */
  outward: Vec2;
  /** Stretches (distance from a) not yet claimed by a wall. */
  free: Interval[];
}

function buildEdges(polygons: Polygon[]): Edge[] {
  const edges: Edge[] = [];
  polygons.forEach((polygon, poly) => {
    const ccw = signedArea(polygon) > 0;
    polygon.forEach((a, i) => {
      const b = polygon[(i + 1) % polygon.length]!;
      const len = length(sub(b, a));
      if (len < 1) return;
      const dir = normalize(sub(b, a));
      const right = { x: dir.y, y: -dir.x };
      edges.push({ poly, a, dir, len, outward: ccw ? right : scale(right, -1), free: [[0, len]] });
    });
  });
  return edges;
}

function intersectIntervals(p: Interval[], q: Interval[]): Interval[] {
  const out: Interval[] = [];
  for (const [p0, p1] of p) {
    for (const [q0, q1] of q) {
      const lo = Math.max(p0, q0);
      const hi = Math.min(p1, q1);
      if (hi > lo) out.push([lo, hi]);
    }
  }
  return out;
}

function subtractInterval(free: Interval[], [c0, c1]: Interval): Interval[] {
  return free.flatMap(([f0, f1]): Interval[] => {
    if (c1 <= f0 || c0 >= f1) return [[f0, f1]];
    const parts: Interval[] = [];
    if (c0 > f0) parts.push([f0, c0]);
    if (c1 < f1) parts.push([c1, f1]);
    return parts;
  });
}

interface Pair {
  e: Edge;
  f: Edge;
  gap: number;
  /** Both edges belong to one room: the stretch is open, claimed without a wall. */
  same: boolean;
}

/** Two edges that face each other across a wall-sized gap, e on the inner side looking outward. */
function facing(e: Edge, f: Edge, o: WallDeriveOptions, group: number[]): Pair | null {
  if (Math.abs(cross(e.dir, f.dir)) > 0.02 || dot(e.dir, f.dir) > 0) return null;
  const gapA = dot(sub(f.a, e.a), e.outward);
  const fEnd = add(f.a, scale(f.dir, f.len));
  const gapB = dot(sub(fEnd, e.a), e.outward);
  const gap = (gapA + gapB) / 2;
  const same = group[e.poly] === group[f.poly];
  if (gap < -TOUCH_SLACK_MM || gap > (same ? o.minGapMm : o.maxGapMm)) return null;
  if (dot(sub(e.a, f.a), f.outward) < -TOUCH_SLACK_MM) return null;
  return { e, f, gap, same };
}

/** Where f lies along e (distance from e.a), and where e's claimed-free stretches lie along f. */
const alongOf = (e: Edge, p: Vec2): number => dot(sub(p, e.a), e.dir);

function freeOnOther(e: Edge, f: Edge): Interval[] {
  return f.free.map(([u0, u1]): Interval => {
    const s0 = alongOf(e, add(f.a, scale(f.dir, u0)));
    const s1 = alongOf(e, add(f.a, scale(f.dir, u1)));
    return [Math.min(s0, s1), Math.max(s0, s1)];
  });
}

function claim(e: Edge, f: Edge, [s0, s1]: Interval): void {
  e.free = subtractInterval(e.free, [s0, s1]);
  const t0 = dot(sub(add(e.a, scale(e.dir, s0)), f.a), f.dir);
  const t1 = dot(sub(add(e.a, scale(e.dir, s1)), f.a), f.dir);
  f.free = subtractInterval(f.free, [Math.min(t0, t1), Math.max(t0, t1)]);
}

function sharedSegments(edges: Edge[], o: WallDeriveOptions, group: number[]): WallSegment[] {
  const pairs: Pair[] = [];
  for (const e of edges)
    for (const f of edges)
      if (e !== f) {
        const pair = facing(e, f, o, group);
        if (pair && edges.indexOf(e) < edges.indexOf(f)) pairs.push(pair);
      }
  pairs.sort((p, q) => p.gap - q.gap);
  const segments: WallSegment[] = [];
  for (const { e, f, gap, same } of pairs) {
    const overlap = intersectIntervals(e.free, freeOnOther(e, f));
    for (const [s0, s1] of overlap) {
      if (s1 - s0 < o.minSegmentMm) continue;
      claim(e, f, [s0, s1]);
      if (same) continue;
      const shift = scale(e.outward, gap / 2);
      const leftIsE = dot(perpLeft(e.dir), e.outward) < 0;
      segments.push({
        a: add(add(e.a, scale(e.dir, s0)), shift),
        b: add(add(e.a, scale(e.dir, s1)), shift),
        thickness: gap < o.minGapMm ? o.touchingThicknessMm : gap,
        ...(leftIsE ? { leftPoly: e.poly, rightPoly: f.poly } : { leftPoly: f.poly, rightPoly: e.poly }),
      });
    }
  }
  return segments;
}

const isAxisAligned = (dir: Vec2): boolean => Math.abs(dir.x) > 0.999 || Math.abs(dir.y) > 0.999;

/** Gap from an axis-aligned edge to the outer face of the nearest matching shell rectangle. */
export function shellGap(
  edge: Pick<Edge, 'a' | 'dir' | 'outward'>,
  [s0, s1]: Interval,
  shells: ShellRect[],
  o: WallDeriveOptions,
): number | null {
  const p0 = add(edge.a, scale(edge.dir, s0));
  const p1 = add(edge.a, scale(edge.dir, s1));
  const n = edge.outward;
  let best: number | null = null;
  for (const r of shells) {
    const horizontalEdge = Math.abs(n.y) > 0.999;
    const lo = horizontalEdge ? Math.min(p0.x, p1.x) : Math.min(p0.y, p1.y);
    const hi = horizontalEdge ? Math.max(p0.x, p1.x) : Math.max(p0.y, p1.y);
    const rLo = horizontalEdge ? r.x0 : r.y0;
    const rHi = horizontalEdge ? r.x1 : r.y1;
    if (Math.min(hi, rHi) - Math.max(lo, rLo) < o.minSegmentMm) continue;
    const outerFace = horizontalEdge ? (n.y > 0 ? r.y1 : r.y0) : n.x > 0 ? r.x1 : r.x0;
    const gap = (outerFace - (horizontalEdge ? p0.y : p0.x)) * (horizontalEdge ? n.y : n.x);
    if (gap >= o.minGapMm && gap <= o.maxGapMm && (best === null || gap < best)) best = gap;
  }
  return best;
}

function exteriorSegments(edges: Edge[], shells: ShellRect[], o: WallDeriveOptions): WallSegment[] {
  const segments: WallSegment[] = [];
  for (const e of edges) {
    for (const [s0, s1] of e.free) {
      if (s1 - s0 < o.minExteriorSegmentMm) continue;
      const axis = isAxisAligned(e.dir);
      const fallback = axis ? o.exteriorThicknessMm : o.diagonalThicknessMm;
      const gap = (axis ? shellGap(e, [s0, s1], shells, o) : null) ?? fallback;
      const shift = scale(e.outward, gap / 2);
      const leftIsE = dot(perpLeft(e.dir), e.outward) < 0;
      segments.push({
        a: add(add(e.a, scale(e.dir, s0)), shift),
        b: add(add(e.a, scale(e.dir, s1)), shift),
        thickness: gap,
        ...(leftIsE ? { leftPoly: e.poly } : { rightPoly: e.poly }),
      });
    }
  }
  return segments;
}

interface Hit {
  t: number;
  u: number;
  len: number;
}

function rayHit(end: Vec2, dir: Vec2, other: WallSegment): Hit | null {
  const od = normalize(sub(other.b, other.a));
  const denom = cross(dir, od);
  if (Math.abs(denom) < 0.05) return null;
  const rel = sub(other.a, end);
  return { t: cross(rel, od) / denom, u: cross(rel, dir) / denom, len: length(sub(other.b, other.a)) };
}

/** Stretches one wall end to the nearest crossing wall line, so corners and T-junctions close. */
function extendEnd(end: Vec2, dir: Vec2, self: WallSegment, all: WallSegment[], o: WallDeriveOptions): Vec2 {
  let best: number | null = null;
  for (const other of all) {
    if (other === self) continue;
    const hit = rayHit(end, dir, other);
    if (!hit || hit.u < -o.maxExtensionMm || hit.u > hit.len + o.maxExtensionMm) continue;
    const touching = Math.abs(hit.t) <= 5 && hit.u >= -5 && hit.u <= hit.len + 5;
    if (touching) return end;
    if (hit.t > 5 && hit.t <= o.maxExtensionMm && (best === null || hit.t < best)) best = hit.t;
  }
  return best === null ? end : add(end, scale(dir, best));
}

export function closeCorners(segments: WallSegment[], o: WallDeriveOptions): WallSegment[] {
  return segments.map((seg) => {
    const dir = normalize(sub(seg.b, seg.a));
    return {
      ...seg,
      a: extendEnd(seg.a, scale(dir, -1), seg, segments, o),
      b: extendEnd(seg.b, dir, seg, segments, o),
    };
  });
}

/** Maps every value to the mean of its cluster (values at most `tol` from their neighbour), in 5 mm steps. */
function clusterMap(values: number[], tol: number): Map<number, number> {
  const sorted = [...values].sort((p, q) => p - q);
  const map = new Map<number, number>();
  let group: number[] = [];
  const flush = () => {
    if (group.length === 0) return;
    const mean = group.reduce((sum, v) => sum + v, 0) / group.length;
    for (const v of group) map.set(v, Math.round(mean / 5) * 5);
    group = [];
  };
  for (const v of sorted) {
    if (group.length > 0 && v - group[group.length - 1]! > tol) flush();
    group.push(v);
  }
  flush();
  return map;
}

const isAxisSegment = (s: WallSegment): boolean => isAxisAligned(normalize(sub(s.b, s.a)));

/**
 * Walls of neighbouring rooms rarely line up to the millimetre (the input has jogs of a few cm).
 * Coordinates of axis-aligned walls within `tol` of each other are merged so walls meet cleanly.
 */
export function snapAxes(segments: WallSegment[], tol: number): WallSegment[] {
  const axis = segments.filter(isAxisSegment);
  const xs = clusterMap(
    axis.flatMap((s) => [s.a.x, s.b.x]),
    tol,
  );
  const ys = clusterMap(
    axis.flatMap((s) => [s.a.y, s.b.y]),
    tol,
  );
  const snap = (p: Vec2): Vec2 => ({ x: xs.get(p.x) ?? p.x, y: ys.get(p.y) ?? p.y });
  return segments.map((s) => (isAxisSegment(s) ? { ...s, a: snap(s.a), b: snap(s.b) } : s));
}

/** Wall segments (centrelines with thickness) for room polygons; see the module comment. */
export function deriveWallSegments(
  polygons: Polygon[],
  shells: ShellRect[],
  options: Partial<WallDeriveOptions> = {},
  /** Group per polygon (e.g. the room it belongs to): polygons of one group never get a wall between them. */
  groups: number[] = polygons.map((_, i) => i),
): WallSegment[] {
  const o = { ...DEFAULT_WALL_DERIVE, ...options };
  const edges = buildEdges(polygons);
  const shared = sharedSegments(edges, o, groups);
  const exterior = exteriorSegments(edges, shells, o);
  return closeCorners(snapAxes([...shared, ...exterior], o.snapToleranceMm), o).map((s) => ({
    ...s,
    a: { x: Math.round(s.a.x), y: Math.round(s.a.y) },
    b: { x: Math.round(s.b.x), y: Math.round(s.b.y) },
  }));
}

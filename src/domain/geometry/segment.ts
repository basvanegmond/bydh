import type { Vec2 } from '../schema/types';
import { add, cross, distance, dot, EPSILON_MM, lerp, scale, sub } from './vec2';

export interface Segment {
  a: Vec2;
  b: Vec2;
}

/** Parameter t (0 at a, 1 at b) of the projection of p onto the infinite line through a and b. */
export function projectParam(p: Vec2, a: Vec2, b: Vec2): number {
  const ab = sub(b, a);
  const lenSq = dot(ab, ab);
  return lenSq === 0 ? 0 : dot(sub(p, a), ab) / lenSq;
}

/** Closest point on segment ab to p, with its parameter t ∈ [0, 1]. */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const t = Math.min(1, Math.max(0, projectParam(p, a, b)));
  return { point: lerp(a, b, t), t };
}

export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return distance(p, closestPointOnSegment(p, a, b).point);
}

/**
 * Intersection of two infinite lines given as point + direction.
 * Returns null for (nearly) parallel lines.
 */
export function intersectLines(p: Vec2, dirP: Vec2, q: Vec2, dirQ: Vec2): Vec2 | null {
  const denom = cross(dirP, dirQ);
  if (Math.abs(denom) < 1e-9) return null;
  const t = cross(sub(q, p), dirQ) / denom;
  return add(p, scale(dirP, t));
}

export interface SegmentHit {
  point: Vec2;
  /** Parameter along the first segment. */
  t: number;
  /** Parameter along the second segment. */
  u: number;
}

/**
 * Proper or touching intersection of segments ab and cd (collinear overlaps are ignored).
 * `tolerance` (mm) widens the segments slightly so endpoints touching a segment count.
 */
export function intersectSegments(
  a: Vec2,
  b: Vec2,
  c: Vec2,
  d: Vec2,
  tolerance = EPSILON_MM,
): SegmentHit | null {
  const r = sub(b, a);
  const s = sub(d, c);
  const denom = cross(r, s);
  if (Math.abs(denom) < 1e-9) return null;
  const qp = sub(c, a);
  const t = cross(qp, s) / denom;
  const u = cross(qp, r) / denom;
  const tolT = tolerance / Math.hypot(r.x, r.y);
  const tolU = tolerance / Math.hypot(s.x, s.y);
  if (t < -tolT || t > 1 + tolT || u < -tolU || u > 1 + tolU) return null;
  return { point: add(a, scale(r, t)), t, u };
}

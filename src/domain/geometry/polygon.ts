import type { Polygon, Vec2 } from '../schema/types';
import { almostEqual } from './vec2';

/** Signed area (mm²): positive for counter-clockwise polygons. */
export function signedArea(polygon: Polygon): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    sum += p.x * q.y - q.x * p.y;
  }
  return sum / 2;
}

export const area = (polygon: Polygon): number => Math.abs(signedArea(polygon));

export function perimeter(polygon: Polygon): number {
  let sum = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    sum += Math.hypot(q.x - p.x, q.y - p.y);
  }
  return sum;
}

/** Area centroid; falls back to the vertex average for degenerate polygons. */
export function centroid(polygon: Polygon): Vec2 {
  const a = signedArea(polygon);
  if (Math.abs(a) < 1e-6) {
    const n = Math.max(1, polygon.length);
    return {
      x: polygon.reduce((s, p) => s + p.x, 0) / n,
      y: polygon.reduce((s, p) => s + p.y, 0) / n,
    };
  }
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i]!;
    const q = polygon[(i + 1) % polygon.length]!;
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

/** Even-odd point-in-polygon test (points exactly on an edge may go either way). */
export function pointInPolygon(p: Vec2, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Inside the outer ring and outside every hole. */
export function pointInPolygonWithHoles(p: Vec2, outer: Polygon, holes: Polygon[]): boolean {
  return pointInPolygon(p, outer) && !holes.some((hole) => pointInPolygon(p, hole));
}

/** Removes consecutive duplicates (and a closing duplicate) within `tolerance` mm. */
export function dedupe(polygon: Polygon, tolerance?: number): Polygon {
  const result: Polygon = [];
  for (const p of polygon) {
    const last = result[result.length - 1];
    if (!last || !almostEqual(last, p, tolerance)) result.push(p);
  }
  if (result.length > 1 && almostEqual(result[0]!, result[result.length - 1]!, tolerance)) result.pop();
  return result;
}

/**
 * A point guaranteed to lie inside the polygon (for labels and room anchors).
 * Uses the centroid when it is inside; otherwise the middle of the widest horizontal
 * run through the centroid's height.
 */
export function interiorPoint(outer: Polygon, holes: Polygon[] = []): Vec2 {
  const c = centroid(outer);
  if (pointInPolygonWithHoles(c, outer, holes)) return c;
  const ys = [c.y, ...outer.map((p) => p.y)].sort((a, b) => a - b);
  const candidates = [c.y];
  for (let i = 0; i < ys.length - 1; i++) candidates.push((ys[i]! + ys[i + 1]!) / 2);
  let best: { point: Vec2; width: number } | null = null;
  for (const y of candidates) {
    const xs = [outer, ...holes].flatMap((ring) => scanlineCrossings(ring, y)).sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const width = xs[i + 1]! - xs[i]!;
      if (!best || width > best.width) best = { point: { x: (xs[i]! + xs[i + 1]!) / 2, y }, width };
    }
  }
  return best?.point ?? c;
}

function scanlineCrossings(ring: Polygon, y: number): number[] {
  const xs: number[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > y !== b.y > y) xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
  }
  return xs;
}

export function boundingBox(points: Vec2[]): { min: Vec2; max: Vec2 } | null {
  if (points.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  return { min: { x: minX, y: minY }, max: { x: maxX, y: maxY } };
}

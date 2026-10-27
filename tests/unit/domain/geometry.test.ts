import { describe, expect, it } from 'vitest';
import {
  area,
  centroid,
  dedupe,
  interiorPoint,
  pointInPolygon,
  pointInPolygonWithHoles,
  signedArea,
} from '@/domain/geometry/polygon';
import { closestPointOnSegment, intersectLines, intersectSegments } from '@/domain/geometry/segment';
import { normalizeDegrees, perpLeft } from '@/domain/geometry/vec2';

const square = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 4000 },
  { x: 0, y: 4000 },
];
// U shape whose centroid falls in the notch.
const uShape = [
  { x: 0, y: 0 },
  { x: 3000, y: 0 },
  { x: 3000, y: 3000 },
  { x: 2000, y: 3000 },
  { x: 2000, y: 1000 },
  { x: 1000, y: 1000 },
  { x: 1000, y: 3000 },
  { x: 0, y: 3000 },
];

describe('vec2', () => {
  it('perpLeft rotates counter-clockwise', () => {
    expect(perpLeft({ x: 1, y: 0 })).toEqual({ x: -0, y: 1 });
  });
  it('normalizes degrees into [0, 360)', () => {
    expect(normalizeDegrees(-90)).toBe(270);
    expect(normalizeDegrees(450)).toBe(90);
  });
});

describe('segments', () => {
  it('projects onto a segment and clamps to its ends', () => {
    expect(closestPointOnSegment({ x: 5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toEqual({
      point: { x: 5, y: 0 },
      t: 0.5,
    });
    expect(closestPointOnSegment({ x: -5, y: 5 }, { x: 0, y: 0 }, { x: 10, y: 0 }).t).toBe(0);
  });

  it('intersects crossing segments and ignores parallel or distant ones', () => {
    const hit = intersectSegments({ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 });
    expect(hit?.point).toEqual({ x: 5, y: 5 });
    expect(intersectSegments({ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 5 }, { x: 10, y: 5 })).toBeNull();
    expect(intersectSegments({ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 5, y: 0 }, { x: 6, y: -1 })).toBeNull();
  });

  it('intersects infinite lines', () => {
    expect(intersectLines({ x: 0, y: 1 }, { x: 1, y: 0 }, { x: 3, y: 0 }, { x: 0, y: 1 })).toEqual({
      x: 3,
      y: 1,
    });
  });
});

describe('polygons', () => {
  it('computes signed area by winding', () => {
    expect(signedArea(square)).toBe(16_000_000);
    expect(signedArea([...square].reverse())).toBe(-16_000_000);
    expect(area(uShape)).toBe(7_000_000);
  });

  it('computes the centroid', () => {
    expect(centroid(square)).toEqual({ x: 2000, y: 2000 });
  });

  it('tests point containment, including holes', () => {
    expect(pointInPolygon({ x: 2000, y: 2000 }, square)).toBe(true);
    expect(pointInPolygon({ x: 5000, y: 2000 }, square)).toBe(false);
    const hole = [
      { x: 1500, y: 1500 },
      { x: 2500, y: 1500 },
      { x: 2500, y: 2500 },
      { x: 1500, y: 2500 },
    ];
    expect(pointInPolygonWithHoles({ x: 2000, y: 2000 }, square, [hole])).toBe(false);
    expect(pointInPolygonWithHoles({ x: 500, y: 500 }, square, [hole])).toBe(true);
  });

  it('finds an interior point even when the centroid lies outside', () => {
    expect(pointInPolygon(centroid(uShape), uShape)).toBe(false);
    expect(pointInPolygon(interiorPoint(uShape), uShape)).toBe(true);
  });

  it('removes duplicate and closing points', () => {
    expect(
      dedupe([
        { x: 0, y: 0 },
        { x: 0, y: 0.1 },
        { x: 10, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ]);
  });
});

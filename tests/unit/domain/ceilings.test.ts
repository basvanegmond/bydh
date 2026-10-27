import { describe, expect, it } from 'vitest';
import {
  ceilingHeightAt,
  headroomAreas,
  planeHeightAt,
  saddleRoofFromWalls,
  usableArea,
  wallCeilingHook,
  wallTopAt,
} from '@/domain/model/ceilings';
import { syncRooms } from '@/domain/model/rooms';
import { area } from '@/domain/geometry/polygon';
import { newId } from '@/domain/schema';
import type { CeilingPlane, Floor } from '@/domain/schema';
import { drawLoop, emptyFloor, EXTERIOR } from './fixtures';

const TAN20 = Math.tan((20 * Math.PI) / 180);

/** 8 x 6 m shell of 30 cm walls (interior 7700 x 5700), flat ceiling 2700 - 200 = 2500. */
function attic(): Floor {
  const floor = emptyFloor();
  floor.level = 'attic';
  drawLoop(
    floor,
    [
      { x: 0, y: 0 },
      { x: 8000, y: 0 },
      { x: 8000, y: 6000 },
      { x: 0, y: 6000 },
    ],
    EXTERIOR,
  );
  syncRooms(floor);
  return floor;
}

function withSaddle(floor: Floor): CeilingPlane[] {
  const planes = saddleRoofFromWalls(floor, 1000, 20);
  for (const plane of planes) floor.ceilingPlanes[plane.id] = plane;
  return planes;
}

const southSlope = (extent?: CeilingPlane['extent']): CeilingPlane => ({
  id: newId(),
  eave: { a: { x: 0, y: 0 }, b: { x: 8000, y: 0 } },
  kneeHeight: 900,
  slopeDeg: 20,
  risesToward: 'left',
  ...(extent ? { extent } : {}),
});

describe('plane height', () => {
  it('rises from the knee height along the slope', () => {
    const plane = southSlope();
    expect(planeHeightAt(plane, { x: 100, y: 0 })).toBeCloseTo(900);
    expect(planeHeightAt(plane, { x: 100, y: 1000 })).toBeCloseTo(900 + 1000 * TAN20);
  });

  it('honours risesToward right (mirror)', () => {
    const plane: CeilingPlane = { ...southSlope(), risesToward: 'right' };
    expect(planeHeightAt(plane, { x: 100, y: -1000 })).toBeCloseTo(900 + 1000 * TAN20);
  });
});

describe('ceilingHeightAt', () => {
  it('is the flat ceiling without planes', () => {
    expect(ceilingHeightAt(attic(), { x: 4000, y: 3000 })).toBe(2500);
  });

  it('follows a one-sided slope and ignores the low side', () => {
    const floor = attic();
    const plane = southSlope();
    floor.ceilingPlanes[plane.id] = plane;
    expect(ceilingHeightAt(floor, { x: 4000, y: 0 })).toBeCloseTo(900);
    expect(ceilingHeightAt(floor, { x: 4000, y: 2000 })).toBeCloseTo(900 + 2000 * TAN20);
    expect(ceilingHeightAt(floor, { x: 4000, y: 5000 })).toBe(2500);
    expect(ceilingHeightAt(floor, { x: 4000, y: -500 })).toBe(2500);
  });

  it('does not cover a point outside the plane extent', () => {
    const floor = attic();
    const plane = southSlope([
      { x: 0, y: 0 },
      { x: 2000, y: 0 },
      { x: 2000, y: 6000 },
      { x: 0, y: 6000 },
    ]);
    floor.ceilingPlanes[plane.id] = plane;
    expect(ceilingHeightAt(floor, { x: 1000, y: 1000 })).toBeCloseTo(900 + 1000 * TAN20);
    expect(ceilingHeightAt(floor, { x: 5000, y: 1000 })).toBe(2500);
  });

  it('takes the lowest plane of a saddle roof, capped by the flat ceiling', () => {
    const floor = attic();
    const planes = withSaddle(floor);
    expect(planes).toHaveLength(2);
    // Eave lines on the outer wall faces (y = -150 and y = 6150), ridge at y = 3000.
    expect(ceilingHeightAt(floor, { x: 4000, y: 3000 })).toBeCloseTo(1000 + 3150 * TAN20);
    expect(ceilingHeightAt(floor, { x: 4000, y: 3000 - 1000 })).toBeCloseTo(1000 + 2150 * TAN20);
    expect(ceilingHeightAt(floor, { x: 4000, y: 3000 + 1000 })).toBeCloseTo(1000 + 2150 * TAN20);
  });

  it('is the knee wall height at the eave line', () => {
    const floor = attic();
    withSaddle(floor);
    expect(ceilingHeightAt(floor, { x: 4000, y: -150 })).toBeCloseTo(1000);
    expect(ceilingHeightAt(floor, { x: 4000, y: 6150 })).toBeCloseTo(1000);
  });
});

describe('saddleRoofFromWalls', () => {
  it('returns no planes without a closed outer boundary', () => {
    expect(saddleRoofFromWalls(emptyFloor(), 1000, 30)).toEqual([]);
  });

  it('puts the eaves on the outer faces of the longest parallel walls, rising inwards', () => {
    const [p, q] = saddleRoofFromWalls(attic(), 1000, 30);
    const ys = [p!.eave.a.y, q!.eave.a.y].sort((a, b) => a - b);
    expect(ys[0]).toBeCloseTo(-150);
    expect(ys[1]).toBeCloseTo(6150);
    expect(p!.eave.a.y).toBeCloseTo(p!.eave.b.y);
    expect(p!.kneeHeight).toBe(1000);
    expect(p!.slopeDeg).toBe(30);
    expect(p!.id).not.toBe(q!.id);
  });
});

describe('wall tops', () => {
  it('clips a wall along its axis', () => {
    const floor = attic();
    const plane = southSlope();
    floor.ceilingPlanes[plane.id] = plane;
    const south = Object.values(floor.walls).find((w) => {
      const a = floor.wallNodes[w.startNodeId]!.position;
      const b = floor.wallNodes[w.endNodeId]!.position;
      return a.y === 0 && b.y === 0;
    })!;
    const east = Object.values(floor.walls).find((w) => {
      const a = floor.wallNodes[w.startNodeId]!.position;
      const b = floor.wallNodes[w.endNodeId]!.position;
      return a.x === 8000 && b.x === 8000;
    })!;
    // Along the south wall the eave line is hit everywhere: the knee height.
    expect(wallTopAt(floor, south, 3000)).toBeCloseTo(900);
    // Along the east wall the top rises with the slope, capped by the flat ceiling.
    const start = floor.wallNodes[east.startNodeId]!.position;
    const end = floor.wallNodes[east.endNodeId]!.position;
    const hook = wallCeilingHook(floor, east, { a: start, b: end });
    const sign = Math.sign(end.y - start.y);
    const y = (along: number) => start.y + sign * along;
    expect(hook(1000)).toBeCloseTo(ceilingHeightAt(floor, { x: 8000, y: y(1000) }));
    expect(hook(1000)).toBeGreaterThanOrEqual(Math.min(hook(0), 2500));
    expect(hook(1e9)).toBeLessThanOrEqual(2500);
    expect(hook(-50)).toBe(hook(0));
  });

  it('caps at an explicit wall height', () => {
    const floor = attic();
    const wall = Object.values(floor.walls)[0]!;
    wall.height = 1500;
    expect(wallTopAt(floor, wall, 100)).toBe(1500);
  });
});

describe('headroom', () => {
  it('returns the low strips of a saddle roof', () => {
    const floor = attic();
    withSaddle(floor);
    const low = headroomAreas(floor, 1800);
    // Strip from the outer face: (1800 - 1000) / tan20 = 2198 mm, of which 150 mm is wall.
    const strip = 7700 * (800 / TAN20 - 300);
    expect(low).toHaveLength(2);
    expect(low.reduce((s, p) => s + area(p), 0)).toBeCloseTo(2 * strip, -3);
  });

  it('is empty when the threshold is at or below the knee height', () => {
    const floor = attic();
    withSaddle(floor);
    expect(headroomAreas(floor, 1000)).toEqual([]);
  });

  it('computes usable area as room area minus headroom', () => {
    const floor = attic();
    withSaddle(floor);
    const polygon = [
      { x: 150, y: 150 },
      { x: 7850, y: 150 },
      { x: 7850, y: 5850 },
      { x: 150, y: 5850 },
    ];
    const total = area(polygon);
    const strip = 7700 * (800 / TAN20 - 300);
    expect(usableArea(polygon, floor, 1800)).toBeCloseTo(total - 2 * strip, -3);
    expect(usableArea(polygon, floor, 0)).toBeCloseTo(total);
    expect(usableArea(polygon, floor, 2600)).toBe(0);
  });

  it('does not double count overlapping low regions', () => {
    const floor = attic();
    withSaddle(floor);
    const polygon = [
      { x: 150, y: 150 },
      { x: 7850, y: 150 },
      { x: 7850, y: 5850 },
      { x: 150, y: 5850 },
    ];
    // Threshold 2400: both strips reach past the ridge, so everything is low (ridge is 2146).
    expect(usableArea(polygon, floor, 2400)).toBeCloseTo(0, -2);
  });
});

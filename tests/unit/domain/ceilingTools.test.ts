import { describe, expect, it } from 'vitest';
import {
  distanceToFlatCeiling,
  planeFromClicks,
  sideOfEave,
  translatePlane,
} from '@/domain/model/ceilingTools';
import { planeHeightAt } from '@/domain/model/ceilings';
import { parseSlope } from '@/features/ceilings/slope';
import { emptyFloor } from './fixtures';

const A = { x: 0, y: 0 };
const B = { x: 4000, y: 0 };

describe('sideOfEave', () => {
  it('reports the side of the line a -> b', () => {
    expect(sideOfEave(A, B, { x: 2000, y: 1000 })).toBe('left');
    expect(sideOfEave(A, B, { x: 2000, y: -1000 })).toBe('right');
  });

  it('is null on or very near the line, and for a zero-length line', () => {
    expect(sideOfEave(A, B, { x: 2000, y: 3 })).toBeNull();
    expect(sideOfEave(A, A, { x: 0, y: 500 })).toBeNull();
  });
});

describe('planeFromClicks', () => {
  it('builds a plane rising towards the clicked side', () => {
    const plane = planeFromClicks(A, B, { x: 2000, y: -800 }, 1000, 40);
    expect(plane).toMatchObject({ risesToward: 'right', kneeHeight: 1000, slopeDeg: 40 });
    expect(plane?.eave).toEqual({ a: A, b: B });
    // Height at 1 m from the eave on the rising side.
    expect(planeHeightAt(plane!, { x: 2000, y: -1000 })).toBeCloseTo(
      1000 + Math.tan((40 * Math.PI) / 180) * 1000,
    );
  });

  it('rejects a too-short eave and an ambiguous side', () => {
    expect(planeFromClicks(A, { x: 50, y: 0 }, { x: 0, y: 500 }, 1000, 40)).toBeNull();
    expect(planeFromClicks(A, B, { x: 2000, y: 0 }, 1000, 40)).toBeNull();
  });
});

describe('translatePlane', () => {
  it('moves the eave line and the extent', () => {
    const plane = planeFromClicks(A, B, { x: 0, y: 500 }, 1000, 40)!;
    plane.extent = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ];
    translatePlane(plane, { x: 100, y: -50 });
    expect(plane.eave.a).toEqual({ x: 100, y: -50 });
    expect(plane.eave.b).toEqual({ x: 4100, y: -50 });
    expect(plane.extent?.[1]).toEqual({ x: 110, y: -50 });
  });
});

describe('distanceToFlatCeiling', () => {
  it('is the horizontal run needed to climb from the knee to the flat ceiling', () => {
    const floor = emptyFloor(); // flat ceiling = height - slab
    const plane = planeFromClicks(A, B, { x: 0, y: 500 }, 1000, 45)!;
    const rise = floor.height - floor.slabThickness - 1000;
    expect(distanceToFlatCeiling(plane, floor)).toBeCloseTo(rise);
  });

  it('is null when the knee wall is as high as the flat ceiling', () => {
    const floor = emptyFloor();
    const plane = planeFromClicks(A, B, { x: 0, y: 500 }, floor.height, 30)!;
    expect(distanceToFlatCeiling(plane, floor)).toBeNull();
  });
});

describe('parseSlope', () => {
  it('accepts 1 to 89 with a Dutch comma and rejects the rest', () => {
    expect(parseSlope('37,5')).toBe(37.5);
    expect(parseSlope('0')).toBeNull();
    expect(parseSlope('90')).toBeNull();
    expect(parseSlope('abc')).toBeNull();
  });
});

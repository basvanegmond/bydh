import { describe, expect, it } from 'vitest';
import { area, signedArea } from '@/domain/geometry/polygon';
import { floorSlabs } from '@/domain/model/slabs';
import { addWall } from '@/domain/model/walls';
import type { Stair } from '@/domain/schema';
import { drawLoop, emptyFloor, EXTERIOR, INTERIOR } from './fixtures';

const square = (x: number, y: number, size: number) => [
  { x, y },
  { x: x + size, y },
  { x: x + size, y: y + size },
  { x, y: y + size },
];

const stairTo = (floorId: string, over: Partial<Stair> = {}): Stair => ({
  id: 's1',
  fromFloorId: 'below',
  toFloorId: floorId,
  shape: 'straight',
  position: { x: 1000, y: 2000 },
  rotationDeg: 0,
  width: 900,
  runLength: 2700,
  steps: 15,
  cutsVoid: true,
  ...over,
});

describe('floorSlabs', () => {
  it('gives a square the outer boundary including the wall thickness', () => {
    const floor = emptyFloor();
    drawLoop(floor, square(0, 0, 4000), EXTERIOR);
    const slabs = floorSlabs(floor, []);
    expect(slabs).toHaveLength(1);
    expect(area(slabs[0]!.outline)).toBeCloseTo(4300 * 4300, 0);
    expect(signedArea(slabs[0]!.outline)).toBeGreaterThan(0);
    expect(slabs[0]!.holes).toEqual([]);
  });

  it('cuts the footprint of an arriving stair as a hole', () => {
    const floor = emptyFloor();
    drawLoop(floor, square(0, 0, 4000), EXTERIOR);
    const slabs = floorSlabs(floor, [stairTo(floor.id)]);
    expect(slabs[0]!.holes).toHaveLength(1);
    expect(area(slabs[0]!.holes[0]!)).toBeCloseTo(2700 * 900, 0);
    expect(signedArea(slabs[0]!.holes[0]!)).toBeLessThan(0);
  });

  it('ignores stairs that go elsewhere or do not cut a void', () => {
    const floor = emptyFloor();
    drawLoop(floor, square(0, 0, 4000), EXTERIOR);
    expect(floorSlabs(floor, [stairTo('other')])[0]!.holes).toEqual([]);
    expect(floorSlabs(floor, [stairTo(floor.id, { cutsVoid: false })])[0]!.holes).toEqual([]);
  });

  it('makes no hole for a stair outside the slab', () => {
    const floor = emptyFloor();
    drawLoop(floor, square(0, 0, 4000), EXTERIOR);
    const slabs = floorSlabs(floor, [stairTo(floor.id, { position: { x: 9000, y: 9000 } })]);
    expect(slabs[0]!.holes).toEqual([]);
  });

  it('makes one slab per separate group of walls', () => {
    const floor = emptyFloor();
    drawLoop(floor, square(0, 0, 4000), EXTERIOR);
    drawLoop(floor, square(8000, 0, 3000), EXTERIOR);
    const slabs = floorSlabs(floor, [stairTo(floor.id, { position: { x: 8500, y: 1500 }, runLength: 1800 })]);
    expect(slabs).toHaveLength(2);
    expect(slabs.map((s) => s.holes.length).sort()).toEqual([0, 1]);
  });

  it('gives interior walls no slab of their own', () => {
    const floor = emptyFloor();
    drawLoop(floor, square(0, 0, 4000), EXTERIOR);
    addWall(floor, { x: 2000, y: 0 }, { x: 2000, y: 4000 }, INTERIOR);
    expect(floorSlabs(floor, [])).toHaveLength(1);
  });

  it('gives no slab to a floor without a closed wall loop', () => {
    const floor = emptyFloor();
    expect(floorSlabs(floor, [])).toEqual([]);
    addWall(floor, { x: 0, y: 0 }, { x: 3000, y: 0 }, INTERIOR);
    addWall(floor, { x: 3000, y: 0 }, { x: 3000, y: 3000 }, INTERIOR);
    expect(floorSlabs(floor, [])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { createStair, directionDeg, floorAbove } from '@/domain/model/stairPlacement';
import { defaultStepCount } from '@/domain/model/stairs';
import { createBuilding, createFloor } from '@/domain/schema/factories';

describe('directionDeg', () => {
  const o = { x: 0, y: 0 };
  it('measures counter-clockwise from +X', () => {
    expect(directionDeg(o, { x: 1000, y: 0 })).toBe(0);
    expect(directionDeg(o, { x: 0, y: 1000 })).toBe(90);
    expect(directionDeg(o, { x: -1000, y: 0 })).toBe(180);
    expect(directionDeg(o, { x: 0, y: -1000 })).toBe(270);
  });
  it('snaps to the given step', () => {
    expect(directionDeg(o, { x: 1000, y: 300 }, 15)).toBe(15);
    expect(directionDeg(o, { x: 1000, y: -50 }, 15)).toBe(0);
    expect(directionDeg(o, { x: 1000, y: -300 }, 15)).toBe(345);
  });
  it('keeps east for a degenerate drag', () => {
    expect(directionDeg(o, { x: 5, y: 5 })).toBe(0);
  });
});

describe('createStair / floorAbove', () => {
  it('uses the default dimensions of the stair tool', () => {
    const building = createBuilding();
    const ground = building.floors[building.floorOrder[0]!]!;
    const stair = createStair(ground, 'upper', { x: 10, y: 20 }, 90);
    const steps = defaultStepCount(ground.height);
    expect(stair).toMatchObject({
      fromFloorId: ground.id,
      toFloorId: 'upper',
      shape: 'straight',
      width: 900,
      steps,
      runLength: steps * 250,
      cutsVoid: true,
      turn: 'left',
      rotationDeg: 90,
      position: { x: 10, y: 20 },
    });
  });

  it('finds the next floor up, or nothing at the top', () => {
    const building = createBuilding();
    const ground = building.floorOrder[0]!;
    expect(floorAbove(building, ground)).toBeUndefined();
    const upper = createFloor('first');
    building.floors[upper.id] = upper;
    building.floorOrder.push(upper.id);
    expect(floorAbove(building, ground)?.id).toBe(upper.id);
    expect(floorAbove(building, upper.id)).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import { floorGeometry } from '@/domain/model/floorGeometry';
import { computeWallOutlines } from '@/domain/model/outlines';
import { syncRooms } from '@/domain/model/rooms';
import { drawLoop, emptyFloor, EXTERIOR } from './fixtures';

const square = [
  { x: 0, y: 0 },
  { x: 4000, y: 0 },
  { x: 4000, y: 4000 },
  { x: 0, y: 4000 },
];

describe('floorGeometry', () => {
  it('matches the direct computations and is shared for a frozen floor', () => {
    const floor = emptyFloor();
    drawLoop(floor, square, EXTERIOR);
    syncRooms(floor);
    Object.freeze(floor);
    const geometry = floorGeometry(floor);
    expect(geometry.outlines).toEqual(computeWallOutlines(floor));
    expect(Object.values(geometry.rooms)).toHaveLength(1);
    expect(floorGeometry(floor)).toBe(geometry);
  });

  it('does not cache a floor that can still change', () => {
    const floor = emptyFloor();
    drawLoop(floor, square, EXTERIOR);
    expect(floorGeometry(floor)).not.toBe(floorGeometry(floor));
  });
});

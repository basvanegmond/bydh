import { distance, normalizeDegrees, toDegrees } from '../geometry/vec2';
import { newId } from '../schema/factories';
import type { Building, Floor, Id, Stair, Vec2 } from '../schema/types';
import { defaultStepCount } from './stairs';

/** Default stair values used by the stair tool. */
export const DEFAULT_STAIR_WIDTH_MM = 900;
export const DEFAULT_TREAD_MM = 250;
/** Angle step used while Shift is held. */
export const STAIR_ANGLE_STEP_DEG = 15;
/** A second click closer than this to the first keeps the previous direction (east). */
const MIN_DIRECTION_MM = 50;

/** The floor directly above `floorId` in the building, if any. */
export function floorAbove(building: Building, floorId: Id): Floor | undefined {
  const index = building.floorOrder.indexOf(floorId);
  const nextId = index < 0 ? undefined : building.floorOrder[index + 1];
  return nextId ? building.floors[nextId] : undefined;
}

/** Direction in degrees (counter-clockwise from +X, in [0, 360)) from `from` to `to`, optionally snapped. */
export function directionDeg(from: Vec2, to: Vec2, snapStepDeg = 0): number {
  if (distance(from, to) < MIN_DIRECTION_MM) return 0;
  const raw = toDegrees(Math.atan2(to.y - from.y, to.x - from.x));
  const deg = snapStepDeg > 0 ? Math.round(raw / snapStepDeg) * snapStepDeg : raw;
  return normalizeDegrees(Math.round(deg * 10) / 10) % 360 || 0; // `|| 0` turns -0 into 0
}

/** A straight stair with default dimensions from `fromFloor` up to `toFloorId`. */
export function createStair(fromFloor: Floor, toFloorId: Id, position: Vec2, rotationDeg: number): Stair {
  const steps = defaultStepCount(fromFloor.height);
  return {
    id: newId(),
    fromFloorId: fromFloor.id,
    toFloorId,
    shape: 'straight',
    position,
    rotationDeg,
    width: DEFAULT_STAIR_WIDTH_MM,
    runLength: steps * DEFAULT_TREAD_MM,
    steps,
    turn: 'left',
    cutsVoid: true,
  };
}

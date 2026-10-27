import type { Floor, Id } from '../schema';
import { computeWallOutlines } from './outlines';
import type { WallOutline } from './outlines';
import { computeRoomGeometry } from './rooms';
import type { RoomGeometry } from './rooms';

export interface FloorGeometry {
  outlines: Record<Id, WallOutline>;
  rooms: Record<Id, RoomGeometry>;
}

const cache = new WeakMap<Floor, FloorGeometry>();

/**
 * Derived geometry of a floor, computed once per floor object and shared by the 2D plan, the 3D
 * scene and the inspector. Only frozen (committed) floors are cached: a draft can still change.
 */
export function floorGeometry(floor: Floor): FloorGeometry {
  const cached = cache.get(floor);
  if (cached) return cached;
  const geometry = { outlines: computeWallOutlines(floor), rooms: computeRoomGeometry(floor) };
  if (Object.isFrozen(floor)) cache.set(floor, geometry);
  return geometry;
}

import type { Building, Id } from './types';

/**
 * Finished floor level (mm, relative to peil) of every floor in a building, derived from
 * `floorOrder` and each floor's floor-to-floor `height` (which already includes the slab).
 * The floor with level 'ground' is 0; floors below it are negative, floors above positive.
 * Without a ground floor the lowest floor is 0. Ids missing from `floors` are skipped.
 */
export function floorElevations(building: Pick<Building, 'floors' | 'floorOrder'>): Record<Id, number> {
  const ordered = building.floorOrder.flatMap((floorId) => {
    const floor = building.floors[floorId];
    return floor ? [{ id: floorId, level: floor.level, height: floor.height }] : [];
  });
  const raw: number[] = [];
  let level = 0;
  for (const entry of ordered) {
    raw.push(level);
    level += entry.height;
  }
  const groundIndex = ordered.findIndex((entry) => entry.level === 'ground');
  const origin = raw[groundIndex < 0 ? 0 : groundIndex] ?? 0;
  const result: Record<Id, number> = {};
  ordered.forEach((entry, index) => {
    result[entry.id] = (raw[index] ?? 0) - origin;
  });
  return result;
}

/** Elevation of a single floor; 0 when the floor is not part of the building. */
export function floorElevation(building: Pick<Building, 'floors' | 'floorOrder'>, floorId: Id): number {
  return floorElevations(building)[floorId] ?? 0;
}

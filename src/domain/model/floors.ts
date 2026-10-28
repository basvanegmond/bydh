import { createFloor, newId } from '../schema/factories';
import type { Building, Floor, FloorLevel, Id } from '../schema/types';

/**
 * Floor management. Functions mutate a Building (or Floor) in place, so they work on plain
 * objects in tests and on Immer drafts in the store. Callers re-run wall normalisation and
 * room detection after `copyWallsFrom`.
 */

export const DEFAULT_NEW_FLOOR_HEIGHT_MM = 2600;
export const DEFAULT_NEW_SLAB_MM = 200;

export interface AddFloorOptions {
  name?: string;
  height?: number;
  slabThickness?: number;
}

export interface FloorContents {
  walls: number;
  rooms: number;
  openings: number;
  objects: number;
  /** Stairs that start or end on this floor and are removed with it. */
  stairs: number;
}

const ABOVE: Record<FloorLevel, FloorLevel> = {
  basement: 'ground',
  ground: 'first',
  first: 'second',
  second: 'attic',
  attic: 'roof',
  roof: 'roof',
};
const BELOW: Record<FloorLevel, FloorLevel> = {
  basement: 'basement',
  ground: 'basement',
  first: 'ground',
  second: 'first',
  attic: 'second',
  roof: 'attic',
};

function levelFor(building: Building, position: 'above' | 'below'): FloorLevel {
  const edgeId = position === 'above' ? building.floorOrder.at(-1) : building.floorOrder[0];
  const edge = edgeId ? building.floors[edgeId] : undefined;
  if (!edge) return 'ground';
  return (position === 'above' ? ABOVE : BELOW)[edge.level];
}

/**
 * Thickness (mm) of the slab that forms the ceiling of a floor: the slab of the next floor up (each
 * floor slab sits under its own floor), or the floor own slab thickness for the top floor.
 */
export function ceilingSlabThickness(building: Pick<Building, 'floors' | 'floorOrder'>, floorId: Id): number {
  const floor = building.floors[floorId];
  const aboveId = building.floorOrder[building.floorOrder.indexOf(floorId) + 1];
  const above = aboveId ? building.floors[aboveId] : undefined;
  return above?.slabThickness ?? floor?.slabThickness ?? DEFAULT_NEW_SLAB_MM;
}

/** Adds an empty floor at the top or bottom of the stack and returns its id. */
export function addFloor(building: Building, position: 'above' | 'below', opts: AddFloorOptions = {}): Id {
  const floor = createFloor(levelFor(building, position), opts.name);
  floor.height = opts.height ?? DEFAULT_NEW_FLOOR_HEIGHT_MM;
  floor.slabThickness = opts.slabThickness ?? DEFAULT_NEW_SLAB_MM;
  building.floors[floor.id] = floor;
  if (position === 'above') building.floorOrder.push(floor.id);
  else building.floorOrder.unshift(floor.id);
  return floor.id;
}

/** Removes a floor and its stairs. Returns false (and changes nothing) for the last floor or an unknown id. */
export function removeFloor(building: Building, floorId: Id): boolean {
  if (!(floorId in building.floors) || building.floorOrder.length <= 1) return false;
  for (const [id, stair] of Object.entries(building.stairs)) {
    if (stair.fromFloorId === floorId || stair.toFloorId === floorId) delete building.stairs[id];
  }
  delete building.floors[floorId];
  building.floorOrder = building.floorOrder.filter((id) => id !== floorId);
  return true;
}

/** What deleting the floor would lose, for the confirmation dialog. */
export function describeFloorContents(floor: Floor, building: Pick<Building, 'stairs'>): FloorContents {
  const stairs = Object.values(building.stairs).filter(
    (s) => s.fromFloorId === floor.id || s.toFloorId === floor.id,
  ).length;
  return {
    walls: Object.keys(floor.walls).length,
    rooms: Object.keys(floor.rooms).length,
    openings: Object.keys(floor.openings).length,
    objects: Object.keys(floor.objects).length,
    stairs,
  };
}

/**
 * Adds copies of the source walls and nodes to the target (new ids, no openings, no rooms).
 * Existing target content is kept; the caller normalises and re-detects rooms afterwards.
 */
export function copyWallsFrom(target: Floor, source: Floor): void {
  const nodeIds = new Map<Id, Id>();
  for (const node of Object.values(source.wallNodes)) {
    const id = newId();
    nodeIds.set(node.id, id);
    target.wallNodes[id] = { id, position: { x: node.position.x, y: node.position.y } };
  }
  for (const wall of Object.values(source.walls)) {
    const start = nodeIds.get(wall.startNodeId);
    const end = nodeIds.get(wall.endNodeId);
    if (!start || !end) continue;
    const id = newId();
    target.walls[id] = {
      ...(JSON.parse(JSON.stringify(wall)) as typeof wall), // not structuredClone: the source may be an Immer draft (Proxy)
      id,
      startNodeId: start,
      endNodeId: end,
    };
  }
}

/** Sets the floor-to-floor height; elevations of floors above follow via floorElevations. */
export function setFloorHeight(floor: Floor, heightMm: number): boolean {
  if (!Number.isFinite(heightMm) || heightMm <= 0) return false;
  floor.height = heightMm;
  return true;
}

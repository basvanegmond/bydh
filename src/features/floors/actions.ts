import {
  addFloor,
  copyWallsFrom,
  describeFloorContents,
  removeFloor,
  setFloorHeight,
} from '@/domain/model/floors';
import { normalizeFloor } from '@/domain/model/normalize';
import { findFloor, mainBuilding, orderedFloors } from '@/domain/model/project';
import { syncRooms } from '@/domain/model/rooms';
import type { Floor, Id, Project } from '@/domain/schema';
import i18n from '@/i18n';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';
import { confirmAction } from '../dialogs/dialogStore';

const t = (key: string, options?: Record<string, unknown>) => i18n.t(key, options);
const current = (): Project => useProjectStore.getState().project;

/** Display name: the custom name, or the translated level name. */
export const floorLabel = (floor: Floor): string => floor.name ?? t(`floor.level.${floor.level}`);

/**
 * Adds an empty floor above or below the stack and makes it the active floor. Floors added without a
 * name show their translated level name, so they follow the UI language. With `copyWalls`, a floor added
 * above starts with a copy of the walls of the floor below (one undo step).
 */
export function addFloorAt(position: 'above' | 'below', copyWalls = false): Id | null {
  let newId: Id | null = null;
  useProjectStore.getState().edit(position === 'above' ? 'Add floor above' : 'Add floor below', (p) => {
    const building = mainBuilding(p);
    if (!building) return;
    const sourceId = position === 'above' ? building.floorOrder.at(-1) : undefined;
    newId = addFloor(building, position);
    const target = building.floors[newId];
    const source = sourceId ? building.floors[sourceId] : undefined;
    if (copyWalls && target && source) {
      copyWallsFrom(target, source);
      normalizeFloor(target);
      syncRooms(target);
    }
  });
  if (newId) useViewStore.getState().setActiveFloor(newId);
  return newId;
}

/** Sets a custom name; an empty name goes back to the translated level name. */
export function renameFloor(floorId: Id, name: string): void {
  const trimmed = name.trim();
  useProjectStore.getState().edit('Rename floor', (p) => {
    const floor = findFloor(p, floorId);
    if (!floor) return;
    if (trimmed) floor.name = trimmed;
    else delete floor.name;
  });
}

/** Sets the floor-to-floor height; floors above move with it (their elevation is derived). */
export function setHeight(floorId: Id, heightMm: number): boolean {
  if (!Number.isFinite(heightMm) || heightMm <= 0) return false;
  useProjectStore.getState().edit('Floor height', (p) => {
    const floor = findFloor(p, floorId);
    if (floor) setFloorHeight(floor, heightMm);
  });
  return true;
}

export function deleteMessage(floor: Floor, project: Project): string {
  const building = mainBuilding(project);
  const c = describeFloorContents(floor, building ?? { stairs: {} });
  return t('floors.deleteConfirm', { name: floorLabel(floor), ...c });
}

/** Asks for confirmation (listing what is lost), then removes the floor as one undoable edit. */
export async function deleteFloor(floorId: Id): Promise<boolean> {
  const project = current();
  const floors = orderedFloors(project);
  const floor = floors.find((f) => f.id === floorId);
  if (!floor || floors.length < 2) return false;
  if (!(await confirmAction(t('floors.deleteTitle'), deleteMessage(floor, project)))) return false;
  const index = floors.indexOf(floor);
  const neighbour = floors[index - 1] ?? floors[index + 1];
  // The store re-validates the active floor as soon as the project changes (falling back to the
  // ground floor), so the neighbour has to become active before the edit.
  const view = useViewStore.getState();
  if (view.activeFloorId === floorId && neighbour) view.setActiveFloor(neighbour.id);
  useProjectStore.getState().edit('Delete floor', (p) => {
    const building = mainBuilding(p);
    if (building) removeFloor(building, floorId);
  });
  return true;
}

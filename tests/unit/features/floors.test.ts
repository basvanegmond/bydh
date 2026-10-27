import { beforeEach, describe, expect, it } from 'vitest';
import { floorElevations } from '@/domain/schema/floors';
import { mainBuilding, orderedFloors } from '@/domain/model/project';
import { addWall } from '@/domain/model/walls';
import { createProject } from '@/domain/schema';
import { useDialogStore } from '@/features/dialogs/dialogStore';
import { addFloorAt, deleteFloor, renameFloor, setHeight } from '@/features/floors/actions';
import { floorBelow } from '@/features/floors/ghost';
import { useProjectStore } from '@/store/projectStore';
import { useViewStore } from '@/store/viewStore';

const store = () => useProjectStore.getState();
const floors = () => orderedFloors(store().project);
const elevations = () => floorElevations(mainBuilding(store().project)!);

beforeEach(() => {
  store().loadProject(createProject('Test'));
  useViewStore.setState({ activeFloorId: floors()[0]!.id });
});

function drawOn(floorId: string) {
  store().editFloor('Draw wall', floorId, (f) => {
    addWall(f, { x: 0, y: 0 }, { x: 4000, y: 0 }, { thickness: 100, justification: 'center' });
    addWall(f, { x: 4000, y: 0 }, { x: 4000, y: 3000 }, { thickness: 100, justification: 'center' });
  });
}

/** Resolves the pending confirm dialog the way the user clicking OK (or Cancel) would. */
function answer(ok: boolean) {
  const request = useDialogStore.getState().request;
  if (request?.kind !== 'confirm') throw new Error('no confirm pending');
  request.resolve(ok);
  useDialogStore.setState({ request: null });
}

describe('floor actions', () => {
  it('adds floors above and below and activates the new floor', () => {
    const above = addFloorAt('above')!;
    expect(floors().map((f) => f.level)).toEqual(['ground', 'first']);
    expect(useViewStore.getState().activeFloorId).toBe(above);
    const below = addFloorAt('below')!;
    expect(floors().map((f) => f.level)).toEqual(['basement', 'ground', 'first']);
    expect(useViewStore.getState().activeFloorId).toBe(below);
  });

  it('copies walls from the floor below in one undo step', () => {
    drawOn(floors()[0]!.id);
    const steps = store().history.past.length;
    const id = addFloorAt('above', true)!;
    expect(Object.keys(floors()[1]!.walls)).toHaveLength(2);
    expect(floors()[1]!.id).toBe(id);
    expect(store().history.past.length).toBe(steps + 1);
    store().undo();
    expect(floors()).toHaveLength(1);
  });

  it('renames, and an empty name goes back to the level name', () => {
    const id = floors()[0]!.id;
    renameFloor(id, '  Living  ');
    expect(floors()[0]!.name).toBe('Living');
    renameFloor(id, '');
    expect(floors()[0]!.name).toBeUndefined();
  });

  it('a height change moves the floors above it, not the ones below', () => {
    addFloorAt('above');
    addFloorAt('above');
    addFloorAt('below');
    const [basement, ground, first, second] = floors();
    const before = elevations();
    expect(setHeight(ground!.id, 3000)).toBe(true);
    const after = elevations();
    expect(after[ground!.id]).toBe(0);
    expect(after[basement!.id]).toBe(before[basement!.id]);
    const delta = 3000 - ground!.height;
    expect(after[first!.id]).toBe(before[first!.id]! + delta);
    expect(after[second!.id]).toBe(before[second!.id]! + delta);
  });

  it('rejects an invalid height without recording an edit', () => {
    const steps = store().history.past.length;
    expect(setHeight(floors()[0]!.id, 0)).toBe(false);
    expect(setHeight(floors()[0]!.id, Number.NaN)).toBe(false);
    expect(store().history.past.length).toBe(steps);
  });

  it('deletes after confirmation as one undoable edit and keeps the active floor valid', async () => {
    const ground = floors()[0]!;
    const upper = addFloorAt('above')!;
    drawOn(upper);
    const steps = store().history.past.length;
    const pending = deleteFloor(upper);
    const request = useDialogStore.getState().request;
    expect(request?.kind === 'confirm' && request.message).toContain('2 wall');
    answer(true);
    expect(await pending).toBe(true);
    expect(floors().map((f) => f.id)).toEqual([ground.id]);
    expect(useViewStore.getState().activeFloorId).toBe(ground.id);
    expect(store().history.past.length).toBe(steps + 1);
    store().undo();
    expect(floors()).toHaveLength(2);
    expect(Object.keys(floors()[1]!.walls)).toHaveLength(2);
  });

  it('activates the floor below when the active top floor is deleted', async () => {
    const first = addFloorAt('above')!;
    const attic = addFloorAt('above')!;
    expect(useViewStore.getState().activeFloorId).toBe(attic);
    const pending = deleteFloor(attic);
    answer(true);
    await pending;
    expect(useViewStore.getState().activeFloorId).toBe(first);
  });

  it('activates the floor above when the active ground floor is deleted', async () => {
    const ground = floors()[0]!.id;
    const first = addFloorAt('above')!;
    useViewStore.setState({ activeFloorId: ground });
    const pending = deleteFloor(ground);
    answer(true);
    await pending;
    expect(useViewStore.getState().activeFloorId).toBe(first);
  });

  it('does nothing when the confirmation is cancelled, and never deletes the last floor', async () => {
    const upper = addFloorAt('above')!;
    const pending = deleteFloor(upper);
    answer(false);
    expect(await pending).toBe(false);
    expect(floors()).toHaveLength(2);
    store().loadProject(createProject('One'));
    expect(await deleteFloor(floors()[0]!.id)).toBe(false);
    expect(useDialogStore.getState().request).toBeNull();
  });

  it('floorBelow returns the previous floor', () => {
    const upper = addFloorAt('above')!;
    expect(floorBelow(store().project, upper)?.level).toBe('ground');
    expect(floorBelow(store().project, floors()[0]!.id)).toBeUndefined();
  });
});

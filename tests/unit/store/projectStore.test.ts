import * as actions from '@/features/project/actions';
import { beforeEach, describe, expect, it } from 'vitest';
import { orderedFloors } from '@/domain/model/project';
import { addWall, moveNode } from '@/domain/model/walls';
import { createProject } from '@/domain/schema';
import { useViewStore } from '@/store/viewStore';
import { useProjectStore } from '@/store/projectStore';

const store = () => useProjectStore.getState();
const floor = () => orderedFloors(store().project)[0]!;
const fid = () => floor().id;
const wallCount = () => Object.keys(floor().walls).length;

function drawSquare() {
  const corners = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 4000 },
    { x: 0, y: 4000 },
  ];
  corners.forEach((c, i) => {
    store().editFloor('Draw wall', fid(), (f) => {
      addWall(f, c, corners[(i + 1) % 4]!, { thickness: 100, justification: 'center' });
    });
  });
}

beforeEach(() => store().loadProject(createProject('Test')));

describe('project store', () => {
  it('detects rooms as walls are drawn', () => {
    drawSquare();
    expect(wallCount()).toBe(4);
    expect(Object.keys(floor().rooms)).toHaveLength(1);
  });

  it('undoes and redoes every step', () => {
    drawSquare();
    store().undo();
    expect(wallCount()).toBe(3);
    expect(floor().rooms).toEqual({});
    store().undo();
    store().undo();
    store().undo();
    expect(wallCount()).toBe(0);
    store().undo(); // nothing left: no-op
    for (let i = 0; i < 4; i++) store().redo();
    expect(wallCount()).toBe(4);
    expect(Object.keys(floor().rooms)).toHaveLength(1);
  });

  it('a new edit discards the redo branch', () => {
    drawSquare();
    store().undo();
    store().editFloor('Other', fid(), (f) => addWall(f, { x: 0, y: 0 }, { x: 0, y: -2000 }));
    expect(store().history.future).toEqual([]);
  });

  it('turns a drag into a single undo step', () => {
    drawSquare();
    const corner = Object.values(floor().wallNodes).find(
      (n) => n.position.x === 4000 && n.position.y === 4000,
    )!;
    store().beginTransaction('Move corner');
    for (const x of [4100, 4200, 4500])
      store().editFloor('Move corner', fid(), (f) => moveNode(f, corner.id, { x, y: 4000 }));
    store().commitTransaction();
    expect(floor().wallNodes[corner.id]!.position.x).toBe(4500);
    store().undo();
    expect(floor().wallNodes[corner.id]!.position.x).toBe(4000);
  });

  it('cancelling a transaction restores the state before it', () => {
    drawSquare();
    const before = store().project;
    store().beginTransaction('Drag');
    store().editFloor('Drag', fid(), (f) => addWall(f, { x: 0, y: 0 }, { x: -3000, y: 0 }));
    store().cancelTransaction();
    expect(floor().walls).toEqual(orderedFloors(before)[0]!.walls);
  });

  it('loading a project clears history', () => {
    drawSquare();
    store().loadProject(createProject('Fresh'));
    expect(store().history.past).toEqual([]);
  });

  it('records nothing for a no-op edit', () => {
    drawSquare();
    const past = store().history.past.length;
    const updatedAt = store().project.updatedAt;
    store().editFloor('Noop', fid(), () => undefined);
    store().edit('Noop', () => undefined);
    expect(store().history.past).toHaveLength(past);
    expect(store().project.updatedAt).toBe(updatedAt);
  });

  it('a double click that adds no wall does not create an undo step', () => {
    drawSquare();
    const past = store().history.past.length;
    store().editFloor('Draw wall', fid(), (f) =>
      addWall(f, { x: 0, y: 0 }, { x: 0, y: 0 }, { thickness: 100, justification: 'center' }),
    );
    expect(store().history.past).toHaveLength(past);
  });

  it('ignores edits to an unknown floor instead of falling back to the ground floor', () => {
    const before = store().project;
    store().editFloor('Bad', 'nope', (f) => addWall(f, { x: 0, y: 0 }, { x: 1000, y: 0 }));
    store().editFloor('Bad', null, (f) => addWall(f, { x: 0, y: 0 }, { x: 1000, y: 0 }));
    expect(store().project).toBe(before);
  });

  it('keeps the active floor valid after loading another project', () => {
    useViewStore.setState({ activeFloorId: 'gone' });
    store().loadProject(createProject('Other'));
    expect(useViewStore.getState().activeFloorId).toBe(floor().id);
  });

  it('variant switches are undoable and keep history coherent', () => {
    drawSquare();
    const first = store().project.activeVariantId;
    const { duplicateVariant } = actions;
    duplicateVariant();
    expect(store().project.activeVariantId).not.toBe(first);
    store().undo();
    expect(store().project.activeVariantId).toBe(first);
    expect(wallCount()).toBe(4);
  });
});

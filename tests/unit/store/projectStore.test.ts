import { beforeEach, describe, expect, it } from 'vitest';
import { orderedFloors } from '@/domain/model/project';
import { addWall, moveNode } from '@/domain/model/walls';
import { createProject } from '@/domain/schema';
import { useProjectStore } from '@/store/projectStore';

const store = () => useProjectStore.getState();
const floor = () => orderedFloors(store().project)[0]!;
const wallCount = () => Object.keys(floor().walls).length;

function drawSquare() {
  const corners = [
    { x: 0, y: 0 },
    { x: 4000, y: 0 },
    { x: 4000, y: 4000 },
    { x: 0, y: 4000 },
  ];
  corners.forEach((c, i) => {
    store().editFloor('Draw wall', null, (f) => {
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
    store().editFloor('Other', null, (f) => addWall(f, { x: 0, y: 0 }, { x: 0, y: -2000 }));
    expect(store().history.future).toEqual([]);
  });

  it('turns a drag into a single undo step', () => {
    drawSquare();
    const corner = Object.values(floor().wallNodes).find(
      (n) => n.position.x === 4000 && n.position.y === 4000,
    )!;
    store().beginTransaction('Move corner');
    for (const x of [4100, 4200, 4500])
      store().editFloor('Move corner', null, (f) => moveNode(f, corner.id, { x, y: 4000 }));
    store().commitTransaction();
    expect(floor().wallNodes[corner.id]!.position.x).toBe(4500);
    store().undo();
    expect(floor().wallNodes[corner.id]!.position.x).toBe(4000);
  });

  it('cancelling a transaction restores the state before it', () => {
    drawSquare();
    const before = store().project;
    store().beginTransaction('Drag');
    store().editFloor('Drag', null, (f) => addWall(f, { x: 0, y: 0 }, { x: -3000, y: 0 }));
    store().cancelTransaction();
    expect(floor().walls).toEqual(orderedFloors(before)[0]!.walls);
  });

  it('loading a project clears history', () => {
    drawSquare();
    store().loadProject(createProject('Fresh'));
    expect(store().history.past).toEqual([]);
  });
});

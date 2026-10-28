import { beforeEach, describe, expect, it } from 'vitest';
import { addWall } from '@/domain/model/walls';
import { orderedFloors } from '@/domain/model/project';
import { createProject } from '@/domain/schema';
import { addRoofFromWalls } from '@/features/ceilings/actions';
import { useDialogStore } from '@/features/dialogs/dialogStore';
import { useProjectStore } from '@/store/projectStore';
import { DEFAULT_HEADROOM, useViewStore } from '@/store/viewStore';

const store = () => useProjectStore.getState();
const floor = () => orderedFloors(store().project)[0]!;

beforeEach(() => {
  store().loadProject(createProject('Test'));
  useViewStore.setState({ activeFloorId: floor().id, headroomLimits: DEFAULT_HEADROOM });
  store().editFloor('Walls', floor().id, (f) => {
    const wall = { thickness: 100, justification: 'center' as const };
    const pts = [
      { x: 0, y: 0 },
      { x: 6000, y: 0 },
      { x: 6000, y: 4000 },
      { x: 0, y: 4000 },
    ];
    pts.forEach((p, i) => addWall(f, p, pts[(i + 1) % 4]!, wall));
  });
});

function answer(ok: boolean) {
  const request = useDialogStore.getState().request;
  if (request?.kind !== 'confirm') throw new Error('no confirm pending');
  request.resolve(ok);
  useDialogStore.setState({ request: null });
}

describe('roof from walls', () => {
  it('adds a pair without asking, then asks before replacing and keeps one pair in one undo step', async () => {
    expect(await addRoofFromWalls()).toBe(2);
    expect(Object.keys(floor().ceilingPlanes)).toHaveLength(2);
    const steps = store().history.past.length;
    const pending = addRoofFromWalls();
    answer(true);
    expect(await pending).toBe(2);
    expect(Object.keys(floor().ceilingPlanes)).toHaveLength(2);
    expect(store().history.past.length).toBe(steps + 1);
  });

  it('leaves the existing planes alone when the replacement is declined', async () => {
    await addRoofFromWalls();
    const before = Object.keys(floor().ceilingPlanes);
    const pending = addRoofFromWalls();
    answer(false);
    expect(await pending).toBeNull();
    expect(Object.keys(floor().ceilingPlanes)).toEqual(before);
  });
});

describe('headroom limits', () => {
  it('rejects a low limit above the mid limit', () => {
    useViewStore.getState().setHeadroomLimits({ low: 2000 });
    expect(useViewStore.getState().headroomLimits).toEqual(DEFAULT_HEADROOM);
    useViewStore.getState().setHeadroomLimits({ mid: 2100 });
    expect(useViewStore.getState().headroomLimits.mid).toBe(2100);
  });
});

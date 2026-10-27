import { describe, expect, it } from 'vitest';
import { addWall } from '@/domain/model/walls';
import { createFloor } from '@/domain/schema';
import { snapTargets } from '@/render2d/planData';

const WALL = { thickness: 100, justification: 'center' } as const;

function floorWith(...walls: [number, number, number, number][]) {
  const floor = createFloor('ground');
  for (const [x1, y1, x2, y2] of walls) addWall(floor, { x: x1, y: y1 }, { x: x2, y: y2 }, WALL);
  return floor;
}

describe('snapTargets', () => {
  const active = floorWith([0, 0, 1000, 0]);
  const ghost = floorWith([5000, 0, 5000, 2000]);

  it('offers only the active floor without a ghost', () => {
    const t = snapTargets(active);
    expect(t.nodes).toHaveLength(2);
    expect(t.segments).toHaveLength(1);
  });

  it('adds the ghost nodes and wall lines when a ghost floor is given', () => {
    const t = snapTargets(active, [], ghost);
    expect(t.nodes).toHaveLength(4);
    expect(t.nodes).toContainEqual({ x: 5000, y: 2000 });
    expect(t.segments).toHaveLength(2);
  });

  it('exclusions apply to the active floor only, and the ghost works without an active floor', () => {
    const [first] = Object.values(active.wallNodes);
    const t = snapTargets(active, [first!.id], ghost);
    expect(t.nodes).toHaveLength(1 + 2);
    expect(t.segments).toHaveLength(1);
    expect(snapTargets(undefined, [], ghost).nodes).toHaveLength(2);
    expect(snapTargets(undefined)).toEqual({ nodes: [], segments: [] });
  });
});

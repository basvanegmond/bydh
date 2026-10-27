import { describe, expect, it } from 'vitest';
import {
  addFloor,
  ceilingSlabThickness,
  copyWallsFrom,
  describeFloorContents,
  removeFloor,
  setFloorHeight,
} from '@/domain/model/floors';
import { floorElevations } from '@/domain/schema/floors';
import { createBuilding } from '@/domain/schema';
import type { Building, Stair } from '@/domain/schema';
import { flatCeilingHeight } from '@/domain/model/ceilings';
import { INTERIOR, threeRoomFloor } from './fixtures';
import { addWall } from '@/domain/model/walls';

const levels = (b: Building) => b.floorOrder.map((id) => b.floors[id]!.level);

function stairBetween(from: string, to: string): Stair {
  return {
    id: `${from}-${to}`,
    fromFloorId: from,
    toFloorId: to,
    shape: 'straight',
    position: { x: 0, y: 0 },
    rotationDeg: 0,
    width: 900,
    runLength: 3000,
    steps: 15,
    cutsVoid: true,
  };
}

describe('addFloor', () => {
  it('adds levels above and below with defaults', () => {
    const b = createBuilding();
    const first = addFloor(b, 'above', { name: 'First' });
    const second = addFloor(b, 'above');
    const attic = addFloor(b, 'above');
    const cellar = addFloor(b, 'below');
    expect(levels(b)).toEqual(['basement', 'ground', 'first', 'second', 'attic']);
    expect(b.floorOrder[0]).toBe(cellar);
    expect(b.floors[first]).toMatchObject({ name: 'First', height: 2600, slabThickness: 200 });
    expect(b.floors[second]!.name).toBeUndefined();
    expect(b.floorOrder.at(-1)).toBe(attic);
  });

  it('honours height and slab options', () => {
    const b = createBuilding();
    const id = addFloor(b, 'above', { height: 2400, slabThickness: 150 });
    expect(b.floors[id]).toMatchObject({ height: 2400, slabThickness: 150 });
  });
});

describe('floor heights and elevations', () => {
  it('shifts floors above when a lower height changes', () => {
    const b = createBuilding();
    const first = addFloor(b, 'above');
    const second = addFloor(b, 'above');
    const ground = b.floorOrder[0]!;
    expect(floorElevations(b)[second]).toBe(2700 + 2600);
    expect(setFloorHeight(b.floors[ground]!, 3000)).toBe(true);
    expect(floorElevations(b)[first]).toBe(3000);
    expect(floorElevations(b)[second]).toBe(3000 + 2600);
  });

  it('rejects non-positive heights', () => {
    const b = createBuilding();
    const ground = b.floors[b.floorOrder[0]!]!;
    expect(setFloorHeight(ground, 0)).toBe(false);
    expect(setFloorHeight(ground, Number.NaN)).toBe(false);
    expect(ground.height).toBe(2700);
  });
});

describe('removeFloor', () => {
  it('removes the floor and the stairs that touch it', () => {
    const b = createBuilding();
    const ground = b.floorOrder[0]!;
    const first = addFloor(b, 'above');
    const second = addFloor(b, 'above');
    b.stairs['a'] = stairBetween(ground, first);
    b.stairs['b'] = stairBetween(first, second);
    expect(removeFloor(b, second)).toBe(true);
    expect(b.floorOrder).toEqual([ground, first]);
    expect(second in b.floors).toBe(false);
    expect(Object.keys(b.stairs)).toEqual(['a']);
  });

  it('refuses to remove the last floor or an unknown floor', () => {
    const b = createBuilding();
    expect(removeFloor(b, b.floorOrder[0]!)).toBe(false);
    expect(removeFloor(b, 'nope')).toBe(false);
    expect(b.floorOrder).toHaveLength(1);
  });

  it('shifts elevations of the floors above after removal', () => {
    const b = createBuilding();
    const ground = b.floorOrder[0]!;
    const first = addFloor(b, 'above');
    const second = addFloor(b, 'above');
    removeFloor(b, first);
    expect(floorElevations(b)).toEqual({ [ground]: 0, [second]: 2700 });
  });
});

describe('describeFloorContents', () => {
  it('counts what a delete would lose', () => {
    const b = createBuilding();
    const ground = b.floors[b.floorOrder[0]!]!;
    Object.assign(ground, threeRoomFloor(), { id: ground.id });
    const first = addFloor(b, 'above');
    b.stairs['a'] = stairBetween(ground.id, first);
    const counts = describeFloorContents(ground, b);
    expect(counts.walls).toBe(Object.keys(ground.walls).length);
    expect(counts.walls).toBeGreaterThan(0);
    expect(counts.stairs).toBe(1);
    expect(describeFloorContents(b.floors[first]!, b)).toMatchObject({ walls: 0, rooms: 0, stairs: 1 });
  });
});

describe('copyWallsFrom', () => {
  it('copies nodes and walls with new ids and no openings or rooms', () => {
    const source = threeRoomFloor();
    const target = addTargetFloor();
    copyWallsFrom(target, source);
    expect(Object.keys(target.walls)).toHaveLength(Object.keys(source.walls).length);
    expect(Object.keys(target.wallNodes)).toHaveLength(Object.keys(source.wallNodes).length);
    expect(Object.keys(target.rooms)).toHaveLength(0);
    expect(Object.keys(target.openings)).toHaveLength(0);
    for (const id of Object.keys(target.walls)) expect(id in source.walls).toBe(false);
    for (const wall of Object.values(target.walls)) {
      expect(wall.startNodeId in target.wallNodes).toBe(true);
      expect(wall.endNodeId in target.wallNodes).toBe(true);
    }
  });

  it('keeps geometry and does not alias the source', () => {
    const source = threeRoomFloor();
    const target = addTargetFloor();
    copyWallsFrom(target, source);
    const positions = (f: typeof source) =>
      Object.values(f.wallNodes)
        .map((n) => `${n.position.x},${n.position.y}`)
        .sort();
    expect(positions(target)).toEqual(positions(source));
    const wall = Object.values(target.walls)[0]!;
    wall.thickness = 1;
    expect(Object.values(source.walls).every((w) => w.thickness !== 1)).toBe(true);
  });

  it('adds to existing target walls', () => {
    const target = addTargetFloor();
    addWall(target, { x: -5000, y: -5000 }, { x: -4000, y: -5000 }, INTERIOR);
    copyWallsFrom(target, threeRoomFloor());
    expect(Object.keys(target.walls).length).toBeGreaterThan(1);
  });
});

function addTargetFloor() {
  const b = createBuilding();
  return b.floors[addFloor(b, 'above')]!;
}

describe('ceilingSlabThickness', () => {
  it('uses the slab of the floor above, and the own slab on the top floor', () => {
    const b = createBuilding();
    const ground = b.floors[b.floorOrder[0]!]!;
    ground.slabThickness = 300;
    const first = b.floors[addFloor(b, 'above', { slabThickness: 200 })]!;
    expect(ceilingSlabThickness(b, ground.id)).toBe(200);
    expect(ceilingSlabThickness(b, first.id)).toBe(200);
    first.slabThickness = 250;
    expect(ceilingSlabThickness(b, ground.id)).toBe(250);
    expect(flatCeilingHeight(ground, ceilingSlabThickness(b, ground.id))).toBe(ground.height - 250);
  });
});

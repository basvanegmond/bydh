import { describe, expect, it } from 'vitest';
import {
  addWall,
  deleteWall,
  ensureNodeAt,
  findNodeAt,
  moveNode,
  moveWall,
  setWallLength,
  splitWall,
  wallEnds,
  wallLength,
  wallsAtNode,
} from '@/domain/model/walls';
import { emptyFloor, EXTERIOR, INTERIOR, threeRoomFloor } from './fixtures';

const count = (record: object) => Object.keys(record).length;

describe('addWall', () => {
  it('creates two nodes and one wall', () => {
    const floor = emptyFloor();
    const ids = addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 }, INTERIOR);
    expect(ids).toHaveLength(1);
    expect(count(floor.wallNodes)).toBe(2);
    expect(wallLength(floor, floor.walls[ids[0]!]!)).toBe(4000);
  });

  it('ignores zero-length walls and exact duplicates', () => {
    const floor = emptyFloor();
    expect(addWall(floor, { x: 0, y: 0 }, { x: 0, y: 0 })).toEqual([]);
    addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 });
    expect(addWall(floor, { x: 4000, y: 0 }, { x: 0, y: 0 })).toEqual([]);
    expect(count(floor.walls)).toBe(1);
  });

  it('splits an existing wall at a T-junction', () => {
    const floor = emptyFloor();
    addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 });
    addWall(floor, { x: 2000, y: 0 }, { x: 2000, y: 3000 });
    expect(count(floor.walls)).toBe(3);
    const junction = findNodeAt(floor, { x: 2000, y: 0 })!;
    expect(wallsAtNode(floor, junction)).toHaveLength(3);
  });

  it('splits both walls where they cross (X-junction)', () => {
    const floor = emptyFloor();
    addWall(floor, { x: 0, y: 2000 }, { x: 4000, y: 2000 });
    addWall(floor, { x: 2000, y: 0 }, { x: 2000, y: 4000 });
    expect(count(floor.walls)).toBe(4);
    expect(wallsAtNode(floor, findNodeAt(floor, { x: 2000, y: 2000 })!)).toHaveLength(4);
  });

  it('splits the new wall at existing nodes it passes through', () => {
    const floor = emptyFloor();
    addWall(floor, { x: 2000, y: 0 }, { x: 2000, y: 3000 });
    addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 });
    expect(count(floor.walls)).toBe(3);
  });

  it('snaps endpoints onto nearby nodes within the tolerance', () => {
    const floor = emptyFloor();
    addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 });
    addWall(floor, { x: 4008, y: 5 }, { x: 4000, y: 3000 }, INTERIOR, 20);
    expect(count(floor.wallNodes)).toBe(3);
  });

  it('copies wall properties to each piece', () => {
    const floor = emptyFloor();
    addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 }, EXTERIOR);
    addWall(floor, { x: 2000, y: -2000 }, { x: 2000, y: 2000 }, INTERIOR);
    const thicknesses = Object.values(floor.walls)
      .map((w) => w.thickness)
      .sort();
    expect(thicknesses).toEqual([100, 100, 300, 300]);
  });
});

describe('splitWall', () => {
  it('moves openings beyond the split onto the new piece', () => {
    const floor = emptyFloor();
    const [wallId] = addWall(floor, { x: 0, y: 0 }, { x: 6000, y: 0 });
    floor.openings = {
      near: {
        id: 'near',
        wallId: wallId!,
        offset: 1000,
        width: 900,
        height: 2100,
        sillHeight: 0,
        spec: { type: 'door', operation: 'swing', hinge: 'left', opensTo: 'left' },
      },
      far: {
        id: 'far',
        wallId: wallId!,
        offset: 5000,
        width: 900,
        height: 1200,
        sillHeight: 900,
        spec: { type: 'window', operation: 'fixed', frameColor: '#ffffff' },
      },
    };
    splitWall(floor, wallId!, { x: 3000, y: 0 });
    expect(floor.openings['near']).toMatchObject({ wallId, offset: 1000 });
    expect(floor.openings['far']!.wallId).not.toBe(wallId);
    expect(floor.openings['far']!.offset).toBe(2000);
  });

  it('does not share nested objects between the pieces', () => {
    const floor = emptyFloor();
    const [wallId] = addWall(floor, { x: 0, y: 0 }, { x: 6000, y: 0 });
    splitWall(floor, wallId!, { x: 3000, y: 0 });
    const [a, b] = Object.values(floor.walls);
    a!.sides.left.color = '#ff0000';
    expect(b!.sides.left.color).toBeUndefined();
  });
});

describe('editing', () => {
  it('ensureNodeAt reuses nodes and splits walls', () => {
    const floor = emptyFloor();
    addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 });
    const start = findNodeAt(floor, { x: 0, y: 0 });
    expect(ensureNodeAt(floor, { x: 0, y: 0 })).toBe(start);
    ensureNodeAt(floor, { x: 1000, y: 0 });
    expect(count(floor.walls)).toBe(2);
  });

  it('moveNode drags connected walls and merges onto another node', () => {
    const floor = emptyFloor();
    addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 });
    addWall(floor, { x: 5000, y: 0 }, { x: 5000, y: 3000 });
    const loose = findNodeAt(floor, { x: 5000, y: 0 })!;
    const merged = moveNode(floor, loose, { x: 4000, y: 0 });
    expect(merged).toBe(findNodeAt(floor, { x: 4000, y: 0 }));
    expect(count(floor.wallNodes)).toBe(3);
    expect(wallsAtNode(floor, merged)).toHaveLength(2);
  });

  it('moveNode removes walls that collapse to zero length', () => {
    const floor = emptyFloor();
    addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 });
    moveNode(floor, findNodeAt(floor, { x: 4000, y: 0 })!, { x: 0, y: 0 });
    expect(count(floor.walls)).toBe(0);
  });

  it('moveWall translates both nodes', () => {
    const floor = emptyFloor();
    const [id] = addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 });
    moveWall(floor, id!, { x: 0, y: 500 });
    expect(wallEnds(floor, floor.walls[id!]!)).toEqual({ a: { x: 0, y: 500 }, b: { x: 4000, y: 500 } });
  });

  it('setWallLength moves the end node along the wall', () => {
    const floor = emptyFloor();
    const [id] = addWall(floor, { x: 0, y: 0 }, { x: 3000, y: 4000 });
    setWallLength(floor, id!, 10_000);
    const { b } = wallEnds(floor, floor.walls[id!]!);
    expect(b.x).toBeCloseTo(6000);
    expect(b.y).toBeCloseTo(8000);
  });

  it('deleteWall removes the wall, its openings and orphan nodes', () => {
    const floor = threeRoomFloor();
    const before = count(floor.wallNodes);
    const spur = addWall(floor, { x: 1000, y: 1000 }, { x: 2000, y: 1000 })[0]!;
    floor.openings['o'] = {
      id: 'o',
      wallId: spur,
      offset: 500,
      width: 600,
      height: 2000,
      sillHeight: 0,
      spec: { type: 'door', operation: 'doorway', hinge: 'left', opensTo: 'left' },
    };
    deleteWall(floor, spur);
    expect(count(floor.wallNodes)).toBe(before);
    expect(floor.openings).toEqual({});
  });
});

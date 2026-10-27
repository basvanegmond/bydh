import { describe, expect, it } from 'vitest';
import { computeWallOutlines, wallExtents } from '@/domain/model/outlines';
import { computeRoomGeometry, detectRoomFaces, syncRooms } from '@/domain/model/rooms';
import { addWall, deleteWall, findNodeAt, wallsAtNode } from '@/domain/model/walls';
import { drawLoop, emptyFloor, EXTERIOR, INTERIOR, threeRoomFloor } from './fixtures';

const m2 = (mm2: number) => Math.round(mm2 / 10_000) / 100;
const sortedAreas = (floor: Parameters<typeof detectRoomFaces>[0]) =>
  detectRoomFaces(floor)
    .map((f) => m2(f.area))
    .sort((a, b) => a - b);

describe('wall outlines', () => {
  it('a free wall is a rectangle around its centre line', () => {
    const floor = emptyFloor();
    const [id] = addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 }, EXTERIOR);
    expect(computeWallOutlines(floor)[id!]!.polygon).toEqual([
      { x: 0, y: -150 },
      { x: 4000, y: -150 },
      { x: 4000, y: 150 },
      { x: 0, y: 150 },
    ]);
  });

  it('justification moves the wall to one side of its line', () => {
    expect(wallExtents({ thickness: 300, justification: 'left' } as never)).toEqual({ left: 0, right: 300 });
    expect(wallExtents({ thickness: 300, justification: 'right' } as never)).toEqual({ left: 300, right: 0 });
  });

  it('mitres an L-corner on both the inside and the outside', () => {
    const floor = emptyFloor();
    const [east] = addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 }, EXTERIOR);
    addWall(floor, { x: 0, y: 0 }, { x: 0, y: 3000 }, EXTERIOR);
    const outline = computeWallOutlines(floor)[east!]!;
    expect(outline.startLeft).toEqual({ x: 150, y: 150 });
    expect(outline.startRight.x).toBeCloseTo(-150);
    expect(outline.startRight.y).toBeCloseTo(-150);
  });

  it('keeps the through-wall straight at a T-junction', () => {
    const floor = emptyFloor();
    addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 }, EXTERIOR);
    addWall(floor, { x: 2000, y: 0 }, { x: 2000, y: 3000 }, INTERIOR);
    const outlines = computeWallOutlines(floor);
    const junction = findNodeAt(floor, { x: 2000, y: 0 })!;
    const southFaces = wallsAtNode(floor, junction)
      .filter((w) => w.thickness === 300)
      .flatMap((w) => outlines[w.id]!.polygon.filter((p) => p.y < 0));
    expect(southFaces.every((p) => p.y === -150)).toBe(true);
  });

  it('falls back to square ends for very sharp angles', () => {
    const floor = emptyFloor();
    addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 }, EXTERIOR);
    addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 100 }, EXTERIOR);
    for (const outline of Object.values(computeWallOutlines(floor))) {
      for (const p of outline.polygon) expect(Math.hypot(p.x, p.y)).toBeLessThan(4300);
    }
  });
});

describe('room detection', () => {
  it('finds the three rooms of the fixture with their net areas', () => {
    expect(sortedAreas(threeRoomFloor())).toEqual([7.84, 7.84, 27.36]);
  });

  it('finds nothing in an open (unclosed) set of walls', () => {
    const floor = emptyFloor();
    addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 });
    addWall(floor, { x: 4000, y: 0 }, { x: 4000, y: 4000 });
    expect(detectRoomFaces(floor)).toEqual([]);
  });

  it('excludes a dead-end wall poking into a room from its area', () => {
    const floor = emptyFloor();
    drawLoop(
      floor,
      [
        { x: 0, y: 0 },
        { x: 4000, y: 0 },
        { x: 4000, y: 4000 },
        { x: 0, y: 4000 },
      ],
      INTERIOR,
    );
    addWall(floor, { x: 0, y: 2000 }, { x: 1000, y: 2000 }, INTERIOR);
    // 3.9 × 3.9 = 15.21 m², minus the spur footprint 0.95 × 0.1 = 0.095 m².
    expect(sortedAreas(floor)).toEqual([15.12]);
  });

  it('cuts a free-standing block out of the room around it', () => {
    const floor = emptyFloor();
    drawLoop(
      floor,
      [
        { x: 0, y: 0 },
        { x: 6000, y: 0 },
        { x: 6000, y: 6000 },
        { x: 0, y: 6000 },
      ],
      INTERIOR,
    );
    drawLoop(
      floor,
      [
        { x: 2000, y: 2000 },
        { x: 3000, y: 2000 },
        { x: 3000, y: 3000 },
        { x: 2000, y: 3000 },
      ],
      INTERIOR,
    );
    // Outer: 5.9² − 1.1² (island footprint) = 33.6 m²; island interior: 0.9² = 0.81 m².
    expect(sortedAreas(floor)).toEqual([0.81, 33.6]);
  });
});

describe('syncRooms', () => {
  it('creates one room per enclosed space and is stable when repeated', () => {
    const floor = threeRoomFloor();
    syncRooms(floor);
    const ids = Object.keys(floor.rooms).sort();
    expect(ids).toHaveLength(3);
    syncRooms(floor);
    expect(Object.keys(floor.rooms).sort()).toEqual(ids);
  });

  it('keeps a room name when a wall splits the room, and adds a room for the new half', () => {
    const floor = threeRoomFloor();
    syncRooms(floor);
    const left = Object.values(floor.rooms).find((r) => r.anchor.x < 5000)!;
    left.name = 'Woonkamer';
    addWall(floor, { x: 0, y: 1000 }, { x: 5000, y: 1000 }, INTERIOR);
    syncRooms(floor);
    expect(Object.keys(floor.rooms)).toHaveLength(4);
    expect(floor.rooms[left.id]?.name).toBe('Woonkamer');
  });

  it('merges rooms when the wall between them is deleted, keeping the first room', () => {
    const floor = threeRoomFloor();
    syncRooms(floor);
    const right = Object.values(floor.rooms).filter((r) => r.anchor.x > 5000);
    right[0]!.name = 'Keuken';
    const y = (nodeId: string) => floor.wallNodes[nodeId]!.position.y;
    const divider = Object.values(floor.walls).find(
      (w) => y(w.startNodeId) === 3000 && y(w.endNodeId) === 3000,
    )!;
    deleteWall(floor, divider.id);
    syncRooms(floor);
    expect(Object.keys(floor.rooms)).toHaveLength(2);
    expect(Object.values(floor.rooms).some((r) => r.name === 'Keuken')).toBe(true);
  });

  it('removes rooms whose space was opened up', () => {
    const floor = threeRoomFloor();
    syncRooms(floor);
    for (const wall of Object.values(floor.walls)) if (wall.thickness === 300) deleteWall(floor, wall.id);
    syncRooms(floor);
    expect(floor.rooms).toEqual({});
  });

  it('computes geometry and a label point inside each room', () => {
    const floor = threeRoomFloor();
    syncRooms(floor);
    const geometry = Object.values(computeRoomGeometry(floor));
    expect(geometry.map((g) => m2(g.area)).sort((a, b) => a - b)).toEqual([7.84, 7.84, 27.36]);
    for (const g of geometry) expect(g.labelPoint.x).toBeGreaterThan(0);
  });
});

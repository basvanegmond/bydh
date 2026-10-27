import { describe, expect, it } from 'vitest';
import { newId } from '@/domain/schema/factories';
import type { Floor, Opening } from '@/domain/schema';
import { normalizeFloor } from '@/domain/model/normalize';
import { computeWallOutlines } from '@/domain/model/outlines';
import { detectRoomFaces, syncRooms } from '@/domain/model/rooms';
import { addWall, moveNode, moveWall, setWallLength, splitWall, wallLength } from '@/domain/model/walls';
import { drawLoop, emptyFloor, EXTERIOR, INTERIOR } from './fixtures';

const box = (floor: Floor, w = 4000, h = 4000, x0 = 0) =>
  drawLoop(
    floor,
    [
      { x: x0, y: 0 },
      { x: x0 + w, y: 0 },
      { x: x0 + w, y: h },
      { x: x0, y: h },
    ],
    EXTERIOR,
  );

function addDoor(floor: Floor, wallId: string, offset: number, width = 900): Opening {
  const id = newId();
  const opening = {
    id,
    wallId,
    offset,
    width,
    height: 2100,
    sillHeight: 0,
    spec: { type: 'door' },
  } as unknown as Opening;
  floor.openings[id] = opening;
  return opening;
}

const within = (floor: Floor, o: Opening) => {
  const len = wallLength(floor, floor.walls[o.wallId]!);
  return o.offset - o.width / 2 >= -1e-6 && o.offset + o.width / 2 <= len + 1e-6;
};

describe('normalizeFloor', () => {
  it('splits a wall dragged across a box into separate rooms and is idempotent', () => {
    const floor = emptyFloor();
    box(floor);
    const [id] = addWall(floor, { x: 6000, y: 1000 }, { x: 7000, y: 1000 }, INTERIOR);
    const wall = floor.walls[id!]!;
    moveNode(floor, wall.startNodeId, { x: -1000, y: 2000 });
    moveNode(floor, wall.endNodeId, { x: 5000, y: 2000 });
    expect(detectRoomFaces(floor)).toHaveLength(1);
    normalizeFloor(floor);
    expect(detectRoomFaces(floor)).toHaveLength(2);
    const snapshot = JSON.stringify(floor);
    normalizeFloor(floor);
    expect(JSON.stringify(floor)).toBe(snapshot);
  });

  it('splits a wall at a node that landed on its middle', () => {
    const floor = emptyFloor();
    box(floor);
    const [id] = addWall(floor, { x: 2000, y: 6000 }, { x: 2000, y: 7000 }, INTERIOR);
    moveNode(floor, floor.walls[id!]!.startNodeId, { x: 2000, y: 0 });
    moveNode(floor, floor.walls[id!]!.endNodeId, { x: 2000, y: 4000 });
    normalizeFloor(floor);
    expect(Object.keys(floor.walls)).toHaveLength(7);
    expect(detectRoomFaces(floor)).toHaveLength(2);
  });

  it('moves openings of a merged duplicate wall to the kept wall', () => {
    const floor = emptyFloor();
    const [a] = addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 }, INTERIOR);
    const [b] = addWall(floor, { x: 0, y: 1000 }, { x: 4000, y: 1000 }, INTERIOR);
    const door = addDoor(floor, b!, 1000);
    moveWall(floor, b!, { x: 0, y: -1000 });
    normalizeFloor(floor);
    expect(Object.keys(floor.walls)).toHaveLength(1);
    expect(floor.walls[door.wallId]).toBeDefined();
    expect(floor.walls[a!] ?? Object.values(floor.walls)[0]).toBeDefined();
    expect(floor.openings[door.id]).toBeDefined();
  });
});

describe('openings', () => {
  it('splitting a wall keeps a door within its piece', () => {
    const floor = emptyFloor();
    const [id] = addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 }, INTERIOR);
    const door = addDoor(floor, id!, 2000);
    splitWall(floor, id!, { x: 2100, y: 0 });
    expect(within(floor, door)).toBe(true);
  });

  it('shortening a wall keeps openings inside it', () => {
    const floor = emptyFloor();
    const [id] = addWall(floor, { x: 0, y: 0 }, { x: 4000, y: 0 }, INTERIOR);
    const door = addDoor(floor, id!, 3500);
    setWallLength(floor, id!, 2000);
    expect(within(floor, door)).toBe(true);
  });
});

describe('syncRooms', () => {
  it('keeps name and id when the room is resized in one step', () => {
    const floor = emptyFloor();
    box(floor, 5000, 4000);
    syncRooms(floor);
    const room = Object.values(floor.rooms)[0]!;
    room.name = 'Kitchen';
    const previous = structuredClone(floor);
    const east = Object.values(floor.wallNodes).filter((n) => n.position.x === 5000);
    for (const n of east) moveNode(floor, n.id, { x: 2000, y: n.position.y });
    syncRooms(floor, undefined, previous);
    expect(Object.values(floor.rooms)).toHaveLength(1);
    expect(floor.rooms[room.id]?.name).toBe('Kitchen');
  });
});

describe('outlines', () => {
  it('does not invert a short stub on a thick wall', () => {
    const floor = emptyFloor();
    const [stub] = addWall(
      floor,
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { thickness: 300, justification: 'center' },
    );
    addWall(floor, { x: 100, y: 0 }, { x: 100, y: 3000 }, { thickness: 300, justification: 'center' });
    const outline = computeWallOutlines(floor)[stub!]!;
    const [p0, p1, p2, p3] = outline.polygon;
    const a =
      (p0!.x * p1!.y -
        p1!.x * p0!.y +
        p1!.x * p2!.y -
        p2!.x * p1!.y +
        p2!.x * p3!.y -
        p3!.x * p2!.y +
        p3!.x * p0!.y -
        p0!.x * p3!.y) /
      2;
    expect(a).toBeGreaterThan(0);
  });
});

describe('rooms', () => {
  it('subtracts a free-standing straight wall from the room area', () => {
    const floor = emptyFloor();
    box(floor, 5000, 5000);
    const base = detectRoomFaces(floor)[0]!.area;
    addWall(floor, { x: 1500, y: 2500 }, { x: 3500, y: 2500 }, INTERIOR);
    const faces = detectRoomFaces(floor);
    expect(faces).toHaveLength(1);
    expect(faces[0]!.area).toBeCloseTo(base - 2000 * 100, 0);
  });
});

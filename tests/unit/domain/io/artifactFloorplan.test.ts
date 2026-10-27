import { describe, expect, it } from 'vitest';
import {
  ArtifactFloorplanSchema,
  convertArtifactFloorplan,
  doorHingeAndSide,
  doorOperation,
  formatReport,
  toPlanPoint,
} from '@/domain/io/artifactFloorplan';
import type { ArtifactFloorplan } from '@/domain/io/artifactFloorplan';
import { deriveWallSegments } from '@/domain/io/artifactWalls';
import { orderedFloors } from '@/domain/model/project';
import { parseProjectFile, serializeProjectFile, toProjectFile } from '@/domain/schema';

/*
 * Synthetic data in the shape of the prototype export (not a real house): two 4 x 3 m rooms side
 * by side with a 0.29 m wall between them and a 0.25 m outer wall. Plan y points south.
 */

const room = (id: string, name: string, x0: number, x1: number, extra: object = {}) => ({
  id,
  level: 'g',
  name,
  kind: 'living',
  walls: true,
  polygons: [
    [
      [x0, 0],
      [x1, 0],
      [x1, 3],
      [x0, 3],
    ],
  ],
  default_colors: { floor: '#cdb792', wall: '#ebe7df' },
  ...extra,
});

const window1 = {
  id: 'w1',
  level: 'g',
  wall_orientation: 'east-west',
  wall_coordinate: -0.125,
  start_along_wall: 1,
  width_m: 1.2,
};

function input(overrides: Partial<ArtifactFloorplan> | Record<string, unknown> = {}): ArtifactFloorplan {
  return ArtifactFloorplanSchema.parse({
    schemaVersion: '1.0.0',
    rooms: [room('a', 'Room A', 0, 4), room('b', 'Room B', 4.29, 8, { kind: 'bath' })],
    fixed_elements: [
      {
        level: 'g',
        kind: 'stairs',
        name: 'Stair',
        rect: { x0: 1, y0: 1, x1: 2.3, y1: 1.9 },
        stair_steps: 'e',
      },
    ],
    doors: [
      {
        id: 'd1',
        level: 'g',
        wall_orientation: 'north-south',
        wall_coordinate: 4.145,
        start_along_wall: 1,
        width_m: 0.9,
        hinge: 'a',
        swing_direction: 1,
        type: 'swing',
      },
    ],
    windows: [window1],
    sloped_roof_zones: [{ id: 's0', level: 'e2', max_height_m: 1.5 }],
    wall_shell_rects: { g: [[-0.25, -0.25, 8.25, 3.25]] },
    ...overrides,
  });
}

const ground = (project: ReturnType<typeof convertArtifactFloorplan>['project']) =>
  orderedFloors(project)[0]!;

describe('toPlanPoint', () => {
  it('converts metres to mm, flips y (south to north) and snaps to 10 mm', () => {
    expect(toPlanPoint(1.234, 2.5)).toEqual({ x: 1230, y: -2500 });
    expect(toPlanPoint(0, 0)).toEqual({ x: 0, y: 0 });
  });
});

describe('deriveWallSegments', () => {
  const rect = (x0: number, x1: number) => [
    toPlanPoint(x0, 0),
    toPlanPoint(x1, 0),
    toPlanPoint(x1, 3),
    toPlanPoint(x0, 3),
  ];
  const shells = [{ x0: -250, x1: 8250, y0: -3250, y1: 250 }];

  it('puts one wall in the gap between rooms, as thick as the gap', () => {
    const segs = deriveWallSegments([rect(0, 4), rect(4.29, 8)], shells);
    const shared = segs.filter((s) => s.a.x === 4145 && s.b.x === 4145);
    expect(shared).toHaveLength(1);
    expect(shared[0]!.thickness).toBe(290);
    expect(Math.abs(shared[0]!.a.y - shared[0]!.b.y)).toBeGreaterThanOrEqual(3000);
  });

  it('puts exterior walls outside the room, up to the outer face of the shell', () => {
    const segs = deriveWallSegments([rect(0, 4), rect(4.29, 8)], shells);
    const west = segs.find((s) => s.a.x === -125 && s.b.x === -125);
    expect(west?.thickness).toBe(250);
  });

  it('falls back to the default exterior thickness without a shell', () => {
    const segs = deriveWallSegments([rect(0, 4)], []);
    expect(segs.find((s) => s.a.x === -125 && s.b.x === -125)?.thickness).toBe(250);
  });

  it('draws no wall between polygons of one room', () => {
    const segs = deriveWallSegments([rect(0, 4), rect(4, 8)], shells, {}, [0, 0]);
    expect(segs.some((s) => s.a.x === 4000 && s.b.x === 4000)).toBe(false);
  });
});

describe('doors', () => {
  const frame = (a: { x: number; y: number }, b: { x: number; y: number }) => ({
    start: a,
    end: b,
    centre: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
  });
  // North-south door from plan y 1.0 to 1.9 m (south): BYDH y -1000 to -1900.
  const ns = frame({ x: 4145, y: -1000 }, { x: 4145, y: -1900 });

  it('maps hinge a to the wall start when the wall runs north to south, swing 1 (east) to the left', () => {
    const r = doorHingeAndSide({ wall_orientation: 'north-south', hinge: 'a', swing_direction: 1 }, ns, {
      x: 0,
      y: -1,
    });
    expect(r).toEqual({ hinge: 'left', opensTo: 'left' });
  });

  it('mirrors hinge and side when the wall is drawn the other way', () => {
    const r = doorHingeAndSide({ wall_orientation: 'north-south', hinge: 'a', swing_direction: 1 }, ns, {
      x: 0,
      y: 1,
    });
    expect(r).toEqual({ hinge: 'right', opensTo: 'right' });
  });

  it('maps swing -1 on an east-west wall to the north side (BYDH +y)', () => {
    const ew = frame({ x: 1000, y: -3000 }, { x: 1900, y: -3000 });
    const r = doorHingeAndSide({ wall_orientation: 'east-west', hinge: 'b', swing_direction: -1 }, ew, {
      x: 1,
      y: 0,
    });
    expect(r).toEqual({ hinge: 'right', opensTo: 'left' });
  });

  it('maps door types to operations', () => {
    expect([doorOperation('swing'), doorOperation('double'), doorOperation('slide')]).toEqual([
      'swing',
      'double-swing',
      'sliding',
    ]);
  });
});

describe('convertArtifactFloorplan', () => {
  it('builds three named floors with stacked levels', () => {
    const { project } = convertArtifactFloorplan(input(), 'Test house');
    const floors = orderedFloors(project);
    expect(floors.map((f) => [f.level, f.name, f.height, f.slabThickness])).toEqual([
      ['ground', 'Begane grond', 2600, 200],
      ['first', '1e verdieping', 2600, 200],
      ['second', '2e verdieping', 2600, 200],
    ]);
  });

  it('detects both rooms, names them and applies the floor colour as a library material', () => {
    const { project, report } = convertArtifactFloorplan(input(), 'Test house');
    const rooms = Object.values(ground(project).rooms);
    expect(rooms.map((r) => r.name).sort()).toEqual(['Room A', 'Room B']);
    expect(report.floors[0]).toMatchObject({ inputRooms: 2, detectedRooms: 2, matchedPolygons: 2 });
    const finish = rooms.find((r) => r.name === 'Room B')!.floorFinish;
    expect(finish.pattern).toBe('tile');
    expect(project.library.materials[finish.materialId]?.color).toBe('#cdb792');
  });

  it('colours the wall sides from the neighbouring rooms', () => {
    const floor = ground(convertArtifactFloorplan(input(), 'T').project);
    const shared = Object.values(floor.walls).find((w) => w.thickness === 290)!;
    expect(shared.sides.left.color).toBe('#ebe7df');
    expect(shared.sides.right.color).toBe('#ebe7df');
  });

  it('places the door on the shared wall at the right offset', () => {
    const { project, report } = convertArtifactFloorplan(input(), 'T');
    const floor = ground(project);
    const door = Object.values(floor.openings).find((o) => o.spec.type === 'door')!;
    const wall = floor.walls[door.wallId]!;
    expect(wall.thickness).toBe(290);
    expect(door.width).toBe(900);
    expect(door.spec).toMatchObject({ operation: 'swing' });
    expect(report.floors[0]).toMatchObject({ doorsPlaced: 1, doorsInput: 1 });
    // Centre 1.45 m south of the room's north edge; the offset is measured along the wall.
    const a = floor.wallNodes[wall.startNodeId]!.position;
    const b = floor.wallNodes[wall.endNodeId]!.position;
    const t = door.offset / Math.hypot(b.x - a.x, b.y - a.y);
    expect(a.y + (b.y - a.y) * t).toBeCloseTo(-1450, 0);
  });

  it('places the window and reports openings without a wall', () => {
    const lost = input({
      windows: [window1, { ...window1, id: 'w2', wall_coordinate: 20 }],
    });
    const { project, report } = convertArtifactFloorplan(lost, 'T');
    const windows = Object.values(ground(project).openings).filter((o) => o.spec.type === 'window');
    expect(windows).toHaveLength(1);
    expect(windows[0]!.width).toBe(1200);
    expect(report.floors[0]!.windowsPlaced).toBe(1);
    expect(report.floors[0]!.skippedOpenings).toEqual([expect.stringContaining('w2')]);
  });

  it('creates a straight stair rising east from the rect, linking the floor above', () => {
    const { project, report } = convertArtifactFloorplan(input(), 'T');
    const building = Object.values(Object.values(project.variants)[0]!.scene.buildings)[0]!;
    const stairs = Object.values(building.stairs);
    expect(stairs).toHaveLength(1);
    const stair = stairs[0]!;
    expect(stair).toMatchObject({
      shape: 'straight',
      rotationDeg: 0,
      cutsVoid: true,
      position: { x: 1000, y: -1450 },
      runLength: 1300,
      width: 900,
      steps: 14,
    });
    expect(stair.fromFloorId).toBe(building.floorOrder[0]);
    expect(stair.toFloorId).toBe(building.floorOrder[1]);
    expect(report.floors[0]!.stairs).toBe(1);
  });

  it('does not wall rooms with walls: false and lists what was skipped', () => {
    const outdoors = input({
      rooms: [room('a', 'Room A', 0, 4), room('t', 'Garden', 10, 14, { walls: false })],
    });
    const { project, report } = convertArtifactFloorplan(outdoors, 'T');
    expect(Object.values(ground(project).rooms)).toHaveLength(1);
    expect(report.skipped.join('\n')).toContain('1 sloped roof zones');
    expect(formatReport(report)).toContain('Begane grond');
  });

  it('produces a file the app import accepts', () => {
    const { project } = convertArtifactFloorplan(input(), 'Test house');
    const result = parseProjectFile(serializeProjectFile(toProjectFile(project)));
    expect(result.ok).toBe(true);
  });
});

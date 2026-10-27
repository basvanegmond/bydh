import { describe, expect, it } from 'vitest';
import { floorGeometry } from '@/domain/model/floorGeometry';
import { addFloor } from '@/domain/model/floors';
import { headroomAreas, saddleRoofFromWalls, wallCeilingHook } from '@/domain/model/ceilings';
import { mainBuilding } from '@/domain/model/project';
import { syncRooms } from '@/domain/model/rooms';
import { floorSlabs } from '@/domain/model/slabs';
import { wallPieces } from '@/domain/model/openings';
import { addWall } from '@/domain/model/walls';
import type { WallProps } from '@/domain/model/walls';
import {
  createProject,
  floorElevations,
  parseProjectFile,
  serializeProjectFile,
  toProjectFile,
} from '@/domain/schema';
import type { Building, Floor, Opening, Project, Stair, Vec2 } from '@/domain/schema';

/* A synthetic three-floor house (not a real plan): 8 x 6 m shell on every floor. */

const EXTERIOR: WallProps = { thickness: 300, justification: 'center' };
const INTERIOR: WallProps = { thickness: 100, justification: 'center' };
const SHELL: Vec2[] = [
  { x: 0, y: 0 },
  { x: 8000, y: 0 },
  { x: 8000, y: 6000 },
  { x: 0, y: 6000 },
];

function shell(floor: Floor): void {
  SHELL.forEach((p, i) => addWall(floor, p, SHELL[(i + 1) % 4]!, EXTERIOR));
}

function opening(
  id: string,
  wallId: string,
  offset: number,
  spec: Opening['spec'],
  size: [number, number, number] = [900, 2100, 0],
): Opening {
  return { id, wallId, offset, width: size[0], height: size[1], sillHeight: size[2], spec };
}

function buildProject(): Project {
  const project = createProject('Round trip');
  const building = mainBuilding(project)!;
  const ground = building.floors[building.floorOrder[0]!]!;
  const firstId = addFloor(building, 'above', { name: 'First' });
  const atticId = addFloor(building, 'above', { name: 'Attic', height: 2800 });
  const first = building.floors[firstId]!;
  const attic = building.floors[atticId]!;

  for (const floor of [ground, first, attic]) shell(floor);
  addWall(ground, { x: 4000, y: 0 }, { x: 4000, y: 6000 }, INTERIOR);
  addWall(first, { x: 4000, y: 0 }, { x: 4000, y: 6000 }, INTERIOR);

  const doorOps = ['swing', 'double-swing', 'sliding', 'pocket', 'doorway'] as const;
  const groundWalls = Object.values(ground.walls);
  doorOps.forEach((operation, i) => {
    const w = groundWalls[i % groundWalls.length]!;
    const o = opening(`door-${operation}`, w.id, 1500, {
      type: 'door',
      operation,
      hinge: i % 2 ? 'left' : 'right',
      opensTo: 'left',
      ...(i === 0 ? { frameColor: '#ffffff' } : {}),
    });
    ground.openings[o.id] = o;
  });
  const windowOps = ['fixed', 'tilt-turn', 'casement', 'sliding', 'top-hung'] as const;
  const firstWalls = Object.values(first.walls);
  windowOps.forEach((operation, i) => {
    const w = firstWalls[i % firstWalls.length]!;
    const o = opening(
      `window-${operation}`,
      w.id,
      3500,
      { type: 'window', operation, divisions: 2 },
      [1200, 1200, 900],
    );
    first.openings[o.id] = o;
  });
  for (const floor of [ground, first, attic]) syncRooms(floor);

  for (const plane of saddleRoofFromWalls(attic, 1000, 35)) attic.ceilingPlanes[plane.id] = plane;

  const stair = (id: string, from: Floor, to: Floor, shape: Stair['shape'], position: Vec2): Stair => ({
    id,
    fromFloorId: from.id,
    toFloorId: to.id,
    shape,
    position,
    rotationDeg: 90,
    width: 900,
    runLength: 3000,
    steps: 15,
    cutsVoid: true,
    ...(shape === 'quarter-turn' ? { turn: 'right' as const } : {}),
  });
  building.stairs['stair-qt'] = stair('stair-qt', ground, first, 'quarter-turn', { x: 1500, y: 1000 });
  building.stairs['stair-st'] = stair('stair-st', first, attic, 'straight', { x: 5000, y: 1000 });
  return project;
}

function wallEnds(floor: Floor, wall: Floor['walls'][string]) {
  return { a: floor.wallNodes[wall.startNodeId]!.position, b: floor.wallNodes[wall.endNodeId]!.position };
}

function derived(building: Building) {
  const stairs = Object.values(building.stairs);
  return {
    elevations: floorElevations(building),
    floors: building.floorOrder.map((id) => {
      const floor = building.floors[id]!;
      const geometry = floorGeometry(floor);
      return {
        outlines: geometry.outlines,
        rooms: geometry.rooms,
        pieces: Object.values(floor.walls).map((w) =>
          wallPieces(floor, w, undefined, wallCeilingHook(floor, w, wallEnds(floor, w))),
        ),
        slabs: floorSlabs(floor, stairs),
        headroom: headroomAreas(floor, 1800),
      };
    }),
  };
}

const roundTrip = (project: Project): Project => {
  const result = parseProjectFile(serializeProjectFile(toProjectFile(project)));
  if (!result.ok) throw new Error(`${result.message} ${(result.issues ?? []).join('; ')}`);
  return result.file.project;
};

describe('phase 2 round trip', () => {
  it('builds a fixture with the expected content', () => {
    const building = mainBuilding(buildProject())!;
    const [ground, first, attic] = building.floorOrder.map((id) => building.floors[id]!);
    expect(building.floorOrder).toHaveLength(3);
    expect(Object.keys(ground!.openings)).toHaveLength(5);
    expect(Object.keys(first!.openings)).toHaveLength(5);
    expect(Object.keys(attic!.ceilingPlanes)).toHaveLength(2);
    expect(Object.keys(building.stairs)).toHaveLength(2);
    expect(Object.keys(ground!.rooms)).toHaveLength(2);
  });

  it('survives export and import with deep equality of the project', () => {
    const project = buildProject();
    expect(roundTrip(project)).toEqual(project);
  });

  it('derives identical geometry before and after', () => {
    const project = buildProject();
    const before = derived(mainBuilding(project)!);
    const after = derived(mainBuilding(roundTrip(project))!);
    expect(after).toEqual(before);
    // Sanity: the derived data is not trivially empty.
    expect(before.floors[1]!.slabs[0]!.holes).toHaveLength(1); // quarter-turn arrives on First
    expect(before.floors[2]!.slabs[0]!.holes).toHaveLength(1); // straight stair arrives on the attic
    expect(before.floors[2]!.headroom.length).toBeGreaterThan(0);
    expect(before.floors[0]!.pieces.flat().length).toBeGreaterThan(5);
    expect(Object.values(before.elevations).sort((a, b) => a - b)[2]).toBeGreaterThan(0);
  });

  it('is stable when exported twice', () => {
    const once = roundTrip(buildProject());
    expect(roundTrip(once)).toEqual(once);
  });

  it('opens the same project from a v2 file (no ceilingPlanes) via the v2 to v3 migration', () => {
    const project = buildProject();
    const building = mainBuilding(project)!;
    building.floors[building.floorOrder[2]!]!.ceilingPlanes = {};
    const file = JSON.parse(serializeProjectFile(toProjectFile(project))) as Record<string, unknown>;
    file['schemaVersion'] = 2;
    const variants = (
      file['project'] as { variants: Record<string, { scene: { buildings: Record<string, Building> } }> }
    ).variants;
    for (const variant of Object.values(variants)) {
      for (const b of Object.values(variant.scene.buildings)) {
        for (const floor of Object.values(b.floors)) delete (floor as Partial<Floor>).ceilingPlanes;
      }
    }
    const result = parseProjectFile(JSON.stringify(file));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.file.project).toEqual(project);
  });
});

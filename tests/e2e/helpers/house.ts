import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addWall } from '../../../src/domain/model/walls';
import { addFloor } from '../../../src/domain/model/floors';
import { syncRooms } from '../../../src/domain/model/rooms';
import { mainBuilding } from '../../../src/domain/model/project';
import { createProject, newId, serializeProjectFile, toProjectFile } from '../../../src/domain/schema';
import type { Vec2 } from '../../../src/domain/schema';

const WALL = { thickness: 200, justification: 'center' } as const;
const SQUARE: Vec2[] = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
];

export function buildProjectFile(): string {
  const project = createProject('Three-D test');
  const building = mainBuilding(project)!;
  const ground = building.floors[building.floorOrder[0]!]!;
  const upperId = addFloor(building, 'above', { name: 'Attic' });
  const upper = building.floors[upperId]!;
  for (const floor of [ground, upper]) {
    SQUARE.forEach((p, i) => addWall(floor, p, SQUARE[(i + 1) % 4]!, WALL));
  }
  syncRooms(ground);
  syncRooms(upper);
  const [south, , north] = Object.values(ground.walls);
  ground.openings[newId()] = {
    id: 'door-1',
    wallId: south!.id,
    offset: 2000,
    width: 930,
    height: 2315,
    sillHeight: 0,
    spec: { type: 'door', operation: 'swing', hinge: 'left', opensTo: 'left' },
  };
  ground.openings[newId()] = {
    id: 'window-1',
    wallId: north!.id,
    offset: 3000,
    width: 1200,
    height: 1200,
    sillHeight: 900,
    spec: { type: 'window', operation: 'casement', divisions: 1 },
  };
  upper.ceilingPlanes['plane-1'] = {
    id: 'plane-1',
    eave: { a: { x: -100, y: 0 }, b: { x: 6100, y: 0 } },
    kneeHeight: 1000,
    slopeDeg: 40,
    risesToward: 'left',
  };
  const stairId = newId();
  building.stairs[stairId] = {
    id: stairId,
    fromFloorId: ground.id,
    toFloorId: upperId,
    shape: 'quarter-turn',
    position: { x: 500, y: 1500 },
    rotationDeg: 0,
    width: 900,
    runLength: 3200,
    steps: 15,
    cutsVoid: true,
    turn: 'left',
  };
  return serializeProjectFile(toProjectFile(project));
}

export async function importHouse(page: Page) {
  await page.getByTestId('project-menu').click();
  await page.getByTestId('import-json').click();
  await page.getByTestId('import-file').setInputFiles({
    name: 'house.bydh.json',
    mimeType: 'application/json',
    buffer: Buffer.from(buildProjectFile()),
  });
  await page.getByTestId('import-as-new').click();
  await expect(page.getByTestId('import-dialog')).toBeHidden();
}

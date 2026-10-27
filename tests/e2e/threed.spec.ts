import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addWall } from '../../src/domain/model/walls';
import { addFloor } from '../../src/domain/model/floors';
import { mainBuilding } from '../../src/domain/model/project';
import { createProject, newId, serializeProjectFile, toProjectFile } from '../../src/domain/schema';
import type { Vec2 } from '../../src/domain/schema';

/*
 * The 3D view renders a synthetic two-storey house with a door, a window, a stair and a sloped attic
 * ceiling. The project is generated as a JSON file and imported through the app, because the opening,
 * stair and ceiling tools are 2D UI that is tested separately.
 */

const WALL = { thickness: 200, justification: 'center' } as const;
const SQUARE: Vec2[] = [
  { x: 0, y: 0 },
  { x: 6000, y: 0 },
  { x: 6000, y: 4000 },
  { x: 0, y: 4000 },
];

function buildProjectFile(): string {
  const project = createProject('Three-D test');
  const building = mainBuilding(project)!;
  const ground = building.floors[building.floorOrder[0]!]!;
  const upperId = addFloor(building, 'above', { name: 'Attic' });
  const upper = building.floors[upperId]!;
  for (const floor of [ground, upper]) {
    SQUARE.forEach((p, i) => addWall(floor, p, SQUARE[(i + 1) % 4]!, WALL));
  }
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

async function importHouse(page: Page) {
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

test('renders a house with a door, a window, a stair and a sloped ceiling in 3D', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('bydh.locale', 'en'));
  await page.goto('./');
  await expect(page.getByTestId('plan-svg')).toBeVisible();
  await importHouse(page);

  await page.getByTestId('view-3d').click();
  await expect(page.locator('[data-testid="pane-3d"] canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('scene-3d-error')).toHaveCount(0);

  // The stack control switches modes without breaking the scene.
  for (const mode of ['upTo', 'active', 'all']) {
    await page.getByTestId(`stack-mode-${mode}`).click();
    await expect(page.getByTestId(`stack-mode-${mode}`)).toHaveAttribute('aria-checked', 'true');
  }
  await expect(page.locator('[data-testid="pane-3d"] canvas')).toBeVisible();
  await expect(page.getByTestId('scene-3d-error')).toHaveCount(0);
  expect(errors).toEqual([]);
});

import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Phase 2 acceptance: a two-floor house built only through the UI (synthetic 8 x 6 m plan), then reload,
 * export and import into a fresh browser. The per-feature specs (openings, floors, stairs, ceilings,
 * threed) cover the individual tools; this one covers what only shows when they work together.
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bydh.locale', 'en'));
  await page.goto('./');
  await expect(page.getByTestId('plan-svg')).toBeVisible();
});

/** Screen position of the plan origin: an empty floor is centred on it at 1 m = 50 px. */
async function planOrigin(page: Page) {
  const box = await page.getByTestId('plan-svg').boundingBox();
  if (!box) throw new Error('plan not visible');
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, scale: 0.05 };
}
type Origin = Awaited<ReturnType<typeof planOrigin>>;
const toScreen = (o: Origin, x: number, y: number) => ({ x: o.x + x * o.scale, y: o.y - y * o.scale });

async function click(page: Page, o: Origin, x: number, y: number) {
  const p = toScreen(o, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

/** Draws a closed 8 x 6 m rectangle with the wall tool, from the plan origin. */
async function drawRoom(page: Page, o: Origin) {
  await page.keyboard.press('w');
  const start = toScreen(o, 0, 0);
  await page.mouse.click(start.x, start.y);
  const legs: [number, number, string][] = [
    [1, 0, '800'],
    [0, 1, '600'],
    [-1, 0, '800'],
    [0, -1, '600'],
  ];
  let [x, y] = [0, 0];
  for (const [dx, dy, typed] of legs) {
    const here = toScreen(o, x, y);
    await page.mouse.move(here.x + dx * 80, here.y - dy * 80);
    await page.keyboard.type(typed);
    await page.keyboard.press('Enter');
    x += dx * Number(typed) * 10;
    y += dy * Number(typed) * 10;
  }
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
  await expect(page.getByTestId('room')).toHaveCount(1);
}

async function addFloorAboveWithWalls(page: Page) {
  await page.getByTestId('floor-switcher').click();
  await page.getByTestId('floors-manage').click();
  await page.getByTestId('floor-copy-walls').click();
  await page.getByTestId('floor-add-above').click();
  await page.getByTestId('floors-panel').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('floors-panel')).toBeHidden();
}

async function pickFloor(page: Page, which: 'first' | 'last') {
  await page.getByTestId('floor-switcher').click();
  const option = page.getByTestId('floor-option');
  await (which === 'first' ? option.first() : option.last()).click();
  await expect(page.getByRole('menu')).toBeHidden();
}

const openings = (page: Page) => page.locator('[data-entity^="opening:"]');
const stairs = (page: Page) => page.locator('[data-entity^="stair:"]');
const planes = (page: Page) => page.locator('[data-entity^="ceilingPlane:"]');
const walls = (page: Page) => page.getByTestId('wall');

/** Counts what the plan shows for the active floor. */
async function counts(page: Page) {
  return {
    walls: await walls(page).count(),
    openings: await openings(page).count(),
    stairs: await stairs(page).count(),
    planes: await planes(page).count(),
  };
}

/** Top floor is listed first in the switcher, the ground floor last. */
async function expectHouse(page: Page) {
  await pickFloor(page, 'last');
  expect(await counts(page)).toEqual({ walls: 4, openings: 2, stairs: 1, planes: 0 });
  await expect(stairs(page)).toHaveAttribute('data-stair-direction', 'up');
  await pickFloor(page, 'first');
  expect(await counts(page)).toEqual({ walls: 4, openings: 1, stairs: 1, planes: 2 });
  await expect(stairs(page)).toHaveAttribute('data-stair-direction', 'down');
}

test('builds a two-floor house in the UI, reloads, exports and imports it elsewhere', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const o = await planOrigin(page);

  // Ground floor: shell, a door and a window on the south wall.
  await drawRoom(page, o);
  await page.keyboard.press('d');
  await click(page, o, 2000, 0);
  await page.keyboard.press('n');
  await click(page, o, 6000, 0);
  await expect(openings(page)).toHaveCount(2);

  // First floor: copied walls, a saddle roof from the walls, and a door on the low eave wall.
  await addFloorAboveWithWalls(page);
  await expect(walls(page)).toHaveCount(4);
  await expect(page.getByTestId('room')).toHaveCount(1);
  await page.keyboard.press('r');
  await page.getByTestId('ceiling-options').getByTestId('roof-from-walls').click();
  await expect(planes(page)).toHaveCount(2);
  await page.keyboard.press('d');
  await click(page, o, 4000, 0);
  await expect(openings(page)).toHaveCount(1);
  // The new door is selected; the roof plane (eave on the outer wall face) would win a click on the wall.
  await expect(page.getByTestId('opening-ceiling-warning')).toBeVisible(); // 2.3 m door under a 1 m knee wall

  // Stair from the ground floor up (two clicks: bottom step, direction).
  await pickFloor(page, 'last');
  await page.keyboard.press('s');
  await click(page, o, 1000, 1000);
  await click(page, o, 1000, 4000);
  await expect(stairs(page)).toHaveCount(1);
  await expectHouse(page);

  // Reload: wait for the autosave first, then everything must still be there.
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await expect(page.getByTestId('plan-svg')).toBeVisible();
  await expectHouse(page);

  // Export, then import into a fresh browser (empty storage, like the other laptop).
  await page.getByTestId('project-menu').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-json').click();
  const download = await downloadPromise;
  const path = await download.path();
  const exported = JSON.parse(await readFile(path, 'utf8')) as { schemaVersion: number };
  expect(exported.schemaVersion).toBe(3);

  const other = await browser.newContext();
  const page2 = await other.newPage();
  await page2.addInitScript(() => localStorage.setItem('bydh.locale', 'en'));
  await page2.goto('./');
  await expect(page2.getByTestId('plan-svg')).toBeVisible();
  await page2.getByTestId('project-menu').click();
  await page2.getByTestId('import-json').click();
  await page2.getByTestId('import-file').setInputFiles(path);
  await page2.getByTestId('import-as-new').click();
  await expect(page2.getByTestId('import-dialog')).toBeHidden();
  await expectHouse(page2);
  await other.close();
  expect(errors).toEqual([]);
});

test('every door and window operation can be chosen in the inspector', async ({ page }) => {
  const o = await planOrigin(page);
  await page.keyboard.press('w');
  const start = toScreen(o, 0, 0);
  await page.mouse.click(start.x, start.y);
  await page.mouse.move(start.x + 80, start.y);
  await page.keyboard.type('600');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('d');
  await click(page, o, 1500, 0);
  await page.keyboard.press('n');
  await click(page, o, 4500, 0);
  await page.keyboard.press('v');

  const door = page.locator('[data-entity^="opening:"][data-opening-type="door"]');
  const window = page.locator('[data-entity^="opening:"][data-opening-type="window"]');
  const pick = async (x: number, target: typeof door, ops: string[]) => {
    await click(page, o, x, 0);
    for (const op of ops) {
      await page.getByTestId('opening-operation').selectOption(op);
      await expect(target).toHaveAttribute('data-operation', op);
    }
  };
  await pick(1500, door, ['swing', 'double-swing', 'sliding', 'pocket', 'doorway']);
  await pick(4500, window, ['fixed', 'tilt-turn', 'casement', 'sliding', 'top-hung']);
  await expect(openings(page)).toHaveCount(2);
});

test('a project with an attic roof, a stair and openings renders in 3D without errors after reload', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const o = await planOrigin(page);
  await drawRoom(page, o);
  await page.keyboard.press('d');
  await click(page, o, 2000, 0);
  await addFloorAboveWithWalls(page);
  await page.keyboard.press('r');
  await page.getByTestId('ceiling-options').getByTestId('roof-from-walls').click();
  await expect(planes(page)).toHaveCount(2);
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await page.getByTestId('view-3d').click();
  await expect(page.locator('[data-testid="pane-3d"] canvas')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('scene-3d-error')).toHaveCount(0);
  expect(errors).toEqual([]);
});

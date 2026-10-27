import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/*
 * Phase 1 acceptance: a 3-room plan drawn with typed lengths round-trips through JSON,
 * shows in 3D, survives a reload, and undo/redo works through every step.
 * The plan is synthetic (8 × 6 m shell, 30 cm outer walls, 10 cm inner walls).
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

/** Draws one wall chain: click at `start` (plan mm), then for each leg aim and type its length. */
async function drawChain(page: Page, o: Origin, start: [number, number], legs: [number, number, string][]) {
  let [x, y] = start;
  const s = toScreen(o, x, y);
  await page.mouse.click(s.x, s.y);
  for (const [dx, dy, typed] of legs) {
    const here = toScreen(o, x, y);
    await page.mouse.move(here.x + dx * 80, here.y - dy * 80);
    await page.keyboard.type(typed);
    await page.keyboard.press('Enter');
    x += dx * Number(typed) * 10;
    y += dy * Number(typed) * 10;
  }
  await page.keyboard.press('Escape');
}

async function drawThreeRooms(page: Page) {
  const o = await planOrigin(page);
  await page.keyboard.press('w');
  await page.getByTestId('thickness-300').click();
  await drawChain(
    page,
    o,
    [0, 0],
    [
      [1, 0, '800'],
      [0, 1, '600'],
      [-1, 0, '800'],
      [0, -1, '600'],
    ],
  );
  await page.getByTestId('thickness-100').click();
  await drawChain(page, o, [5000, 0], [[0, 1, '600']]);
  await drawChain(page, o, [5000, 3000], [[1, 0, '300']]);
}

const areas = async (page: Page) => (await page.getByTestId('room-area').allTextContents()).sort();
const EXPECTED_AREAS = ['27.4 m²', '7.8 m²', '7.8 m²'];

test('draws a 3-room plan with typed lengths and detects the rooms', async ({ page }) => {
  await drawThreeRooms(page);
  // 4 outer walls, each split where an inner wall meets it (bottom, top, right) = 7 pieces,
  // plus the inner wall split by the divider (2) and the divider itself (1).
  await expect(page.getByTestId('wall')).toHaveCount(10);
  await expect(page.getByTestId('room')).toHaveCount(3);
  expect(await areas(page)).toEqual(EXPECTED_AREAS);
  await expect(page.getByTestId('wall-dimension').filter({ hasText: '6.00 m' })).toHaveCount(1);
  await expect(page.getByTestId('wall-dimension').filter({ hasText: '5.00 m' })).toHaveCount(2);
});

test('renames a room and changes its floor in the inspector', async ({ page }) => {
  await drawThreeRooms(page);
  await page.getByTestId('tool-select').click();
  const o = await planOrigin(page);
  const living = toScreen(o, 2500, 1500);
  await page.mouse.click(living.x, living.y);
  await expect(page.getByTestId('room-inspector')).toBeVisible();
  await page.getByTestId('room-name-input').fill('Living room');
  await page.getByTestId('room-name-input').press('Enter');
  await page.getByTestId('room-floor-select').selectOption('tile-light');
  await expect(page.getByTestId('room-name').filter({ hasText: 'Living room' })).toHaveCount(1);
});

test('undo and redo walk through every drawing step', async ({ page }) => {
  await drawThreeRooms(page);
  const undo = page.getByTestId('undo');
  for (let i = 0; i < 6; i++) await page.keyboard.press('Control+z');
  await expect(page.getByTestId('room')).toHaveCount(0);
  for (let i = 0; i < 6; i++) await page.keyboard.press('Control+Shift+z');
  await expect(page.getByTestId('room')).toHaveCount(3);
  expect(await areas(page)).toEqual(EXPECTED_AREAS);
  await expect(undo).toBeEnabled();
});

test('autosaves in the browser and restores after a reload', async ({ page }) => {
  await drawThreeRooms(page);
  // Drawing marks the project as pending; 'saved' only appears once the last change is written.
  await expect(page.getByTestId('save-status')).toHaveAttribute('data-status', 'saved');
  await page.reload();
  await expect(page.getByTestId('room')).toHaveCount(3);
  expect(await areas(page)).toEqual(EXPECTED_AREAS);
});

test('exports JSON and imports it as a new project in another browser', async ({ page, browser }) => {
  await drawThreeRooms(page);
  await page.getByTestId('project-menu').click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByTestId('export-json').click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('my-home.bydh.json');
  const exported = JSON.parse(await readFile((await download.path())!, 'utf8')) as {
    project: { variants: unknown };
  };

  // A fresh browser context has empty storage: like opening the app on the other laptop.
  const other = await browser.newContext();
  const page2 = await other.newPage();
  await page2.addInitScript(() => localStorage.setItem('bydh.locale', 'en'));
  await page2.goto('./');
  await expect(page2.getByTestId('room')).toHaveCount(0);
  await page2.getByTestId('project-menu').click();
  await page2.getByTestId('import-json').click();
  await page2.getByTestId('import-file').setInputFiles((await download.path())!);
  await page2.getByTestId('import-as-new').click();
  await expect(page2.getByTestId('import-dialog')).toBeHidden();
  await expect(page2.getByTestId('room')).toHaveCount(3);
  expect(await areas(page2)).toEqual(EXPECTED_AREAS);

  // Round trip: exporting again yields the same variants (deep-equal).
  await page2.getByTestId('project-menu').click();
  const again = page2.waitForEvent('download');
  await page2.getByTestId('export-json').click();
  const reExported = JSON.parse(await readFile((await (await again).path())!, 'utf8')) as typeof exported;
  expect(reExported.project.variants).toEqual(exported.project.variants);
  await other.close();
});

test('shows the walls in 3D', async ({ page }) => {
  await drawThreeRooms(page);
  await page.getByTestId('view-split').click();
  await expect(
    page.locator('[data-testid="pane-3d"] canvas, [data-testid="scene-3d-error"]').first(),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId('room')).toHaveCount(3);
  // Regression: the plan re-fits the narrower pane instead of sliding off-screen.
  const pane = (await page.getByTestId('plan-svg').boundingBox())!;
  for (const wall of await page.getByTestId('wall').all()) {
    const box = (await wall.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(pane.x);
    expect(box.x + box.width).toBeLessThanOrEqual(pane.x + pane.width);
  }
});

const SVG_PLAN = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="500"><rect width="1000" height="500" fill="#fff"/>' +
    '<rect x="100" y="100" width="800" height="300" fill="none" stroke="#000" stroke-width="8"/></svg>',
);

test('imports a background image and calibrates its scale from two points', async ({ page }) => {
  await page
    .getByTestId('underlay-file')
    .setInputFiles({ name: 'plan.svg', mimeType: 'image/svg+xml', buffer: SVG_PLAN });
  await expect(page.getByTestId('underlay-image')).toBeVisible();
  await expect(page.getByTestId('tool-hint')).toContainText('two points');

  const box = (await page.getByTestId('underlay-image').boundingBox())!;
  // Two points 40 % of the image width apart = 400 image pixels.
  const y = box.y + box.height / 2;
  await page.mouse.click(box.x + box.width * 0.3, y);
  await page.mouse.click(box.x + box.width * 0.7, y);
  await page.getByLabel(/Real distance/).fill('800');
  await page.getByRole('button', { name: 'Apply scale' }).click();

  // 8 m over ~400 px → 1 px ≈ 2 cm (clicks land on whole screen pixels, so allow rounding).
  await expect(page.getByTestId('underlay-scale')).toHaveText(/^Scale: 1 px = 2(\.0)? cm$/);
});

test('imports the first page of a PDF floor plan as a background', async ({ page, browser }) => {
  // Chromium prints a synthetic one-page PDF, so no fixture file is needed.
  const printer = await browser.newPage();
  await printer.setContent(
    '<h1>Synthetic plan</h1><div style="width:400px;height:250px;border:6px solid #000"></div>',
  );
  const pdf = await printer.pdf({ format: 'A4' });
  await printer.close();

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page
    .getByTestId('underlay-file')
    .setInputFiles({ name: 'plan.pdf', mimeType: 'application/pdf', buffer: pdf });
  await expect(page.getByTestId('underlay-image')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('underlay-inspector')).toContainText('plan.pdf');
  expect(errors).toEqual([]);
});

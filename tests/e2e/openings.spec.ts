import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/* Phase 2: place, edit, move, undo and delete doors and windows on a synthetic 4 m wall. */

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

/** Draws a 4 m wall along +x from the origin with the wall tool. */
async function drawWall(page: Page, o: Origin) {
  await page.keyboard.press('w');
  const start = toScreen(o, 0, 0);
  await page.mouse.click(start.x, start.y);
  await page.mouse.move(start.x + 80, start.y);
  await page.keyboard.type('400');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('wall')).toHaveCount(1);
}

async function click(page: Page, o: Origin, x: number, y: number) {
  const p = toScreen(o, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

const openings = (page: Page) => page.locator('[data-entity^="opening:"]');

async function placeDoorAndWindow(page: Page, o: Origin) {
  await page.keyboard.press('d');
  await click(page, o, 1000, 0);
  await page.keyboard.press('n');
  await click(page, o, 3000, 0);
  await expect(openings(page)).toHaveCount(2);
}

test('places a door and a window, shows them as gaps, and undoes both', async ({ page }) => {
  const o = await planOrigin(page);
  await drawWall(page, o);
  await page.keyboard.press('d');
  await expect(page.getByTestId('tool-door')).toHaveAttribute('aria-pressed', 'true');
  // The preview is red where nothing fits: a 4.5 m door on a 4 m wall.
  const width = page.getByTestId('default-door-width');
  await width.fill('450');
  await width.press('Enter');
  const mid = toScreen(o, 2000, 0);
  await page.mouse.move(mid.x, mid.y);
  await expect(page.getByTestId('opening-tool-overlay')).toHaveAttribute('data-invalid', 'true');
  await page.mouse.click(mid.x, mid.y);
  await expect(openings(page)).toHaveCount(0);
  await width.fill('93');
  await width.press('Enter');
  await placeDoorAndWindow(page, o);
  await expect(page.locator('[data-entity^="opening:"][data-opening-type="door"]')).toHaveCount(1);
  await expect(page.locator('[data-entity^="opening:"][data-opening-type="window"]')).toHaveCount(1);
  // The wall is drawn as pieces: one wall element with 3 solid parts.
  await expect(page.getByTestId('wall')).toHaveCount(1);
  await expect(page.getByTestId('wall').locator('polygon')).toHaveCount(3);

  await page.keyboard.press('Control+z');
  await expect(openings(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(openings(page)).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await page.keyboard.press('Control+Shift+z');
  await expect(openings(page)).toHaveCount(2);
});

test('uses the default size from the tool options', async ({ page }) => {
  const o = await planOrigin(page);
  await drawWall(page, o);
  await page.keyboard.press('d');
  await page.getByTestId('default-door-width').fill('80');
  await page.getByTestId('default-door-width').press('Enter');
  await click(page, o, 2000, 0);
  await expect(page.getByTestId('opening-width')).toHaveValue('80');
});

test('selects an opening, edits width and swing, and deletes it', async ({ page }) => {
  const o = await planOrigin(page);
  await drawWall(page, o);
  await placeDoorAndWindow(page, o);
  await page.getByTestId('tool-select').click();
  await click(page, o, 1000, 0);
  await expect(page.getByTestId('opening-inspector')).toBeVisible();
  await expect(page.getByTestId('opening-width')).toHaveValue('93');

  await page.getByTestId('opening-width').fill('80');
  await page.getByTestId('opening-width').press('Enter');
  await expect(page.getByTestId('opening-width')).toHaveValue('80');

  const door = page.locator('[data-entity^="opening:"][data-opening-type="door"]');
  const arc = door.locator('[data-shape="arc"]');
  const before = await arc.getAttribute('d');
  await page.getByTestId('flip-opens-to').click();
  expect(await arc.getAttribute('d')).not.toEqual(before);
  await page.getByTestId('opening-operation').selectOption('sliding');
  await expect(door).toHaveAttribute('data-operation', 'sliding');

  await click(page, o, 3000, 0);
  await page.getByTestId('opening-sill').fill('100');
  await page.getByTestId('opening-sill').press('Enter');
  await expect(page.getByTestId('opening-sill')).toHaveValue('100');

  await click(page, o, 1000, 0);
  await page.keyboard.press('Delete');
  await expect(openings(page)).toHaveCount(1);
  await page.keyboard.press('Control+z');
  await expect(openings(page)).toHaveCount(2);
  await click(page, o, 1000, 0);
  await page.getByTestId('delete-opening').click();
  await expect(openings(page)).toHaveCount(1);
});

test('drags an opening along its wall as one undo step', async ({ page }) => {
  const o = await planOrigin(page);
  await drawWall(page, o);
  await placeDoorAndWindow(page, o);
  await page.getByTestId('tool-select').click();
  const door = page.locator('[data-entity^="opening:"][data-opening-type="door"]');
  const before = (await door.boundingBox())!;
  const from = toScreen(o, 1000, 0);
  const to = toScreen(o, 2000, 0);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, to.y, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 4 });
  await page.mouse.up();
  const after = (await door.boundingBox())!;
  expect(after.x - before.x).toBeGreaterThan(40);

  await page.keyboard.press('Control+z');
  const undone = (await door.boundingBox())!;
  expect(Math.abs(undone.x - before.x)).toBeLessThan(2);
  await page.keyboard.press('Control+Shift+z');
  const redone = (await door.boundingBox())!;
  expect(Math.abs(redone.x - after.x)).toBeLessThan(2);
});

test('a locked wall blocks moving and deleting its openings', async ({ page }) => {
  const o = await planOrigin(page);
  await drawWall(page, o);
  await placeDoorAndWindow(page, o);
  await page.getByTestId('tool-select').click();
  await click(page, o, 2000, 0); // the wall piece between the two openings
  await page.getByTestId('lock-toggle').click();
  const door = page.locator('[data-entity^="opening:"][data-opening-type="door"]');
  const before = (await door.boundingBox())!;
  const from = toScreen(o, 1000, 0);
  const to = toScreen(o, 2000, 0);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  expect(Math.abs((await door.boundingBox())!.x - before.x)).toBeLessThan(2);
  await page.keyboard.press('Delete');
  await expect(openings(page)).toHaveCount(2);
  await expect(page.getByTestId('delete-opening')).toBeDisabled();
});

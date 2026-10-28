import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/* Phase 2: place, edit, move, undo and delete a stair that links two floors (synthetic plan). */

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

async function drawWall(page: Page, o: Origin) {
  await page.keyboard.press('w');
  const start = toScreen(o, 0, 0);
  await page.mouse.click(start.x, start.y);
  await page.mouse.move(start.x + 80, start.y);
  await page.keyboard.type('400');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
}

async function click(page: Page, o: Origin, x: number, y: number) {
  const p = toScreen(o, x, y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.click(p.x, p.y);
}

async function addFloorAbove(page: Page) {
  await page.getByTestId('floor-switcher').click();
  await page.getByTestId('floors-manage').click();
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

const stairs = (page: Page) => page.locator('[data-entity^="stair:"]');

test('stair tool needs a floor above', async ({ page }) => {
  await page.keyboard.press('s');
  await expect(page.getByTestId('tool-stair')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('tool-hint')).toContainText('Add a floor above');
  const o = await planOrigin(page);
  await click(page, o, 500, 1000);
  await click(page, o, 500, 4000);
  await expect(stairs(page)).toHaveCount(0);
});

test('stairs: place, show UP and DN, edit, move, undo and delete', async ({ page }) => {
  const o = await planOrigin(page);
  await drawWall(page, o);
  await addFloorAbove(page);
  await drawWall(page, o);
  await pickFloor(page, 'last'); // ground floor

  // Two clicks: bottom step, then direction (north).
  await page.keyboard.press('s');
  await click(page, o, 500, 1000);
  await click(page, o, 500, 4000);
  await expect(stairs(page)).toHaveCount(1);
  await expect(stairs(page)).toHaveAttribute('data-stair-direction', 'up');
  await expect(page.locator('[data-testid^="stair-label-"]')).toHaveText('UP');
  await expect(page.getByTestId('stair-inspector')).toBeVisible();

  // The upper floor shows the dashed outline with a DN label.
  await pickFloor(page, 'first');
  await expect(stairs(page)).toHaveAttribute('data-stair-direction', 'down');
  await expect(page.locator('[data-testid^="stair-label-"]')).toHaveText('DN');
  await pickFloor(page, 'last');

  // Select it and edit the shape.
  await page.keyboard.press('v');
  await click(page, o, 500, 2000);
  await expect(page.getByTestId('stair-inspector')).toBeVisible();
  await expect(page.getByTestId('stair-turn')).toHaveCount(0);
  await page.getByTestId('stair-shape').selectOption('quarter-turn');
  await expect(page.getByTestId('stair-turn')).toBeVisible();
  await page.getByTestId('stair-shape').selectOption('straight');

  // Too few steps: the riser warning shows; restoring the count clears it.
  const stepsInput = page.getByTestId('stair-steps');
  const original = await stepsInput.inputValue();
  await stepsInput.fill('4');
  await stepsInput.press('Enter');
  await expect(page.getByTestId('stair-warning-riser-too-high')).toBeVisible();
  await page.getByTestId('undo').click();
  await expect(page.getByTestId('stair-warning-riser-too-high')).toHaveCount(0);
  await expect(page.getByTestId('stair-steps')).toHaveValue(original);
  await page.getByTestId('redo').click();
  await expect(page.getByTestId('stair-warning-riser-too-high')).toBeVisible();
  await page.getByTestId('undo').click();

  // Dragging moves the stair as one undo step.
  const before = await stairs(page).boundingBox();
  const from = toScreen(o, 500, 2000);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y, { steps: 5 });
  await page.mouse.up();
  const after = await stairs(page).boundingBox();
  expect(after && before && after.x - before.x).toBeGreaterThan(40);

  // Delete from the inspector, undo, then delete with the keyboard.
  await page.getByTestId('delete-stair').click();
  await expect(stairs(page)).toHaveCount(0);
  await page.getByTestId('undo').click();
  await expect(stairs(page)).toHaveCount(1);
  await click(page, o, 500 + 1200, 2000);
  await page.keyboard.press('Delete');
  await expect(stairs(page)).toHaveCount(0);
});

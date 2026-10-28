import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

/* Phase 2: floor management, the floor switcher and the ghost floor (synthetic plan). */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bydh.locale', 'en'));
  await page.goto('./');
  await expect(page.getByTestId('plan-svg')).toBeVisible();
});

async function drawWall(page: Page, lengthCm: string) {
  const box = await page.getByTestId('plan-svg').boundingBox();
  if (!box) throw new Error('plan not visible');
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.keyboard.press('w');
  await page.mouse.click(x, y);
  await page.mouse.move(x + 200, y);
  await page.keyboard.type(lengthCm);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Escape');
  await page.keyboard.press('v');
}

async function openPanel(page: Page) {
  await page.getByTestId('floor-switcher').click();
  await page.getByTestId('floors-manage').click();
  await expect(page.getByTestId('floors-panel')).toBeVisible();
}

async function pickFloor(page: Page, which: 'first' | 'last') {
  await page.getByTestId('floor-switcher').click();
  const option = page.getByTestId('floor-option');
  await (which === 'first' ? option.first() : option.last()).click();
  await expect(page.getByRole('menu')).toBeHidden();
}

async function closePanel(page: Page) {
  await page.getByTestId('floors-panel').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('floors-panel')).toBeHidden();
}

test('floors: add, switch, ghost, rename, delete and undo', async ({ page }) => {
  const switcher = page.getByTestId('floor-switcher');
  await expect(switcher).toHaveText('Ground floor');
  await expect(page.getByTestId('ghost-floor')).toHaveCount(0); // nothing below the ground floor

  await drawWall(page, '400');
  await expect(page.getByTestId('wall')).toHaveCount(1);

  await openPanel(page);
  await page.getByTestId('floor-add-above').click();
  await expect(page.getByTestId('floor-row')).toHaveCount(2);
  await closePanel(page);
  await expect(switcher).toHaveText('First floor');
  await expect(page.getByTestId('wall')).toHaveCount(0);

  // The floor below shows as a ghost; drawing here adds a wall of our own.
  await expect(page.getByTestId('ghost-floor').locator('polygon')).toHaveCount(1);
  await expect(page.getByTestId('ghost-floor')).toHaveAttribute('pointer-events', 'none');
  await drawWall(page, '300');
  await expect(page.getByTestId('wall')).toHaveCount(1);

  await page.getByTestId('ghost-toggle').click();
  await expect(page.getByTestId('ghost-floor')).toHaveCount(0);
  await page.getByTestId('ghost-toggle').click();
  await expect(page.getByTestId('ghost-floor')).toHaveCount(1);

  // Switch with the dropdown.
  await pickFloor(page, 'last');
  await expect(switcher).toHaveText('Ground floor');
  await expect(page.getByTestId('wall')).toHaveCount(1);
  await pickFloor(page, 'first');
  await expect(switcher).toHaveText('First floor');

  // Rename the top floor (first row) and change its height.
  await openPanel(page);
  const topName = page.getByTestId('floor-name').first();
  await topName.fill('Attic');
  await topName.press('Enter');
  await expect(switcher).toHaveText('Attic');
  const height = page.getByTestId('floor-height').first();
  await height.fill('2.8 m');
  await height.press('Enter');
  await expect(height).toHaveValue(/2[.,]8/);

  // Delete with confirmation, then undo brings it back.
  await page.getByTestId('floor-delete').first().click();
  await expect(page.getByRole('dialog').filter({ hasText: '1 wall(s)' })).toBeVisible();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('confirm-ok')).toBeHidden();
  await expect(page.getByTestId('floor-row')).toHaveCount(1);
  await expect(switcher).toHaveText('Ground floor');

  await closePanel(page);
  await page.getByTestId('undo').click();
  await openPanel(page);
  await expect(page.getByTestId('floor-row')).toHaveCount(2);
  await expect(page.getByTestId('floor-name').first()).toHaveValue('Attic');
});

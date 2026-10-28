import { expect, test } from '@playwright/test';
import { importHouse } from './helpers/house';

test('3D camera controls: cutaway, inside view and reset', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('bydh.locale', 'en'));
  await page.goto('./');
  await expect(page.getByTestId('plan-svg')).toBeVisible();
  await importHouse(page);
  await page.getByTestId('view-3d').click();
  const canvas = page.locator('[data-testid="pane-3d"] canvas');
  await expect(canvas).toBeVisible({ timeout: 20_000 });

  await expect(page.getByTestId('stack-mode-upTo')).toHaveAttribute('aria-checked', 'true');
  const cutaway = page.getByTestId('cutaway-toggle');
  await expect(cutaway).toHaveAttribute('aria-pressed', 'true');
  await cutaway.click();
  await expect(cutaway).toHaveAttribute('aria-pressed', 'false');
  await cutaway.click();

  const inside = page.getByTestId('inside-view');
  await inside.click();
  await expect(inside).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas).toBeVisible();
  await canvas.hover();
  await page.mouse.wheel(0, -100);
  await inside.click();
  await expect(inside).toHaveAttribute('aria-pressed', 'false');

  await page.getByTestId('reset-view').click();
  await expect(canvas).toBeVisible();
  await expect(page.getByTestId('scene-3d-error')).toHaveCount(0);
  expect(errors).toEqual([]);
});

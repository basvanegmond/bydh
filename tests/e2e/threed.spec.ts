import { expect, test } from '@playwright/test';
import { importHouse } from './helpers/house';

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

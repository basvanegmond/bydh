import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Start every test in English with default view settings.
    localStorage.setItem('bydh.locale', 'en');
  });
});

test('loads the editor shell with an empty 2D plan', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('./');
  await expect(page).toHaveTitle(/BYDH/);
  await expect(page.getByTestId('project-name')).toContainText('My home');
  await expect(page.getByTestId('floor-switcher')).toHaveText('Ground floor');
  await expect(page.getByTestId('plan-svg')).toBeVisible();
  await expect(page.getByTestId('plan-grid').locator('line').first()).toBeAttached();
  await expect(page.getByTestId('scale-bar')).toContainText('m');
  expect(errors).toEqual([]);
});

test('wheel zoom changes the scale bar', async ({ page }) => {
  await page.goto('./');
  const scaleBar = page.getByTestId('scale-bar');
  const before = await scaleBar.textContent();
  await page.getByTestId('plan-svg').hover();
  await page.mouse.wheel(0, -800);
  await expect(scaleBar).not.toHaveText(before ?? '');
});

test('switches to the 3D view and renders a canvas', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('view-3d').click();
  await expect(page.getByTestId('pane-2d')).toHaveCount(0);
  // Headless CI may lack WebGL; then the friendly fallback must show instead of a crash.
  await expect(
    page.locator('[data-testid="pane-3d"] canvas, [data-testid="scene-3d-error"]').first(),
  ).toBeVisible({
    timeout: 20_000,
  });
});

test('split view shows both panes', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('view-split').click();
  await expect(page.getByTestId('pane-2d')).toBeVisible();
  await expect(page.getByTestId('pane-3d')).toBeVisible();
});

test('switches the interface to Dutch and remembers it', async ({ page }) => {
  await page.goto('./');
  await page.getByTestId('language-toggle').click();
  await expect(page.getByTestId('floor-switcher')).toHaveText('Begane grond');
  await expect(page.locator('html')).toHaveAttribute('lang', 'nl');
  const stored = await page.evaluate(() => localStorage.getItem('bydh.locale'));
  expect(stored).toBe('nl');
});

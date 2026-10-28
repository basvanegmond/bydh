import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';

/* Phase 2: sloped attic ceilings on a synthetic 8 x 6 m rectangular room. */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('bydh.locale', 'en'));
  await page.goto('./');
  await expect(page.getByTestId('plan-svg')).toBeVisible();
});

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

/** Adds a floor above the ground floor and makes it active. */
async function addUpperFloor(page: Page) {
  await page.getByTestId('floor-switcher').click();
  await page.getByTestId('floors-manage').click();
  await page.getByTestId('floor-add-above').click();
  await page.getByTestId('floors-panel').getByRole('button', { name: 'Close' }).click();
  await expect(page.getByTestId('floors-panel')).toBeHidden();
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

const planes = (page: Page) => page.locator('[data-entity^="ceilingPlane:"]');
const bands = (page: Page, kind: 'shade' | 'hatch') =>
  page.locator(`[data-testid="headroom-band"][data-band="${kind}"]`);
const heightOf = async (l: Locator) => (await l.boundingBox())?.height ?? 0;
const squareMetres = async (l: Locator) => Number((await l.innerText()).replace(/[^\d.]/g, ''));

test('roof from walls: planes, headroom bands, edits, usable area, undo and delete', async ({ page }) => {
  const o = await planOrigin(page);
  await addUpperFloor(page);
  await drawRoom(page, o);

  await page.keyboard.press('r');
  await expect(page.getByTestId('tool-ceiling')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('ceiling-options')).toBeVisible();
  await page.getByTestId('ceiling-options').getByTestId('roof-from-walls').click();
  await expect(planes(page)).toHaveCount(2);
  await expect(page.getByTestId('ceiling-plane-inspector')).toBeVisible();
  // Knee 100 cm equals the "unusable" limit, so only the shaded band (below 1.8 m) shows.
  await expect(bands(page, 'shade')).toHaveCount(2);
  await expect(bands(page, 'hatch')).toHaveCount(0);

  // Slope 40 -> 20 degrees: the band below 1.8 m gets wider.
  await page.keyboard.press('v');
  const before = await heightOf(bands(page, 'shade').first());
  const slope = page.getByTestId('plane-slope');
  await slope.fill('20');
  await slope.press('Enter');
  await expect.poll(() => heightOf(bands(page, 'shade').first())).toBeGreaterThan(before + 20);

  // A lower knee wall makes the area under 1.0 m appear (hatched).
  const knee = page.getByTestId('plane-knee');
  await knee.fill('50');
  await knee.press('Enter');
  await expect(bands(page, 'hatch').first()).toBeVisible();
  await expect(page.getByTestId('plane-reach')).not.toBeEmpty();

  // The room inspector shows the area with at least 1.8 m headroom, smaller than the total.
  const o2 = await planOrigin(page);
  await click(page, o2, 4000, 3000);
  await expect(page.getByTestId('room-inspector')).toBeVisible();
  const total = await squareMetres(page.getByTestId('room-area-value'));
  const usable = await squareMetres(page.getByTestId('room-usable-area-value'));
  expect(usable).toBeGreaterThan(0);
  expect(usable).toBeLessThan(total);

  // Undo the knee edit, then the slope edit, then the roof; redo brings them back.
  await page.keyboard.press('Control+z');
  await expect(bands(page, 'hatch')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await expect(planes(page)).toHaveCount(0);
  await expect(bands(page, 'shade')).toHaveCount(0);
  await page.keyboard.press('Control+Shift+z');
  await expect(planes(page)).toHaveCount(2);

  // Delete one plane with the key, the other with the inspector button (eave lines sit on the outer wall faces).
  await click(page, o2, 4000, -50);
  await expect(page.getByTestId('ceiling-plane-inspector')).toBeVisible();
  await page.keyboard.press('Delete');
  await expect(planes(page)).toHaveCount(1);
  await click(page, o2, 4000, 6050);
  await page.getByTestId('delete-ceiling-plane').click();
  await expect(planes(page)).toHaveCount(0);
});

test('ceiling tool: two clicks for the eave and a third on the rising side', async ({ page }) => {
  const o = await planOrigin(page);
  await page.keyboard.press('r');
  await click(page, o, 1000, 1000);
  await click(page, o, 5000, 1000);
  await click(page, o, 3000, 2500);
  await expect(planes(page)).toHaveCount(1);
  await expect(planes(page).first()).toHaveAttribute('data-rises-toward', 'left');
  await page.keyboard.press('Control+z');
  await expect(planes(page)).toHaveCount(0);
});

test('roof from walls explains itself when there are no outer walls', async ({ page }) => {
  await page.keyboard.press('r');
  await page.getByTestId('ceiling-options').getByTestId('roof-from-walls').click();
  await expect(page.getByTestId('ceiling-options').getByTestId('roof-from-walls-hint')).toBeVisible();
  await expect(planes(page)).toHaveCount(0);
});

import { expect, test, type Page } from '@playwright/test';
import { boot, shot, state } from './helpers';

// A scripted gamepad: navigator.getGamepads() returns one standard-mapping pad
// whose axes and buttons the test sets through window.__pad.
const FAKE_PAD = () => {
  const pad = {
    id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  (window as unknown as { __pad: typeof pad }).__pad = pad;
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
};

const B = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, SELECT: 8, START: 9, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

async function connect(page: Page) {
  await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
  await expect(page.locator('#toast')).toContainText('Stik terhubung', { timeout: 10_000 });
}
async function axes(page: Page, a: number[]) {
  await page.evaluate((v) => { (window as unknown as { __pad: { axes: number[] } }).__pad.axes = v; }, a);
}
async function hold(page: Page, i: number, on: boolean) {
  await page.evaluate(([b, p]) => {
    const btn = (window as unknown as { __pad: { buttons: { pressed: boolean; value: number }[] } }).__pad.buttons[b as number];
    btn.pressed = p as boolean; btn.value = p ? 1 : 0;
  }, [i, on] as const);
}
// Hold across at least two animation frames so a busy machine cannot miss the press.
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
async function press(page: Page, i: number) {
  await hold(page, i, true);
  await frames(page);
  await page.waitForTimeout(60);
  await hold(page, i, false);
  await frames(page);
}
const cam = (page: Page) => page.evaluate(() => (window.__kantor!.camera as () => { yaw: number; pitch: number; distance: number })());

test.describe('gamepad', () => {
  test.beforeEach(async ({ page }) => { await page.addInitScript(FAKE_PAD); });

  test('left stick walks, right stick turns the camera, bumpers zoom', async ({ page }) => {
    await boot(page);
    await connect(page);
    const start = (await state(page)).pos;
    // Hold the stick until the avatar has covered ground: frame rate varies under load.
    await axes(page, [0, -1, 0, 0]);
    await expect.poll(async () => { const p = (await state(page)).pos; return Math.hypot(p[0] - start[0], p[1] - start[1]); }, { timeout: 15_000 }).toBeGreaterThan(0.8);
    await axes(page, [0, 0, 0, 0]);

    const c0 = await cam(page);
    await axes(page, [0, 0, 1, 0]);
    await expect.poll(async () => Math.abs((await cam(page)).yaw - c0.yaw), { timeout: 15_000 }).toBeGreaterThan(0.3);
    await axes(page, [0, 0, 0, 0]);

    const d0 = (await cam(page)).distance;
    await hold(page, B.RB, true);
    await expect.poll(async () => (await cam(page)).distance, { timeout: 15_000 }).toBeLessThan(d0 * 0.95);
    await hold(page, B.RB, false);

    await press(page, B.X);
    await expect(page.locator('#touch-run')).toHaveAttribute('aria-pressed', 'true');
    await press(page, B.X);
    await expect(page.locator('#touch-run')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Start opens Settings, D-pad moves focus, A selects, B closes', async ({ page }, info) => {
    await boot(page);
    await connect(page);
    await press(page, B.START);
    const dlg = page.locator('#dlg-settings');
    await expect(dlg).toBeVisible();
    await press(page, B.DOWN);
    const first = await page.evaluate(() => document.activeElement?.closest('dialog')?.id ?? null);
    expect(first).toBe('dlg-settings');
    // Walk down to the language radios and pick the one that is not checked.
    const target = page.locator('#dlg-settings input[name="reducedMotion"]');
    const before = await target.isChecked();
    for (let i = 0; i < 12 && !(await target.evaluate((e) => e === document.activeElement)); i++) await press(page, B.DOWN);
    await expect(target).toBeFocused();
    await expect(page.locator('html')).toHaveAttribute('data-input', 'pad');
    await press(page, B.A);
    await expect(target).toBeChecked({ checked: !before });
    await shot(page, info, 'gamepad-settings');
    await press(page, B.B);
    await expect(dlg).toBeHidden();
    // Stick motion is ignored while a dialog is open, so nothing moved meanwhile.
  });

  test('D-pad reaches the HUD menu and A opens the map with Select', async ({ page }) => {
    await boot(page);
    await connect(page);
    await press(page, B.RIGHT);
    await expect.poll(() => page.evaluate(() => document.activeElement?.id ?? '')).toMatch(/^btn-/);
    await press(page, B.B);
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    await press(page, B.SELECT);
    await expect(page.locator('#dlg-map')).toBeVisible({ timeout: 10_000 });
    // A modal opened on top of the map is the one B closes first.
    await page.evaluate(() => (document.getElementById('dlg-help') as HTMLDialogElement).showModal());
    await press(page, B.B);
    await expect(page.locator('#dlg-help')).toBeHidden();
    await expect(page.locator('#dlg-map')).toBeVisible();
    await press(page, B.B);
    await expect(page.locator('#dlg-map')).toBeHidden();
  });

  test('in the Studio the D-pad reaches its buttons and the camera stays put', async ({ page }, info) => {
    test.skip(info.project.name === 'mobile', 'Studio editing is a desktop and tablet tool');
    await boot(page);
    await connect(page);
    await page.locator('#btn-studio').click();
    await expect.poll(() => page.evaluate(() => (window.__kantor!.studioOpen as () => boolean)())).toBe(true);
    const c0 = await cam(page);
    await axes(page, [0, 0, 1, 0]);
    await page.waitForTimeout(400);
    await axes(page, [0, 0, 0, 0]);
    expect((await cam(page)).yaw).toBeCloseTo(c0.yaw, 5);
    await press(page, B.DOWN);
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#studio-panel'))).toBe(true);
    for (let i = 0; i < 6; i++) await press(page, B.DOWN);
    await expect.poll(() => page.evaluate(() => document.activeElement?.closest('#studio-panel') ? document.activeElement.tagName : '')).not.toBe('');
    // A on a Studio button keeps focus in the panel even when the panel re-renders.
    const btn = page.locator('#studio-panel button:visible').first();
    await btn.focus();
    await press(page, B.A);
    await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest('#studio-panel'))).toBe(true);
  });
});

import { expect, test, type Page } from '@playwright/test';

// Local multiplayer (Budi 2026-10-14): a second gamepad joins on the intro
// card with A, leaves with B, and then drives its own player in the game.
const TWO_PADS = () => {
  const mk = (index: number) => ({
    id: `Test pad ${index} (STANDARD GAMEPAD)`, index, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  });
  const pads = [mk(0), mk(1)];
  (window as unknown as { __pads: typeof pads }).__pads = pads;
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pads[0], pads[1], null, null] });
};
type Pads = { __pads: { buttons: { pressed: boolean; value: number }[] }[] };
type St = { phase: string; players: number; pads: { p1: number | null; extra: number[] }; snap: Record<string, unknown> | null } | null;
const set = (page: Page, pad: number, btn: number, on: boolean) => page.evaluate(([p, b, v]) => {
  const x = (window as unknown as Pads).__pads[p as number].buttons[b as number]; x.pressed = v as boolean; x.value = v ? 1 : 0;
}, [pad, btn, on] as const);
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const tap = async (page: Page, pad: number, btn: number) => { await set(page, pad, btn, true); await frames(page); await set(page, pad, btn, false); await frames(page); };
const state = (page: Page) => page.evaluate(() => (window as unknown as { __mg: { state: () => St } }).__mg.state());
const A = 0, B = 1, RIGHT = 15;

async function openGame(page: Page, id: string) {
  await page.addInitScript(TWO_PADS);
  await page.goto(`/mg.html?game=${id}&seed=7`);
  await expect(page.locator('#mg-host .mg-card button.primary')).toBeVisible({ timeout: 20_000 });
  await frames(page);
}

test.describe('local multiplayer', () => {
  test('Tarung Kantor: pad 2 joins with A, leaves with B, joins again; both players pick fighters', async ({ page }) => {
    await openGame(page, 'tarung-kantor');
    await expect(page.locator('.mg-lobby li')).toHaveCount(1);
    await tap(page, 1, A);
    await expect(page.locator('.mg-lobby li')).toHaveCount(2);
    await expect(page.locator('.mg-lobby li').nth(1)).toContainText(/Pemain 2|Player 2/);
    await tap(page, 1, B);
    await expect(page.locator('.mg-lobby li')).toHaveCount(1);
    await tap(page, 1, A);
    await expect(page.locator('.mg-lobby li')).toHaveCount(2);
    // the joining A did not press Start; Pemain 1's A does
    expect((await state(page))?.phase).toBe('intro');
    await tap(page, 0, A);
    await expect.poll(async () => (await state(page))?.phase).toBe('play');
    const s = await state(page);
    expect(s?.players).toBe(2);
    expect(s?.pads).toEqual({ p1: 0, extra: [1] });
    expect(s?.snap?.versus).toBe(true);
    // Pemain 2 moves its own cursor and readies up, then Pemain 1
    const sel2 = s?.snap?.sel2 as number;
    await tap(page, 1, RIGHT);
    await expect.poll(async () => (await state(page))?.snap?.sel2).not.toBe(sel2);
    await tap(page, 1, A);
    await expect.poll(async () => (await state(page))?.snap?.ready).toEqual([false, true]);
    await tap(page, 0, A);
    await expect.poll(async () => (await state(page))?.snap?.phase).toBe('intro');
  });

  test('one pad alone still plays solo: its A presses Start, the game runs against the CPU', async ({ page }) => {
    await openGame(page, 'tarung-kantor');
    await tap(page, 0, A);
    await expect.poll(async () => (await state(page))?.phase).toBe('play');
    const s = await state(page);
    expect(s?.players).toBe(1);
    expect(s?.snap?.versus).toBe(false);
  });

  test('Arena Bom and Catur accept a second player; single-player games show no lobby', async ({ page }) => {
    await openGame(page, 'arena-bom');
    await tap(page, 1, A);
    await expect(page.locator('.mg-lobby li')).toHaveCount(2);
    await tap(page, 0, A);
    await expect.poll(async () => (await state(page))?.snap?.humans).toBe(2);

    await page.goto('/mg.html?game=catur&seed=7');
    await expect(page.locator('#mg-host .mg-card button.primary')).toBeVisible({ timeout: 20_000 });
    await frames(page);
    await tap(page, 1, A);
    await tap(page, 0, A);
    await expect.poll(async () => (await state(page))?.snap?.versus).toBe(true);

    await page.goto('/mg.html?game=lari-pagi&seed=7');
    await expect(page.locator('#mg-host .mg-card button.primary')).toBeVisible({ timeout: 20_000 });
    await expect(page.locator('.mg-lobby')).toHaveCount(0);
  });
});

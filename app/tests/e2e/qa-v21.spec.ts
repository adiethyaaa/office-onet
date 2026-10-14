import { expect, test, type Page } from '@playwright/test';
import { boot } from './helpers';

// QA v2.1 regressions outside the mini game folder: one press opens one layer,
// focus comes back after a mini game, the office keeps working afterwards.
const FAKE_PAD = () => {
  const pad = {
    id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
  };
  (window as unknown as { __pad: typeof pad }).__pad = pad;
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad, null, null, null] });
};
type Pad = { __pad: { buttons: { pressed: boolean; value: number }[] } };
const hold = (page: Page, i: number, on: boolean) => page.evaluate(([b, p]) => {
  const x = (window as unknown as Pad).__pad.buttons[b as number]; x.pressed = p as boolean; x.value = p ? 1 : 0;
}, [i, on] as const);
const frames = (page: Page) => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
const phase = (page: Page) => page.evaluate(async () => ((await (window.__kantor!.miniGameState as () => Promise<{ phase: string } | null>)()) ?? { phase: null }).phase);
const use = (page: Page, id: string) => page.evaluate((x) => (window.__kantor!.useInteractable as (x: string) => void)(x), id);
const layer = (page: Page) => page.evaluate(() => ({ arcade: !!document.getElementById('arcade'), host: !!document.getElementById('mg-host') }));

test.describe('QA v2.1 layers', () => {
  test('gamepad: A held from the Game Station does not launch slot 01; a fresh A does', async ({ page }) => {
    await page.addInitScript(FAKE_PAD);
    await boot(page);
    await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
    // A goes down, then the station opens while it is still held (like a human press).
    await hold(page, 0, true);
    await page.evaluate(() => (window.__kantor!.useInteractable as (x: string) => void)('FX-L2-064'));
    await expect(page.locator('#arcade')).toBeVisible({ timeout: 15_000 });
    await frames(page);
    await page.waitForTimeout(400);
    expect(await layer(page)).toEqual({ arcade: true, host: false });
    // The release must be seen by a poll before the next press counts: wait
    // two animation frames (software GL runs at ~6 fps).
    await hold(page, 0, false);
    await frames(page);
    await hold(page, 0, true);
    await frames(page);
    await expect(page.locator('#mg-host')).toBeVisible({ timeout: 15_000 });
    await hold(page, 0, false);
  });

  test('keyboard: a held Enter does not click through the Game Station', async ({ page }) => {
    await boot(page);
    await page.evaluate(() => (window.__kantor!.useInteractable as (x: string) => void)('FX-L2-064'));
    await expect(page.locator('#arcade')).toBeVisible({ timeout: 15_000 });
    const cdp = await page.context().newCDPSession(page);
    const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 };
    for (let i = 0; i < 6; i++) { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key, autoRepeat: true }); await page.waitForTimeout(40); }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    await page.waitForTimeout(400);
    expect(await layer(page)).toEqual({ arcade: true, host: false });
    await page.keyboard.press('Enter');
    await expect(page.locator('#mg-host')).toBeVisible({ timeout: 15_000 });
  });

  test('closing a facility game gives focus back to the opener and the CEO walks again', async ({ page }) => {
    await boot(page);
    await page.locator('#btn-directory').focus();
    await page.evaluate(() => (window.__kantor!.useInteractable as (x: string) => void)('FX-L2-077'));
    // Wait for the intro card: Esc during "Memuat permainan..." is ignored (noted in QA-V21.md).
    await expect(page.locator('#mg-host .mg-card button.primary')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#mg-host')).toHaveCount(0);
    await expect(page.locator('#btn-directory')).toBeFocused();
    const p0 = await page.evaluate(() => (window.__kantor!.state as () => { pos: [number, number] })().pos);
    await page.keyboard.down('s');
    await expect.poll(async () => {
      const p = await page.evaluate(() => (window.__kantor!.state as () => { pos: [number, number] })().pos);
      return Math.hypot(p[0] - p0[0], p[1] - p0[1]);
    }, { timeout: 10_000 }).toBeGreaterThan(0.3);
    await page.keyboard.up('s');
  });

  test('gamepad: A held from the Game Station slot does not press "Mulai" in the game', async ({ page }) => {
    await page.addInitScript(FAKE_PAD);
    await boot(page);
    await page.evaluate(() => window.dispatchEvent(new Event('gamepadconnected')));
    await use(page, 'FX-L2-064');
    await expect(page.locator('#arcade')).toBeVisible({ timeout: 15_000 });
    await frames(page);
    await hold(page, 0, true);
    await expect(page.locator('#mg-host .mg-card button.primary')).toBeVisible({ timeout: 15_000 });
    await frames(page);
    await page.waitForTimeout(500);
    expect(await phase(page)).toBe('intro');
    await hold(page, 0, false);
    await frames(page);
    await hold(page, 0, true);
    await expect.poll(() => phase(page), { timeout: 10_000 }).toBe('play');
    await hold(page, 0, false);
  });

  test('keyboard: a held Enter from the Game Station does not press "Mulai"', async ({ page }) => {
    await boot(page);
    await use(page, 'FX-L2-064');
    await expect(page.locator('#arcade')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Enter');
    await expect(page.locator('#mg-host .mg-card button.primary')).toBeFocused({ timeout: 15_000 });
    const cdp = await page.context().newCDPSession(page);
    const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 };
    for (let i = 0; i < 6; i++) { await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', ...key, autoRepeat: true }); await page.waitForTimeout(40); }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    await page.waitForTimeout(300);
    expect(await phase(page)).toBe('intro');
  });

  test('Esc while the game is still loading closes it', async ({ page }) => {
    await boot(page);
    // Hold the game chunk back so the "Memuat permainan..." card stays up.
    await page.route(/games\/biliar|biliar-[\w-]+\.js/, async (r) => { await new Promise((ok) => setTimeout(ok, 4000)); await r.continue().catch(() => {}); });
    await use(page, 'FX-L2-077');
    await expect(page.locator('#mg-host')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(page.locator('#mg-host')).toHaveCount(0, { timeout: 3000 });
  });

  test('chess is played at the board game table: the CEO takes a stool, not a Game Station slot', async ({ page }) => {
    await boot(page);
    // Walk up from the south side: the CEO takes the south stool, not one across the table.
    await page.evaluate(() => (window.__kantor!.placeNear as (f: string, x: number, y: number) => unknown)('L2', 26.0, 14.4));
    await use(page, 'FX-L2-066');
    await expect(page.locator('#mg-host[data-game="catur"]')).toBeVisible({ timeout: 15_000 });
    // The CEO holds exactly one of the four stool seats around the board.
    const seat = await page.evaluate(() => (window.__kantor!.reservations as () => [string, string][])()
      .filter(([id, npc]) => /^SL-L2-0(6[7-9]|70)-/.test(id) && npc === 'ACT-BUDI'));
    expect(seat).toEqual([['SL-L2-068-1', 'ACT-BUDI']]);
    await page.keyboard.press('Escape');
    await expect(page.locator('#mg-host')).toHaveCount(0);
    await use(page, 'slot:SL-L2-069-1');
    await expect(page.locator('#mg-host[data-game="catur"]')).toBeVisible({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await use(page, 'FX-L2-064');
    await expect(page.locator('#arcade')).toBeVisible({ timeout: 15_000 });
    await expect(page.locator('.arcade-slot[data-game="catur"]')).toHaveCount(0);
  });

  test('120 Hz screen: every quick press reaches the game (frames without a 60 Hz step used to drop it)', async ({ page }) => {
    await page.addInitScript(() => {
      // Fake a 120 Hz frame clock once a mini game is open.
      const real = window.requestAnimationFrame.bind(window);
      const q: FrameRequestCallback[] = [];
      let ticking = false;
      const tick = () => { const cbs = q.splice(0); const now = performance.now(); for (const c of cbs) c(now); if (q.length) setTimeout(tick, 1000 / 120); else ticking = false; };
      window.requestAnimationFrame = (cb) => {
        if (!document.getElementById('mg-host')) return real(cb);
        q.push(cb); if (!ticking) { ticking = true; setTimeout(tick, 1000 / 120); } return 1;
      };
    });
    await boot(page);
    await use(page, 'FX-L2-064');
    await page.locator('.arcade-slot[data-game="sambung-kabel"]').click();
    await page.locator('#mg-host .mg-card button.primary').click();
    await expect.poll(() => phase(page)).toBe('play');
    // Count presses the host hands to the game (the game itself may ignore
    // some, e.g. once a level is solved, so its own move count is not used).
    const got = () => page.evaluate(async () => ((await (window.__kantor!.miniGameState as () => Promise<{ delivered: Record<string, number> }>)()).delivered.a ?? 0));
    const m0 = await got();
    for (let i = 0; i < 12; i++) { await page.keyboard.press('j', { delay: 3 }); await page.waitForTimeout(70); }
    await expect.poll(async () => (await got()) - m0).toBe(12);
  });

  test('gym: personas run on the treadmill belt and pedal on the bike saddle, not beside the machines', async ({ page }) => {
    await boot(page);
    const ids = await page.evaluate(() => (window.__kantor!.npcs as () => { id: string }[])().slice(0, 2).map((n) => n.id));
    const k = (fn: string, ...a: unknown[]) => page.evaluate(([f, args]) => (window.__kantor![f as string] as (...x: unknown[]) => unknown)(...(args as unknown[])), [fn, a] as const);
    expect(await k('performAt', ids[0], 'SL-L2-080-1', 300)).toBe(true);
    expect(await k('performAt', ids[1], 'SL-L2-082-1', 300)).toBe(true);
    await expect.poll(() => k('npcClip', ids[0])).toBe('run');
    await expect.poll(() => k('npcClip', ids[1])).toBe('bike');
  });
});

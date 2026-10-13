import { expect, test } from '@playwright/test';
import { boot, state } from './helpers';

// Bumping into a persona (Budi 2026-10-13): pushing into one for 2 s, or
// running, walks through them; walls still block.
type K = { placeNear: (f: string, x: number, y: number) => [number, number] | null; parkNpc: (id: string, x: number, y: number) => boolean;
  drive: (dx: number, dy: number, run?: boolean) => void; npcs: () => { id: string; floor: string }[] };

async function setup(page: import('@playwright/test').Page) {
  await boot(page);
  const at = await page.evaluate(() => (window.__kantor as unknown as K).placeNear('L1', 10, 9.25));
  expect(at).not.toBeNull();
  const [x, y] = at!;
  // A persona parked 1.2 m east of the CEO, head-on, in the same corridor.
  const ok = await page.evaluate(([px, py]) => {
    const k = window.__kantor as unknown as K;
    const n = k.npcs().find((q) => q.floor === 'L1');
    return n ? k.parkNpc(n.id, px + 1.2, py) : false;
  }, [x, y]);
  expect(ok).toBe(true);
  return { x, y };
}

test('pushing into a persona for 2 s walks through it', async ({ page }) => {
  const { x } = await setup(page);
  const t0 = Date.now();
  await page.evaluate(() => (window.__kantor as unknown as K).drive(1, 0, false));
  // Still blocked at 1.2 s.
  await page.waitForTimeout(1200);
  expect((await state(page)).pos[0]).toBeLessThan(x + 0.9);
  await expect.poll(async () => (await state(page)).pos[0], { timeout: 15_000 }).toBeGreaterThan(x + 2.0);
  expect(Date.now() - t0).toBeGreaterThan(2000);
  await page.evaluate(() => (window.__kantor as unknown as K).drive(0, 0));
  await expect(page.locator('#toast')).toContainText('menembus');
});

test('running walks straight through a persona', async ({ page }) => {
  const { x } = await setup(page);
  await page.evaluate(() => (window.__kantor as unknown as K).drive(1, 0, true));
  await expect.poll(async () => (await state(page)).pos[0], { timeout: 1800 }).toBeGreaterThan(x + 2.0);
  await page.evaluate(() => (window.__kantor as unknown as K).drive(0, 0));
  const s = await page.evaluate(() => (window.__kantor!.state as () => { ghostBy: string | null })());
  expect(s.ghostBy).toBe('run');
});

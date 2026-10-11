import { expect, test } from '@playwright/test';
import { boot, shot, state, walkTo } from './helpers';

type Leaf = { id: string; door: string; floor: string; openness: number };
const leaves = (page: import('@playwright/test').Page) => page.evaluate(() => (window.__kantor!.doors as () => Leaf[])());

test.describe('door leaves (R2)', () => {
  test('every swing door has its leaves, they open for the CEO and close after', async ({ page }, info) => {
    await boot(page);
    const all = await leaves(page);
    expect(all.length).toBe(38); // 23 on L1 + 15 on L2, same as CAD and Blender
    // Walk from the lobby into the meeting room through D-L1-03 (corridor side).
    expect(await walkTo(page, 4, 9.25)).toBe(true);
    await expect.poll(async () => (await leaves(page)).find((l) => l.door === 'D-L1-03')!.openness).toBe(1);
    expect(await walkTo(page, 4, 6.5)).toBe(true);
    expect((await state(page)).room).toBe('L1-MEET');
    await shot(page, info, 'door-open');
    expect(await walkTo(page, 2, 3)).toBe(true);
    await expect.poll(async () => (await leaves(page)).find((l) => l.door === 'D-L1-03')!.openness).toBe(0);
  });

  test('in visitor mode the server door stays shut even with the CEO next to it', async ({ page }) => {
    // The walk from the lobby is ~25 m. Frame time is clamped at 0.1 s, so on a
    // software-rendered CI runner (a few fps) the CEO walks far slower than on
    // a GPU; give the long walk its own budget instead of the 90 s default.
    test.setTimeout(300_000);
    await boot(page);
    await page.locator('#btn-settings').click();
    await page.getByLabel('Mode visitor (ruang terbatas terkunci)').check();
    await page.getByRole('button', { name: 'Selesai' }).click();
    const server = (await leaves(page)).find((l) => l.door === 'D-L1-19')!;
    expect(await walkTo(page, 24.0, 20.25, 240_000)).toBe(true); // work area 1 m from the server door
    const [px, py] = (await state(page)).pos;
    expect(Math.hypot(px - 25, py - 20.25)).toBeLessThan(1.6); // really next to the door
    // Hold position for a few door-update frames, then check the leaf never moved.
    for (let n = 0; n < 5; n++) {
      await page.waitForTimeout(400);
      expect((await leaves(page)).find((l) => l.id === server.id)!.openness).toBe(0);
    }
  });
});

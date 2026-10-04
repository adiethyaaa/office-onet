import { expect, test } from '@playwright/test';
import { boot, shot, walkTo } from './helpers';

test('world labels stay clear of the HUD while walking', async ({ page }, info) => {
  await boot(page);
  for (const [x, y] of [[12, 9.25], [14.8, 11.3]]) {
    expect(await walkTo(page, x, y)).toBe(true);
    await expect.poll(async () => page.evaluate(() => {
      const hud = document.querySelector('.hud-top')!.getBoundingClientRect();
      return [...document.querySelectorAll('.npc-label, .room-label')]
        .filter(el => Number(getComputedStyle(el).opacity) > 0.5)
        .filter(el => {
          const r = el.getBoundingClientRect();
          return r.left < hud.right && r.right > hud.left && r.top < hud.bottom && r.bottom > hud.top;
        }).map(el => el.textContent);
    }), { timeout: 5000 }).toEqual([]);
  }
  await expect.poll(() => page.locator('.npc-label, .room-label').evaluateAll(els =>
    els.filter(el => Number(getComputedStyle(el).opacity) > 0.5).length)).toBeGreaterThan(0);
  await shot(page, info, 'hud-label-clearance');
});

test('world labels stay clear of touch controls and action prompt', async ({ page }) => {
  await boot(page);
  expect(await walkTo(page, 14.8, 11.3)).toBe(true);
  await expect.poll(() => page.evaluate(() => {
    const blockers = [...document.querySelectorAll('.joystick, .touch-btn, #prompt')]
      .map(el => el.getBoundingClientRect()).filter(r => r.width && r.height);
    return [...document.querySelectorAll('.npc-label, .room-label')]
      .filter(el => Number(getComputedStyle(el).opacity) > 0.5)
      .filter(el => {
        const r = el.getBoundingClientRect();
        return blockers.some(b => r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top);
      }).map(el => el.textContent);
  }), { timeout: 5000 }).toEqual([]);
});

import { expect, test } from '@playwright/test';
import { boot, shot, state } from './helpers';

test.describe('player activities (M2)', () => {
  test('billiards table opens the 8-ball mini game, holds the table, and Keluar releases it (v2.0)', async ({ page }, info) => {
    await boot(page);
    await page.locator('#btn-directory').click();
    await page.getByRole('button', { name: 'Pergi Ruang biliar' }).click();
    await expect.poll(async () => (await state(page)).room, { timeout: 10_000 }).toBe('L2-BILLIARD');
    const free = await page.evaluate(() => {
      const held = new Map((window.__kantor!.reservations as () => [string, string][])());
      return ['SL-L2-077-1', 'SL-L2-077-2'].some((x) => !held.has(x));
    });
    test.skip(!free, 'both cue positions held by NPCs in this seed');
    // Use the table through its fixture interaction (same path as pressing E there).
    await page.evaluate(() => (window.__kantor!.useInteractable as (x: string) => void)('FX-L2-077'));
    await expect(page.locator('#mg-title')).toHaveText('Biliar 8-Ball', { timeout: 15_000 });
    const held = await page.evaluate(() => (window.__kantor!.reservations as () => [string, string][])());
    expect(held.some(([, npc]) => npc === 'ACT-BUDI')).toBe(true);
    await page.getByRole('button', { name: 'Mulai' }).click();
    await shot(page, info, 'billiards');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Keluar' }).last().click();
    await expect(page.locator('#mg-host')).toHaveCount(0);
    const after = await page.evaluate(() => (window.__kantor!.reservations as () => [string, string][])());
    expect(after.some(([, npc]) => npc === 'ACT-BUDI')).toBe(false);
  });

  test('sitting on a free lounge seat, busy seats are refused, Selesai ends it', async ({ page }, info) => {
    await boot(page);
    const seats = ['SL-L2-010-1', 'SL-L2-010-2', 'SL-L2-011-1', 'SL-L2-011-2'];
    const held = new Map(await page.evaluate(() => (window.__kantor!.reservations as () => [string, string][])()));
    const free = seats.find((id) => !held.has(id))!;
    await page.locator('#btn-directory').click();
    await page.getByRole('button', { name: 'Pergi Lounge & coffee bar' }).click();
    await expect.poll(async () => (await state(page)).room, { timeout: 10_000 }).toBe('L2-LOUNGE');
    await page.evaluate((id) => (window.__kantor!.useInteractable as (x: string) => void)(`slot:${id}`), free);
    await expect(page.locator('#activity')).toBeVisible();
    await expect(page.locator('#activity-text')).toContainText(/Duduk|Istirahat/);
    await shot(page, info, 'sofa');
    await page.locator('#activity-end').click();
    await expect(page.locator('#activity')).toBeHidden();
    // Boundary: a seat reserved by an NPC is refused with a clear message.
    await page.evaluate(() => (window.__kantor!.reserveForTest as (slot: string, npc: string) => void)('SL-L2-011-1', 'ACT-HUGO'));
    await page.evaluate(() => (window.__kantor!.useInteractable as (x: string) => void)('slot:SL-L2-011-1'));
    await expect(page.locator('#toast')).toContainText('Sedang dipakai Hugo');
    await expect(page.locator('#activity')).toBeHidden();
  });
});

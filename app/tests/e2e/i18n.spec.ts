import { expect, test } from '@playwright/test';
import { boot, shot } from './helpers';

test.describe('English UI', () => {
  test('?lang=en shows the HUD, map and world names in English', async ({ page }, info) => {
    const errors = await boot(page, '?lang=en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('#btn-settings')).toHaveAccessibleName(/settings/i);
    await expect(page.locator('#minimap .minimap-floor')).toHaveText('Floor 1');
    await page.keyboard.press('p');
    await expect(page.locator('.map-dialog, dialog[open]').first()).toContainText('Floor 2');
    await page.keyboard.press('Escape');
    await shot(page, info, 'i18n-en');
    expect(errors).toEqual([]);
  });

  test('an English browser gets English, and the settings switch goes back to Indonesian', async ({ browser }) => {
    const ctx = await browser.newContext({ locale: 'en-US', viewport: { width: 1366, height: 820 } });
    const page = await ctx.newPage();
    await boot(page);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.locator('#btn-settings').click();
    await expect(page.locator('#dlg-settings legend', { hasText: 'Language' })).toBeVisible();
    await page.locator('#dlg-settings label', { hasText: 'Bahasa Indonesia' }).click();
    await page.waitForFunction(() => document.documentElement.lang === 'id' && !!window.__kantor, null, { timeout: 30_000 });
    await expect(page.locator('#minimap .minimap-floor')).toHaveText('Lantai 1');
    await ctx.close();
  });
});

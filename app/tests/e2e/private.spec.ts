// M4/M5 di browser: papan demo untuk pengunjung, login owner sandi + 2FA,
// papan Pokja nyata, percakapan agen dengan 3 pilihan + Ketik manual,
// approval, dan keyboard/mobile. Backend privat yang asli dijalankan di
// proses tes dengan runner palsu (tanpa LLM) dan data Pokja buatan lewat
// `pokjaFetch` suntikan (ringkasan, sesi, log audit); tidak ada lagi
// fixture Kanban/Telegram.
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { boot, shot } from './helpers';
import { createServer } from '../../../server/server.mjs';
import { totp, hashPassword, base32Encode } from '../../../server/auth.mjs';
import { buatFetchPokja } from './pokja-fixture';

const SECRET: string = base32Encode(Buffer.from('kantor-rpg-e2e-secret'));
const PROXY = 'e2e-proxy-secret-0123456789abcdef';
let server: { close: () => void; address: () => { port: number } };
let backend = '';
const calls: { profile: string; message: string }[] = [];
let tmp = '';
// The server clock advances one TOTP step per login so every login has a
// fresh code (the server rejects a reused one) without waiting 30 s.
let clockOffset = 0;

test.beforeAll(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kantor-e2e-'));
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  const dataDir = path.join(tmp, 'data');
  fs.mkdirSync(dataDir, { mode: 0o700 });
  fs.writeFileSync(path.join(dataDir, 'owner.json'), JSON.stringify({ username: 'budi', passwordHash: hashPassword('sandi-e2e-panjang-1'), totpSecret: SECRET }), { mode: 0o600 });
  const runner = async (job: { profile: string; message: string }) => {
    calls.push(job);
    await new Promise((r) => setTimeout(r, 400));
    if (job.message.startsWith('Tinjau')) return { ok: true, text: 'Sudah aku tinjau. Tidak ada keputusan lagi.\n```json\n{"pilihan":[]}\n```', session: 'hs' };
    return { ok: true, text: `Siap, ${job.profile} menerima.\n\`\`\`json\n{"pilihan":[{"label":"Cek progres","pesan":"Cek progres tugas ini"},{"label":"Tinjau hasil","pesan":"Tinjau hasil yang ada"},{"label":"Deploy ke produksi","pesan":"Deploy ke produksi sekarang"}]}\n\`\`\``, session: 'hs' };
  };
  ({ server } = createServer({ dataDir, home, proxySecret: PROXY, allowedOrigin: `http://127.0.0.1:${process.env.KANTOR_PORT ?? '4173'}`, runner, cookieSecure: false, boardTtlMs: 0, pokjaLogCacheMs: 0, pokjaUrl: 'https://pokja-e2e.local/api', pokjaToken: 'e2e-token', pokjaFetch: buatFetchPokja(() => Date.now() + clockOffset), now: () => Date.now() + clockOffset, transcriber: async () => 'tolong cek denah lantai satu', pushFetch: async () => ({ ok: true, status: 201 }) }));
  await new Promise<void>((r) => (server as unknown as { listen: (p: number, h: string, cb: () => void) => void }).listen(0, '127.0.0.1', r));
  backend = `http://127.0.0.1:${server.address().port}`;
});
test.afterAll(() => { server?.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

/** Same-origin /api/ forwarded to the test backend with the nginx proxy header. */
async function wireApi(page: Page) {
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const res = await route.fetch({ url: backend + url.pathname.replace(/^.*\/api\//, '/api/') + url.search, headers: { ...req.headers(), 'x-kantor-proxy': PROXY } });
    await route.fulfill({ response: res });
  });
}

async function login(page: Page) {
  await page.getByLabel('Nama').fill('budi');
  await page.getByLabel('Sandi').fill('sandi-e2e-panjang-1');
  clockOffset += 31_000;
  await page.getByLabel('Kode 2FA (6 digit)').fill(totp(SECRET, Date.now() + clockOffset));
  await page.getByRole('button', { name: 'Masuk' }).click();
}

test('isian login tidak terhapus oleh pembaruan papan tiap 10 detik', async ({ page }) => {
  await boot(page);
  await wireApi(page);
  await page.getByRole('button', { name: /Papan kerja/ }).click();
  const user = page.getByLabel('Nama');
  await user.fill('budi');
  await page.getByLabel('Sandi').fill('rahasia');
  await page.getByLabel('Sandi').focus();
  await page.waitForTimeout(11_500); // one board refresh tick
  await expect(user).toHaveValue('budi');
  await expect(page.getByLabel('Sandi')).toHaveValue('rahasia');
  await expect(page.getByLabel('Sandi')).toBeFocused();
});

test('pengunjung: papan Demo dan tidak bisa memerintah agen (REQ-BOARD-04, AC-CMD-04)', async ({ page }, info) => {
  const errors = await boot(page);
  await page.getByRole('button', { name: /Papan kerja/ }).click();
  const dlg = page.locator('#dlg-boards');
  await expect(dlg.getByText('Demo', { exact: true })).toBeVisible();
  await expect(dlg.getByText(/Contoh Usulan KP/)).toBeVisible();
  await expect(dlg.getByText(/Backend privat tidak terjangkau/)).toBeVisible();
  await shot(page, info, 'boards-demo');
  await dlg.getByRole('button', { name: 'Tutup' }).click();
  await page.evaluate(() => (window.__kantor!.openAgent as (p: string) => void)('CM'));
  await expect(page.locator('#dlg-agent')).toContainText('hanya untuk owner yang login');
  await expect(page.locator('#agent-send')).toHaveCount(0);
  expect(calls.length).toBe(0);
  expect(errors.filter((e) => !/404|Failed to load resource/.test(e))).toEqual([]);
});

test('owner: login 2FA, papan Pokja nyata, filter, log (REQ-BOARD-01..03)', async ({ page }, info) => {
  await wireApi(page);
  await boot(page);
  await page.keyboard.press('b');
  const dlg = page.locator('#dlg-boards');
  await expect(dlg.getByText('Demo', { exact: true })).toBeVisible();
  await login(page);
  await expect(dlg.getByText('Data nyata')).toBeVisible();
  await expect(dlg.getByText('Tidak ada handoff dalam 7 hari terakhir.')).toBeVisible();
  await dlg.getByRole('tab', { name: 'Daftar Pekerjaan' }).click();
  await expect(dlg.locator('tbody tr').first()).toContainText('4 data (3 MS, 1 BTS, 0 TMS)');
  await expect(dlg.locator('tbody tr').first()).toContainText('Citra');
  await expect(dlg.locator('tbody tr').first()).toContainText('Diblokir');
  await expect(dlg.locator('#task-count')).toHaveText('5 dari 5 tugas.');
  await dlg.getByLabel('Bot').selectOption('Erni');
  await expect(dlg.locator('#task-count')).toHaveText('2 dari 5 tugas.');
  await expect(dlg.locator('tbody tr')).toHaveCount(2);
  await dlg.getByLabel('Bot').selectOption('');
  await dlg.getByLabel('Badan').selectOption('POKJA');
  await expect(dlg.locator('#task-count')).toHaveText('5 dari 5 tugas.');
  await dlg.getByLabel('Badan').selectOption('');
  await dlg.getByRole('tab', { name: 'Daftar Pekerjaan' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(dlg.getByRole('tab', { name: 'Log Aktivitas' })).toHaveAttribute('aria-selected', 'true');
  await expect(dlg.locator('.log li').first()).toContainText('Beraktivitas');
  await expect(dlg.locator('.log li').first()).toContainText('Erni');
  await expect(dlg.locator('.log li').first()).toContainText('PGA');
  await expect(dlg.getByText('Masuk ke Pokja')).toBeVisible();
  await expect(dlg.getByText('Keluar dari Pokja')).toBeVisible();
  await shot(page, info, 'boards-log');
  // Backend goes away: the last snapshot stays, labelled stale (REQ-BOARD-05).
  await page.unroute('**/api/**');
  await page.route('**/api/**', (r) => r.abort());
  await dlg.getByRole('tab', { name: 'Papan Handoff' }).click();
  await page.evaluate(() => (window.__kantor!.openBoards as (t: string) => void)('handoffs'));
  await expect(dlg.getByText(/^Basi: pembaruan gagal/)).toBeVisible();
  await expect(dlg.getByText('Tidak ada handoff dalam 7 hari terakhir.')).toBeVisible();
  await page.unroute('**/api/**');
  await wireApi(page);
  await dlg.locator('#btn-logout').click();
  await expect(dlg.getByText('Demo', { exact: true })).toBeVisible();
  await expect(dlg.getByText('Contoh Usulan KP')).toBeVisible();
});

test('owner: beri tugas ke Erni, 3 pilihan + manual, approval, tanpa kirim ganda (AC-CMD-01..03, AC-CHOICE-01, AC-MANUAL-01)', async ({ page }, info) => {
  await wireApi(page);
  await boot(page);
  await page.getByRole('button', { name: /Direktori/ }).click();
  await page.getByRole('button', { name: 'Beri tugas ke Erni' }).click();
  const dlg = page.locator('#dlg-agent');
  await login(page);
  await expect(dlg).toContainText('Profil');
  await expect(dlg).toContainText('ER');
  const ta = dlg.locator('#agent-manual-text');
  await ta.fill('Hitung outlet contoh');
  const n0 = calls.length;
  await dlg.locator('#agent-send').dblclick();
  await expect(dlg.locator('.task-status').first()).toBeVisible();
  await expect(dlg.getByRole('button', { name: /^1\. Cek progres/ })).toBeVisible({ timeout: 15_000 });
  expect(calls.length).toBe(n0 + 1);
  expect(calls.at(-1)!.profile).toBe('ER');
  expect(calls.at(-1)!.message.startsWith('Hitung outlet contoh')).toBe(true);
  await expect(dlg.getByRole('button', { name: /^2\. Tinjau hasil/ })).toBeVisible();
  await expect(dlg.getByRole('button', { name: /^3\. Deploy ke produksi \(perlu persetujuan\)/ })).toBeVisible();
  await expect(dlg.getByRole('button', { name: '4. Ketik manual' })).toBeVisible();
  for (const b of await dlg.locator('.btn.choice').all()) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await shot(page, info, 'agent-choices');
  // Escape inside manual input closes it without sending.
  await dlg.getByRole('button', { name: '4. Ketik manual' }).click();
  await expect(ta).toBeFocused();
  await ta.fill('jangan terkirim');
  await page.keyboard.press('Escape');
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('#agent-manual')).toBeHidden();
  expect(calls.length).toBe(n0 + 1);
  // Risky option waits for a separate approval.
  await dlg.getByRole('button', { name: /^3\. Deploy ke produksi/ }).click();
  await expect(dlg.getByText('Butuh persetujuanmu')).toBeVisible();
  await page.waitForTimeout(600);
  expect(calls.length).toBe(n0 + 1);
  await shot(page, info, 'agent-approval');
  await dlg.getByRole('button', { name: 'Tolak' }).click();
  await expect(dlg.getByText('Butuh persetujuanmu')).toHaveCount(0);
  expect(calls.length).toBe(n0 + 1);
  // Option 2 goes through; the old choices expire after the new reply.
  await dlg.getByRole('button', { name: /^2\. Tinjau hasil/ }).click();
  await expect(dlg.getByText('Sudah aku tinjau')).toBeVisible({ timeout: 15_000 });
  expect(calls.at(-1)!.message.startsWith('Tinjau hasil yang ada')).toBe(true);
  await expect(dlg.getByRole('button', { name: /^1\. Cek progres/ })).toHaveCount(0);
  await expect(dlg.locator('#agent-manual')).toBeVisible();
  await shot(page, info, 'agent-reply');
  // Fresh conversation; a risky manual message: cancel one, approve another.
  await dlg.getByRole('button', { name: 'Mulai percakapan baru' }).click();
  await expect(dlg.getByText(/Belum ada pesan/)).toBeVisible();
  await ta.fill('Deploy ke produksi sekarang');
  await dlg.locator('#agent-send').click();
  await expect(dlg.getByText('Butuh persetujuanmu')).toBeVisible();
  await dlg.getByRole('button', { name: 'Batalkan' }).click();
  await expect(dlg.getByText('Butuh persetujuanmu')).toHaveCount(0);
  const n1 = calls.length;
  if (await dlg.locator('#agent-manual').isHidden()) await dlg.getByRole('button', { name: 'Ketik pesan' }).click();
  await ta.fill('Hapus snapshot lama');
  await dlg.locator('#agent-send').click();
  // Klik paksa: polling percakapan tiap 2 detik saat tugas menunggu
  // persetujuan me-render ulang kartu, sehingga klik biasa tidak pernah
  // menemukan tombol yang stabil di lingkungan swiftshader yang lambat.
  await dlg.getByRole('button', { name: 'Setujui untuk tugas ini' }).click({ force: true });
  await expect(dlg.getByText(/Siap, ER menerima/).last()).toBeVisible({ timeout: 15_000 });
  expect(calls.length).toBe(n1 + 1);
  expect(calls.at(-1)!.message).toContain('Persetujuan owner dari panel RPG');
});

test('NPC di dunia: Sapa lalu Bicara & beri tugas membuka profil yang benar', async ({ page }) => {
  await wireApi(page);
  await boot(page);
  await page.getByRole('button', { name: /Direktori/ }).click();
  await page.getByRole('button', { name: 'Temui Michael' }).click();
  const info = page.locator('#dlg-info');
  await expect(info.getByRole('button', { name: 'Bicara & beri tugas' })).toBeVisible({ timeout: 20_000 });
  await info.getByRole('button', { name: 'Bicara & beri tugas' }).click();
  await expect(page.locator('#dlg-agent')).toBeVisible();
  await login(page);
  await expect(page.locator('#dlg-agent')).toContainText('MJ');
  await expect(page.locator('#agent-title')).toContainText('Michael');
});

test('shortcut C: chat agen tanpa mendatangi NPC; status nyata membuat Michael bekerja di mejanya', async ({ page }, info) => {
  await wireApi(page);
  await boot(page);
  await expect(page.locator('#sim-badge')).toHaveText('SIMULASI: data demo');
  await page.keyboard.press('c');
  const dlg = page.locator('#dlg-agent');
  await expect(dlg).toContainText('hanya untuk owner yang login');
  await login(page);
  await expect(page.locator('#agent-title')).toHaveText('Chat agen');
  const mj = dlg.locator('[data-agent="MJ"]');
  await expect(mj).toContainText('Bekerja'); // Sesi Pokja: Michael aktif, aktivitas 3 menit lalu
  await expect(dlg.locator('[data-agent="NG"]')).toContainText('Siap'); // Angelina tidak punya sesi
  await shot(page, info, 'agent-picker');
  await dlg.locator('[data-agent="ER"]').click();
  await expect(page.locator('#agent-title')).toContainText('Erni');
  await page.keyboard.press('Escape');
  await expect(page.locator('#sim-badge')).toHaveText('Status kerja: nyata');
  // Michael walks to his own desk and keeps typing; the label says he is working.
  await expect.poll(async () => page.evaluate(() => (window.__kantor!.npcs as () => { id: string; phase: string; activity: string; slot: string | null; workStatus: string }[])().find((n) => n.id === 'ACT-MJ')),
    { timeout: 60_000 }).toMatchObject({ workStatus: 'working', phase: 'perform', activity: 'desk', slot: 'SL-L1-099-1' });
  await expect(page.locator('.npc-label.busy', { hasText: 'Michael · bekerja' })).toHaveCount(1);
  const sl = await page.evaluate(() => (window.__kantor!.npcs as () => { id: string; workStatus: string }[])().find((n) => n.id === 'ACT-SL'));
  expect(sl?.workStatus).toBe('done'); // Sonya idle 30 menit: sesi aktif, aktivitas terakhir melewati batas bekerja
});

test('chat Pokja: /laporan menjawab dari data Pokja, /help memuat perintah Pokja', async ({ page }, info) => {
  await wireApi(page);
  await boot(page);
  const n0 = calls.length;
  await page.keyboard.press('b');
  await login(page);
  await expect(page.locator('#dlg-boards').getByText('Data nyata')).toBeVisible();
  await page.locator('#dlg-boards').getByRole('button', { name: 'Tutup' }).click();
  await page.keyboard.press('c');
  await page.locator('.agent-pick-btn[data-agent="KASUARI"]').click();
  const dlg = page.locator('#dlg-agent');
  await expect(dlg.locator('#agent-sync-note')).toContainText('khusus RPG');
  await expect(dlg.getByText('Sama dengan chat Telegram')).toHaveCount(0);
  const ta = dlg.locator('#agent-manual-text');
  await ta.fill('/laporan');
  await dlg.locator('#agent-send').click();
  await expect(dlg).toContainText('Laporan Pokja');
  await expect(dlg).toContainText('Citra: 4 (3 MS, 1 BTS, 0 TMS)');
  await expect(dlg).toContainText('Total: 13 data.');
  await ta.fill('/help');
  await dlg.locator('#agent-send').click();
  await expect(dlg).toContainText('Perintah yang bisa dipakai di chat ini:');
  await expect(dlg).toContainText('/audit: Aktivitas terakhir');
  await shot(page, info, 'agent-pokja-commands');
  expect(calls.length, 'perintah Pokja tidak sampai ke runner').toBe(n0);
});

test('chat tahap 2-3: kirim foto, pesan suara jadi teks, cari pesan, setelan notifikasi', async ({ page, context }, info) => {
  await context.grantPermissions(['microphone']).catch(() => {});
  await wireApi(page);
  await boot(page);
  await page.keyboard.press('b');
  await login(page);
  await expect(page.locator('#dlg-boards').getByText('Data nyata')).toBeVisible();
  await page.locator('#dlg-boards').getByRole('button', { name: 'Tutup' }).click();
  await page.keyboard.press('c');
  const dlg = page.locator('#dlg-agent');
  await expect(dlg.locator('.notify-settings summary')).toHaveText(/Notifikasi/);
  await dlg.locator('.notify-settings summary').click();
  await expect(dlg.locator('#push-help')).not.toBeEmpty();
  await dlg.locator('.agent-pick-btn[data-agent="RP"]').click();
  await expect(page.locator('#agent-title')).toContainText('Rony');
  if (await dlg.locator('#agent-manual').isHidden()) await dlg.locator('#agent-manual-toggle').click();
  // Foto: unggah, chip muncul, kirim tanpa teks; agen menerima path lokal.
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  await dlg.locator('#agent-file').setInputFiles({ name: 'denah.png', mimeType: 'image/png', buffer: png });
  await expect(dlg.locator('.staged-item')).toContainText('denah.png');
  const before = calls.length;
  await dlg.locator('#agent-manual-text').fill('Ini denahnya');
  await dlg.locator('#agent-send').click();
  await expect.poll(() => calls.length).toBeGreaterThan(before);
  expect(calls.at(-1)!.message).toMatch(/\[Image attached at: \/.+\.png\]/);
  await expect(dlg.locator('.turn.owner .att-image img').last()).toBeVisible();
  await expect.poll(async () => dlg.locator('.turn.owner .att-image img').last().evaluate((i: HTMLImageElement) => i.naturalWidth)).toBe(1);
  await expect(dlg.locator('.turn.agent').last()).toContainText('RP menerima', { timeout: 15_000 });
  // Pesan suara: berkas audio masuk lewat pemilih berkas (perekam nyata butuh mikrofon fisik).
  if (await dlg.locator('#agent-manual').isHidden()) await dlg.locator('#agent-manual-toggle').click();
  await dlg.locator('#agent-file').setInputFiles({ name: 'suara.webm', mimeType: 'audio/webm', buffer: Buffer.from('1a45dfa3', 'hex') });
  await expect(dlg.locator('.staged-item')).toContainText('pesan-suara');
  const b2 = calls.length;
  await dlg.locator('#agent-send').click();
  await expect.poll(() => calls.length).toBeGreaterThan(b2);
  expect(calls.at(-1)!.message).toContain('Transkrip otomatis: "tolong cek denah lantai satu"');
  await expect(dlg.locator('.turn.owner .att-voice audio').last()).toBeAttached();
  await expect(dlg.locator('.turn.owner .att-voice .transcript').last()).toContainText('tolong cek denah');
  // Cari pesan. Balasan agen yang tiba dapat me-render ulang chat dan
  // menutup <details> pencarian; klik sampai kolomnya terlihat.
  await expect.poll(async () => {
    if (!(await dlg.locator('#agent-search').isVisible())) await dlg.locator('.chat-search summary').click();
    return dlg.locator('#agent-search').isVisible();
  }).toBe(true);
  await dlg.locator('#agent-search').fill('denahnya');
  await dlg.locator('.chat-search').getByRole('button', { name: 'Cari' }).click();
  await expect(dlg.locator('.search-results mark').first()).toHaveText(/denahnya/i);
  await shot(page, info, 'agent-media-search');
});

test('PWA: manifest, ikon dan service worker tersedia', async ({ page }) => {
  await boot(page);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const m = await (await page.request.get(new URL(href!, page.url()).href)).json();
  expect(m.display).toBe('standalone');
  for (const i of m.icons) expect((await page.request.get(new URL(i.src, page.url()).href)).status()).toBe(200);
  const sw = await page.request.get(new URL('sw.js', page.url()).href);
  expect(sw.status()).toBe(200);
  expect(await sw.text()).toContain('showNotification');
});

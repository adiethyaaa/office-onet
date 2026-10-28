// Perintah slash dari chat game: dijalankan server, tidak pernah sampai ke agen.
// Perintah Pokja dijawab dari API Pokja lewat fetch tiruan; tidak ada lagi
// fixture Hermes/state.db dan tidak ada percakapan terikat Telegram.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from '../server.mjs';
import { totp, hashPassword, base32Encode } from '../auth.mjs';
import { parseCommand } from '../commands.mjs';

const SECRET = base32Encode(Buffer.from('slash-commands-secret-1'));
const PROXY = 'proxy-secret-for-slash-0123456789';
const ORIGIN = 'https://employee-rpg.air-buddy.site';
const PW = ['sandi', 'slash', 'panjang', '7'].join('-');
let slowStt = false; let releaseStt = () => {};
let tmp; let srv; let base; let calls; let gate; let s; let fetchCalls;

async function api(method, p, body) {
  const headers = { 'content-type': 'application/json', 'x-kantor-proxy': PROXY, origin: ORIGIN };
  if (s) { headers.cookie = s.cookie; headers['x-csrf'] = s.csrf; }
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const waitFor = async (fn, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 20)); } };
let n = 0;
const say = (conv, text) => api('POST', `/api/conversations/${conv}/messages`, { text, idem: `idem-slash-${String(++n).padStart(4, '0')}` });

// Tanggal hari ini (Jayapura) dan jam dini hari, supaya sesi/log tiruan
// selalu tanggal hari ini dan selalu di masa lalu kapan pun tes jalan.
const HARI_INI = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jayapura' });

const ringkasanApi = (tanggal) => ({
  judul_laporan: 'x', periode_teks: 'x', waktu_update: 'x', is_range: false,
  start_date: tanggal, end_date: tanggal,
  rekap_per_layanan: {
    PGA: { perubahan_user: [{ user: 'CM', ms: 3, bts: 8, tms: 0, total: 11 }] },
    PI: { perubahan_user: [] }, KP: { perubahan_user: [] },
    CASN: { perubahan_user: [] }, SDP: { perubahan_user: [] },
  },
});

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kantor-slash-'));
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  const dataDir = path.join(tmp, 'data');
  fs.mkdirSync(dataDir, { mode: 0o700 });
  fs.writeFileSync(path.join(dataDir, 'owner.json'), JSON.stringify({ username: 'budi', passwordHash: hashPassword(PW), totpSecret: SECRET }), { mode: 0o600 });
  calls = []; fetchCalls = [];
  const runner = async (job) => { calls.push(job); if (gate) await gate; return { ok: true, text: 'Oke.\n```json\n{"pilihan":[]}\n```', session: job.hermesSession ?? 'hs_rpg_1' }; };
  const pokjaFetch = async (url) => {
    fetchCalls.push(url);
    let badan;
    if (url.includes('start_date=')) {
      badan = ringkasanApi(new URL(url).searchParams.get('start_date'));
    } else if (url.includes('action=sessions')) {
      badan = {
        total: 1, waktu_cek: 'x',
        sessions: [{ id: 's1', session_id: 's1', inisial: 'FA', nama: 'ADIETHYA ARPUJIONO', status: 'active', login_time: `${HARI_INI} 00:05:00`, last_active: `${HARI_INI} 00:55:00`, logout_time: null }],
      };
    } else {
      badan = {
        total: 1, waktu_cek: 'x',
        logs: [{ id: 1, session_id: 's1', inisial: 'CM', nama: 'CITRA SARI', module: 'KP', action: 'NAV_MENU', created_at: `${HARI_INI} 00:20:00` }],
      };
    }
    return { ok: true, json: async () => badan };
  };
  ({ server: srv } = createServer({
    dataDir, home, proxySecret: PROXY, allowedOrigin: ORIGIN, runner, cookieSecure: false, boardTtlMs: 0,
    pokjaUrl: 'https://pokja.example/agent_summary.php', pokjaToken: 't-uji', pokjaFetch,
    transcriber: async () => { if (slowStt) await new Promise((r) => { releaseStt = () => { slowStt = false; r(); }; }); return 'halo'; },
    pushFetch: async () => ({ ok: true, status: 201 }),
  }));
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${srv.address().port}`;
  const r = await fetch(`${base}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kantor-proxy': PROXY, origin: ORIGIN }, body: JSON.stringify({ username: 'budi', password: PW, code: totp(SECRET) }) });
  s = { cookie: r.headers.get('set-cookie').split(';')[0], csrf: (await r.json()).csrf };
});
after(() => { srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('parseCommand: /word dan /word@bot saja; path dan teks biasa bukan perintah', () => {
  assert.deepEqual(parseCommand('/new'), { name: 'new', args: '' });
  assert.deepEqual(parseCommand('  /Status@leo_bot  '), { name: 'status', args: '' });
  assert.deepEqual(parseCommand('/new judul baru'), { name: 'new', args: 'judul baru' });
  assert.equal(parseCommand('/Users/air_buddy/denah.dwg tolong cek'), null);
  assert.equal(parseCommand('tolong /new'), null);
  assert.equal(parseCommand('/'), null);
});

test('/help, perintah tak dikenal, /telegram, dan /status tidak diteruskan ke agen', async () => {
  const conv = (await api('POST', '/api/conversations', { profile: 'CM' })).json;
  const c0 = calls.length;
  const help = await say(conv.id, '/help');
  assert.equal(help.status, 200);
  assert.equal(help.json.command.kind, 'help');
  assert.deepEqual(help.json.command.commands.map((c) => c.name), ['new', 'stop', 'status', 'help', 'laporan', 'rekap', 'sesi', 'online', 'audit', 'ping']);
  const unk = await say(conv.id, '/compress');
  assert.equal(unk.json.command.kind, 'unknown');
  assert.equal(unk.json.command.name, 'compress');
  const tg = await say(conv.id, '/telegram');
  assert.equal(tg.json.command.kind, 'unknown', '/telegram sudah tidak ada');
  const st = await say(conv.id, '/status');
  assert.equal(st.json.command.kind, 'status');
  assert.equal(st.json.command.channel, 'rpg');
  assert.equal(st.json.command.session, null);
  assert.equal(st.json.command.model, null);
  assert.equal(st.json.command.running, false);
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, c0, 'tidak ada perintah yang sampai ke agen');
  const view = (await api('GET', `/api/conversations/${conv.id}`)).json;
  assert.ok(!view.turns.some((t) => t.text.startsWith('/')), 'perintah tidak tercatat sebagai pesan ke agen');
});

test('/stop menghentikan tugas yang sedang jalan dan yang antre', async () => {
  const conv = (await api('POST', '/api/conversations', { profile: 'MJ', fresh: true })).json;
  let release; gate = new Promise((r) => { release = r; });
  await say(conv.id, 'hitung margin proyek A');
  await say(conv.id, 'lalu proyek B');
  await waitFor(() => calls.some((c) => c.profile === 'MJ'));
  const st = await say(conv.id, '/status');
  assert.equal(st.json.command.running, true);
  assert.ok(st.json.command.tasks.some((t) => t.status === 'working'));
  const stop = await say(conv.id, '/stop');
  assert.equal(stop.json.command.kind, 'stop');
  assert.equal(stop.json.command.stopped, 2);
  release(); gate = null;
  const v = await waitFor(async () => { const x = (await api('GET', `/api/conversations/${conv.id}`)).json; return x.tasks.every((t) => t.terminal) ? x : null; });
  assert.ok(v.tasks.every((t) => t.status === 'cancelled'));
  assert.equal((await say(conv.id, '/stop')).json.command.stopped, 0);
});

test('perintah idempoten: kunci yang sama tidak membuka chat kedua', async () => {
  const conv = (await api('POST', '/api/conversations', { profile: 'ER', fresh: true })).json;
  const body = { text: '/new', idem: 'idem-slash-retry-0001' };
  const a = await api('POST', `/api/conversations/${conv.id}/messages`, body);
  const b = await api('POST', `/api/conversations/${conv.id}/messages`, body);
  assert.equal(b.json.duplicate, true);
  assert.equal(b.json.conversation.id, a.json.conversation.id);
  assert.equal((await api('POST', `/api/conversations/${a.json.conversation.id}/messages`, body)).status, 409);
});

test('/stop saat prepare() (transkripsi) berjalan: agen tidak dipanggil sesudahnya', async () => {
  const conv = (await api('POST', '/api/conversations', { profile: 'ONET', fresh: true })).json;
  slowStt = true; // transcription starts at upload time and is awaited in prepare()
  const up = await fetch(`${base}/api/conversations/${conv.id}/uploads`, { method: 'POST', headers: { 'content-type': 'audio/webm', 'x-file-name': 'v.webm', 'x-kantor-proxy': PROXY, origin: ORIGIN, cookie: s.cookie, 'x-csrf': s.csrf }, body: Buffer.from('1a45dfa3', 'hex') }).then((r) => r.json());
  assert.ok(up.upload?.id, JSON.stringify(up));
  const c0 = calls.filter((c) => c.profile === 'ONET').length;
  await api('POST', `/api/conversations/${conv.id}/messages`, { text: '', attachments: [up.upload.id], idem: 'idem-slash-prep-0001' });
  await new Promise((r) => setTimeout(r, 100));
  assert.equal((await say(conv.id, '/stop')).json.command.stopped, 1);
  releaseStt();
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(calls.filter((c) => c.profile === 'ONET').length, c0, 'runner tidak boleh jalan untuk tugas yang dihentikan');
});

test('/new: percakapan RPG baru, tanpa jejak Telegram', async () => {
  const rpg = (await api('POST', '/api/conversations', { profile: 'NG', fresh: true })).json;
  assert.equal(rpg.channel, 'rpg');
  const nw = await say(rpg.id, '/new');
  assert.equal(nw.json.command.kind, 'new');
  assert.equal(nw.json.command.fromTelegram, false);
  assert.equal(nw.json.command.telegramAvailable, false);
  assert.notEqual(nw.json.conversation.id, rpg.id);
  assert.equal(nw.json.conversation.turns.length, 0);
  assert.equal(nw.json.conversation.channel, 'rpg');
  assert.equal(nw.json.conversation.detached, false);
});

test('perintah Pokja: /laporan, /rekap, /sesi, /online, /audit, /ping dijawab dari API, tanpa memanggil runner', async () => {
  const conv = (await api('POST', '/api/conversations', { profile: 'KASUARI', fresh: true })).json;
  const c0 = calls.length; const f0 = fetchCalls.length;
  const lap = await say(conv.id, '/laporan');
  assert.equal(lap.json.command.kind, 'pokja');
  assert.match(lap.json.command.text, /PGA: 11 data \(3 MS, 8 BTS, 0 TMS\)/);
  const rek = await say(conv.id, `/rekap ${HARI_INI}`);
  assert.match(rek.json.command.text, new RegExp(`${HARI_INI}: 11 data`));
  const sesi = await say(conv.id, '/sesi');
  assert.match(sesi.json.command.text, /Adiethya — aktif/);
  const online = await say(conv.id, '/online');
  assert.match(online.json.command.text, /Adiethya/);
  const audit = await say(conv.id, '/audit CM');
  assert.match(audit.json.command.text, /Citra — Membuka KP/);
  const ping = await say(conv.id, '/ping');
  assert.match(ping.json.command.text, /Aktif\./);
  assert.equal(calls.length, c0, 'perintah Pokja tidak sampai ke runner');
  assert.ok(fetchCalls.length > f0, 'perintah Pokja menarik API');
  const f1 = fetchCalls.length;
  await api('POST', `/api/conversations/${conv.id}/messages`, { text: '/laporan', idem: 'idem-slash-lap-0001' });
  const ulang2 = await api('POST', `/api/conversations/${conv.id}/messages`, { text: '/laporan', idem: 'idem-slash-lap-0001' });
  assert.equal(ulang2.json.duplicate, true);
  assert.equal(fetchCalls.length, f1 + 1, 'percobaan ulang memakai jawaban pertama');
});

test('perintah Pokja tanpa konfigurasi: /laporan menjawab belum terkonfigurasi', async () => {
  // Server kedua tanpa pokjaUrl: penarik perintah null, perintah menjawab terus terang.
  const dataDir = path.join(tmp, 'data-tanpa-pokja');
  fs.mkdirSync(dataDir, { mode: 0o700 });
  fs.writeFileSync(path.join(dataDir, 'owner.json'), JSON.stringify({ username: 'budi', passwordHash: hashPassword(PW), totpSecret: SECRET }), { mode: 0o600 });
  const { server: srv2 } = createServer({
    dataDir, home: path.join(tmp, 'home'), proxySecret: PROXY, allowedOrigin: ORIGIN,
    runner: async () => ({ ok: true, text: 'Oke.', session: null }), cookieSecure: false,
    pushFetch: async () => ({ ok: true, status: 201 }),
  });
  await new Promise((r) => srv2.listen(0, '127.0.0.1', r));
  const base2 = `http://127.0.0.1:${srv2.address().port}`;
  const login = await fetch(`${base2}/api/login`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kantor-proxy': PROXY, origin: ORIGIN }, body: JSON.stringify({ username: 'budi', password: PW, code: totp(SECRET) }) });
  const s2 = { cookie: login.headers.get('set-cookie').split(';')[0], csrf: (await login.json()).csrf };
  const conv = await fetch(`${base2}/api/conversations`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kantor-proxy': PROXY, origin: ORIGIN, cookie: s2.cookie, 'x-csrf': s2.csrf }, body: JSON.stringify({ profile: 'KASUARI', fresh: true }) }).then((r) => r.json());
  const r = await fetch(`${base2}/api/conversations/${conv.id}/messages`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-kantor-proxy': PROXY, origin: ORIGIN, cookie: s2.cookie, 'x-csrf': s2.csrf }, body: JSON.stringify({ text: '/laporan', idem: 'idem-tanpa-pokja-1' }) }).then((x) => x.json());
  assert.match(r.command.text, /belum terkonfigurasi/);
  srv2.close();
});

// Perintah slash dari chat game: dijalankan server, tidak pernah sampai ke agen.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer } from '../server.mjs';
import { totp, hashPassword, base32Encode } from '../auth.mjs';
import { parseCommand } from '../commands.mjs';

const SECRET = base32Encode(Buffer.from('slash-commands-secret-1'));
const PROXY = 'proxy-secret-for-slash-0123456789';
const ORIGIN = 'https://employee-rpg.air-buddy.site';
const PW = ['sandi', 'slash', 'panjang', '7'].join('-');
let slowStt = false; let releaseStt = () => {};
let tmp; let srv; let base; let calls; let gate; let s;

async function api(method, p, body) {
  const headers = { 'content-type': 'application/json', 'x-kantor-proxy': PROXY, origin: ORIGIN };
  if (s) { headers.cookie = s.cookie; headers['x-csrf'] = s.csrf; }
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, json: await r.json().catch(() => null) };
}
const waitFor = async (fn, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 20)); } };
let n = 0;
const say = (conv, text) => api('POST', `/api/conversations/${conv}/messages`, { text, idem: `idem-slash-${String(++n).padStart(4, '0')}` });

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kantor-slash-'));
  const home = path.join(tmp, 'home');
  fs.mkdirSync(path.join(home, '.hermes', 'logs'), { recursive: true });
  fs.writeFileSync(path.join(home, '.hermes', '.env'), 'TELEGRAM_ALLOWED_USERS=777\n');
  const kas = path.join(home, '.hermes', 'profiles', 'KASUARI');
  fs.mkdirSync(kas, { recursive: true });
  fs.writeFileSync(path.join(kas, 'config.yaml'), "model:\n  default: 'model-KASUARI-uji'\n  provider: 'uji'\n");
  const t = Date.now() / 1000;
  execFileSync('sqlite3', [path.join(kas, 'state.db'), `
    create table sessions(id text primary key, source text, session_key text, started_at real, ended_at real, model text);
    create table messages(id integer primary key autoincrement, session_id text, role text, content text, timestamp real, platform_message_id text, _compressed_summary int default 0);
    insert into sessions values('tg_kasuari','telegram','agent:KASUARI:telegram:dm:777',${t - 600},null,'model-sesi-telegram');
    insert into messages(session_id,role,content,timestamp,platform_message_id) values ('tg_kasuari','user','halo kasuari',${t - 500},'1');
  `]);
  const dataDir = path.join(tmp, 'data');
  fs.mkdirSync(dataDir, { mode: 0o700 });
  fs.writeFileSync(path.join(dataDir, 'owner.json'), JSON.stringify({ username: 'budi', passwordHash: hashPassword(PW), totpSecret: SECRET }), { mode: 0o600 });
  calls = [];
  const runner = async (job) => { calls.push(job); if (gate) await gate; return { ok: true, text: 'Oke.\n```json\n{"pilihan":[]}\n```', session: job.hermesSession ?? 'hs_rpg_1' }; };
  ({ server: srv } = createServer({ dataDir, home, proxySecret: PROXY, allowedOrigin: ORIGIN, runner, cookieSecure: false, boardTtlMs: 0, transcriber: async () => { if (slowStt) await new Promise((r) => { releaseStt = () => { slowStt = false; r(); }; }); return 'halo'; }, pushFetch: async () => ({ ok: true, status: 201 }), telegram: { post: () => ({ ok: true }) } }));
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

test('/help, perintah tak dikenal, dan /status tidak diteruskan ke agen', async () => {
  const conv = (await api('POST', '/api/conversations', { profile: 'CM' })).json;
  const c0 = calls.length;
  const help = await say(conv.id, '/help');
  assert.equal(help.status, 200);
  assert.equal(help.json.command.kind, 'help');
  assert.deepEqual(help.json.command.commands.map((c) => c.name), ['new', 'stop', 'status', 'telegram', 'help']);
  const unk = await say(conv.id, '/compress');
  assert.equal(unk.json.command.kind, 'unknown');
  assert.equal(unk.json.command.name, 'compress');
  const st = await say(conv.id, '/status');
  assert.equal(st.json.command.kind, 'status');
  assert.equal(st.json.command.channel, 'rpg');
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

test('/new: chat RPG mendapat percakapan baru; chat Telegram pindah ke chat khusus RPG lalu /telegram kembali', async () => {
  const rpg = (await api('POST', '/api/conversations', { profile: 'NG', fresh: true })).json;
  const nw = await say(rpg.id, '/new');
  assert.equal(nw.json.command.kind, 'new');
  assert.notEqual(nw.json.conversation.id, rpg.id);
  assert.equal(nw.json.conversation.turns.length, 0);

  const tg = (await api('POST', '/api/conversations', { profile: 'KASUARI' })).json;
  assert.equal(tg.channel, 'telegram');
  const st = await say(tg.id, '/status');
  assert.equal(st.json.command.session, 'tg_kasuari');
  assert.equal(st.json.command.model, 'model-sesi-telegram');
  const c0 = calls.length;
  const fresh = await say(tg.id, '/new');
  assert.equal(fresh.json.command.kind, 'new');
  assert.equal(fresh.json.command.fromTelegram, true);
  assert.equal(fresh.json.conversation.channel, 'rpg');
  assert.equal(fresh.json.conversation.detached, true);
  // Reopening the bot keeps the new RPG-only chat (it does not snap back to Telegram).
  const again = (await api('POST', '/api/conversations', { profile: 'KASUARI' })).json;
  assert.equal(again.id, fresh.json.conversation.id);
  const st2 = await say(again.id, '/status');
  assert.equal(st2.json.command.channel, 'rpg-detached');
  assert.equal(st2.json.command.model, 'model-KASUARI-uji', 'belum ada sesi: model bawaan profil');
  // A message there starts a fresh Hermes session, not the Telegram one.
  await say(again.id, 'ide poster baru');
  await waitFor(() => calls.length > c0);
  assert.equal(calls.at(-1).profile, 'KASUARI');
  assert.equal(calls.at(-1).hermesSession, null);
  // A late reply in the detached chat must not pull it back in front after /telegram.
  let rel; gate = new Promise((r) => { rel = r; });
  await say(again.id, 'satu lagi');
  await waitFor(() => calls.at(-1)?.message.startsWith('satu lagi'));
  const back = await say(again.id, '/telegram');
  rel(); gate = null;
  await waitFor(async () => (await api('GET', `/api/conversations/${again.id}`)).json.tasks.every((t) => t.terminal));
  assert.equal(back.json.command.ok, true);
  assert.equal(back.json.conversation.channel, 'telegram');
  assert.equal((await api('POST', '/api/conversations', { profile: 'KASUARI' })).json.channel, 'telegram');
  // Bot without Telegram: /telegram says so.
  const ent = (await api('POST', '/api/conversations', { profile: 'CM' })).json;
  assert.equal((await say(ent.id, '/telegram')).json.command.ok, false);
});

// Integrasi backend privat dengan runner palsu (tidak memanggil LLM) dan
// sumber papan buatan. Bukti untuk REQ-CMD-01..05, REQ-CHOICE-01,
// REQ-MANUAL-01 dan REQ-BOARD-01..05 (bagian API).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createServer, createSetup } from '../server.mjs';
import { totp, hashPassword, base32Encode } from '../auth.mjs';
import { scrub } from '../boards.mjs';
import { parseOptions, checkMessage } from '../policy.mjs';

const SECRET = base32Encode(Buffer.from('12345678901234567890'));
const PROXY = 'proxy-secret-for-tests-0123456789';
const BAD = 'bukan-itu'.toUpperCase();
const PW = ['sandi', 'uji', 'panjang', '1'].join('-'); // test-only owner credential
const ORIGIN = 'https://employee-rpg.air-buddy.site';
let tmp; let srv; let base; let calls; let replies; let clock;

function fakeHome(root) {
  const h = path.join(root, 'home');
  fs.mkdirSync(path.join(h, '.hermes', 'logs'), { recursive: true });
  fs.mkdirSync(path.join(h, '.hermes', 'profiles', 'CM', 'logs'), { recursive: true });
  fs.mkdirSync(path.join(h, 'Hermes', '_Bersama', '2026-10-09-proyek-x'), { recursive: true });
  const hf = path.join(h, 'Hermes', '_Bersama', '2026-10-09-proyek-x', 'HANDOFF-hugo-ke-nova.md');
  fs.writeFileSync(hf, '# HANDOFF: Volume ruang Villa X\n\n## Badan\nENT\n\n## Dari\nHugo\n\n## Untuk\nNova\n\n## Yang diminta dari penerima\nHitung outlet per ruang dari /Users/budi/rahasia/denah.dwg lalu kirim ke Clara.\n\n## Jangan\n-\n');
  const db = path.join(h, '.hermes', 'kanban.db');
  const n = Math.floor(Date.now() / 1000);
  execFileSync('sqlite3', [db, `
    create table tasks(id text primary key,title text,body text,assignee text,status text,created_by text,created_at int,started_at int,completed_at int);
    create table task_events(id integer primary key autoincrement,task_id text,kind text,created_at int);
    insert into tasks values('t_h1','HANDOFF 2026-10-09-proyek-x: Volume ruang Villa X','Serah terima dari sipil untuk enterprise.\nBaca berkas handoff LENGKAP dulu: ${hf}\n','CM','todo','RP',${n - 30 * 3600},null,null);
    insert into tasks values('t_h2','HANDOFF proyek-y: harga switch','x','MJ','running','CM',${n - 3600},${n - 1800},null);
    insert into tasks values('t_a','Audit token sk-abcdefghijklmnopqrstuvwx di /Users/air_buddy/x.txt','x','ER','blocked','default',${n - 7200},null,null);
    insert into tasks values('t_p','Belanja ulang tahun istri','x','yupus','todo','yupus',${n - 100},null,null);
    insert into tasks values('t_old','Lama sekali','x','NG','done','default',${n - 30 * 86400},null,${n - 29 * 86400});
    insert into task_events(task_id,kind,created_at) values('t_a','blocked',${n - 600}),('t_h2','claimed',${n - 1800}),('t_p','created',${n - 100});
  `]);
  const stamp = (msAgo) => { const d = new Date(Date.now() - msAgo + 8 * 3600_000); return d.toISOString().replace('T', ' ').replace(/\.(\d{3})Z$/, ',$1'); };
  const logLines = [
    `${stamp(60_000)} INFO [s1] agent.tool_executor: tool terminal completed (1.2s, 10 chars)`,
    `${stamp(30_000)} INFO [s1] agent.tool_executor: tool write_file failed (0.1s)`,
    `${stamp(48 * 3600_000)} INFO [s1] agent.tool_executor: tool web_search completed (0.1s)`,
  ].join('\n') + '\n';
  fs.writeFileSync(path.join(h, '.hermes', 'logs', 'agent.log'), logLines);
  // [POKJA-TAHAP-1] Log yang sama untuk profil FA (pengguna Pokja): roster
  // baru tidak lagi punya profil 'default' yang dibaca boards.mjs
  // dari log utama, jadi tanpa berkas ini baris alat papan kosong.
  fs.mkdirSync(path.join(h, '.hermes', 'profiles', 'FA', 'logs'), { recursive: true });
  fs.writeFileSync(path.join(h, '.hermes', 'profiles', 'FA', 'logs', 'agent.log'), logLines);
  const od = path.join(h, '.omp', 'agent', 'sessions', '--repo--');
  fs.mkdirSync(od, { recursive: true });
  fs.writeFileSync(path.join(od, 'sess-aktif.jsonl'), `${JSON.stringify({ type: 'session', cwd: '/Users/x/Dev/APP-Perumnet/center', timestamp: new Date(Date.now() - 600_000).toISOString() })}\n${JSON.stringify({ type: 'message', message: { role: 'user', content: 'PERAN: SUN. Kerjakan drop 7.' } })}\n`);
  fs.writeFileSync(path.join(od, 'sess-selesai.jsonl'), `${JSON.stringify({ type: 'session', cwd: '/x/armory' })}\nPERAN: MOON\n${JSON.stringify({ type: 'custom', customType: 'session_exit' })}\n`);
  return h;
}

async function api(method, p, { body, cookie, csrf, origin = ORIGIN, proxy = PROXY } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (proxy) headers['x-kantor-proxy'] = proxy;
  if (cookie) headers.cookie = cookie;
  if (csrf) headers['x-csrf'] = csrf;
  if (origin) headers.origin = origin;
  const r = await fetch(base + p, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch { /* html */ }
  return { status: r.status, json, text, setCookie: r.headers.get('set-cookie') };
}

async function login() {
  const r = await api('POST', '/api/login', { body: { username: 'budi', password: PW, code: totp(SECRET, clock()) } });
  assert.equal(r.status, 200, r.text);
  return { cookie: r.setCookie.split(';')[0], csrf: r.json.csrf };
}

const waitFor = async (fn, ms = 3000) => { const t0 = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout'); await new Promise((r) => setTimeout(r, 20)); } };

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kantor-srv-'));
  const home = fakeHome(tmp);
  const dataDir = path.join(tmp, 'data');
  fs.mkdirSync(dataDir, { mode: 0o700 });
  fs.writeFileSync(path.join(dataDir, 'owner.json'), JSON.stringify({ username: 'budi', passwordHash: hashPassword(PW), totpSecret: SECRET }), { mode: 0o600 });
  calls = []; replies = [];
  let t = Date.now(); clock = () => t; clock.advance = (ms) => { t += ms; };
  const runner = async (job) => {
    calls.push(job);
    const r = replies.shift() ?? { ok: true, text: 'Siap.\n```json\n{"pilihan":[]}\n```', session: 'hs_1' };
    if (r.wait) await r.wait;
    return r;
  };
  // [POKJA-PAPAN] Rute /api/boards disuntik papan tiruan berbentuk
  // keluaran papanDariData; pemetaan Pokja sendiri diuji di
  // boards-pokja.test.mjs, dan rumah Hermes tiruan tetap dipakai tes
  // lain (cadangan kehadiran, sinkronisasi Telegram).
  const papanTiruan = {
    observedAt: '2026-10-28T02:00:00.000Z', mode: 'private',
    handoffs: { ok: true, source: 'Pokja tidak memiliki handoff', items: [] },
    tasks: {
      ok: true, source: 'Ringkasan harian Pokja',
      items: [
        { id: 'pokja-PGA-CM', title: '11 data (3 MS, 8 BTS, 0 TMS)', owner: 'Citra', ownerProfile: 'CM', requester: 'PGA', status: 'blocked', createdAt: 0, ageHours: 0, handoff: false, badan: 'POKJA' },
        { id: 'pokja-SDP-SL', title: '2 data (1 MS, 1 BTS, 0 TMS)', owner: 'Sonya', ownerProfile: 'SL', requester: 'SDP', status: 'blocked', createdAt: 0, ageHours: 0, handoff: false, badan: 'POKJA' },
      ],
    },
    log: {
      ok: true, source: 'audit_logs Pokja',
      items: [
        { at: 1000, kind: 'tool', bot: 'Citra', verb: 'Membuka layanan', object: 'KP', taskId: null },
        { at: 500, kind: 'tool', bot: 'Adiethya', verb: 'Masuk ke Pokja', object: '', taskId: null },
      ],
    },
  };
  const { server } = createServer({ dataDir, home, proxySecret: PROXY, allowedOrigin: ORIGIN, runner, now: () => clock(), cookieSecure: false, boardTtlMs: 0, boards: async () => papanTiruan, pushFetch: async () => ({ ok: true, status: 201 }), transcriber: async () => 'uji suara' });
  srv = server;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => { srv.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('visitor tanpa login ditolak di semua API privat (AC-CMD-04, REQ-BOARD-04)', async () => {
  for (const [m, p] of [['GET', '/api/boards'], ['GET', '/api/agents'], ['GET', '/api/presence'], ['POST', '/api/conversations'], ['GET', '/api/conversations/conv_abcdefgh'], ['POST', '/api/conversations/conv_abcdefgh/messages'], ['POST', '/api/approvals/appr_abcdefgh'], ['POST', '/api/tasks/task_abcdefgh/cancel']]) {
    const r = await api(m, p, { body: m === 'POST' ? { profile: 'CM', text: 'x', idem: 'aaaaaaaaaa' } : undefined });
    assert.equal(r.status, 401, `${m} ${p}`);
    assert.ok(!/HANDOFF|Villa|enterprise/.test(r.text.replace('Perlu login owner.', '')));
  }
  assert.equal(calls.length, 0);
  const me = await api('GET', '/api/me');
  assert.equal(me.json.authenticated, false);
});

test('tanpa header proxy ditolak (backend tidak bisa diakses langsung)', async () => {
  const r = await api('GET', '/api/me', { proxy: null });
  assert.equal(r.status, 403);
});

test('login: sandi salah, kode salah, kode dipakai ulang, dan rate limit', async () => {
  assert.equal((await api('POST', '/api/login', { body: { username: 'budi', password: BAD, code: totp(SECRET, clock()) } })).status, 401);
  assert.equal((await api('POST', '/api/login', { body: { username: 'budi', password: PW, code: '000000' } })).status, 401);
  const s = await login();
  const replay = await api('POST', '/api/login', { body: { username: 'budi', password: PW, code: totp(SECRET, clock()) } });
  assert.equal(replay.status, 401, 'kode TOTP yang sama tidak boleh dipakai dua kali');
  for (let i = 0; i < 5; i++) await api('POST', '/api/login', { body: { username: 'penebak', password: BAD, code: '1' } });
  assert.equal((await api('POST', '/api/login', { body: { username: 'penebak', password: BAD, code: '1' } })).status, 429);
  const me = await api('GET', '/api/me', { cookie: s.cookie });
  assert.equal(me.json.authenticated, true);
});

test('CSRF dan origin asing ditolak untuk owner yang login', async () => {
  clock.advance(31_000);
  const s = await login();
  assert.equal((await api('POST', '/api/conversations', { cookie: s.cookie, body: { profile: 'CM' } })).status, 403);
  assert.equal((await api('POST', '/api/conversations', { cookie: s.cookie, csrf: s.csrf, origin: 'https://evil.example', body: { profile: 'CM' } })).status, 403);
  assert.equal((await api('POST', '/api/conversations', { cookie: s.cookie, csrf: s.csrf, body: { profile: 'yupus' } })).status, 404, 'profil tidak ada di roster');
});

test('pesan manual sampai ke profil yang tepat, receipt + idempotensi (AC-CMD-01, AC-CMD-05, AC-MANUAL-01)', async () => {
  clock.advance(31_000);
  const s = await login();
  const conv = (await api('POST', '/api/conversations', { cookie: s.cookie, csrf: s.csrf, body: { profile: 'CM', fresh: true } })).json;
  const other = (await api('POST', '/api/conversations', { cookie: s.cookie, csrf: s.csrf, body: { profile: 'RP', fresh: true } })).json;
  let release; replies.push({ ok: true, text: 'Outlet dihitung.\n```json\n{"pilihan":[{"label":"Cek progres","pesan":"Tolong cek progres"},{"label":"Tinjau hasil","pesan":"Tinjau hasil"},{"label":"Langkah berikut","pesan":"Susun langkah berikut"}]}\n```', session: 'hs_ent', wait: new Promise((r) => { release = r; }) });
  const text = 'Hitung outlet Villa X  \n baris dua apa adanya';
  const a = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { text, idem: 'idem-0001-abc' } });
  assert.equal(a.status, 202, a.text);
  const b = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { text, idem: 'idem-0001-abc' } });
  assert.equal(b.json.duplicate, true);
  assert.equal(b.json.taskId, a.json.taskId);
  await waitFor(() => calls.length === 1);
  assert.equal(calls[0].profile, 'CM');
  assert.ok(calls[0].message.startsWith(text), 'teks owner diteruskan utuh');
  const mid = (await api('GET', `/api/conversations/${conv.id}`, { cookie: s.cookie })).json;
  assert.equal(mid.tasks[0].status, 'working');
  release();
  const done = await waitFor(async () => { const v = (await api('GET', `/api/conversations/${conv.id}`, { cookie: s.cookie })).json; return v.tasks[0].status === 'waiting_owner' ? v : null; });
  const agentTurn = done.turns.find((t) => t.role === 'agent');
  assert.equal(agentTurn.options.length, 3);
  assert.ok(!agentTurn.text.includes('pilihan'));
  assert.deepEqual(done.events.map((e) => e.status), ['queued', 'working', 'waiting_owner']);
  const o = (await api('GET', `/api/conversations/${other.id}`, { cookie: s.cookie })).json;
  assert.equal(o.turns.length, 0, 'riwayat profil lain tidak tercampur');
});

test('pilihan: dikirim sesuai ID turn, pilihan lama kedaluwarsa, ID palsu ditolak (AC-CHOICE-01)', async () => {
  clock.advance(31_000);
  const s = await login();
  const conv = (await api('POST', '/api/conversations', { cookie: s.cookie, csrf: s.csrf, body: { profile: 'CM' } })).json;
  const turn = conv.turns.filter((t) => t.role === 'agent').at(-1);
  assert.equal(turn.options.length, 3);
  assert.equal((await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { decision: { turnId: 'turn_palsu123', optionId: 'o1' }, idem: 'idem-0002-abc' } })).status, 400);
  assert.equal((await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { decision: { turnId: turn.id, optionId: 'o9' }, idem: 'idem-0003-abc' } })).status, 400);
  const n0 = calls.length;
  const r = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { decision: { turnId: turn.id, optionId: 'o2' }, idem: 'idem-0004-abc' } });
  assert.equal(r.status, 202, r.text);
  await waitFor(() => calls.length === n0 + 1);
  assert.ok(calls.at(-1).message.startsWith('Tinjau hasil'));
  await waitFor(async () => (await api('GET', `/api/conversations/${conv.id}`, { cookie: s.cookie })).json.tasks.at(-1).status === 'completed');
  const stale = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { decision: { turnId: turn.id, optionId: 'o1' }, idem: 'idem-0005-abc' } });
  assert.equal(stale.status, 410, 'pilihan dari giliran lama tidak boleh dipakai');
});

test('aksi berisiko menunggu approval terpisah; ditolak/kedaluwarsa/replay tidak mengirim (AC-CMD-03)', async () => {
  clock.advance(31_000);
  const s = await login();
  // Profil ONET dipakai di sini supaya tugas RPG yang tersisa dalam
  // keadaan menunggu tidak mengubah status ER pada uji presence.
  const conv = (await api('POST', '/api/conversations', { cookie: s.cookie, csrf: s.csrf, body: { profile: 'ONET', fresh: true } })).json;
  const n0 = calls.length;
  const r = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { text: 'Deploy ke produksi sekarang', idem: 'idem-risk-0001' } });
  assert.equal(r.status, 202);
  assert.ok(r.json.approval?.id);
  await new Promise((x) => setTimeout(x, 80));
  assert.equal(calls.length, n0, 'tidak ada dispatch sebelum approval');
  const rej = await api('POST', `/api/approvals/${r.json.approval.id}`, { cookie: s.cookie, csrf: s.csrf, body: { decision: 'reject', taskId: r.json.taskId } });
  assert.equal(rej.json.status, 'cancelled');
  assert.equal((await api('POST', `/api/approvals/${r.json.approval.id}`, { cookie: s.cookie, csrf: s.csrf, body: { decision: 'approve' } })).status, 409, 'replay ditolak');
  const r2 = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { text: 'Kirim penawaran ke klien', idem: 'idem-risk-0002' } });
  assert.equal((await api('POST', `/api/approvals/${r2.json.approval.id}`, { cookie: s.cookie, csrf: s.csrf, body: { decision: 'approve', taskId: r.json.taskId } })).status, 404, 'approval tidak bisa dipindah ke task lain');
  clock.advance(16 * 60_000);
  const s2 = await login();
  assert.equal((await api('POST', `/api/approvals/${r2.json.approval.id}`, { cookie: s2.cookie, csrf: s2.csrf, body: { decision: 'approve' } })).status, 409, 'kedaluwarsa');
  assert.equal(calls.length, n0);
  const r3 = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s2.cookie, csrf: s2.csrf, body: { text: 'Hapus backup lama di docker-01', idem: 'idem-risk-0003' } });
  const ok = await api('POST', `/api/approvals/${r3.json.approval.id}`, { cookie: s2.cookie, csrf: s2.csrf, body: { decision: 'approve' } });
  assert.equal(ok.json.status, 'queued');
  await waitFor(() => calls.length === n0 + 1);
  assert.match(calls.at(-1).message, /Persetujuan owner dari panel RPG, hanya untuk tugas ini/);
});

test('rahasia di chat ditolak; gagal/offline jujur; cancel (REQ-CMD-02, REQ-CMD-05)', async () => {
  clock.advance(31_000);
  const s = await login();
  const conv = (await api('POST', '/api/conversations', { cookie: s.cookie, csrf: s.csrf, body: { profile: 'NG', fresh: true } })).json;
  const sec = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { text: 'sandi: hunter2hunter2', idem: 'idem-sec-0001' } });
  assert.equal(sec.status, 422);
  replies.push({ ok: false, error: 'Agen gagal (kode 1).' });
  const f = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { text: 'Buat brief poster', idem: 'idem-fail-0001' } });
  await waitFor(async () => (await api('GET', `/api/conversations/${conv.id}`, { cookie: s.cookie })).json.tasks.find((t) => t.id === f.json.taskId).status === 'failed');
  replies.push({ ok: false, unknown: true, error: 'Proses agen dihentikan (SIGTERM); efek tidak diketahui.' });
  const u = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { text: 'Buat brief video', idem: 'idem-unk-0001' } });
  const v = await waitFor(async () => { const x = (await api('GET', `/api/conversations/${conv.id}`, { cookie: s.cookie })).json; return x.tasks.find((t) => t.id === u.json.taskId).status === 'unknown' ? x : null; });
  assert.ok(!v.tasks.some((t) => t.status === 'completed' && t.id === u.json.taskId));
  let release; replies.push({ ok: true, text: 'x', wait: new Promise((r) => { release = r; }) });
  const w = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { text: 'Tugas panjang', idem: 'idem-long-0001' } });
  const q2 = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { text: 'Tugas antre', idem: 'idem-q-0001' } });
  const c = await api('POST', `/api/tasks/${q2.json.taskId}/cancel`, { cookie: s.cookie, csrf: s.csrf });
  assert.equal(c.status, 200);
  release();
  await waitFor(async () => (await api('GET', `/api/conversations/${conv.id}`, { cookie: s.cookie })).json.tasks.find((t) => t.id === w.json.taskId).terminal);
  const final = (await api('GET', `/api/conversations/${conv.id}`, { cookie: s.cookie })).json;
  assert.equal(final.tasks.find((t) => t.id === q2.json.taskId).status, 'cancelled');
});

test('logout mematikan sesi', async () => {
  clock.advance(31_000);
  const s = await login();
  assert.equal((await api('POST', '/api/logout', { cookie: s.cookie, csrf: s.csrf })).status, 200);
  assert.equal((await api('GET', '/api/boards', { cookie: s.cookie })).status, 401);
});

test('papan: rute menyajikan papan Pokja yang disuntik, handoff kosong, tanpa rahasia (REQ-BOARD-01..03, 05)', async () => {
  clock.advance(31_000);
  const s = await login();
  const b = (await api('GET', '/api/boards', { cookie: s.cookie })).json;
  assert.equal(b.mode, 'private');
  assert.equal(b.handoffs.ok, true);
  assert.deepEqual(b.handoffs.items, []);
  assert.deepEqual(b.tasks.items.map((t) => t.id), ['pokja-PGA-CM', 'pokja-SDP-SL']);
  assert.equal(b.tasks.items[0].owner, 'Citra');
  assert.equal(b.tasks.items[0].requester, 'PGA');
  assert.equal(b.tasks.items[0].badan, 'POKJA');
  const flat = JSON.stringify(b);
  for (const bad of ['sk-abcdefghijklmnop', '/Users/', 'Belanja ulang tahun', 'rahasia/denah']) assert.ok(!flat.includes(bad), bad);
  assert.deepEqual(b.log.items.map((r) => r.verb), ['Membuka layanan', 'Masuk ke Pokja']);
  assert.ok(b.log.items.every((r, i, a) => i === 0 || a[i - 1].at >= r.at));
});

test('kebijakan: parseOptions tepat tiga, berbeda; scrub; deteksi risiko', () => {
  assert.equal(parseOptions('a\n```json\n{"pilihan":["x","y"]}\n```').options, null);
  assert.match(parseOptions('a\n```json\n{"pilihan":["x","y"]}\n```').invalid, /tepat tiga/);
  assert.match(parseOptions('a\n```json\n{"pilihan":["x","X","y"]}\n```').invalid, /tidak berbeda/);
  assert.equal(parseOptions('a\n```json\n{"pilihan":[]}\n```').invalid, null);
  const ok = parseOptions('Isi\n```json\n{"pilihan":["Cek","Deploy ke produksi","Batal"]}\n```');
  assert.equal(ok.options[1].requiresApproval, true);
  assert.equal(ok.body, 'Isi');
  assert.equal(scrub('lihat /Users/a/b/c.md dan https://x.y/z 192.0.2.7'), 'lihat [berkas] dan [tautan] [ip]');
  assert.equal(checkMessage('Buat poster promo').risks.length, 0);
  assert.ok(checkMessage('deploy ke produksi sekarang').risks.some((r) => r.id === 'deploy'));
  assert.equal(checkMessage('kartu 4111 1111 1111 1111').ok, false);
});

test('setup owner: tautan sekali pakai, kode wajib benar, lalu tidak berlaku', async () => {
  const dataDir = path.join(tmp, 'setup-data');
  const url = createSetup(dataDir, { username: 'budi', publicUrl: ORIGIN });
  const t = new URL(url).searchParams.get('t');
  const { server } = createServer({ dataDir, home: tmp, proxySecret: PROXY, allowedOrigin: ORIGIN, runner: async () => ({ ok: true, text: '' }), cookieSecure: false });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const b2 = `http://127.0.0.1:${server.address().port}`;
  const get = await fetch(`${b2}/api/setup?t=${t}`, { headers: { 'x-kantor-proxy': PROXY } });
  const html = await get.text();
  assert.equal(get.status, 200);
  assert.match(html, /data:image\/png;base64/);
  assert.equal(get.headers.get('referrer-policy'), 'same-origin', 'no-referrer makes Chrome post the form with Origin: null');
  const secret = /<code>([A-Z2-7]+)<\/code>/.exec(html)[1];
  const post = (code, pw = 'sandi-baru-panjang-9') => fetch(`${b2}/api/setup`, { method: 'POST', headers: { 'x-kantor-proxy': PROXY, 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ t, password: pw, password2: pw, code }).toString() });
  assert.equal((await post('000000')).status, 400);
  assert.equal((await post(totp(secret), 'pendek')).status, 400);
  assert.equal((await post(totp(secret))).status, 200);
  const owner = JSON.parse(fs.readFileSync(path.join(dataDir, 'owner.json'), 'utf8'));
  assert.ok(owner.passwordHash.startsWith('scrypt$') && !JSON.stringify(owner).includes('sandi-baru'));
  assert.equal((fs.statSync(path.join(dataDir, 'owner.json')).mode & 0o777), 0o600);
  assert.equal((await fetch(`${b2}/api/setup?t=${t}`, { headers: { 'x-kantor-proxy': PROXY } })).status, 410);
  server.close();
});

test('presence: status nyata per agen Pokja (Kanban running = bekerja, log = bekerja, profil pribadi tidak ada)', async () => {
  const s = await login();
  const r = await api('GET', '/api/presence', { cookie: s.cookie });
  assert.equal(r.status, 200);
  const by = Object.fromEntries(r.json.agents.map((a) => [a.profile, a]));
  // Hanya status yang diturunkan dari Kanban yang ditegaskan di
  // sini: status CM dan FA bergantung pada sisa tugas RPG dan
  // jam palsu dari uji sebelumnya, jadi tidak ditegaskan.
  // Jalur log 5 menit FA tetap tercakup lewat baris alat pada
  // uji papan.
  assert.deepEqual(Object.keys(by).sort(), ['CM', 'ER', 'FA', 'KASUARI', 'MJ', 'NG', 'ONET', 'RP', 'SL']);
  assert.equal(by.MJ.status, 'working');
  assert.equal(by.MJ.source, 'Kanban');
  assert.equal(by.ER.status, 'idle');
  assert.equal(by.ER.source, 'Kanban + agent.log');
  assert.equal(by.ER.summary, '1 tugas diblokir');
  assert.ok(!('yupus' in by) && !('wealth' in by));
  assert.doesNotMatch(JSON.stringify(r.json), /\/Users\/|sk-abc/);
});

// [POKJA-CHAT] Chat RPG saja: tidak ada sinkronisasi Telegram.
// Pesan, balasan berpilihan, dan kedaluwarsa pilihan diuji lewat
// giliran lokal; tidak ada yang dikirim ke Telegram.
test('chat RPG: pesan menunggu, balasan berpilihan, pilihan kedaluwarsa setelah giliran baru', async () => {
  const s = await login();
  const conv = (await api('POST', '/api/conversations', { cookie: s.cookie, csrf: s.csrf, body: { profile: 'KASUARI' } })).json;
  assert.equal(conv.channel, 'rpg');
  assert.deepEqual(conv.turns, []);
  let release;
  replies.push({ ok: true, text: 'Perak juga naik.\n```json\n{"pilihan":[{"label":"Pantau","pesan":"Pantau harga"},{"label":"Ringkas","pesan":"Ringkas mingguan"},{"label":"Stop","pesan":"Cukup dulu"}]}\n```', wait: new Promise((r) => { release = r; }) });
  const a = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { text: 'Kalau perak?', idem: 'idem-rpg-0001' } });
  assert.equal(a.status, 202, a.text);
  await waitFor(() => calls.some((c) => c.profile === 'KASUARI'));
  const call = calls.find((c) => c.profile === 'KASUARI');
  assert.equal(call.hermesSession, null, 'chat RPG tidak melanjutkan sesi apa pun');
  const pending = (await api('GET', `/api/conversations/${conv.id}`, { cookie: s.cookie })).json;
  assert.equal(pending.turns.at(-1).role, 'owner');
  assert.equal(pending.turns.at(-1).text, 'Kalau perak?', 'pesan RPG tampil menunggu');
  assert.equal(pending.typing, true, 'agen sedang mengerjakan = mengetik');
  assert.ok(['sent', 'delivered'].includes(pending.turns.at(-1).receipt), 'pesan menunggu belum centang dua biru');
  const pres = (await api('GET', '/api/presence', { cookie: s.cookie })).json.agents.find((x) => x.profile === 'KASUARI');
  assert.equal(pres.typing, true, 'daftar agen juga menampilkan mengetik');
  release();
  const done = await waitFor(async () => { const v = (await api('GET', `/api/conversations/${conv.id}`, { cookie: s.cookie })).json; return v.tasks.at(-1).status === 'waiting_owner' ? v : null; });
  const last = done.turns.at(-1);
  assert.equal(last.text, 'Perak juga naik.');
  assert.equal(last.options?.length, 3, 'tiga pilihan tetap ada pada balasan terbaru');
  assert.equal(done.typing, false, 'selesai membalas = berhenti mengetik');
  assert.equal(done.turns.find((x) => x.role === 'owner' && x.text === 'Kalau perak?').receipt, 'read', 'dibalas = centang dua biru');
  assert.equal(done.lastSeen, last.at);
  // Giliran baru membuat pilihan lama kedaluwarsa.
  replies.push({ ok: true, text: 'Sama-sama.' });
  await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { text: 'oke makasih', idem: 'idem-rpg-0002' } });
  await waitFor(async () => (await api('GET', `/api/conversations/${conv.id}`, { cookie: s.cookie })).json.tasks.at(-1).status === 'completed');
  const after = (await api('GET', `/api/conversations/${conv.id}`, { cookie: s.cookie })).json;
  assert.equal(after.turns.at(-1).text, 'Sama-sama.');
  assert.ok(!after.turns.some((x) => x.options), 'pilihan hilang setelah giliran baru');
  const stale = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { decision: { turnId: last.id, optionId: 'o1' }, idem: 'idem-rpg-0003' } });
  assert.equal(stale.status, 410);
  // Profil pengguna Pokja tetap memakai percakapan RPG sendiri.
  const ent = (await api('POST', '/api/conversations', { cookie: s.cookie, csrf: s.csrf, body: { profile: 'CM' } })).json;
  assert.equal(ent.channel, 'rpg');
});

test('lampiran + cari + push lewat API: hanya owner, path asli tidak bocor, agen menerima path lokal', async () => {
  const s = await login();
  for (const [m, p] of [['POST', '/api/conversations/conv_abcdefgh/uploads'], ['GET', '/api/media/abc.def'], ['GET', '/api/push'], ['POST', '/api/push/subscribe'], ['GET', '/api/conversations/conv_abcdefgh/search']]) {
    assert.equal((await api(m, p)).status, 401, `${m} ${p} tanpa login`);
  }
  const conv = (await api('POST', '/api/conversations', { cookie: s.cookie, csrf: s.csrf, body: { profile: 'CM', fresh: true } })).json;
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
  const up = await fetch(`${base}/api/conversations/${conv.id}/uploads`, { method: 'POST', body: png, headers: { 'content-type': 'image/png', 'x-file-name': encodeURIComponent('denah lantai 1.png'), 'x-kantor-proxy': PROXY, cookie: s.cookie, 'x-csrf': s.csrf, origin: ORIGIN } });
  assert.equal(up.status, 201);
  const { upload } = await up.json();
  assert.equal(upload.name, 'denah lantai 1.png');
  const nocsrf = await fetch(`${base}/api/conversations/${conv.id}/uploads`, { method: 'POST', body: png, headers: { 'content-type': 'image/png', 'x-kantor-proxy': PROXY, cookie: s.cookie, origin: ORIGIN } });
  assert.equal(nocsrf.status, 403, 'unggah butuh CSRF');
  const got = await fetch(`${base}/${upload.url}`, { headers: { 'x-kantor-proxy': PROXY, cookie: s.cookie } });
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), png);
  const n0 = calls.length;
  const sent = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { text: '', attachments: [upload.id], idem: 'idem-att-0001' } });
  assert.equal(sent.status, 202, sent.text);
  await waitFor(() => calls.length > n0);
  const job = calls[calls.length - 1];
  assert.match(job.message, /\[Image attached at: \/.+\.png\]/, 'agen menerima path lokal seperti lampiran Telegram');
  const view = (await api('GET', `/api/conversations/${conv.id}`, { cookie: s.cookie })).json;
  const ownerTurn = view.turns.find((t) => t.role === 'owner' && t.attachments?.length);
  assert.equal(ownerTurn.attachments[0].kind, 'image');
  assert.ok(!JSON.stringify(view).includes(tmp), 'tidak ada path server di respons');
  const again = await api('POST', `/api/conversations/${conv.id}/messages`, { cookie: s.cookie, csrf: s.csrf, body: { text: 'lagi', attachments: [upload.id], idem: 'idem-att-0002' } });
  assert.equal(again.status, 400, 'lampiran yang sudah terkirim tidak bisa dipakai ulang');
  await waitFor(async () => (await api('GET', `/api/conversations/${conv.id}`, { cookie: s.cookie })).json.tasks.every((t) => t.terminal));
  const found = (await api('GET', `/api/conversations/${conv.id}/search?q=${encodeURIComponent('siap')}`, { cookie: s.cookie })).json;
  assert.ok(found.results.length >= 1, 'cari menemukan balasan agen');
  const info = (await api('GET', '/api/push', { cookie: s.cookie })).json;
  assert.equal(Buffer.from(info.publicKey, 'base64url').length, 65);
  const bad = await api('POST', '/api/push/subscribe', { cookie: s.cookie, csrf: s.csrf, body: { subscription: { endpoint: 'https://evil.io/x', keys: { p256dh: info.publicKey, auth: 'AAAAAAAAAAAAAAAAAAAAAA' } } } });
  assert.equal(bad.status, 400);
});

// Tes papan Pokja: pemetaan ringkasan harian + audit log menjadi tiga
// papan, penarik nyata dengan fetch tiruan, cache, dan penyambungan
// server.mjs. Bentuk data tiruan mengikuti bentuk nyata API Pokja
// (rekap_per_layanan/perubahan_user, sessions, audit_logs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { papanDariData, buatPapanPokja, boardCache } from '../boards.mjs';
import { buatPenarikSnapshot } from '../pokja.mjs';
import { buatPenarikKehadiran } from '../pokja-log.mjs';

// "Sekarang" tetap: 2026-10-28 09:00 WIT. Baris log memakai stempel
// nyata "YYYY-MM-DD HH:MM:SS" tanpa zona, dianggap WIT.
const SEKARANG = Date.parse('2026-10-28T09:00:00+07:00');

const ringkasan = {
  date: '2026-10-28',
  services: {
    PGA: [
      { user: 'CM', ms: 3, bts: 8, tms: 0, total: 11 },
      { user: 'RP', ms: 7, bts: 2, tms: 0, total: 9 },
      { user: 'XX', ms: 1, bts: 0, tms: 0, total: 1 },
    ],
    PI: [],
    KP: [{ user: 'ZZ', ms: 0, bts: 0, tms: 0, total: 0 }],
    CASN: [],
    SDP: [{ user: 'SL', ms: 1, bts: 1, tms: 0, total: 2 }],
  },
};

const barisLog = (id, inisial, module, action, created_at, nama = '') => ({
  id, session_id: `s${id}`, user_uid: `u${id}`, id_inisial: inisial, inisial,
  user_nama: nama, nama, module_name: module, module, action_type: action,
  action, target_key: null, target_nama: null, changes_summary: null,
  details: null, ip_address: '192.0.2.1', created_at,
});

const dataKehadiran = {
  sesi: [],
  log: [
    barisLog(1, 'FA', 'AUTH', 'LOGIN', '2026-10-28 08:05:00', 'ADIETHYA ARPUJIONO'),
    barisLog(2, 'CM', 'KP', 'NAV_MENU', '2026-10-28 08:20:00', 'CITRA SARI'),
    barisLog(3, 'RP', 'PGA', 'BUTTON_CLICK', '2026-10-28 08:35:00', 'RONY PALLOAN'),
    barisLog(4, 'SL', 'SDP', 'EXPORT_EXCEL', '2026-10-28 08:40:00', 'SONYA LESTIANA'),
    barisLog(5, 'FA', 'AUTH', 'LOGOUT', '2026-10-28 08:50:00', 'ADIETHYA ARPUJIONO'),
    barisLog(3, 'RP', 'PGA', 'BUTTON_CLICK', '2026-10-28 08:35:00', 'RONY PALLOAN'),
    barisLog(6, 'CM', 'KP', 'HAPUS_XYZ', '2026-10-28 08:25:00', 'CITRA SARI'),
    barisLog(7, 'CM', 'KP', 'NAV_MENU', '2026-10-27 08:00:00', 'CITRA SARI'),
    barisLog(8, 'CM', 'KP', 'NAV_MENU', '2026-10-28 10:00:00', 'CITRA SARI'),
    barisLog(9, '', 'KP', 'NAV_MENU', '2026-10-28 08:30:00', ''),
    barisLog(10, 'NG', 'NAV', 'NAV_MENU', '2026-10-28 08:15:00', 'ANGELINA'),
  ],
  logLengkap: true,
};

test('papanDariData: tugas per pengguna per layanan, urutan layanan lalu total', () => {
  const b = papanDariData(ringkasan, dataKehadiran, SEKARANG);
  assert.equal(b.mode, 'private');
  assert.equal(b.tasks.ok, true);
  assert.equal(b.tasks.source, 'Ringkasan harian Pokja');
  assert.deepEqual(b.tasks.items.map((t) => t.id), [
    'pokja-PGA-CM', 'pokja-PGA-RP', 'pokja-PGA-XX', 'pokja-SDP-SL',
  ]);
  const cm = b.tasks.items[0];
  assert.equal(cm.title, '11 data (3 MS, 8 BTS, 0 TMS)');
  assert.equal(cm.owner, 'Citra');
  assert.equal(cm.ownerProfile, 'CM');
  assert.equal(cm.requester, 'PGA');
  assert.equal(cm.status, 'blocked');
  assert.equal(cm.badan, 'POKJA');
  assert.equal(cm.ageHours, 0);
  assert.equal(cm.createdAt, SEKARANG);
  assert.equal(b.tasks.items.find((t) => t.id === 'pokja-PGA-XX').owner, 'XX');
  assert.equal(b.tasks.items.find((t) => t.id === 'pokja-PGA-XX').status, 'done');
  assert.equal(b.tasks.items.find((t) => t.id === 'pokja-SDP-SL').owner, 'Sonya');
});

test('papanDariData: handoff kosong, log dari audit dengan dedupe dan jendela 24 jam', () => {
  const b = papanDariData(ringkasan, dataKehadiran, SEKARANG);
  assert.equal(b.handoffs.ok, true);
  assert.deepEqual(b.handoffs.items, []);
  assert.equal(b.log.ok, true);
  assert.equal(b.log.source, 'audit_logs Pokja');
  assert.deepEqual(
    b.log.items.map((r) => [r.bot, r.verb, r.object]),
    [
      ['Adiethya', 'Keluar dari Pokja', ''],
      ['Sonya', 'Beraktivitas', 'SDP'],
      ['Rony', 'Beraktivitas', 'PGA'],
      ['Citra', 'Membuka layanan', 'KP'],
      ['Angelina', 'Membuka layanan', ''],
      ['Adiethya', 'Masuk ke Pokja', ''],
    ],
  );
  assert.ok(b.log.items.every((r) => r.kind === 'tool' && r.taskId === null));
  assert.ok(b.log.items.every((r) => r.at <= SEKARANG && r.at >= SEKARANG - 24 * 3600_000));
  const flat = JSON.stringify(b);
  assert.ok(!flat.includes('192.0.2.1'), 'IP tidak boleh keluar ke papan');
  assert.ok(!flat.includes('ADIETHYA'), 'nama lengkap backend tidak dipakai');
});

test('papanDariData: bentuk ringkasan/log yang rusak ditolak', () => {
  assert.throws(() => papanDariData(null, dataKehadiran, SEKARANG), /services/);
  assert.throws(() => papanDariData({ services: { PGA: 'bukan-daftar' } }, dataKehadiran, SEKARANG), /bukan daftar/);
  assert.throws(() => papanDariData(ringkasan, {}, SEKARANG), /logs/);
});

test('buatPapanPokja dengan penarik nyata dan fetch tiruan membaca URL tanggal WIT', async () => {
  const alamat = [];
  const ambil = async (url) => {
    alamat.push(url);
    let badan;
    if (url.includes('start_date=')) {
      badan = {
        judul_laporan: 'x', periode_teks: 'x', waktu_update: 'x', is_range: false,
        start_date: '2026-10-28', end_date: '2026-10-28',
        rekap_per_layanan: {
          PGA: { perubahan_user: ringkasan.services.PGA },
          PI: { perubahan_user: [] },
          KP: { perubahan_user: ringkasan.services.KP },
          CASN: { perubahan_user: [] },
          SDP: { perubahan_user: ringkasan.services.SDP },
        },
      };
    } else if (url.includes('action=sessions')) {
      badan = { total: 0, waktu_cek: 'x', sessions: [] };
    } else {
      badan = { total: dataKehadiran.log.length, waktu_cek: 'x', logs: dataKehadiran.log };
    }
    return { ok: true, json: async () => badan };
  };
  const papan = buatPapanPokja({
    penarikRingkasan: buatPenarikSnapshot({ url: 'https://pokja.example/agent_summary.php', token: 't', ambil }),
    penarikKehadiran: buatPenarikKehadiran({ url: 'https://pokja.example/agent_summary.php', token: 't', ambil }),
  });
  const b = await papan(SEKARANG);
  assert.equal(b.tasks.items.length, 4);
  assert.equal(b.log.items.length, 6);
  assert.ok(alamat.some((u) => u.includes('start_date=2026-10-28&end_date=2026-10-28')));
  assert.ok(alamat.some((u) => u.includes('action=sessions&limit=500')));
  assert.ok(alamat.some((u) => u.includes('action=audit_logs&limit=500')));
});

test('buatPapanPokja: penarikan gagal atau tanpa konfigurasi menjawab gagal, bukan kosong sukses (REQ-BOARD-05)', async () => {
  const gagal = buatPapanPokja({
    penarikRingkasan: async () => { throw new Error('API Pokja menjawab status 500'); },
    penarikKehadiran: async () => ({ sesi: [], log: [], logLengkap: true }),
  });
  const b = await gagal(SEKARANG);
  assert.equal(b.handoffs.ok, false);
  assert.equal(b.tasks.ok, false);
  assert.equal(b.log.ok, false);
  assert.match(b.tasks.error, /500/);
  const tanpa = buatPapanPokja({});
  const b2 = await tanpa(SEKARANG);
  assert.equal(b2.tasks.ok, false);
  assert.match(b2.tasks.error, /tidak terkonfigurasi/);
});

test('boardCache: dalam TTL tidak menarik lagi, penarikan bersama dipakai bersama, setelah TTL menarik lagi', async () => {
  let reads = 0;
  const ambil = async () => { reads++; return { observedAt: '', mode: 'private', handoffs: { ok: true, items: [] }, tasks: { ok: true, items: [] }, log: { ok: true, items: [] } }; };
  const get = boardCache(ambil, 5000);
  const [a, b] = await Promise.all([get(1000), get(1000)]);
  assert.equal(a, b);
  assert.equal(reads, 1);
  await get(5999);
  assert.equal(reads, 1);
  await get(6001);
  assert.equal(reads, 2);
});

test('server.mjs memakai tepat tiga penanda PAPAN dan rute papan async', () => {
  const serverMjs = fs.readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.mjs'), 'utf8',
  );
  assert.equal((serverMjs.match(/\[POKJA-PAPAN\]/g) ?? []).length, 3);
  assert.match(serverMjs, /import \{ boardCache, buildPresence, buatPapanPokja, makeSources \} from '\.\/boards\.mjs';/);
  assert.match(serverMjs, /buatPenarikSnapshot\(\{ url: cfg\.pokjaUrl, token: cfg\.pokjaToken, ambil: cfg\.pokjaFetch \}\)/);
  assert.match(serverMjs, /buatPenarikKehadiran\(\{ url: cfg\.pokjaUrl, token: cfg\.pokjaToken, ambil: cfg\.pokjaFetch \}\)/);
  assert.match(serverMjs, /boardCache\(buatPapanPokja\(\{ penarikRingkasan, penarikKehadiran \}\), cfg\.boardTtlMs \?\? 30000\)/);
  assert.match(serverMjs, /route\('GET', \/\^\\\/api\\\/boards\$\/, \{\}, async \(req, res\) => send\(res, 200, await boards\(now\(\)\)\)\);/);
});

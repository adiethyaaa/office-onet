// Tes chat Pokja: pemformat perintah, penjawab perintah dengan penarik
// tiruan, runner balasan tetap, dan pemeriksaan statis penyambungan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  formatLaporan, formatRekap, sesiHariIni, formatSesi, formatOnline,
  formatAudit, formatBantuan, jawabPerintahPokja, buatRunnerPokja,
} from '../pokja-chat.mjs';
import { buatPenarikSnapshot } from '../pokja.mjs';
import { buatPenarikKehadiran } from '../pokja-log.mjs';
import { COMMANDS } from '../commands.mjs';

const SEKARANG = Date.parse('2026-10-28T09:00:00+09:00');

const ringkasan = {
  date: '2026-10-28',
  services: {
    PGA: [
      { user: 'CM', ms: 3, bts: 8, tms: 0, total: 11 },
      { user: 'RP', ms: 7, bts: 2, tms: 0, total: 9 },
    ],
    PI: [{ user: 'ER', ms: 1, bts: 0, tms: 0, total: 1 }],
    KP: [], CASN: [],
    SDP: [{ user: 'SL', ms: 1, bts: 1, tms: 0, total: 2 }],
  },
};

const barisSesi = (id, inisial, login, terakhir, keluar, status, nama = '') => ({
  id, session_id: id, user_uid: `u${id}`, id_inisial: inisial, inisial,
  user_nama: nama, nama, role: 'user', ip_address: '192.0.2.1',
  login_at: login, login_time: login, last_active_at: terakhir, last_active: terakhir,
  logout_at: keluar, logout_time: keluar, status,
});

const barisLog = (id, inisial, module, action, created_at, nama = '') => ({
  id, session_id: `s${id}`, user_uid: `u${id}`, id_inisial: inisial, inisial,
  user_nama: nama, nama, module_name: module, module, action_type: action,
  action, target_key: null, target_nama: null, changes_summary: null,
  details: null, ip_address: '192.0.2.1', created_at,
});

const dataKehadiran = {
  sesi: [
    barisSesi('s1', 'FA', '2026-10-28 08:05:00', '2026-10-28 08:55:00', null, 'active', 'ADIETHYA ARPUJIONO'),
    barisSesi('s1', 'FA', '2026-10-28 08:05:00', '2026-10-28 08:58:00', null, 'active', 'ADIETHYA ARPUJIONO'),
    barisSesi('s2', 'RP', '2026-10-28 07:30:00', '2026-10-28 08:10:00', '2026-10-28 08:10:00', 'logged_out', 'RONY PALLOAN'),
    barisSesi('s3', 'CM', '2026-10-27 16:00:00', '2026-10-27 16:30:00', '2026-10-27 16:30:00', 'logged_out', 'CITRA SARI'),
    barisSesi('s4', '', '2026-10-28 08:00:00', '2026-10-28 08:00:00', null, 'active', ''),
  ],
  log: [
    barisLog(1, 'FA', 'AUTH', 'LOGIN', '2026-10-28 08:05:00', 'ADIETHYA ARPUJIONO'),
    barisLog(2, 'CM', 'KP', 'NAV_MENU', '2026-10-28 08:20:00', 'CITRA SARI'),
    barisLog(3, 'RP', 'PGA', 'BUTTON_CLICK', '2026-10-28 08:35:00', 'RONY PALLOAN'),
    barisLog(3, 'RP', 'PGA', 'BUTTON_CLICK', '2026-10-28 08:35:00', 'RONY PALLOAN'),
    barisLog(4, 'SL', 'SDP', 'EXPORT_EXCEL', '2026-10-28 08:40:00', 'SONYA LESTIANA'),
    barisLog(5, 'FA', 'AUTH', 'LOGOUT', '2026-10-28 08:50:00', 'ADIETHYA ARPUJIONO'),
    barisLog(6, 'CM', 'KP', 'HAPUS_XYZ', '2026-10-28 08:25:00', 'CITRA SARI'),
    barisLog(7, 'CM', 'KP', 'NAV_MENU', '2026-10-28 10:00:00', 'CITRA SARI'),
  ],
  logLengkap: true,
};

test('formatLaporan: per layanan dan per pengguna, total di akhir', () => {
  const teks = formatLaporan(ringkasan, '2026-10-28');
  assert.match(teks, /Laporan Pokja 2026-10-28/);
  assert.match(teks, /PGA: 20 data \(10 MS, 10 BTS, 0 TMS\)/);
  assert.match(teks, /Citra: 11 \(3 MS, 8 BTS, 0 TMS\)/);
  assert.match(teks, /PI: 1 data \(1 MS, 0 BTS, 0 TMS\)/);
  assert.ok(!teks.includes('KP:'), 'layanan kosong tidak ditulis');
  assert.match(teks, /Total: 23 data\./);
  assert.match(formatLaporan({ date: '2026-10-28', services: {} }, '2026-10-28'), /Belum ada data/);
});

test('formatRekap: per tanggal, hari gagal ditandai, total di akhir', () => {
  const teks = formatRekap([
    { tanggal: '2026-10-27', ringkasan },
    { tanggal: '2026-10-26', gagal: true },
    { tanggal: '2026-10-25', ringkasan: { date: '2026-10-25', services: {} } },
  ]);
  assert.match(teks, /2026-10-27: 23 data \(PGA 20, PI 1, SDP 2\)/);
  assert.match(teks, /2026-10-26: tidak terbaca\./);
  assert.match(teks, /2026-10-25: belum ada data\./);
  assert.match(teks, /Total: 23 data\./);
});

test('sesiHariIni dan formatSesi/formatOnline: dedupe, filter tanggal, tanpa IP', () => {
  const daftar = sesiHariIni(dataKehadiran, '2026-10-28');
  assert.deepEqual(daftar.map((s) => s.idSesi), ['s1', 's2']);
  assert.equal(daftar[0].terakhirIso, new Date('2026-10-28T08:58:00+09:00').toISOString());
  // Stempel dibaca +09:00 (WIT) dan ditampilkan di Jayapura (konvensi
  // yang sama dengan jamWit di pokja-log.mjs), jadi 08:05 tampil 08.05.
  const sesi = formatSesi(daftar, '2026-10-28');
  assert.match(sesi, /08\.05 Adiethya — aktif, terakhir 08\.58/);
  assert.match(sesi, /07\.30 Rony — keluar 08\.10/);
  assert.ok(!sesi.includes('192.0.2.1'));
  const online = formatOnline(daftar, SEKARANG);
  assert.match(online, /Adiethya — masuk 08\.05, terakhir aktif 2 menit lalu/);
  assert.ok(!online.includes('Rony'));
  assert.equal(formatSesi([], '2026-10-28'), 'Tidak ada sesi Pokja pada 2026-10-28.');
  assert.equal(formatOnline([], SEKARANG), 'Tidak ada yang sedang online di Pokja.');
});

test('formatAudit: dedupe, filter inisial, aksi tak dikenal dan masa depan dilewati', () => {
  const teks = formatAudit(dataKehadiran, { sekarangMs: SEKARANG });
  assert.deepEqual(teks.split('\n').slice(1), [
    '08.50 Adiethya — Keluar',
    '08.40 Sonya — Beraktivitas di SDP',
    '08.35 Rony — Beraktivitas di PGA',
    '08.20 Citra — Membuka KP',
    '08.05 Adiethya — Masuk',
  ]);
  assert.match(formatAudit(dataKehadiran, { filterInisial: 'CM', sekarangMs: SEKARANG }), /Citra — Membuka KP/);
  assert.ok(!formatAudit(dataKehadiran, { filterInisial: 'CM', sekarangMs: SEKARANG }).includes('Rony'));
  assert.ok(!formatAudit(dataKehadiran, { sekarangMs: SEKARANG }).includes('192.0.2.1'));
});

test('jawabPerintahPokja dengan penarik nyata dan fetch tiruan', async () => {
  const diminta = [];
  const ambil = async (url) => {
    diminta.push(url);
    let badan;
    if (url.includes('start_date=')) {
      const tanggal = new URL(url).searchParams.get('start_date');
      badan = {
        judul_laporan: 'x', periode_teks: 'x', waktu_update: 'x', is_range: false,
        start_date: tanggal, end_date: tanggal,
        rekap_per_layanan: tanggal === '2026-10-28'
          ? { PGA: { perubahan_user: ringkasan.services.PGA }, PI: { perubahan_user: ringkasan.services.PI }, KP: { perubahan_user: [] }, CASN: { perubahan_user: [] }, SDP: { perubahan_user: ringkasan.services.SDP } }
          : { PGA: { perubahan_user: [] }, PI: { perubahan_user: [] }, KP: { perubahan_user: [] }, CASN: { perubahan_user: [] }, SDP: { perubahan_user: [] } },
      };
    } else if (url.includes('action=sessions')) {
      badan = { total: dataKehadiran.sesi.length, waktu_cek: 'x', sessions: dataKehadiran.sesi };
    } else {
      badan = { total: dataKehadiran.log.length, waktu_cek: 'x', logs: dataKehadiran.log };
    }
    return { ok: true, json: async () => badan };
  };
  const penarik = {
    ringkasan: buatPenarikSnapshot({ url: 'https://pokja.example/agent_summary.php', token: 't', ambil }),
    kehadiran: buatPenarikKehadiran({ url: 'https://pokja.example/agent_summary.php', token: 't', ambil }),
  };
  const lap = await jawabPerintahPokja({ nama: 'laporan', penarik, sekarangMs: SEKARANG });
  assert.equal(lap.kind, 'pokja');
  assert.match(lap.text, /PGA: 20 data/);
  const rek = await jawabPerintahPokja({ nama: 'rekap', args: '2026-10-27 2026-10-28', penarik, sekarangMs: SEKARANG });
  assert.match(rek.text, /2026-10-28: 23 data/);
  assert.match(rek.text, /2026-10-27: belum ada data/);
  const bawaan = await jawabPerintahPokja({ nama: 'rekap', penarik, sekarangMs: SEKARANG });
  assert.match(bawaan.text, /2026-10-22: belum ada data/);
  assert.equal(diminta.filter((u) => u.includes('start_date=')).length, 10, 'laporan 1 + rekap 2 hari + bawaan 7 hari');
  const sesi = await jawabPerintahPokja({ nama: 'sesi', penarik, sekarangMs: SEKARANG });
  assert.match(sesi.text, /Rony — keluar 08\.10/);
  const online = await jawabPerintahPokja({ nama: 'online', penarik, sekarangMs: SEKARANG });
  assert.match(online.text, /Adiethya/);
  const audit = await jawabPerintahPokja({ nama: 'audit', args: 'cm', penarik, sekarangMs: SEKARANG });
  assert.match(audit.text, /Citra — Membuka KP/);
  const ping = await jawabPerintahPokja({ nama: 'ping', sekarangMs: SEKARANG });
  assert.match(ping.text, /Aktif\. 2026-10-28 pukul 09\.00 WIT/);
  const bantuan = await jawabPerintahPokja({ nama: 'help', sekarangMs: SEKARANG });
  assert.equal(bantuan.text, formatBantuan());
  const salahRekap = await jawabPerintahPokja({ nama: 'rekap', args: 'kemarin', penarik, sekarangMs: SEKARANG });
  assert.match(salahRekap.text, /Pakai: \/rekap/);
  const salahAudit = await jawabPerintahPokja({ nama: 'audit', args: 'CM RP', penarik, sekarangMs: SEKARANG });
  assert.match(salahAudit.text, /Pakai: \/audit/);
});

test('jawabPerintahPokja: tanpa penarik menjawab belum terkonfigurasi, gagal dibaca menjawab terus terang', async () => {
  const kosong = await jawabPerintahPokja({ nama: 'laporan', penarik: null, sekarangMs: SEKARANG });
  assert.match(kosong.text, /belum terkonfigurasi/);
  const gagal = await jawabPerintahPokja({
    nama: 'laporan',
    penarik: { ringkasan: async () => { throw new Error('API Pokja menjawab status 500'); }, kehadiran: async () => ({}) },
    sekarangMs: SEKARANG,
  });
  assert.match(gagal.text, /tidak bisa dibaca sekarang: API Pokja menjawab status 500/);
});

test('buatRunnerPokja: profil sistem diarahkan ke perintah, pengguna dijelaskan bukan agen', async () => {
  const runner = buatRunnerPokja();
  const kasuari = await runner({ profile: 'KASUARI', message: 'halo' });
  assert.equal(kasuari.ok, true);
  assert.match(kasuari.text, /Kak Suary/);
  assert.match(kasuari.text, /\/laporan/);
  const onet = await runner({ profile: 'ONET', message: 'halo' });
  assert.match(onet.text, /Onet Aspri/);
  const cm = await runner({ profile: 'CM', message: 'halo' });
  assert.match(cm.text, /Citra adalah pengguna Pokja sungguhan, bukan agen/);
  assert.ok(!cm.text.includes('```json'), 'balasan tetap tanpa blok pilihan');
});

test('commands.mjs: daftar perintah Pokja tanpa telegram; telegram.mjs sudah tidak ada', () => {
  assert.deepEqual(COMMANDS.map((c) => c.name), ['new', 'stop', 'status', 'help', 'laporan', 'rekap', 'sesi', 'online', 'audit', 'ping']);
  const dir = path.dirname(fileURLToPath(import.meta.url));
  assert.equal(fs.existsSync(path.join(dir, '..', 'telegram.mjs')), false);
  const serverMjs = fs.readFileSync(path.join(dir, '..', 'server.mjs'), 'utf8');
  assert.equal((serverMjs.match(/\[POKJA-CHAT\]/g) ?? []).length, 7);
  // Komentar penanda boleh menyebut telegram.mjs; yang dilarang adalah impor dan pemakaian kodenya.
  assert.doesNotMatch(serverMjs, /from '\.\/telegram\.mjs'/);
  assert.doesNotMatch(serverMjs, /tgSession\(|telegramTurns|optionsLive/);
  assert.match(serverMjs, /buatRunnerPokja\(\)/);
  assert.match(serverMjs, /penarik: penarikPerintah/);
});

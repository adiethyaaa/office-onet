// [POKJA-PAPAN] Tiga papan kerja dari data Pokja yang dibaca lewat API
// (baca-saja, tanpa akses database langsung): ringkasan harian menjadi
// baris tugas per pengguna per layanan, audit log menjadi baris log
// aktivitas, dan handoff kosong karena Pokja tidak memiliki konsep
// handoff. Bentuk jawaban sama seperti sebelumnya, jadi panel tidak
// berubah. Hanya ringkasan yang keluar: tanpa nomor usulan, nama
// instansi, IP, id sesi, atau isi detail log.
// Jalur kehadiran lama (buildPresence, dari Kanban dan agent.log Hermes)
// dipertahankan apa adanya sebagai cadangan /api/presence di server.mjs.
// Pembaca Kanban, berkas handoff, ekor log, dan sesi omp sudah dihapus
// dari berkas ini; tidak ada lagi pemanggilan sqlite3 di sini.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROSTER, byProfile } from './roster.mjs';
import { URUTAN_LAYANAN, tanggalWit } from './pokja.mjs';
import { normalisasiLog } from './pokja-log.mjs';

const TAIL_BYTES = 512 * 1024;
const LOG_WINDOW_MS = 24 * 3600_000;
export const QUOTA = { taskEvents: 50, toolEvents: 110 };
// Dipertahankan untuk kompatibilitas; handoff selalu kosong pada mode
// Pokja, jadi ambang basi ini tidak lagi dipakai di berkas ini.
export const STALE_HANDOFF_HOURS = 24;

// Kata kerja log dari kategori audit Pokja (lihat PETA_AKSI_NYATA di
// pokja-log.mjs). String dipakai apa adanya pada render log, dan
// diterjemahkan lewat kamus Inggris seperti kata kerja server lainnya.
const VERB_POKJA = {
  login: 'Masuk ke Pokja', logout: 'Keluar dari Pokja',
  navigasi: 'Membuka layanan', aktivitas: 'Beraktivitas',
};

export const clip = (s, n) => {
  const a = Array.from(String(s ?? '').replace(/\s+/g, ' ').trim());
  return a.length > n ? `${a.slice(0, n - 1).join('')}…` : a.join('');
};

/** Removes things that must never reach a board: home paths, URLs, tokens, IPs. */
export function scrub(s) {
  return String(s ?? '')
    .replace(/(?:~|\/Users\/[^/\s]+|\/home\/[^/\s]+|\/Volumes\/[^\s]+)\/[^\s)'"`]*/g, '[berkas]')
    .replace(/https?:\/\/\S+/g, '[tautan]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|AKIA[0-9A-Z]{16})\b/g, '[rahasia]')
    .replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[ip]');
}

const lane = (profile) => ROSTER.find((r) => r.profile === profile)?.name ?? profile ?? '?';

export function makeSources(home) {
  const H = path.join(home, '.hermes');
  return {
    kanbanDb: path.join(H, 'kanban.db'),
    bersama: path.join(home, 'Hermes', '_Bersama'),
    ompDir: path.join(home, '.omp', 'agent', 'sessions'),
    logFile: (p) => (p === 'default' ? path.join(H, 'logs', 'agent.log') : path.join(H, 'profiles', p, 'logs', 'agent.log')),
  };
}

function sql(db, query) {
  const out = execFileSync('sqlite3', ['-json', db, query], { timeout: 4000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return out.trim() ? JSON.parse(out) : [];
}

function tailTools(file, sinceMs) {
  let st;
  try { st = fs.statSync(file); } catch { return []; }
  const start = Math.max(0, st.size - TAIL_BYTES);
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.alloc(st.size - start);
  fs.readSync(fd, buf, 0, buf.length, start);
  fs.closeSync(fd);
  const out = [];
  for (const line of buf.toString('utf8').split('\n')) {
    const m = /^(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d),\d{3} \w+ \[[^\]]+\] agent\.tool_executor: tool (\S+) (completed|failed)/.exec(line);
    if (!m) continue;
    const at = Date.parse(`${m[1]}T${m[2]}+08:00`);
    if (at >= sinceMs) out.push({ at, tool: m[3], ok: m[4] === 'completed' });
  }
  return out;
}

export const PRESENCE_ACTIVE_MS = 5 * 60_000;

/**
 * What each roster agent is really doing right now, for the NPCs. Order of
 * evidence: an RPG task in flight, a running Kanban task, tool calls in the
 * profile's agent.log in the last 5 minutes. No evidence = idle.
 * `rpg` is [{profile, status, message}] from the dispatcher.
 */
export function buildPresence(src, rpg = [], now = Date.now()) {
  let kanban = null;
  try {
    kanban = sql(src.kanbanDb, "select assignee,status,title from tasks where status in ('running','claimed','blocked') order by created_at desc limit 200");
  } catch { kanban = null; }
  const since = now - PRESENCE_ACTIVE_MS;
  return ROSTER.map((r) => {
    const base = { profile: r.profile, name: r.name, actorId: r.actorId };
    const mine = rpg.filter((t) => t.profile === r.profile);
    const w = mine.find((t) => t.status === 'working' || t.status === 'queued');
    if (w) return { ...base, status: 'working', source: 'perintah dari RPG', summary: clip(scrub(w.message), 70) };
    if (mine.some((t) => t.status === 'waiting_owner')) return { ...base, status: 'waiting', source: 'perintah dari RPG', summary: 'Menunggu persetujuanmu' };
    const k = kanban?.filter((t) => t.assignee === r.profile) ?? [];
    const run = k.find((t) => t.status === 'running' || t.status === 'claimed');
    if (run) return { ...base, status: 'working', source: 'Kanban', summary: clip(scrub(run.title), 70) };
    const tools = tailTools(src.logFile(r.profile), since);
    if (tools.length) return { ...base, status: 'working', source: 'agent.log', summary: `Aktif di Hermes (${tools.length} langkah, 5 menit terakhir)` };
    if (kanban === null) return { ...base, status: 'unknown', source: 'Kanban tidak terbaca', summary: '' };
    return { ...base, status: 'idle', source: 'Kanban + agent.log', summary: k.length ? `${k.length} tugas diblokir` : '' };
  });
}

// ---------------------------------------------------------------------------
// Papan Pokja (pengganti pembaca Kanban di atas untuk /api/boards).
// ---------------------------------------------------------------------------

const namaPengguna = (kode) => byProfile(kode)?.name ?? kode;

/**
 * Pemeta murni: ringkasan yang sudah dinormalisasi (keluaran
 * buatPenarikSnapshot) dan data kehadiran mentah (keluaran
 * buatPenarikKehadiran) menjadi tiga papan dengan bentuk yang sama
 * seperti sebelumnya. Fungsi ini tidak mengambil jaringan dan tidak
 * membaca berkas, sehingga mudah diuji dengan data tiruan.
 *
 * Tugas: satu baris per pengguna per layanan yang totalnya lebih dari
 * nol, urutan layanan PGA, PI, KP, CASN, SDP, lalu total terbesar dulu.
 * Status adalah turunan tampilan, bukan data asli: 'blocked' bila ada
 * BTS atau TMS yang perlu ditindaklanjuti, 'done' bila semuanya MS.
 * Handoff selalu kosong: Pokja tidak memiliki konsep handoff. Log:
 * baris audit yang kategorinya dikenal, terbaru dulu, dibatasi kuota
 * dan jendela 24 jam; baris tanpa inisial, berwaktu tidak sah, atau
 * duplikat dilewati. Hanya inisial/nama/waktu/kategori/layanan yang
 * dipakai; IP, id sesi, dan isi detail tidak pernah disimpan.
 */
export function papanDariData(ringkasan, dataKehadiran, sekarangMs = Date.now()) {
  const observedAt = new Date(sekarangMs).toISOString();
  if (!ringkasan || typeof ringkasan !== 'object' || !ringkasan.services || typeof ringkasan.services !== 'object') {
    throw new Error('Ringkasan Pokja tidak memuat services');
  }
  const tugas = [];
  for (const layanan of URUTAN_LAYANAN) {
    const daftar = ringkasan.services[layanan] ?? [];
    if (!Array.isArray(daftar)) throw new Error(`services ${layanan} bukan daftar`);
    const baris = [];
    for (const u of daftar) {
      if (!u || typeof u.user !== 'string') continue;
      const total = Number(u.total ?? 0);
      const ms = Number(u.ms ?? 0);
      const bts = Number(u.bts ?? 0);
      const tms = Number(u.tms ?? 0);
      if (!Number.isFinite(total) || total <= 0) continue;
      baris.push({
        id: `pokja-${layanan}-${u.user}`,
        title: clip(scrub(`${total} data (${ms} MS, ${bts} BTS, ${tms} TMS)`), 56),
        owner: namaPengguna(u.user), ownerProfile: u.user, requester: layanan,
        status: (bts + tms) > 0 ? 'blocked' : 'done',
        createdAt: sekarangMs, ageHours: 0, handoff: false, badan: 'POKJA',
        _total: total,
      });
    }
    baris.sort((a, b) => b._total - a._total || a.ownerProfile.localeCompare(b.ownerProfile));
    for (const b of baris) { delete b._total; tugas.push(b); }
  }
  const mentah = Array.isArray(dataKehadiran?.log) ? dataKehadiran.log : null;
  if (mentah === null) throw new Error('Data kehadiran tidak memuat daftar logs');
  const sejak = sekarangMs - LOG_WINDOW_MS;
  const lihat = new Set();
  const log = [];
  for (const m of mentah) {
    let n;
    try { n = normalisasiLog(m); } catch { continue; }
    if (!n) continue;
    const kunci = n.id ?? `${n.inisial}|${n.waktuIso}|${n.kategori}|${n.layanan ?? ''}`;
    if (lihat.has(kunci)) continue;
    lihat.add(kunci);
    const at = Date.parse(n.waktuIso);
    if (!Number.isFinite(at) || at < sejak || at > sekarangMs) continue;
    log.push({
      at, kind: 'tool', bot: namaPengguna(n.inisial),
      verb: VERB_POKJA[n.kategori] ?? 'Beraktivitas',
      object: n.layanan ?? '', taskId: null,
    });
  }
  log.sort((a, b) => b.at - a.at);
  return {
    observedAt, mode: 'private',
    handoffs: { ok: true, source: 'Pokja tidak memiliki handoff', items: [] },
    tasks: { ok: true, source: 'Ringkasan harian Pokja', items: tugas },
    log: { ok: true, source: 'audit_logs Pokja', items: log.slice(0, QUOTA.toolEvents) },
  };
}

const papanGagal = (sekarangMs, pesan) => {
  const gagal = { ok: false, source: 'API Pokja', error: clip(scrub(pesan), 120), items: [] };
  return {
    observedAt: new Date(sekarangMs).toISOString(), mode: 'private',
    handoffs: { ...gagal }, tasks: { ...gagal }, log: { ...gagal },
  };
};

/**
 * Pembangun papan async dari dua penarik yang disuntikkan (keduanya
 * menerima tanggal WIT `YYYY-MM-DD`): penarik ringkasan dan penarik
 * kehadiran, dibuat server.mjs dari URL/token/fetch yang sama dengan
 * kehadiran. Tanpa penarik, atau bila salah satu penarikan gagal,
 * ketiga papan menjawab gagal dengan pesan galatnya, bukan kosong
 * sukses (REQ-BOARD-05 dipertahankan).
 */
export function buatPapanPokja({ penarikRingkasan = null, penarikKehadiran = null } = {}) {
  return async (sekarangMs = Date.now()) => {
    if (typeof penarikRingkasan !== 'function' || typeof penarikKehadiran !== 'function') {
      return papanGagal(sekarangMs, 'Pokja tidak terkonfigurasi');
    }
    try {
      const tanggal = tanggalWit(new Date(sekarangMs));
      const [ringkasan, kehadiran] = await Promise.all([
        penarikRingkasan(tanggal), penarikKehadiran(tanggal),
      ]);
      return papanDariData(ringkasan, kehadiran, sekarangMs);
    } catch (e) {
      return papanGagal(sekarangMs, e?.message ?? 'gagal membaca API Pokja');
    }
  };
}

/** Snapshot papan yang dipakai bersama; penarikan ulang paling cepat tiap TTL, dan penarikan yang sedang berjalan dipakai bersama oleh semua viewer. */
export function boardCache(ambilPapan, ttlMs = 30000) {
  let memo = { at: 0, data: null, janji: null };
  return async (sekarang = Date.now()) => {
    if (memo.data && sekarang - memo.at < ttlMs) return memo.data;
    if (memo.janji) return memo.janji;
    memo.janji = (async () => {
      try {
        const data = await ambilPapan(sekarang);
        memo = { at: sekarang, data, janji: null };
        return data;
      } catch (e) {
        memo.janji = null;
        throw e;
      }
    })();
    return memo.janji;
  };
}

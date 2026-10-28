// [POKJA-CHAT] Chat Pokja: perintah baca-saja dan balasan tetap untuk
// pesan bebas. Tidak ada agen bahasa alami di fork ini, tidak ada
// pengiriman ke Telegram, dan tidak ada pesan yang sampai ke pengguna
// Pokja sungguhan. Semua jawaban perintah dibaca dari API Pokja lewat
// penarik yang disuntikkan (URL/token/fetch yang sama dengan kehadiran
// dan papan); pemformatnya murni, tanpa jaringan, supaya mudah diuji.
// Hanya inisial/nama/waktu/kategori/layanan yang ditampilkan; IP, id
// sesi, dan isi detail log tidak pernah dipakai.
import { byProfile } from './roster.mjs';
import { URUTAN_LAYANAN, tanggalWit } from './pokja.mjs';
import { normalisasiSesi, normalisasiLog } from './pokja-log.mjs';

/** Profil yang menjawab perintah: dua profil sistem. Profil lain adalah pengguna Pokja sungguhan. */
export const PROFIL_SISTEM = new Set(['ONET', 'KASUARI']);

const namaPengguna = (kode) => byProfile(kode)?.name ?? kode;

const jamWit = (iso) => new Date(iso).toLocaleTimeString('id-ID', {
  timeZone: 'Asia/Jayapura', hour: '2-digit', minute: '2-digit', hour12: false,
});

const menitLalu = (iso, sekarangMs) => Math.max(0, Math.round((sekarangMs - Date.parse(iso)) / 60000));

const LABEL_AKSI = { login: 'Masuk', logout: 'Keluar', navigasi: 'Membuka', aktivitas: 'Beraktivitas' };

const BANTUAN_BARIS = [
  '/laporan — ringkasan Pokja hari ini',
  '/rekap [dari] [sampai] — rekap harian, bawaan 7 hari terakhir',
  '/sesi — sesi login Pokja hari ini',
  '/online — siapa yang sedang online di Pokja',
  '/audit [INISIAL] — aktivitas terakhir, boleh difilter inisial',
  '/ping — periksa chat Pokja aktif',
  '/help — daftar perintah ini',
];

export const formatBantuan = () => `Perintah Pokja yang bisa dipakai:\n${BANTUAN_BARIS.join('\n')}`;

const totalRingkasan = (ringkasan) => {
  let total = 0;
  for (const layanan of URUTAN_LAYANAN) {
    for (const u of ringkasan?.services?.[layanan] ?? []) total += Number(u.total ?? 0);
  }
  return total;
};

export function formatLaporan(ringkasan, tanggal) {
  const baris = [`Laporan Pokja ${tanggal}:`];
  let ada = false;
  for (const layanan of URUTAN_LAYANAN) {
    const daftar = (ringkasan?.services?.[layanan] ?? []).filter((u) => Number(u.total ?? 0) > 0);
    if (!daftar.length) continue;
    ada = true;
    const ms = daftar.reduce((a, u) => a + Number(u.ms ?? 0), 0);
    const bts = daftar.reduce((a, u) => a + Number(u.bts ?? 0), 0);
    const tms = daftar.reduce((a, u) => a + Number(u.tms ?? 0), 0);
    baris.push(`${layanan}: ${ms + bts + tms} data (${ms} MS, ${bts} BTS, ${tms} TMS)`);
    for (const u of daftar) {
      baris.push(`  ${namaPengguna(u.user)}: ${u.total} (${u.ms} MS, ${u.bts} BTS, ${u.tms} TMS)`);
    }
  }
  if (!ada) baris.push('Belum ada data hari ini.');
  else baris.push(`Total: ${totalRingkasan(ringkasan)} data.`);
  return baris.join('\n');
}

export function formatRekap(harian) {
  const baris = ['Rekap Pokja:'];
  let total = 0;
  for (const { tanggal, ringkasan, gagal } of harian) {
    if (gagal) { baris.push(`${tanggal}: tidak terbaca.`); continue; }
    const perLayanan = URUTAN_LAYANAN.map((l) => {
      const n = (ringkasan?.services?.[l] ?? []).reduce((a, u) => a + Number(u.total ?? 0), 0);
      return n ? `${l} ${n}` : null;
    }).filter(Boolean);
    const n = totalRingkasan(ringkasan);
    total += n;
    baris.push(perLayanan.length ? `${tanggal}: ${n} data (${perLayanan.join(', ')})` : `${tanggal}: belum ada data.`);
  }
  baris.push(`Total: ${total} data.`);
  return baris.join('\n');
}

/** Sesi hari ini, didedupe per id sesi (aktivitas terakhir menang), terbaru dulu. Baris rusak dilewati. */
export function sesiHariIni(dataKehadiran, tanggal) {
  const perId = new Map();
  for (const mentah of dataKehadiran?.sesi ?? []) {
    let sesi;
    try { sesi = normalisasiSesi(mentah); } catch { continue; }
    if (tanggalWit(new Date(sesi.loginIso)) !== tanggal) continue;
    const lama = perId.get(sesi.idSesi);
    if (!lama || Date.parse(sesi.terakhirIso) >= Date.parse(lama.terakhirIso)) perId.set(sesi.idSesi, sesi);
  }
  return [...perId.values()].sort((a, b) => Date.parse(b.loginIso) - Date.parse(a.loginIso));
}

export function formatSesi(daftar, tanggal) {
  if (!daftar.length) return `Tidak ada sesi Pokja pada ${tanggal}.`;
  const baris = [`Sesi Pokja ${tanggal}:`];
  for (const s of daftar.slice(0, 20)) {
    const nama = namaPengguna(s.inisial);
    if (s.keluarIso) baris.push(`${jamWit(s.loginIso)} ${nama} — keluar ${jamWit(s.keluarIso)}`);
    else if (s.status === 'active') baris.push(`${jamWit(s.loginIso)} ${nama} — aktif, terakhir ${jamWit(s.terakhirIso)}`);
    else baris.push(`${jamWit(s.loginIso)} ${nama} — ${s.status}, terakhir ${jamWit(s.terakhirIso)}`);
  }
  return baris.join('\n');
}

export function formatOnline(daftar, sekarangMs) {
  const aktif = daftar.filter((s) => s.status === 'active' && !s.keluarIso);
  if (!aktif.length) return 'Tidak ada yang sedang online di Pokja.';
  const baris = ['Sedang online di Pokja:'];
  for (const s of aktif) {
    baris.push(`${namaPengguna(s.inisial)} — masuk ${jamWit(s.loginIso)}, terakhir aktif ${menitLalu(s.terakhirIso, sekarangMs)} menit lalu`);
  }
  return baris.join('\n');
}

/** Baris audit terbaru, didedupe per id, terbaru dulu. Baris rusak dan aksi tak dikenal dilewati. */
export function formatAudit(dataKehadiran, { filterInisial = null, limit = 10, sekarangMs = Date.now() } = {}) {
  const lihat = new Set();
  const baris = [];
  for (const mentah of dataKehadiran?.log ?? []) {
    let n;
    try { n = normalisasiLog(mentah); } catch { continue; }
    if (!n) continue;
    if (filterInisial && n.inisial !== filterInisial) continue;
    const kunci = n.id ?? `${n.inisial}|${n.waktuIso}|${n.kategori}|${n.layanan ?? ''}`;
    if (lihat.has(kunci)) continue;
    lihat.add(kunci);
    const at = Date.parse(n.waktuIso);
    if (!Number.isFinite(at) || at > sekarangMs) continue;
    const layanan = n.layanan ? (n.kategori === 'aktivitas' ? ` di ${n.layanan}` : ` ${n.layanan}`) : '';
    baris.push({ at, teks: `${jamWit(n.waktuIso)} ${namaPengguna(n.inisial)} — ${LABEL_AKSI[n.kategori]}${layanan}` });
  }
  baris.sort((a, b) => b.at - a.at);
  const ambil = baris.slice(0, limit);
  if (!ambil.length) return filterInisial ? `Tidak ada aktivitas ${filterInisial} yang tercatat.` : 'Tidak ada aktivitas yang tercatat.';
  return `Aktivitas Pokja terakhir:\n${ambil.map((b) => b.teks).join('\n')}`;
}

const TANGGAL_RE = /^\d{4}-\d{2}-\d{2}$/;
const tanggalSah = (s) => TANGGAL_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00+07:00`));

const daftarTanggal = (dari, sampai) => {
  const out = [];
  let d = new Date(`${dari}T00:00:00+07:00`);
  const akhir = new Date(`${sampai}T00:00:00+07:00`);
  while (d <= akhir && out.length <= 31) {
    out.push(tanggalWit(d));
    d = new Date(d.getTime() + 86400_000);
  }
  return out;
};

const pesanGagal = (e) => String(e?.message ?? e ?? 'gagal').replace(/\s+/g, ' ').slice(0, 160);

/**
 * Menjawab satu perintah Pokja. `penarik` berisi {ringkasan, kehadiran},
 * keduanya menerima tanggal WIT. Perintah yang butuh data dan penariknya
 * tidak ada, atau penarikannya gagal, menjawab terus terang, bukan
 * menebak. /ping dan /help tidak butuh penarik.
 */
export async function jawabPerintahPokja({ nama, args = '', penarik = null, sekarangMs = Date.now() } = {}) {
  const sekarang = new Date(sekarangMs);
  const hariIni = tanggalWit(sekarang);
  const butuhData = ['laporan', 'rekap', 'sesi', 'online', 'audit'].includes(nama);
  if (butuhData && !penarik) {
    return { kind: 'pokja', text: 'Perintah Pokja belum terkonfigurasi di server ini.' };
  }
  try {
    if (nama === 'ping') return { kind: 'pokja', text: `Aktif. ${hariIni} pukul ${jamWit(sekarang.toISOString())} WIT.` };
    if (nama === 'help') return { kind: 'pokja', text: formatBantuan() };
    if (nama === 'laporan') {
      const ringkasan = await penarik.ringkasan(hariIni);
      return { kind: 'pokja', text: formatLaporan(ringkasan, hariIni) };
    }
    if (nama === 'rekap') {
      const token = args.split(/\s+/).filter(Boolean);
      let dari; let sampai;
      if (token.length === 0) {
        sampai = hariIni;
        dari = tanggalWit(new Date(sekarangMs - 6 * 86400_000));
      } else if (token.length <= 2 && token.every(tanggalSah)) {
        [dari, sampai = dari] = token;
      } else {
        return { kind: 'pokja', text: 'Pakai: /rekap [dari YYYY-MM-DD] [sampai YYYY-MM-DD]. Contoh: /rekap 2026-10-21 2026-10-27' };
      }
      if (dari > sampai) [dari, sampai] = [sampai, dari];
      const tanggal = daftarTanggal(dari, sampai);
      const hasil = await Promise.all(tanggal.map(async (t) => {
        try { return { tanggal: t, ringkasan: await penarik.ringkasan(t) }; }
        catch { return { tanggal: t, gagal: true }; }
      }));
      return { kind: 'pokja', text: formatRekap(hasil) };
    }
    if (nama === 'sesi' || nama === 'online') {
      const data = await penarik.kehadiran(hariIni);
      const daftar = sesiHariIni(data, hariIni);
      return { kind: 'pokja', text: nama === 'sesi' ? formatSesi(daftar, hariIni) : formatOnline(daftar, sekarangMs) };
    }
    if (nama === 'audit') {
      const token = args.split(/\s+/).filter(Boolean);
      let filterInisial = null;
      if (token.length === 1 && /^[A-Za-z]{2,5}$/.test(token[0])) filterInisial = token[0].toUpperCase();
      else if (token.length > 0) return { kind: 'pokja', text: 'Pakai: /audit [INISIAL]. Contoh: /audit CM' };
      const data = await penarik.kehadiran(hariIni);
      return { kind: 'pokja', text: formatAudit(data, { filterInisial, sekarangMs }) };
    }
    return { kind: 'pokja', text: formatBantuan() };
  } catch (e) {
    return { kind: 'pokja', text: `Maaf, data Pokja tidak bisa dibaca sekarang: ${pesanGagal(e)}` };
  }
}

/**
 * Runner untuk dispatcher: tidak ada agen bahasa alami, jadi pesan bebas
 * hanya dibalas teks tetap. Profil sistem mengarahkan ke perintah;
 * profil pengguna dijelaskan terus terang bukan agen. Teks balasan
 * tidak pernah memuat blok pilihan, jadi tugas selalu selesai.
 */
export function buatRunnerPokja() {
  // Pesan tidak dibaca isinya (termasuk catatan sistem yang ditempel
  // dispatcher dari policy.mjs), karena balasannya selalu teks tetap.
  return async ({ profile }) => {
    const nama = byProfile(profile)?.name ?? profile;
    if (PROFIL_SISTEM.has(profile)) {
      const perkenalan = profile === 'KASUARI'
        ? 'Halo, saya Kak Suary, agen pemantau Pokja. Saya tidak menjawab bebas; saya hanya menjalankan perintah baca-saja berikut:'
        : 'Halo, saya Onet Aspri. Di kantor ini saya hanya menjawab perintah baca-saja berikut:';
      return { ok: true, text: `${perkenalan}\n${BANTUAN_BARIS.join('\n')}` };
    }
    return {
      ok: true,
      text: `${nama} adalah pengguna Pokja sungguhan, bukan agen. Chat di sini tidak sampai ke beliau; untuk laporan Pokja, buka chat Kak Suary atau Onet Aspri dan ketik /laporan.`,
    };
  };
}

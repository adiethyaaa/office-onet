// Pembaca kehadiran perkiraan dari data Pokja, untuk backend privat
// kantor-rpg. Berkas ini BARU dan satu-satunya berkas yang dibuat
// pada langkah pemindahan ini. Tidak ada berkas kantor-rpg lain
// yang diubah pada langkah ini: roster.mjs, boards.mjs, telegram.mjs,
// server.mjs, dan main.mjs masih apa adanya.
//
// Asal-usul: logika kehadiran disalin dari prototipe
// presence-perkiraan/presence.mjs yang sudah diuji (11 tes lolos).
// Yang berubah pada pemindahan ini hanya tiga hal, dan semuanya
// dicatat di bawah agar Mas bisa memeriksa satu per satu:
//  1. Ditambah pengubah bentuk API Pokja ke snapshot
//     (snapshotDariRingkasan), karena API mengembalikan
//     rekap_per_layanan, bukan bentuk snapshot.
//  2. Ditambah pemetaan aktor lewat argumen (pemetaanAktor), karena
//     roster.mjs belum diganti. Sampai roster diganti, actorId
//     dibiarkan null dan tampilan tetap bisa memakai daftar
//     kehadiran tanpa karakter.
//  3. Ditambah penarik snapshot (buatPenarikSnapshot) yang hanya
//     membaca lewat GET, dengan token dari variabel lingkungan.
//     Penarik ini belum dipanggil oleh server mana pun.
//
// Aturan kehadiran, sama seperti prototipe, dibaca dari paling atas:
//  1. Penarikan pertama pada satu tanggal hanya menjadi patokan
//     awal. Tidak ada yang dianggap masuk hanya karena namanya
//     sudah ada di patokan awal.
//  2. Seseorang dianggap masuk (peristiwa "masuk") hanya saat
//     selisih snapshotnya berubah: total bertambah (menambah data)
//     atau berkurang (menghapus data), pada layanan mana pun.
//  3. Setiap perubahan memperbarui waktu terakhir terlihat.
//     Statusnya "bekerja" selama selisihnya tidak melewati batas.
//  4. Melewati batas tanpa perubahan, orang itu dianggap keluar
//     (peristiwa "keluar"). Ini BUKAN bukti sesi habis atau
//     browser ditutup, hanya batas waktu tanpa perubahan.
//  5. Ganti tanggal mereset semuanya dan menetapkan patokan awal
//     baru.
// Setiap label wajib menyebut "perkiraan" dan "bukan status
// login", supaya tampilan tidak mengklaim lebih dari yang
// datanya dukung.
//
// Keamanan: berkas ini hanya membaca. Tidak ada penulisan ke API
// Pokja, tidak ada akses database MariaDB, tidak ada pembacaan
// berkas .env Hermes, dan token tidak pernah dicatat ke log atau
// dikembalikan ke browser. Kalau alamat API atau token tidak ada,
// penarik gagal tertutup (throw), bukan mengembalikan daftar
// kosong yang terlihat seperti sukses.

export const URUTAN_LAYANAN = ["PGA", "PI", "KP", "CASN", "SDP"];
export const URUTAN_STATUS = ["MS", "BTS", "TMS"];

const KUNCI_STATUS = { MS: "ms", BTS: "bts", TMS: "tms" };

// Tanggal hari ini di zona WIT (Asia/Jayapura), bentuk YYYY-MM-DD.
// Pemanggil yang sudah punya tanggal WIT dari lapisannya sendiri
// boleh mengirim tanggal itu langsung dan tidak memakai bantuan ini.
export function tanggalWit(sekarang = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jayapura",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(sekarang);
}

// Ambil kode pendek dari label user, misal "CM (Citra)" -> "CM".
// Kalau formatnya tidak dikenal, kembalikan label apa adanya.
export function kodePengguna(label) {
  const cocok = String(label ?? "").match(/^\s*([A-Za-z]+)/);
  return cocok ? cocok[1].toUpperCase() : String(label ?? "");
}

// Ringkasan satu perubahan, hanya status yang tidak nol, misal:
// "+2 SDP (2 MS)" atau "-1 PGA (1 BTS)".
export function ringkasPerubahan(layanan, selisihPerStatus, selisihTotal) {
  const bagian = [];
  for (const status of URUTAN_STATUS) {
    const nilai = selisihPerStatus[status] ?? 0;
    if (nilai !== 0) bagian.push(`${Math.abs(nilai)} ${status}`);
  }
  const tanda = selisihTotal > 0 ? "+" : "-";
  const isi = bagian.length > 0 ? ` (${bagian.join("; ")})` : "";
  return `${tanda}${Math.abs(selisihTotal)} ${layanan}${isi}`;
}

function angkaBulatsah(nilai, konteks) {
  const angka = Number(nilai);
  if (!Number.isFinite(angka)) {
    throw new Error(`Nilai tidak sah pada ${konteks}: ${String(nilai)}`);
  }
  return angka;
}

// Ubah jawaban API Pokja menjadi bentuk snapshot yang dipakai mesin.
// Bentuk API (dari Kasuari agent.py, fetch_pokja_summary):
//   { rekap_per_layanan: { PGA: { perubahan_user: [
//       { user, ms, bts, tms, total }, ... ] }, ... }, waktu_update }
// Layanan di luar URUTAN_LAYANAN diabaikan. Tanggal tidak ada di
// jawaban API, jadi pemanggil wajib mengirim tanggal WIT yang
// dipakai saat memanggil API (start_date = end_date = hari itu).
export function snapshotDariRingkasan(dataApi, tanggal) {
  if (!dataApi || typeof dataApi !== "object" || Array.isArray(dataApi)) {
    throw new Error("Jawaban API Pokja bukan objek");
  }
  const rekap = dataApi.rekap_per_layanan;
  if (!rekap || typeof rekap !== "object" || Array.isArray(rekap)) {
    throw new Error("Jawaban API Pokja tidak memuat rekap_per_layanan");
  }
  if (typeof tanggal !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
    throw new Error("Tanggal WIT harus bentuk YYYY-MM-DD");
  }
  const services = {};
  for (const layanan of URUTAN_LAYANAN) {
    const bagian = rekap[layanan];
    const daftar = bagian?.perubahan_user ?? [];
    if (!Array.isArray(daftar)) {
      throw new Error(`perubahan_user ${layanan} bukan daftar`);
    }
    services[layanan] = daftar.map((u, i) => {
      if (!u || typeof u.user !== "string" || u.user.trim() === "") {
        throw new Error(`User tidak sah pada ${layanan} indeks ${i}`);
      }
      return {
        user: u.user,
        ms: angkaBulatsah(u.ms ?? 0, `${layanan} ms`),
        bts: angkaBulatsah(u.bts ?? 0, `${layanan} bts`),
        tms: angkaBulatsah(u.tms ?? 0, `${layanan} tms`),
        total: angkaBulatsah(u.total ?? 0, `${layanan} total`),
      };
    });
  }
  return { date: tanggal, services };
}

// Hitung selisih per user per layanan antara dua snapshot.
// User yang hilang dari snapshot baru dianggap totalnya 0, sama
// seperti logika selisih Pokja yang sudah ada (penghapusan semua
// data).
export function hitungPerubahan(snapshotBaru, snapshotLama) {
  const hasil = [];
  const layananBaru = snapshotBaru?.services ?? {};
  const layananLama = snapshotLama?.services ?? {};
  for (const layanan of URUTAN_LAYANAN) {
    const daftarBaru = layananBaru[layanan] ?? [];
    const daftarLama = layananLama[layanan] ?? [];
    const petaLama = new Map(daftarLama.map((u) => [u.user, u]));
    const petaBaru = new Map(daftarBaru.map((u) => [u.user, u]));
    const gabungan = [...daftarBaru];
    for (const lama of daftarLama) {
      if (!petaBaru.has(lama.user)) {
        gabungan.push({ user: lama.user, ms: 0, bts: 0, tms: 0, total: 0 });
      }
    }
    for (const pengguna of gabungan) {
      const lama = petaLama.get(pengguna.user) ?? { ms: 0, bts: 0, tms: 0, total: 0 };
      const selisihPerStatus = {};
      for (const status of URUTAN_STATUS) {
        const kunci = KUNCI_STATUS[status];
        selisihPerStatus[status] =
          Number(pengguna[kunci] ?? 0) - Number(lama[kunci] ?? 0);
      }
      const selisihTotal =
        Number(pengguna.total ?? 0) - Number(lama.total ?? 0);
      if (selisihTotal === 0) continue;
      hasil.push({
        user: pengguna.user,
        layanan,
        selisihTotal,
        selisihPerStatus,
        ringkasan: ringkasPerubahan(layanan, selisihPerStatus, selisihTotal),
        arah: selisihTotal > 0 ? "menambah" : "menghapus",
      });
    }
  }
  return hasil;
}

export function keadaanAwal() {
  return { tanggal: null, snapshotTerakhir: null, pengguna: {} };
}

function menitSejak(waktuIso, terakhirIso) {
  const selisihMs = Date.parse(waktuIso) - Date.parse(terakhirIso);
  if (Number.isNaN(selisihMs) || selisihMs < 0) return 0;
  return Math.floor(selisihMs / 60000);
}

// Satu langkah penarikan. Mengembalikan keadaan baru (keadaan lama
// tidak diubah), daftar peristiwa, dan daftar pengguna yang sedang
// dianggap bekerja pada waktu penarikan ini.
export function prosesPenarikan(keadaan, snapshot, waktuIso, opsi = {}) {
  const batasMenit = opsi.batasMenit ?? 15;
  const sekarangMs = Date.parse(waktuIso);
  if (Number.isNaN(sekarangMs)) {
    throw new Error("waktuIso tidak sah, harus tanggal ISO");
  }

  // Ganti tanggal: reset, patokan awal baru, tanpa peristiwa masuk.
  if (keadaan.tanggal !== null && snapshot?.date !== keadaan.tanggal) {
    return {
      keadaan: { tanggal: snapshot.date, snapshotTerakhir: snapshot, pengguna: {} },
      peristiwa: [
        {
          jenis: "ganti-hari",
          pada: waktuIso,
          keterangan: `Tanggal berubah ke ${snapshot.date}; semua kehadiran direset.`,
        },
      ],
      aktif: [],
    };
  }

  // Penarikan pertama: patokan awal saja, tanpa peristiwa masuk.
  if (keadaan.snapshotTerakhir === null) {
    return {
      keadaan: { tanggal: snapshot.date, snapshotTerakhir: snapshot, pengguna: {} },
      peristiwa: [],
      aktif: [],
    };
  }

  const perubahan = hitungPerubahan(snapshot, keadaan.snapshotTerakhir);
  const penggunaBaru = { ...keadaan.pengguna };
  const peristiwa = [];

  for (const ubah of perubahan) {
    const sudahAda = penggunaBaru[ubah.user];
    if (!sudahAda) {
      peristiwa.push({
        jenis: "masuk",
        user: ubah.user,
        pada: waktuIso,
        lewat: "pintu depan",
        keterangan: `Masuk (perkiraan) setelah ${ubah.arah} data: ${ubah.ringkasan}.`,
      });
    }
    penggunaBaru[ubah.user] = {
      user: ubah.user,
      pertamaMasuk: sudahAda ? sudahAda.pertamaMasuk : waktuIso,
      terakhirTerlihat: waktuIso,
      layananTerakhir: ubah.layanan,
      perubahanTerakhir: ubah.ringkasan,
      arahTerakhir: ubah.arah,
    };
  }

  // Kedaluwarsa: tidak ada perubahan melewati batas menit -> keluar.
  const aktif = [];
  for (const [nama, data] of Object.entries(penggunaBaru)) {
    const menit = menitSejak(waktuIso, data.terakhirTerlihat);
    if (menit > batasMenit) {
      peristiwa.push({
        jenis: "keluar",
        user: nama,
        pada: waktuIso,
        lewat: "pintu depan",
        keterangan:
          `Keluar (perkiraan): tidak ada perubahan data selama ${menit} menit, ` +
          `melewati batas ${batasMenit} menit. Bukan bukti sesi habis.`,
      });
      delete penggunaBaru[nama];
    } else {
      aktif.push({ ...data, menitSejakPerubahanTerakhir: menit, status: "bekerja" });
    }
  }
  aktif.sort((a, b) => a.user.localeCompare(b.user));

  return {
    keadaan: { tanggal: snapshot.date, snapshotTerakhir: snapshot, pengguna: penggunaBaru },
    peristiwa,
    aktif,
  };
}

// Label jujur untuk tampilan. Selalu menyebut perkiraan dan bukan login.
export function labelStatus(data, waktuIso) {
  const menit = menitSejak(waktuIso, data.terakhirTerlihat);
  return (
    `Bekerja (perkiraan) — terakhir mengubah ${data.layananTerakhir} ` +
    `(${data.perubahanTerakhir}) · ${menit} menit lalu · bukan status login`
  );
}

// Bentuk yang cocok dengan bentuk Presence kantor-rpg
// (/api/presence): profile, name, actorId, status, source, summary.
// pemetaanAktor: objek dari kode pengguna ke id karakter, misal
// { CM: "ACT-ONET" }. Argumen ini sengaja dikirim dari luar,
// supaya berkas ini tidak bergantung pada roster.mjs yang belum
// diganti. Kode yang tidak ada di pemetaan mendapat actorId null.
export function keBentukPresence(aktif, waktuIso, pemetaanAktor = {}) {
  return {
    observedAt: waktuIso,
    sumber: "perkiraan-perubahan-data",
    agents: aktif.map((data) => ({
      profile: kodePengguna(data.user),
      name: data.user,
      actorId: pemetaanAktor[kodePengguna(data.user)] ?? null,
      status: "working",
      source: "perkiraan-perubahan-data",
      summary: labelStatus(data, waktuIso),
      lastSeen: Date.parse(data.terakhirTerlihat),
    })),
  };
}

// Penarik snapshot Pokja, baca-saja. Dibuat lewat pabrik supaya
// tes bisa menyuntikkan fungsi ambil palsu tanpa jaringan, dan
// server bisa menyuntikkan fetch bawaannya sendiri.
//   buatPenarikSnapshot({ url, token, ambil, batasMs })
// url dan token dibaca dari variabel lingkungan oleh pemanggil,
// bukan oleh berkas ini: POKJA_API_URL dan POKJA_API_TOKEN
// (nama yang sama dengan yang dipakai Kasuari agent.py).
// Permintaan: GET ?start_date=...&end_date=... dengan header
// X-Agent-Token, batas waktu 20 detik, sama seperti Kasuari.
// Gagal apa pun (alamat/token kosong, status bukan 2xx, JSON
// tidak sah, bentuk tidak sah) melempar galat dan tidak
// mengembalikan daftar kosong.
export function buatPenarikSnapshot({ url, token, ambil = fetch, batasMs = 20000 } = {}) {
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("POKJA_API_URL tidak ada; penarik snapshot tidak dibuat");
  }
  if (typeof token !== "string" || token === "") {
    throw new Error("POKJA_API_TOKEN tidak ada; penarik snapshot tidak dibuat");
  }
  return async (tanggal) => {
    if (typeof tanggal !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      throw new Error("Tanggal WIT harus bentuk YYYY-MM-DD");
    }
    const alamat = `${url}?start_date=${tanggal}&end_date=${tanggal}`;
    const pengendali = new AbortController();
    const pewaktu = setTimeout(() => pengendali.abort(), batasMs);
    try {
      const jawaban = await ambil(alamat, {
        method: "GET",
        headers: {
          "X-Agent-Token": token,
          "User-Agent": "kantor-rpg-pokja/1.0",
        },
        signal: pengendali.signal,
      });
      if (!jawaban.ok) {
        throw new Error(`API Pokja menjawab status ${jawaban.status}`);
      }
      const data = await jawaban.json();
      return snapshotDariRingkasan(data, tanggal);
    } finally {
      clearTimeout(pewaktu);
    }
  };
}

// Pembungkus bermesin untuk pemakaian server nanti. Keadaan hanya
// hidup di memori proses ini; mulai ulang proses berarti patokan
// awal baru. Belum ada penyimpanan keadaan antar-mulai-ulang,
// dan belum ada penjadwalan di dalam berkas ini. Penjadwalan
// (misalnya tiap 2 menit) menjadi tanggung jawab pemanggil,
// dan akan diputuskan bersama Mas pada langkah penyambungan.
//   const mesin = buatMesinKehadiran({ batasMenit: 15, penarik });
//   const hasil = await mesin.perbarui("2026-10-27T08:02:00+09:00");
export function buatMesinKehadiran({ batasMenit = 15, penarik } = {}) {
  if (typeof penarik !== "function") {
    throw new Error("buatMesinKehadiran butuh penarik snapshot");
  }
  let keadaan = keadaanAwal();
  return {
    perbarui: async (waktuIso) => {
      const tanggal = tanggalWit(new Date(waktuIso));
      const snapshot = await penarik(tanggal);
      const hasil = prosesPenarikan(keadaan, snapshot, waktuIso, { batasMenit });
      keadaan = hasil.keadaan;
      return hasil;
    },
    keadaan: () => JSON.parse(JSON.stringify(keadaan)),
  };
}

// Penyegar kehadiran untuk rute /api/presence di server.mjs.
// Dibuat terpisah supaya logika cache dan cadangannya bisa diuji
// tanpa menjalankan server penuh. ambilLama dikirim pada tiap
// panggilan, bukan saat pembuatan, karena jalur lama memakai
// data permintaan saat itu (daftar tugas RPG dan sesi Telegram).
// Aturannya:
//  - Tanpa mesin, langsung panggil ambilLama (jalur Hermes lama).
//  - Cache masih segar (di bawah batasCacheMs), kembalikan cache
//    tanpa memanggil API Pokja lagi.
//  - Cache basi, coba perbarui mesin. Berhasil: simpan cache baru
//    dan kembalikan daftar Pokja.
//  - Perbaruan gagal: kalau ada cache lama, kembalikan cache lama.
//    Kalau belum ada cache sama sekali, panggil ambilLama.
// Bentuk kembaliannya selalu { observedAt, agents }, sama seperti
// bentuk rute presence yang sudah ada, supaya tampilan tidak
// perlu berubah. Setiap agen mendapat replies, typing, dan
// lastSeen seperti yang ditambahkan server.mjs pada jalur lama.
//   const segarkan = buatPenyegarKehadiran({ mesin, batasCacheMs: 120000 });
//   const hasil = await segarkan(waktuIso, waktuMs, ambilLama);
export function buatPenyegarKehadiran({
  mesin = null,
  batasCacheMs = 120000,
  pemetaanAktor = {},
  bentukPresence = keBentukPresence,
} = {}) {
  let cache = null;
  return async (waktuIso, waktuMs, ambilLama) => {
    if (typeof ambilLama !== "function") {
      throw new Error("buatPenyegarKehadiran butuh ambilLama sebagai cadangan");
    }
    // ambilLama ditunggu (await) supaya cadangan berlapis bisa
    // berupa penyegar lain yang async, seperti pada server.mjs:
    // penyegar log memakai penyegar perkiraan sebagai cadangan,
    // dan penyegar perkiraan memakai jalur lama sebagai cadangan.
    // Kalau cadangan itu sendiri penyegar, label sumbernya
    // dipertahankan, supaya tidak tertutup label "lama".
    const pakaiCadangan = async () => {
      const cadangan = await ambilLama();
      return cadangan.sumber ? cadangan : { ...cadangan, sumber: "lama" };
    };
    if (!mesin) return pakaiCadangan();
    if (cache && waktuMs - cache.at <= batasCacheMs) {
      return { ...cache.value, sumber: "cache-pokja" };
    }
    try {
      const hasil = await mesin.perbarui(waktuIso);
      const presence = bentukPresence(hasil.aktif, waktuIso, pemetaanAktor);
      const value = {
        observedAt: presence.observedAt,
        agents: presence.agents.map((a) => ({
          ...a,
          replies: [],
          typing: false,
          lastSeen: a.lastSeen,
        })),
      };
      cache = { at: waktuMs, value };
      return { ...value, sumber: "pokja" };
    } catch {
      if (cache) return { ...cache.value, sumber: "cache-pokja" };
      return pakaiCadangan();
    }
  };
}

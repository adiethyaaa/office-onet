// Konverter kehadiran dari sesi dan log aktivitas Pokja menjadi
// agen di dunia virtual, untuk backend privat kantor-rpg.
//
// DIPERIKSA DARI KODE NYATA, BUKAN DARI ASUMSI
// Berkas ini ditulis ulang 2026-10-28 setelah membaca
// app/agent.py yang sedang berjalan di VPS Tencent
// (/home/ubuntu/hermes-system/app/agent.py, 413 baris, diubah
// 27 Oktober 2026 22:50 WIT) dan setelah memanggil dua
// endpointnya dengan cara yang sama seperti agen itu sendiri.
// Alur yang ditemukan, dari paling atas:
//   Browser/aplikasi Pokja -> tabel activity_logs di
//   db_tim_pokja (di VPS Kanreg) -> agent_summary.php di
//   pokja.tu-kanreg14.id -> agent.py di Tencent ->
//   perintah Telegram /sesi, /online, dan /audit.
// agent.py TIDAK pernah mengakses database secara langsung
// dan tidak pernah menyebut nama tabel activity_logs; tabel
// itu hanya hidup di balik endpoint PHP di Kanreg. Onet juga
// tidak mengakses database itu secara langsung dan tidak
// mengubah apa pun di Kanreg.
//
// Dua endpoint yang dipakai, dengan alamat dasar yang SAMA
// dengan ringkasan (env POKJA_API_URL) dan header yang sama
// (X-Agent-Token), persis seperti fetch_pokja_endpoint di
// agent.py (baris 280), batas waktu 20 detik:
//   ?action=sessions&limit=N  -> { total, waktu_cek,
//     sessions: [{ id, session_id, user_uid, id_inisial,
//       inisial, user_nama, nama, role, ip_address,
//       login_at, login_time, last_active_at, last_active,
//       logout_at, logout_time, status }] }
//   ?action=audit_logs&limit=N -> { total, waktu_cek,
//     logs: [{ id, session_id, user_uid, id_inisial, inisial,
//       user_nama, nama, module_name, module, action_type,
//       action, target_key, target_nama, changes_summary,
//       details, ip_address, created_at }] }
// Perintah Telegram yang memakai keduanya: /sesi dan /online
// memakai sessions (limit 15 di agen), /audit memakai
// audit_logs (limit 15, bisa difilter nip/inisial). Scheduler
// latar belakang agen hanya mengirim laporan ringkasan;
// sessions dan audit_logs hanya dipanggil saat ada perintah.
// Penarik di berkas ini memakai limit yang lebih besar
// (bawaan 500) karena kehadiran butuh semua user, bukan
// 15 baris terakhir.
//
// Nilai yang benar-benar terlihat pada pemeriksaan 2026-10-28
// sekitar pukul 01:00 WIT (hanya inisial FA yang aktif malam
// itu, jadi modul dan aksi lain belum terlihat dan tidak
// ditebak):
//   status sesi: "active", "logged_out"
//   module: "AUTH", "KP", "NAV", "PGA"
//   action: "LOGIN", "LOGOUT", "AUTH_LOGOUT", "NAV_MENU",
//     "BUTTON_CLICK", "EXPORT_EXCEL"
//   waktu: "2026-10-28 00:34:11", tanpa zona, dianggap WIT.
// Peta di bawah hanya memuat nilai-nilai itu. Nilai lain yang
// muncul nanti diabaikan dan dihitung, bukan ditebak.
//
// Aturan kehadiran, dibaca dari paling atas:
//  1. Sesi adalah sumber utama masuk/keluar. User ada di
//     dalam kalau ada sesi berstatus "active". Kalau semua
//     sesinya "logged_out", user sudah keluar. Satu user bisa
//     punya beberapa sesi; sesi yang masih aktif yang menang.
//  2. Audit log hanya memperkaya ringkasan: aksi dan modul
//     terakhir yang terlihat. BUTTON_CLICK TIDAK disebut
//     "mengedit", karena tombol apa pun bisa diklik; disebut
//     "beraktivitas". NAV_MENU disebut "membuka".
//  3. Status dihitung saat ditanya: aktivitas terakhir dalam
//     batas bekerja (bawaan 5 menit) berarti "working";
//     melewati itu tetapi sesi masih aktif dan belum melewati
//     batas idle (bawaan 60 menit) berarti "idle", karakter
//     tetap di dalam dan diam.
//  4. Tanpa aktivitas melewati batas idle, sesi dianggap
//     berakhir sebagai perkiraan, dengan keterangan yang
//     menyebut perkiraan.
//  5. Hanya kategori aksi dan modul yang disimpan dan
//     ditampilkan. Field ip_address, session_id, user_uid,
//     target_key, target_nama, changes_summary, dan details
//     TIDAK PERNAH disimpan atau ditampilkan.
//  6. Kalau daftar sesi terpotong (jumlah yang kembali lebih
//     sedikit dari total), penarik gagal tertutup, supaya
//     kantor tidak menampilkan kehadiran yang tidak lengkap
//     seolah-olah lengkap. Daftar log yang terpotong tidak
//     menggagalkan kehadiran, hanya membuat ringkasan kembali
//     ke wording sesi saja, karena sesi tetap lengkap.
//
// Bentuk Presence yang dihasilkan sama dengan bentuk
// /api/presence kantor-rpg: profile, name, actorId, status
// ("working" atau "idle"), source, summary, lastSeen.

import { tanggalWit, kodePengguna } from "./pokja.mjs";

// Nilai action persis seperti yang terlihat di endpoint
// audit_logs. Kunci ditulis huruf besar persis seperti di
// jawaban API; normalisasi hanya membuang spasi di ujung.
export const PETA_AKSI_NYATA = {
  LOGIN: "login",
  LOGOUT: "logout",
  AUTH_LOGOUT: "logout",
  NAV_MENU: "navigasi",
  BUTTON_CLICK: "aktivitas",
  EXPORT_EXCEL: "aktivitas",
};

export const KATEGORI_LABEL = {
  navigasi: "membuka",
  aktivitas: "beraktivitas di",
};

const LAYANAN_DIKENAL = ["PGA", "PI", "KP", "CASN", "SDP"];

// Stempel waktu menjadi ISO yang bisa diparse. Bentuk nyata
// adalah "2026-10-28 00:34:11" tanpa zona, dianggap WIT.
// Stempel yang sudah membawa zona dipakai apa adanya.
export function parseWaktu(nilai, zonaDefault = "+07:00") {
  const teks = String(nilai ?? "").trim();
  if (teks === "") return null;
  const tanpaZona = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?$/.test(teks);
  const iso = tanpaZona ? `${teks.replace(" ", "T")}${zonaDefault}` : teks;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function menitSejak(waktuIso, terakhirIso) {
  const selisihMs = Date.parse(waktuIso) - Date.parse(terakhirIso);
  if (Number.isNaN(selisihMs) || selisihMs < 0) return 0;
  return Math.floor(selisihMs / 60000);
}

function jamWit(waktuIso) {
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jayapura",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(waktuIso));
}

function labelPengguna(inisial, nama) {
  const namaBersih = String(nama ?? "").trim();
  if (namaBersih !== "" && namaBersih.toUpperCase() !== String(inisial).toUpperCase()) {
    return `${inisial} (${namaBersih})`;
  }
  return String(inisial);
}

function modulKeLayanan(modul) {
  const kode = String(modul ?? "").trim().toUpperCase();
  return LAYANAN_DIKENAL.includes(kode) ? kode : null;
}

// Satu baris sessions menjadi bentuk kanonis. Field yang
// tidak dipakai (ip_address, session_id, user_uid, role)
// sengaja tidak dibaca. Melempar galat kalau inisial, status,
// atau waktu login tidak sah, supaya data rusak tidak
// diam-diam menampilkan kantor yang kosong.
export function normalisasiSesi(mentah) {
  if (!mentah || typeof mentah !== "object" || Array.isArray(mentah)) {
    throw new Error("Baris sesi bukan objek");
  }
  const inisial = String(mentah.inisial ?? "").trim().toUpperCase();
  if (inisial === "") throw new Error("Baris sesi tanpa inisial");
  const status = String(mentah.status ?? "").trim().toLowerCase();
  if (status === "") throw new Error(`Baris sesi ${inisial} tanpa status`);
  const loginIso = parseWaktu(mentah.login_time ?? mentah.login_at);
  if (loginIso === null) throw new Error(`Baris sesi ${inisial} tanpa waktu login yang sah`);
  const terakhirIso = parseWaktu(mentah.last_active ?? mentah.last_active_at) ?? loginIso;
  const keluarIso = parseWaktu(mentah.logout_time ?? mentah.logout_at);
  return {
    idSesi: String(mentah.session_id ?? mentah.id ?? ""),
    inisial,
    nama: String(mentah.nama ?? mentah.user_nama ?? "").trim(),
    loginIso,
    terakhirIso,
    keluarIso,
    status,
  };
}

// Satu baris audit_logs menjadi bentuk kanonis, atau null
// kalau action-nya tidak dikenal (diabaikan, bukan ditebak).
// Field target_key, target_nama, changes_summary, details,
// dan ip_address sengaja TIDAK dibaca.
export function normalisasiLog(mentah) {
  if (!mentah || typeof mentah !== "object" || Array.isArray(mentah)) {
    throw new Error("Baris log bukan objek");
  }
  const inisial = String(mentah.inisial ?? "").trim().toUpperCase();
  if (inisial === "") throw new Error("Baris log tanpa inisial");
  const waktuIso = parseWaktu(mentah.created_at);
  if (waktuIso === null) throw new Error(`Baris log ${inisial} tanpa waktu yang sah`);
  const kategori = PETA_AKSI_NYATA[String(mentah.action ?? "").trim().toUpperCase()];
  if (!kategori) return null;
  return {
    id: mentah.id ?? null,
    inisial,
    nama: String(mentah.nama ?? mentah.user_nama ?? "").trim(),
    waktuIso,
    kategori,
    layanan: modulKeLayanan(mentah.module),
  };
}

// Lipat daftar sesi dan log menjadi kehadiran pada waktu yang
// ditanya. Fungsi murni: hasil yang sama untuk masukan yang
// sama, sehingga penarikan ulang penuh setiap kali aman.
export function lipatKehadiran(dataMentah, sampaiWaktuIso, opsi = {}) {
  const batasBekerjaMenit = opsi.batasBekerjaMenit ?? 5;
  const batasIdleMenit = opsi.batasIdleMenit ?? 60;
  if (Number.isNaN(Date.parse(sampaiWaktuIso))) {
    throw new Error("sampaiWaktuIso tidak sah, harus tanggal ISO");
  }
  const tanggal = tanggalWit(new Date(sampaiWaktuIso));
  const sampaiMs = Date.parse(sampaiWaktuIso);

  // Sesi: buang yang waktunya melewati waktu tanya atau dari
  // tanggal lain, lalu gandakan berdasarkan session_id dengan
  // baris yang aktivitas terakhirnya paling baru yang menang.
  const sesiPerId = new Map();
  for (const mentah of dataMentah?.sesi ?? []) {
    const sesi = normalisasiSesi(mentah);
    if (tanggalWit(new Date(sesi.loginIso)) !== tanggal) continue;
    if (Date.parse(sesi.loginIso) > sampaiMs) continue;
    const lama = sesiPerId.get(sesi.idSesi);
    if (!lama || Date.parse(sesi.terakhirIso) >= Date.parse(lama.terakhirIso)) {
      sesiPerId.set(sesi.idSesi, sesi);
    }
  }
  const sesiPerUser = new Map();
  for (const sesi of sesiPerId.values()) {
    if (!sesiPerUser.has(sesi.inisial)) sesiPerUser.set(sesi.inisial, []);
    sesiPerUser.get(sesi.inisial).push(sesi);
  }

  // Log: buang yang tidak dikenal, yang tanggalnya lain, atau
  // yang waktunya melewati waktu tanya, lalu gandakan
  // berdasarkan id dan urutkan berdasarkan waktu.
  const logPerUser = new Map();
  let diabaikan = 0;
  const idTerlihat = new Set();
  const logUrut = [];
  for (const mentah of dataMentah?.log ?? []) {
    const normal = normalisasiLog(mentah);
    if (normal === null) {
      diabaikan += 1;
      continue;
    }
    if (tanggalWit(new Date(normal.waktuIso)) !== tanggal) continue;
    if (Date.parse(normal.waktuIso) > sampaiMs) continue;
    if (normal.id !== null && normal.id !== undefined) {
      if (idTerlihat.has(normal.id)) continue;
      idTerlihat.add(normal.id);
    }
    logUrut.push(normal);
  }
  logUrut.sort((a, b) => Date.parse(a.waktuIso) - Date.parse(b.waktuIso));
  for (const entri of logUrut) {
    if (!logPerUser.has(entri.inisial)) logPerUser.set(entri.inisial, []);
    logPerUser.get(entri.inisial).push(entri);
  }

  const aktif = [];
  const peristiwa = [];
  const semuaInisial = [...new Set([...sesiPerUser.keys(), ...logPerUser.keys()])].sort();
  for (const inisial of semuaInisial) {
    const daftarSesi = sesiPerUser.get(inisial) ?? [];
    const sesiAktif = daftarSesi.filter((s) => s.status === "active");
    const daftarLog = logPerUser.get(inisial) ?? [];
    if (sesiAktif.length === 0) {
      // Hanya sesi yang sudah keluar: catat peristiwa keluar
      // pada waktu logout terakhir, tanpa menampilkan user.
      const keluar = daftarSesi
        .map((s) => s.keluarIso)
        .filter(Boolean)
        .sort()
        .at(-1);
      if (keluar) {
        peristiwa.push({
          jenis: "keluar",
          user: inisial,
          pada: keluar,
          lewat: "pintu depan",
          keterangan: `Keluar lewat pintu depan: logout tercatat ${jamWit(keluar)} WIT.`,
        });
      }
      continue;
    }
    const nama = sesiAktif[0].nama || daftarLog[0]?.nama || "";
    const masukPada = sesiAktif.map((s) => s.loginIso).sort()[0];
    const terakhirSesi = sesiAktif.map((s) => s.terakhirIso).sort().at(-1);
    const logTerakhir = daftarLog.at(-1) ?? null;
    let terakhirAktivitas = terakhirSesi;
    let aksiTerakhir = "aktivitas";
    let layananTerakhir = null;
    if (logTerakhir && Date.parse(logTerakhir.waktuIso) >= Date.parse(terakhirSesi)) {
      terakhirAktivitas = logTerakhir.waktuIso;
      aksiTerakhir = logTerakhir.kategori;
      layananTerakhir = logTerakhir.layanan;
    }
    const menit = menitSejak(sampaiWaktuIso, terakhirAktivitas);
    if (menit > batasIdleMenit) {
      peristiwa.push({
        jenis: "keluar",
        user: inisial,
        pada: sampaiWaktuIso,
        lewat: "pintu depan",
        keterangan:
          `Keluar (perkiraan): tidak ada aktivitas selama ${menit} menit ` +
          `melewati batas idle ${batasIdleMenit} menit, tanpa catatan keluar.`,
      });
      continue;
    }
    // Setiap user yang masih aktif mendapat satu peristiwa
    // masuk pada waktu login sesi aktifnya yang paling awal.
    // Peristiwa ini hanya catatan; tampilan memakai daftar
    // aktif, bukan daftar peristiwa.
    peristiwa.push({
      jenis: "masuk",
      user: inisial,
      pada: masukPada,
      lewat: "pintu depan",
      keterangan: `Masuk lewat pintu depan: login tercatat ${jamWit(masukPada)} WIT.`,
    });
    aktif.push({
      inisial,
      user: labelPengguna(inisial, nama),
      masukPada,
      terakhirAktivitas,
      aksiTerakhir,
      layananTerakhir,
      menitSejakAktivitasTerakhir: menit,
      status: menit <= batasBekerjaMenit ? "bekerja" : "idle",
    });
  }
  aktif.sort((a, b) => a.inisial.localeCompare(b.inisial));
  return { tanggal, aktif, peristiwa, diabaikan };
}

// Label jujur untuk tampilan. Menyebut sumbernya sesi dan log,
// dan untuk idle menyebut sesi masih aktif.
export function labelStatusLog(data, waktuIso) {
  const menit = menitSejak(waktuIso, data.terakhirAktivitas);
  const layanan = data.layananTerakhir ? ` ${data.layananTerakhir}` : "";
  const aksi =
    data.aksiTerakhir === "login"
      ? "login"
      : data.aksiTerakhir === "navigasi"
        ? `membuka${layanan}`
        : data.aksiTerakhir === "aktivitas"
          ? `beraktivitas${layanan ? ` di${layanan}` : ""}`
          : "beraktivitas";
  if (data.status === "idle") {
    return (
      `Idle — login ${jamWit(data.masukPada)} WIT, tidak ada aktivitas ` +
      `${menit} menit, sesi masih aktif · dari sesi dan log Pokja`
    );
  }
  return (
    `Bekerja — login ${jamWit(data.masukPada)} WIT, terakhir ${aksi} ` +
    `${menit} menit lalu · dari sesi dan log Pokja`
  );
}

// Bentuk yang cocok dengan bentuk Presence kantor-rpg, sama
// seperti keBentukPresence pada jalur perkiraan, tetapi dengan
// status working/idle dari sesi dan log.
export function keBentukPresenceLog(aktif, waktuIso, pemetaanAktor = {}) {
  return {
    observedAt: waktuIso,
    sumber: "sesi-dan-log-pokja",
    agents: aktif.map((data) => ({
      profile: kodePengguna(data.inisial),
      name: data.user,
      actorId: pemetaanAktor[kodePengguna(data.inisial)] ?? null,
      status: data.status === "idle" ? "idle" : "working",
      source: "sesi-dan-log-pokja",
      summary: labelStatusLog(data, waktuIso),
      lastSeen: Date.parse(data.terakhirAktivitas),
    })),
  };
}

// Penarik kehadiran, baca-saja, dengan pola yang sama seperti
// fetch_pokja_endpoint di agent.py: alamat dasar yang sama
// dengan ringkasan, ?action=..., header X-Agent-Token, batas
// waktu 20 detik, gagal tertutup, dan token tidak pernah
// dicatat. Kedua panggilan memakai alamat dan token yang
// sama; tidak ada endpoint terpisah untuk log.
export function buatPenarikKehadiran({
  url,
  token,
  ambil = fetch,
  batasMs = 20000,
  limitSesi = 500,
  limitLog = 500,
} = {}) {
  if (typeof url !== "string" || url.trim() === "") {
    throw new Error("POKJA_API_URL tidak ada; penarik kehadiran tidak dibuat");
  }
  if (typeof token !== "string" || token === "") {
    throw new Error("POKJA_API_TOKEN tidak ada; penarik kehadiran tidak dibuat");
  }
  const ambilSatu = async (action, limit) => {
    const alamat = `${url}?action=${action}&limit=${limit}`;
    const pengendali = new AbortController();
    const pewaktu = setTimeout(() => pengendali.abort(), batasMs);
    try {
      const jawaban = await ambil(alamat, {
        method: "GET",
        headers: {
          "X-Agent-Token": token,
          "User-Agent": "Kasuari-Monitoring-Agent/1.0",
        },
        signal: pengendali.signal,
      });
      if (!jawaban.ok) {
        throw new Error(`API Pokja menjawab status ${jawaban.status} untuk ${action}`);
      }
      return jawaban.json();
    } finally {
      clearTimeout(pewaktu);
    }
  };
  return async (tanggal) => {
    if (typeof tanggal !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(tanggal)) {
      throw new Error("Tanggal WIT harus bentuk YYYY-MM-DD");
    }
    const [dataSesi, dataLog] = await Promise.all([
      ambilSatu("sessions", limitSesi),
      ambilSatu("audit_logs", limitLog),
    ]);
    const sesi = dataSesi?.sessions;
    const log = dataLog?.logs;
    if (!Array.isArray(sesi)) throw new Error("Jawaban sessions tidak memuat daftar sessions");
    if (!Array.isArray(log)) throw new Error("Jawaban audit_logs tidak memuat daftar logs");
    if (typeof dataSesi.total === "number" && sesi.length < dataSesi.total) {
      throw new Error(
        `Daftar sesi tidak lengkap: kembali ${sesi.length} dari total ${dataSesi.total}`,
      );
    }
    // Daftar dikembalikan mentah; normalisasi, pembuangan field
    // yang tidak dipakai, dan penghitungan entri yang diabaikan
    // dilakukan lipatKehadiran, supaya satu tempat saja yang
    // bertanggung jawab atas bentuk kanonis.
    return {
      sesi,
      log,
      logLengkap: typeof dataLog.total !== "number" || log.length >= dataLog.total,
    };
  };
}

// Mesin log untuk pemakaian server. Setiap perbarui mengambil
// ulang sesi dan log hari itu dan melipatnya dari awal, jadi
// tidak ada keadaan bertambah yang bisa menggandakan peristiwa.
//   const mesin = buatMesinLogAktivitas({ penarik });
//   const hasil = await mesin.perbarui("2026-10-28T08:05:00+07:00");
export function buatMesinLogAktivitas({
  penarik,
  batasBekerjaMenit = 5,
  batasIdleMenit = 60,
} = {}) {
  if (typeof penarik !== "function") {
    throw new Error("buatMesinLogAktivitas butuh penarik kehadiran");
  }
  let terakhir = null;
  return {
    perbarui: async (waktuIso) => {
      const tanggal = tanggalWit(new Date(waktuIso));
      const data = await penarik(tanggal);
      const hasil = lipatKehadiran(data, waktuIso, {
        batasBekerjaMenit,
        batasIdleMenit,
      });
      terakhir = hasil;
      return hasil;
    },
    keadaan: () => JSON.parse(JSON.stringify(terakhir)),
  };
}

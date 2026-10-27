// [POKJA-TAHAP-1] Roster Pokja, pengganti daftar Hermes.
// Nama tampil memakai SATU kata nama depan, sesuai arahan
// Mas. Nama diambil dari field nama pada endpoint sesi dan
// log Pokja (tabel users_account di balik backend, dibaca
// lewat backend Kasuari yang sama, tanpa akses database
// langsung): FA dan SL terverifikasi dari sana pada malam
// 28 Oktober 2026; CM, ER, NG, dan MJ memakai kata depan
// dari nama yang sudah terverifikasi pada laporan Pokja;
// RP memakai nama panggilan Rony, sesuai keputusan Mas;
// kata depan nama lengkapnya adalah Yulius.
// FA adalah akun Mas sendiri (nama pada sesi: Adiethya
// Arpujiono), tetapi sejak keputusan Mas 28 Oktober 2026
// 08:13 WIT, FA adalah karyawan biasa seperti pengguna
// Pokja lain; karakter CEO adalah Masdit (pemain) dan
// bukan anggota roster, jadi tidak ada entri CEO di
// roster ini. Nama tampil dua entri sistem memakai
// arahan Mas 28 Oktober 2026 02:09 WIT: ONET tampil
// "Onet Aspri" dan KASUARI tampil "Kak Suary"; kode profil
// keduanya tetap ONET dan KASUARI.
//
// `profile` tidak boleh berubah: panel menyambung daftar
// agen dan kehadiran lewat `profile` yang sama dengan kode
// pengguna dari kodePengguna() di pokja.mjs dan pokja-log.mjs
// (misal "CM").
//
// `gender` memakai bawaan "male" untuk semua entri, sesuai
// arahan Mas sebelum daftar jenis kelamin diberikan. Nanti
// langkah design memakai field ini untuk memilih model
// karakter; Mas akan memberi tahu siapa yang laki-laki dan
// siapa yang perempuan, lalu field ini diperbarui.
//
// actorId adalah id karakter di design/world.json
// (ACT-FA, ACT-ONET, dan seterusnya). Id pemain ACT-MAS
// (Masdit CEO) tidak ada di roster, karena pemain bukan
// agen yang dipantau kehadirannya; FA memakai id
// karakternya sendiri ACT-FA.
//
// PRIVATE_PROFILES mempertahankan dua profil lama Hermes
// (yupus, wealth) BUKAN sebagai anggota roster, melainkan
// sebagai penjaga data Kanban lama: tugas yang ditugaskan
// kepada profil itu tetap disamarkan di papan (judul menjadi
// "Tugas pribadi", badan "PRIBADI") sampai boards.mjs diganti
// pada langkah berikutnya. Tidak ada anggota roster baru yang
// bersifat privat pada langkah ini.
export const ROSTER = [
  { profile: 'FA', name: 'Adiethya', lane: 'Pengguna Pokja Mutasi', actorId: 'ACT-FA', badan: 'POKJA', gender: 'male' },
  { profile: 'ONET', name: 'Onet Aspri', lane: 'Asisten pribadi, kehadiran dan laporan Pokja', actorId: 'ACT-ONET', badan: 'SISTEM', gender: 'male' },
  { profile: 'KASUARI', name: 'Kak Suary', lane: 'Agen pemantau Pokja (Telegram)', actorId: 'ACT-KASUARI', badan: 'SISTEM', gender: 'male' },
  { profile: 'CM', name: 'Citra', lane: 'Pengguna Pokja Mutasi', actorId: 'ACT-CM', badan: 'POKJA', gender: 'male' },
  { profile: 'RP', name: 'Rony', lane: 'Pengguna Pokja Mutasi', actorId: 'ACT-RP', badan: 'POKJA', gender: 'male' },
  { profile: 'ER', name: 'Erni', lane: 'Pengguna Pokja Mutasi', actorId: 'ACT-ER', badan: 'POKJA', gender: 'male' },
  { profile: 'NG', name: 'Angelina', lane: 'Pengguna Pokja Mutasi', actorId: 'ACT-NG', badan: 'POKJA', gender: 'male' },
  { profile: 'SL', name: 'Sonya', lane: 'Pengguna Pokja Mutasi', actorId: 'ACT-SL', badan: 'POKJA', gender: 'male' },
  { profile: 'MJ', name: 'Michael', lane: 'Pengguna Pokja Mutasi', actorId: 'ACT-MJ', badan: 'POKJA', gender: 'male' },
];

export const PRIVATE_PROFILES = new Set(['yupus', 'wealth']);

export const byProfile = (p) => ROSTER.find((r) => r.profile === p) ?? null;

// [POKJA-TAHAP-1] Pemetaan kode pengguna Pokja ke id karakter,
// diturunkan dari ROSTER supaya tidak ada dua daftar yang bisa
// berbeda isinya. server.mjs memakai pemetaan ini sebagai
// bawaan untuk mesin perkiraan dan mesin sesi/log, kecuali
// pemanggil mengirim pemetaan suntikan lewat cfg (untuk tes).
export const PEMETAAN_AKTOR_POKJA = Object.fromEntries(
  ROSTER.filter((r) => r.actorId).map((r) => [r.profile, r.actorId]),
);

# Catatan log aktivitas: dari `db_tim_pokja` ke agen di dunia virtual

> PEMBARUAN 2026-10-28 (setelah membaca `agent.py` di VPS
> Tencent): sebagian besar isi dokumen ini di bawah sudah
> digantikan oleh temuan yang terverifikasi di
> `ALUR-AGENT-POKJA.md`. Yang benar: log dibaca lewat alamat
> Pokja yang sama dengan parameter `?action=sessions` dan
> `?action=audit_logs`, field dan nilai aksinya sudah
> diketahui persis, dan `pokja-log.mjs` sudah ditulis ulang
> memakai sesi sebagai sumber utama dan audit log sebagai
> pengaya ringkasan. `main.mjs` tidak lagi memakai env log
> terpisah. Bagian "Yang masih harus dikonfirmasi" di bawah
> dibaca sebagai riwayat sebelum pemeriksaan itu, bukan
> sebagai keadaan sekarang.

## Jawabannya: bisa, dan lebih jujur daripada versi perkiraan

Log aktivitas mencatat login, navigasi, edit data, dan logout
per user beserta waktunya, jadi karakter bisa masuk saat login
tercatat, berstatus bekerja saat ada navigasi atau edit baru,
berstatus idle saat sesi masih terbuka tetapi tidak ada
aktivitas, dan keluar saat logout tercatat. Versi perkiraan
dari perubahan data tetap dipertahankan sebagai cadangan kalau
log tidak bisa dibaca, dan jalur lama Hermes tetap menjadi
cadangan terakhir.

Batas yang tetap berlaku: log membuktikan ada aksi tercatat,
bukan membuktikan user sedang menatap layar. Status idle di
sini artinya "sesi terbuka, tidak ada aksi tercatat", bukan
"user sedang istirahat". Keterangan di tampilan menyebut
sumbernya log aktivitas, supaya tidak diklaim lebih dari itu.

## Aturan yang dipakai `server/pokja-log.mjs`

- Login tercatat: masuk lewat pintu depan. Login kedua saat
  sesi masih terbuka hanya memperbarui aktivitas.
- Navigasi atau edit dalam 5 menit terakhir (bawaan, bisa
  diubah lewat `batasBekerjaMenit`): status `working`.
- Sesi terbuka, aktivitas terakhir 6 sampai 60 menit lalu
  (bawaan, bisa diubah lewat `batasIdleMenit`): status `idle`.
  Karakter tetap di dalam dan diam.
- Logout tercatat: keluar lewat pintu depan, tidak ada lagi
  di daftar.
- Tanpa aktivitas melewati 60 menit dan tanpa logout: keluar
  sebagai perkiraan, dengan keterangan yang menyebut
  perkiraan dan tanpa catatan keluar.
- Aktivitas tanpa login tercatat sebelumnya: masuk secara
  implisit, dengan keterangan perkiraan dari aktivitas.
- Hanya kategori aksi dan layanan yang ditampilkan, misalnya
  "mengedit PGA" atau "membuka KP". Isi detail log tidak pernah
  disimpan dan tidak pernah ditampilkan.

## Berkas pada langkah ini

- `server/pokja-log.mjs` — berkas baru: konverter log murni,
  penarik log baca-saja, dan mesin log yang melipat ulang
  entri hari itu dari awal setiap penarikan.
- `server/pokja.mjs` — ditambah opsi `bentukPresence` pada
  penyegar dan cadangan berlapis yang menunggu (await), supaya
  penyegar log bisa memakai penyegar perkiraan sebagai
  cadangan. Fungsi lama tidak diubah isinya.
- `server/server.mjs` — ditambah tiga hunk `[POKJA-LOG]`:
  impor log, pembuatan mesin log dan penyegar log, dan dua
  baris terakhir rute `/api/presence` yang merantai log,
  perkiraan, lalu jalur lama. Tidak ada baris lain yang
  berubah pada langkah ini, dan komentar lama yang menyebut
  main.mjs belum mengirim env sudah diperbarui.
- `server/main.mjs` — salinan peninjauan dari `main.mjs`
  asli, dengan dua hunk: daftar env di komentar dan pengiriman
  `POKJA_API_URL` dan `POKJA_API_TOKEN` (nama saja, tanpa
  nilai) ke `createServer`. Perilaku fail-closed proxy-secret
  tetap. (Versi sebelum pembaruan 2026-10-28 sempat memakai
  env log terpisah; versi sekarang tidak, sesuai alur nyata.)
- `server/test/pokja-log.test.mjs` — berkas baru, 12 tes
  dengan bentuk data nyata dari endpoint sessions dan
  audit_logs (versi sebelum pembaruan memakai 13 tes dengan
  bentuk asumsi).
- `server/test/main-pokja.test.mjs` — berkas baru, 2 tes
  pemeriksaan statis `main.mjs`.
- `server/test/server-pokja.test.mjs` — diperbarui: sekarang
  memeriksa tiga penanda TAHAP-1 dan tiga penanda LOG, serta
  rantai penyegar log dan perkiraan.
- `docs/SERVER-MJS.diff` dan `docs/MAIN-MJS.diff` — selisih
  terhadap berkas asli, dibuat ulang pada langkah ini.
- `docs/LOG-AKTIVITAS.md` — berkas ini.

## Urutan sumber di `/api/presence` sekarang

1. Log aktivitas (cache 30 detik). Kalau mesin log tidak ada
   atau perbaruan gagal tanpa cache, lanjut ke nomor 2.
2. Perkiraan dari perubahan data (cache 120 detik). Kalau
   mesin perkiraan tidak ada atau gagal tanpa cache, lanjut
   ke nomor 3.
3. Jalur lama Hermes, persis seperti sebelumnya.

## Yang masih harus dikonfirmasi Mas sebelum jalur log aktif

Sampai lima hal ini dikonfirmasi, jalur log mati secara
bawaan (env log kosong) dan jalur perkiraan yang berjalan.
Tidak ada yang ditebak di kode untuk lima hal ini:

1. **Endpoint baca-saja log. DIPERIKSA 2026-10-28.**
   Mas menyampaikan log sudah ada di `agent_summary.php`.
   Onet memeriksa lewat backend Kasuari yang sama, dengan
   panggilan yang sama seperti Kasuari, untuk hari ini
   (28 Oktober 2026) dan untuk rentang 27–28 Oktober 2026.
   Jawabannya hanya berisi kunci `judul_laporan`,
   `periode_teks`, `waktu_update`, `is_range`, `start_date`,
   `end_date`, dan `rekap_per_layanan`, tanpa daftar log
   dengan nama apa pun di dalam kunci-kunci itu. Jadi yang
   Mas maksud kemungkinan adalah berkas PHP-nya sudah
   membaca tabel log di sisi Kanreg, tetapi belum
   mengembalikannya di jawaban JSON ini. Yang dibutuhkan
   adalah kunci log baru di jawaban yang sama atau endpoint
   baca-saja terpisah di sisi Kanreg. Onet tidak mengubah
   apa pun di Kanreg dan tidak mengakses MariaDB langsung;
   yang dibutuhkan adalah nama tabel dan kolom log, atau
   potongan `agent_summary.php` yang membaca log itu, supaya
   kunci dan peta fieldnya bisa dicocokkan tanpa menebak.
2. **Nama field persis.** Nilai bawaan: `user`, `waktu`,
   `aksi`, `layanan`, dalam daftar bernama `log_aktivitas`.
   Kalau nama nyatanya berbeda, yang diubah hanya
   `petaField` dan `fieldDaftar`, tanpa mengubah logika.
3. **Nilai aksi persis di database.** Peta bawaan memakai
   kata-kata Mas: login, logout, navigasi, edit (plus
   padanannya: masuk, keluar, lihat, buka, ubah, tambah,
   hapus, simpan, submit, validasi, verifikasi). Nilai aksi
   yang tidak ada di peta diabaikan dan dihitung, bukan
   ditebak. Daftar nilai nyata dari Mas yang menentukan
   peta akhirnya; tempat mengubahnya adalah
   `PETA_AKSI_BAWAAN` di `pokja-log.mjs`.
4. **Zona waktu stempel.** Diasumsikan stempel membawa zona
   (ISO dengan offset); stempel tanpa zona dianggap WIT.
   Kalau stempel nyata ternyata UTC, asumsi ini harus
   diubah di `parseWaktu`.
5. **Perilaku sesi.** Apakah logout selalu tercatat, dan
   apakah satu user bisa login dari dua perangkat? Aturan
   kedaluwarsa 60 menit menutup celah tanpa logout, dengan
   label perkiraan.

Yang paling membantu dari Mas untuk langkah berikutnya
adalah salah satu dari: potongan `agent_summary.php` yang
membaca tabel log (nama tabel dan kolomnya saja, tanpa kata
sandi), atau contoh 3 sampai 5 baris log yang sudah
dianonimkan (tanpa kata sandi, tanpa nomor peserta, tanpa
isi usulan), cukup kolom user, waktu, aksi, dan layanan,
supaya peta aksi dan field bisa dicocokkan dengan nilai
nyata. Sampai saat itu, jalur log tetap mati secara bawaan
dan jalur perkiraan yang berjalan, jadi tidak ada yang
rusak karena pemeriksaan ini.

## Verifikasi pada langkah ini

- `node --check` pada `main.mjs`, `server.mjs`,
  `pokja.mjs`, dan `pokja-log.mjs`: lolos.
- `node --test` pada lima berkas tes di `server/test/`:
  34 tes lolos, 0 gagal.
- Selisih `server.mjs` terhadap yang asli: tiga hunk,
  berisi penanda TAHAP-1 dan LOG. Selisih `main.mjs`
  terhadap yang asli: dua hunk.
- Salinan pemeriksaan kantor-rpg asli tetap bersih, belum
  ada fork atau push, dan tidak ada perubahan di VPS
  Tencent atau VPS Kanreg.

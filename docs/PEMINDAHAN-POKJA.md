# Catatan pemindahan: prototipe ke `server/pokja.mjs`

Langkah ini hanya memindahkan satu berkas baru ke tempatnya di
backend `kantor-rpg`. Tidak ada berkas `kantor-rpg` lain yang
diubah pada langkah ini, tidak ada push, dan tidak ada perubahan
di VPS Tencent atau VPS Kanreg.

## Berkas yang dibuat pada langkah ini

- `server/pokja.mjs` — berkas baru, satu-satunya berkas kode
  pada langkah ini. Isinya mesin kehadiran perkiraan, pengubah
  bentuk API Pokja, pemetaan aktor lewat argumen, penarik
  snapshot baca-saja, dan pembungkus bermesin untuk pemakaian
  server nanti.
- `server/test/pokja.test.mjs` — berkas baru, 11 tes gaya
  `node:test` seperti tes server `kantor-rpg` yang sudah ada.
  Dijalankan dari folder `server/` dengan
  `node --test test/pokja.test.mjs`. Tes tidak memakai jaringan
  dan tidak memakai rahasia apa pun.
- `docs/PEMINDAHAN-POKJA.md` — berkas ini, untuk pembelajaran
  dan pemeriksaan Mas.

## Apa yang berubah dari prototipe

Prototipe: `presence-perkiraan/presence.mjs` (11 tes lolos).
Logika kehadiran di `pokja.mjs` disalin apa adanya: patokan awal,
hitung selisih, masuk saat berubah, keluar setelah batas menit,
reset ganti tanggal, dan label yang menyebut perkiraan dan bukan
status login. Tiga tambahan saja, supaya berkas ini bisa hidup
di backend `kantor-rpg`:

1. `snapshotDariRingkasan` — mengubah jawaban API Pokja
   (`rekap_per_layanan` + `perubahan_user`) menjadi bentuk
   snapshot. Bentuk API ini diambil dari `fetch_pokja_summary`
   di Kasuari `agent.py`, yang memakai `?start_date=&end_date=`
   dan header `X-Agent-Token`. Validasi bentuknya ketat dan
   gagal tertutup kalau bentuknya tidak sah.
2. `keBentukPresence` menerima `pemetaanAktor` lewat argumen.
   Kode pengguna yang tidak dipetakan mendapat `actorId` null.
   Dengan begitu berkas ini tidak bergantung pada `roster.mjs`
   yang belum diganti, dan tidak mengunci nama karakter apa pun.
3. `buatPenarikSnapshot` dan `buatMesinKehadiran` — penarik
   GET baca-saja dengan batas waktu 20 detik, dan pembungkus
   yang menjaga keadaan antar-penarikan di memori. Keduanya
   belum dipanggil oleh server mana pun pada langkah ini.

Nama variabel lingkungan yang dipakai penarik sama dengan yang
dipakai Kasuari: `POKJA_API_URL` dan `POKJA_API_TOKEN`. Nama
saja yang ditulis di sini; nilainya tidak pernah ditulis di
berkas mana pun, tidak dicatat ke log, dan tidak dikembalikan
ke browser. Pemanggil yang membuat penarik wajib mengirim
keduanya, kalau tidak penarik gagal tertutup.

## Apa yang sengaja belum diubah

- `server/roster.mjs` — masih 11 profil Hermes. Pemetaan aktor
  ke karakter (misalnya kode CM ke karakter Onet) dikerjakan
  pada langkah roster, bukan di sini.
- `server/boards.mjs`, `server/telegram.mjs`,
  `server/dispatcher.mjs`, `server/commands.mjs` — masih
  membaca Hermes. `pokja.mjs` belum menggantikan satu pun
  dari berkas itu.
- `server/server.mjs` dan `server/main.mjs` — belum menyambung
  `pokja.mjs` ke rute `/api/presence`, belum mengubah nilai
  bawaan folder data, port, atau origin. Penyambungan itu
  langkah berikutnya, dan akan dicatat berkas demi berkas
  seperti langkah ini.
- `app/` dan `design/` — tidak disentuh sama sekali.
- Jadwal Kasuari, snapshot Pokja, dan `virtuallonet` — tidak
  disentuh. Mesin ini membaca bentuk snapshot yang sama,
  tetapi tidak memanggil API Pokja dari langkah ini.

## Cara memeriksa pemindahan ini

1. Bandingkan fungsi `hitungPerubahan`, `prosesPenarikan`,
   dan `labelStatus` di `server/pokja.mjs` dengan fungsi yang
   sama namanya di `presence-perkiraan/presence.mjs`. Logikanya
   harus sama; yang berbeda hanya komentar dan tiga tambahan
   di atas.
2. Jalankan tesnya dan periksa 11 tes lolos, 0 gagal.
3. Periksa dengan pencarian teks bahwa berkas ini tidak memuat
   kata `hermes`, tidak memuat alamat atau token nyata, dan
   tidak memanggil jaringan kecuali lewat fungsi ambil yang
   disuntikkan dari luar pada tes.

## Cara menyambung nanti (belum dikerjakan)

Urutan yang disarankan, masing-masing sebagai langkah terpisah
yang dicatat seperti langkah ini:

1. Ganti `server/roster.mjs` ke Onet, Kasuari Agent, dan Mas,
   lalu isi `pemetaanAktor` dari roster itu saat memanggil
   `keBentukPresence`.
2. Di `server/server.mjs`, tambahkan penarik dan mesin Pokja
   di samping `buildPresence` yang lama, lalu alihkan rute
   `/api/presence` ke mesin Pokja secara bertahap, dengan
   cadangan bentuk lama sampai Mas menyetujui hasil
   perbandingannya.
3. Di `server/main.mjs`, ubah nilai bawaan folder data dan
   origin ke Tencent dan Pages Mas, dan buat penarik dari
   variabel lingkungan yang sudah ada di server (bukan dari
   berkas kode).
4. Putuskan penyimpanan keadaan antar-mulai-ulang dan interval
   penarikan (yang disarankan: tiap 2 menit, terpisah dari
   deteksi 45 menit) sebelum penarikan langsung diaktifkan.

## Cara menaruh berkas ini di fork nanti

Salin `server/pokja.mjs` dan `server/test/pokja.test.mjs` ke
folder `server/` dan `server/test/` di repo hasil fork, pada
posisi yang sama. Jangan salin folder adaptasi ini seluruhnya;
folder ini hanya tempat peninjauan sebelum fork dibuat.

# Catatan penyambungan: `pokja.mjs` ke `server.mjs`

Langkah ini menyambungkan mesin kehadiran perkiraan ke rute
`/api/presence`, dalam salinan peninjauan saja. Tidak ada fork,
tidak ada push, dan tidak ada perubahan di VPS Tencent, VPS
Kanreg, atau repo `kantor-rpg` asli. Salinan pemeriksaan
kantor-rpg tetap bersih.

## Berkas pada langkah ini

- `server/server.mjs` — salinan peninjauan dari `server.mjs`
  asli, dengan tiga hunk bertanda `[POKJA-TAHAP-1]` dan tidak
  ada perubahan lain. Cara memeriksa: jalankan
  `diff -u` terhadap `server.mjs` asli; selisihnya hanya tiga
  hunk itu, dan isi jalur lama hanya berpindah ke dalam
  `ambilLama`, bukan dihapus atau diubah.
- `server/pokja.mjs` — ditambah satu fungsi:
  `buatPenyegarKehadiran`. Fungsi lama tidak diubah isinya;
  hanya tambahan ini yang dibuat pada langkah penyambungan.
- `server/test/pokja-penyegar.test.mjs` — berkas baru, 5 tes
  untuk cache dan cadangan penyegar, tanpa server penuh dan
  tanpa jaringan.
- `server/test/server-pokja.test.mjs` — berkas baru, 3 tes
  pemeriksaan statis salinan `server.mjs`: tiga penanda, jalur
  lama tetap ada, dan tidak ada rahasia atau `process.env`.
- `docs/SAMBUNGAN-SERVER.md` — berkas ini.

## Tiga hunk di `server.mjs`, satu per satu

1. **Impor baru, satu baris.** `buatMesinKehadiran`,
   `buatPenarikSnapshot`, dan `buatPenyegarKehadiran` dari
   `./pokja.mjs`. Tidak ada impor lain yang berubah.
2. **Pembuatan mesin, setelah `presenceMemo`.** Mesin dibuat
   hanya kalau pemanggil mengirim mesin suntikan (`cfg.pokja`,
   untuk tes) atau alamat dan token (`cfg.pokjaUrl`,
   `cfg.pokjaToken`). `main.mjs` belum mengirim keduanya pada
   langkah ini, jadi di produksi mesin tetap `null` dan rute
   presence memakai jalur lama persis seperti sebelumnya.
   Kalau pembuatan mesin gagal, mesin tetap `null` dan server
   tidak berhenti. Pemetaan aktor masih kosong sampai
   `roster.mjs` diganti.
3. **Rute `/api/presence` menjadi `async`.** Isi jalur lama
   dipindahkan apa adanya ke dalam fungsi `ambilLama`, lalu
   rute memanggil penyegar dengan `ambilLama` sebagai cadangan.
   Bentuk jawaban tetap `{ observedAt, agents }`, supaya
   tampilan tidak perlu berubah.

## Perilaku penyegar, supaya tidak mengejutkan

- **Cache 120 detik.** Permintaan presence yang datang dalam
  120 detik memakai cache dan tidak memanggil API Pokja lagi.
  Tidak ada timer latar belakang pada langkah ini; penarikan
  terjadi saat ada permintaan dan cache sudah basi.
- **Penarikan pertama kosong.** Sesuai aturan mesin, penarikan
  pertama pada satu tanggal hanya patokan awal. Daftar Pokja
  kosong sampai ada perubahan data. Ini bukan galat.
- **Cadangan berlapis.** Perbaruan gagal dan ada cache:
  cache lama dipakai. Perbaruan gagal dan belum ada cache:
  jalur lama (Hermes) dipakai. Tanpa mesin: jalur lama dipakai.
- **Tidak ada penulisan.** Penyambungan ini hanya membaca
  snapshot Pokja lewat GET. Tidak ada perubahan pada rute lain,
  papan, chat, atau pengiriman tugas.

## Yang sengaja belum dikerjakan

- `server/main.mjs` — belum mengirim `POKJA_API_URL` dan
  `POKJA_API_TOKEN` dari variabel lingkungan ke `createServer`.
  Itu langkah berikutnya, dan hanya nama variabel yang ditulis,
  bukan nilainya.
- `server/roster.mjs` — belum diganti, jadi `actorId` pada
  daftar Pokja masih `null` dan karakter belum dipetakan.
- Tes integrasi server penuh — tidak dijalankan pada langkah
  ini, karena modul server lain tidak ikut disalin. Tes penuh
  dijalankan nanti di fork, dengan mesin Pokja suntikan lewat
  `cfg.pokja`, mengikuti pola suntikan yang sudah dipakai
  `server.mjs` untuk `telegram`, `runner`, dan `push`.

## Verifikasi pada langkah ini

- `node --check` pada `server.mjs` dan `pokja.mjs`: lolos.
- `node --test` pada tiga berkas tes di `server/test/`:
  19 tes lolos, 0 gagal (11 tes `pokja.mjs`, 5 tes penyegar,
  3 tes pemeriksaan statis).
- Selisih `server.mjs` terhadap yang asli: hanya tiga hunk
  bertanda `[POKJA-TAHAP-1]`.

## Cara menaruh berkas ini di fork nanti

Salin `server/pokja.mjs`, `server/server.mjs`, dan berkas tes
di `server/test/` ke posisi yang sama di repo hasil fork.
Jangan salin folder adaptasi ini seluruhnya; folder ini hanya
tempat peninjauan sebelum fork dibuat.

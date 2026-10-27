# Langkah demo: data contoh Pokja (draf peninjauan)

Draf ini hanya mengganti isi data contoh yang tampil pada
mode demo (pengunjung publik / belum login) di
`app/src/private/demo.ts`, beserta terjemahan Inggrisnya.
Bentuk data, jumlah baris, status, dan umur baris tidak
berubah; hanya nama, judul, ringkasan, dan badan yang
diganti. Fork belum di-push untuk langkah ini; berkas
draf di sini hanya untuk diperiksa Mas.

## Isi contoh yang baru

- Handoff (3): Citra → Rony (Usulan KP, Dikerjakan,
  rantai Citra → Rony → Erni), Rony → Erni (Berkas PGA,
  Dikirim, perlu perhatian karena sudah >24 jam),
  Erni → Sonya (Usulan NIP, Selesai). Badan semua
  `POKJA` (sebelumnya `ENT`).
- Tugas (4): tugas diblokir (Michael, diminta Citra),
  verifikasi berkas (Adiethya, diminta Rony, sedang
  jalan), rekap harian (Angelina, diminta Citra, antre),
  laporan mingguan (Rony, selesai). Status memakai
  kosakata yang sama seperti sebelumnya
  (blocked/running/todo/done).
- Log (4): Adiethya memeriksa berkas, Michael
  (tugas diblokir), Kak Suary melihat ringkasan, Adiethya
  mengambil tugas verifikasi berkas. Kata kerja
  `Tugas diblokir` dan `Mengambil tugas` sudah ada di
  kosakata server; dua kata kerja baru (`Memeriksa
  berkas`, `Melihat ringkasan`) ditambah terjemahannya.

## Yang dijaga

- Semua teks tetap berlabel `Contoh`; tidak ada nomor
  usulan, nama instansi, nama berkas, atau peristiwa
  nyata di bundle. Nama yang dipakai hanya nama tampil
  dari roster (nama depan).
- Panel menerjemahkan teks demo saat render (fungsi
  `dt()` dan `t()` di `panel.ts`), jadi setiap string
  contoh yang baru punya entri di
  `app/src/i18n/en/private.ts`. Entri lama yang tidak
  dipakai lagi dihapus dari blok demo; entri kata kerja
  server yang lain tidak disentuh.
- Kehadiran demo tidak memakai berkas ini: status
  karakter pada mode demo tetap berasal dari simulasi
  (`adapter.ts`), bukan dari data papan.

## Yang sengaja TIDAK diubah pada langkah ini

- `app/src/private/panel.ts` dan jalur chat: bagian dari
  langkah chat/panel. Teks sesi Telegram/Hermes di panel
  masih menunggu langkah itu.
- `server/boards.mjs`: pembaca papan nyata (Kanban/log
  Hermes) diganti pembaca snapshot Pokja pada langkah
  papan tersendiri. Label kata kerja `Bertanya ke Budi`
  di sana masih menunggu langkah itu.
- Tes e2e Playwright (`app/tests/e2e/private.spec.ts`):
  masih menegaskan data demo lama (`Hugo → Nova`,
  `Leo`, `Nova`). Tes-tes itu membutuhkan browser dan
  backend berjalan, dan diperbarui bersama langkah
  chat/panel. Gerbang langkah ini adalah `tsc`, build
  aplikasi, dan tes unit (`vitest`).

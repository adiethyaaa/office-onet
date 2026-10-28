# Papan Pokja (`boards.mjs`)

Draf peninjauan, belum di-push. Rancangan disetujui Mas 2026-10-28 08:50 WIT.

## Yang diganti

`server/boards.mjs` tidak lagi membaca Kanban, berkas handoff,
ekor `agent.log`, atau sesi omp. Tiga papan dibaca dari dua penarik
API Pokja yang sama dengan kehadiran (baca-saja, URL/token/fetch
yang sama):

- **Tugas** — ringkasan harian hari ini: satu baris per pengguna
  per layanan yang totalnya lebih dari nol. Judulnya angka apa
  adanya, misalnya `11 data (3 MS, 8 BTS, 0 TMS)`. Kolom peminta
  diisi kode layanan, badan `POKJA`. Status adalah turunan
  tampilan, bukan data asli: `blocked` bila ada BTS atau TMS,
  `done` bila semuanya MS. Urutan layanan PGA, PI, KP, CASN, SDP,
  lalu total terbesar dulu.
- **Handoff** — selalu kosong dengan sumber
  `Pokja tidak memiliki handoff`, karena Pokja tidak memiliki
  konsep itu. Panel menampilkan nol handoff, bukan galat.
- **Log** — baris `audit_logs` yang kategorinya dikenal:
  `Masuk ke Pokja`, `Keluar dari Pokja`, `Membuka layanan`,
  `Beraktivitas`. Objeknya kode layanan (kosong untuk aksi
  sesi). Terbaru dulu, maksimal 110 baris, jendela 24 jam, aksi
  yang tidak dikenal dan baris duplikat dilewati. Hanya
  inisial/nama/waktu/kategori/layanan yang dipakai; IP, id sesi,
  dan isi detail tidak pernah disimpan atau ditampilkan.

## Yang dipertahankan

- Bentuk jawaban `{observedAt, mode, handoffs, tasks, log}` tidak
  berubah, jadi `panel.ts` tidak disentuh.
- `buildPresence`, `makeSources`, `scrub`, `clip`, `QUOTA`,
  `STALE_HANDOFF_HOURS` dipertahankan; jalur kehadiran lama tetap
  menjadi cadangan `/api/presence` di `server.mjs`.
- Bila penarikan gagal atau Pokja tidak terkonfigurasi, ketiga
  papan menjawab gagal dengan pesan galatnya, bukan kosong sukses
  (REQ-BOARD-05 dipertahankan).
- Cache papan 30 detik bawaan (diatur `boardTtlMs`), penarikan
  yang sedang berjalan dipakai bersama oleh semua viewer.

## Penyambungan

- `server/server.mjs`: tiga hunk bertanda `[POKJA-PAPAN]` — impor
  `buatPapanPokja`, konstruksi penarik ringkasan/kehadiran dari
  `cfg.pokjaUrl`/`cfg.pokjaToken`/`cfg.pokjaFetch`, dan rute
  `/api/boards` menjadi async. Tidak ada variabel env baru;
  `main.mjs` tidak berubah. `PRIVATE_PROFILES` tidak lagi dipakai
  papan (tidak ada judul tugas yang perlu disamarkan); ekspornya
  di `roster.mjs` tetap ada.
- `app/src/i18n/en/private.ts`: empat kata kerja log baru.
  `Masuk`/`Keluar` sudah dipakai tombol login/logout, jadi kata
  kerja sesi memakai `Masuk ke Pokja`/`Keluar dari Pokja`.

## Tes

- `server/test/boards-pokja.test.mjs` (baru): pemetaan, penarik
  nyata dengan fetch tiruan, kegagalan, cache, dan pemeriksaan
  statis penyambungan server.
- `server/test/api.test.mjs`: tes papan memakai papan tiruan yang
  disuntik lewat `cfg.boards`; tes kegagalan dan cache pindah ke
  berkas baru. Rumah Hermes tiruan tetap dipakai tes lain
  (cadangan kehadiran, sinkronisasi Telegram).

## Batas yang diketahui

- Status tugas adalah perkiraan tampilan dari jumlah BTS/TMS,
  bukan status kerja tiap usulan; Pokja tidak menyediakan status
  per usulan lewat ringkasan.
- Umur tugas selalu 0 jam (ringkasan hanya berisi angka hari
  ini); kolom umur di panel tidak lagi bermakna untuk papan ini.
- Log hanya selengkap limit 500 baris terakhir dari API; bila
  terpotong, baris yang lebih lama tidak tampil dan tidak ada
  penanda di panel.

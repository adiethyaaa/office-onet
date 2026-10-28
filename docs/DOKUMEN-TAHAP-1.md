# Dokumen tahap 1

Dokumen utama ditulis ulang mengikuti keadaan fork pada akhir tahap
1. Riwayat upstream dipertahankan; yang diubah hanya bagian yang
tidak lagi benar untuk fork ini.

- `README.md` / `README.en.md`: judul Kantor Regional XIV BKN, 9 NPC,
  backend Pokja baca-saja tanpa Telegram, angka tes yang terverifikasi
  (364 unit, 85 server), URL clone fork dan branch `pokja-tahap-1`,
  nama ruangan Kanreg, tautan ke `POKJA-TAHAP-1.md` dan
  `docs/DEPLOY-VPS.md`. Tautan demo publik dihapus.
- `INSTALL.md` / `INSTALL.en.md`: bagian backend ditulis ulang menjadi
  VPS systemd + Tunnel (merujuk `docs/DEPLOY-VPS.md`); tabel env
  diperbarui termasuk `POKJA_API_URL`/`POKJA_API_TOKEN` dan peringatan
  `proxy-secret` untuk Tunnel. Cara Mac/launchd dan `sambung-nginx.sh`
  disisakan sebagai penyebaran asli upstream.
- `DESIGN.md`: tiga penggantian nama (brief pemilik, nama teks
  Kantor Regional XIV BKN); arah visual tidak diubah.
- `CLAUDE.md`: baris M4 diperbarui — integrasi privat Pokja adalah
  pekerjaan tahap 1 di branch ini; dokumen Pokja ditambahkan ke daftar
  baca-dulu.
- `CHANGELOG.md` / `CHANGELOG.en.md`: entri baru "Tahap 1 Pokja" di
  atas; riwayat upstream tidak diubah.
- `DESIGN.md` dan `CLAUDE.md` tidak pernah punya versi Inggris, jadi
  tidak dibuatkan.

Kode: `server/dispatcher.mjs` — sumber tugas `hermes:${profile}`
menjadi `pokja:${profile}`, sehingga label di panel menjadi
"Sumber pokja:ER". Tidak ada tes yang mengunci nilai lama.

Diketahui belum diperbarui: `docs/FITUR.md` / `docs/FEATURES.md`
masih menjelaskan fitur upstream termasuk Telegram; berkas turunan
`design/derived/` masih memuat nama ruangan lama.

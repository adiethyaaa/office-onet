# Spek e2e Pokja (`tests/e2e/`)

Draf peninjauan, belum di-push. Rancangan disetujui Mas 2026-10-28 10:42 WIT.

## Fixture baru: `tests/e2e/pokja-fixture.ts`

Satu `pokjaFetch` palsu untuk kedua spek privat, menjawab tiga bentuk
JSON Pokja dari jam tes (WIT): ringkasan (`rekap_per_layanan`),
`?action=sessions`, dan `?action=audit_logs`. Sesi: ER aktif
(aktivitas 1 menit lalu, bekerja), MJ aktif (3 menit lalu, bekerja),
SL aktif (30 menit lalu, idle), CM hanya sesi logout (tidak tampil).
Log: BUTTON_CLICK PGA, NAV_MENU KP, LOGIN, LOGOUT. Ringkasan: PGA
CM 4 (1 BTS) + ER 2, KP RP 5 (1 BTS) + ER 1, SDP SL 1; total 13.
Rumah Hermes buatan (`kanban.db`, `state.db`, `.env` Telegram, jam
`tgTs`) dihapus dari kedua spek. Runner palsu tetap disuntik
(`cfg.runner` mengalahkan runner Pokja di `server.mjs`), dan server
dibuat dengan `pokjaUrl`/`pokjaToken` dummy + `pokjaFetch` itu serta
`pokjaLogCacheMs: 0`.

## `private.spec.ts`

- Papan ditulis ulang ke data Pokja: handoff kosong, 5 tugas dengan
  judul angka, filter Bot/Badan, log dengan kata kerja Pokja, dan
  label basi saat backend mati.
- Tes tugas/approval memakai Erni (ER), teks berisiko memakai gerbang
  deploy/hapus yang masih ada, catatan persetujuan "owner".
- Tes NPC dan shortcut C memakai Michael (MJ, kursi FX-L1-099, slot
  SL-L1-099-1) dan Sonya (SL, idle → `done`).
- Tes sinkronisasi Telegram **dihapus**, diganti tes perintah Pokja
  (`/laporan` dari data palsu, `/help` memuat perintah Pokja, tanpa
  memanggil runner).
- Tes badge belum dibaca **dihapus**: badge dihitung dari `replies`
  pada `/api/presence`, dan kehadiran Pokja selalu mengirim
  `replies: []`, jadi tidak ada badge yang bisa diuji di mode ini.
  Kode badge-nya tetap ada, hanya tidak aktif.
- Tes kirim foto/suara memakai Rony (RP); tes login dan PWA
  dipertahankan.

## `chat-voice-slash.spec.ts`

- Fixture Hermes dan opsi `telegram:` dihapus; tes suara/whisper/
  mikrofon dipertahankan dengan profil Pokja (MJ, RP, ER).
- Menu slash menjadi 10 perintah Pokja; `/status` ditegaskan
  "Percakapan: khusus RPG"; blok `/telegram` diganti `/new` +
  `/laporan` (dijawab server, runner tidak dipanggil).

## Spek lain

- `npc.spec.ts`: Nova → Citra (ACT-CM). `world.spec.ts`: Profil
  Nova → Profil Citra (teks "Spesifikasi ICT" tidak berubah, milik
  model CH-ICTSPEC). `v2.spec.ts`: toast dan id teguran Kevin →
  Erni (ACT-ER), Leo → Michael (ACT-MJ), Nova → Citra (ACT-CM).
- Komentar di `npc-push.spec.ts`/`multiplayer.spec.ts` dibiarkan.

## Temuan zona waktu (perbaikan produk, di luar rancangan awal)

Jalannya spek ini menemukan `parseWaktu` di `server/pokja-log.mjs`
menganggap stempel tanpa zona sebagai +07:00, padahal stempel nyata
adalah jam dinding WIT (+09:00): `waktu_cek` dari endpoint sessions
memuat akhiran "WIT" dan cocok dengan jam dinding WIT saat diperiksa
langsung (2026-10-28 10:59 WIT, sesi SL/FA aktif). Geser 2 jam itu
membuat log 2 jam terakhir terbuang dari papan (`at > sekarangMs`)
dan pengguna idle 30 menit terhitung 150 menit sehingga hilang dari
kehadiran. Draf ini memperbaiki bawaan menjadi +09:00, batas
`/rekap` di `pokja-chat.mjs` ikut disesuaikan, dan tiga berkas tes
server (`pokja-log`, `pokja-chat`, `boards-pokja`) diperbarui
mengikuti konvensi WIT. Tes mesin perkiraan (`pokja.test.mjs`,
`pokja-penyegar.test.mjs`) tidak berubah karena memakai ISO
berzona eksplisit. Fixture e2e memakai jam dinding WIT yang benar
(+9 jam). Perbaikan ini mengubah perilaku live menjadi lebih benar
(kehadiran idle dan log papan); tidak ada perubahan konfigurasi.

Sisa yang ditemukan tetapi TIDAK diubah di langkah ini: baris status
tugas menampilkan "Sumber hermes:ER" (`server/dispatcher.mjs:138`,
sumber tugas `hermes:${profile}`), peninggalan nama Hermes yang
terlihat pengguna; dan klik persetujuan memakai `force: true`
karena polling 2 detik me-render ulang kartu (lihat komentar di
tes). Keduanya dicatat untuk langkah pembersihan tersendiri.

## Verifikasi

Dijalankan di VM ini, proyek desktop saja: kedua spek yang ditulis
ulang penuh. Spek lain tidak dijalankan ulang kecuali yang disentuh
namanya (`npc`, `world`, `v2` — dijalankan juga bila waktu
mengizinkan; gerbang langkah ini adalah dua spek privat).

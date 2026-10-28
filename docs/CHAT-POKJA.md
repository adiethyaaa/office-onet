# Chat Pokja (`telegram.mjs` dihapus, `pokja-chat.mjs` baru)

Draf peninjauan, belum di-push. Rancangan disetujui Mas 2026-10-28 09:28 WIT.

## Yang diganti

- `server/telegram.mjs` **dihapus**. Modul itu membaca `state.db`
  dan `.env` Hermes per profil dan mengirim lewat Bot API Telegram.
  Di fork Pokja tidak ada berkas-berkas itu, dan tidak ada
  sinkronisasi Telegram. Yang mengimpornya hanya `server.mjs` dan
  `commands.mjs`; keduanya dibersihkan.
- `server/pokja-chat.mjs` (baru): perintah baca-saja dan balasan
  tetap. Pemformatnya murni (tanpa jaringan), penariknya
  disuntikkan dari `server.mjs` memakai URL/token/fetch yang sama
  dengan kehadiran dan papan.
- `server/commands.mjs`: `/new`, `/stop`, `/status`, `/help`
  dipertahankan dengan bentuk hasil yang sama (field sesi, model,
  dan Telegram menjadi null) supaya panel yang sekarang tetap
  jalan; `/telegram` dihapus. Perintah Pokja dijalankan sebagai
  perintah server (tidak lewat antrean dispatcher, karena
  baca-saja), jadi `runCommand` menjadi async dan hasilnya tetap
  disimpan lewat `command_runs` seperti perintah lain.

## Perintah Pokja

| Perintah | Jawaban |
|---|---|
| `/laporan` | Ringkasan hari ini per layanan dan per pengguna |
| `/rekap [dari] [sampai]` | Rekap harian, bawaan 7 hari terakhir, batas 31 hari |
| `/sesi` | Sesi login hari ini (masuk, terakhir aktif, keluar) |
| `/online` | Sesi berstatus aktif tanpa logout, dengan menit terakhir aktif |
| `/audit [INISIAL]` | 10 aktivitas terakhir, boleh difilter inisial |
| `/ping`, `/help` | Aktif / daftar perintah |

Argumen tanggal harus `YYYY-MM-DD`, filter inisial 2–5 huruf.
Penarikan gagal atau Pokja tidak terkonfigurasi dijawab terus
terang, bukan ditebak. Hanya inisial/nama/waktu/kategori/layanan
yang ditampilkan; IP, id sesi, dan isi detail log tidak dipakai.

## Pesan bebas

Tidak ada agen bahasa alami. Runner Pokja (`buatRunnerPokja`)
hanya membalas teks tetap: profil sistem (KASUARI, ONET)
mengarahkan ke perintah di atas; profil pengguna Pokja dijelaskan
terus terang bahwa mereka pengguna sungguhan, bukan agen, dan chat
di sini tidak sampai ke mereka. Tidak ada tulisan yang dikirim ke
orang sungguhan, tidak ada pesan Telegram, tidak ada perubahan
data. Catatan sistem dari `policy.mjs` yang ditempel dispatcher
diabaikan runner karena balasannya selalu teks tetap.

## Yang dipertahankan

- `dispatcher.mjs`, `chat-state.mjs`, `store.mjs`, `policy.mjs`
  tidak berubah. Dispatcher sudah tidak peduli siapa runnernya;
  `server.mjs` menyuntikkan runner Pokja bila Pokja terkonfigurasi,
  dan mempertahankan `hermesRunner` sebagai cadangan bila tidak.
- Percakapan, giliran, tugas, approval, dan pencarian tetap di
  SQLite lokal; percakapan selalu jalur `rpg`; pencarian hanya di
  giliran lokal. Gerbang kebijakan (rahasia/risiko) tetap berlaku
  untuk pesan bebas sebelum sampai ke runner.
- Kolom `channel`/`detached` di `store.mjs` dipertahankan
  (selalu `rpg`/0 sekarang) supaya skema lama tetap bisa dibaca.

## Penyambungan

- `server/server.mjs`: tujuh hunk bertanda `[POKJA-CHAT]` — impor
  runner, penarik perintah dari penarik papan, pemilihan runner,
  tampilan percakapan lokal saja, pembuatan percakapan jalur RPG,
  pemanggilan `runCommand` async, dan pencarian lokal. Jumlah
  penanda `[POKJA-TAHAP-1]` (3) dan `[POKJA-LOG]` (3) tidak
  berubah. Tidak ada variabel env baru; `main.mjs` tidak berubah.
- Panel (`panel.ts`, `chat-ui.ts`) **belum** diubah pada langkah
  ini: daftar `/telegram` di menu autocomplete dan teks mode
  `Sama dengan chat Telegram` masih ada dan menunggu langkah panel.
  Bentuk hasil perintah dipertahankan supaya panel yang sekarang
  tetap jalan; mengetik `/telegram` sekarang menjawab tidak dikenal
  beserta daftar perintah.

## Tes

- `server/test/pokja-chat.test.mjs` (baru): pemformat, penjawab
  perintah dengan penarik nyata dan fetch tiruan, runner, dan
  pemeriksaan statis penyambungan.
- `server/test/commands.test.mjs`: ditulis ulang tanpa fixture
  Hermes/state.db, dengan fetch Pokja tiruan dan server kedua tanpa
  konfigurasi Pokja.
- `server/test/api.test.mjs`: tes sinkronisasi Telegram diganti
  tes siklus chat RPG (menunggu, balasan berpilihan, kedaluwarsa
  pilihan); suntikan Telegram dan fixture `state.db` dihapus.

## Batas yang diketahui

- `/online` memakai status sesi mentah (`active` tanpa logout),
  bukan aturan 5/60 menit seperti kehadiran; menit terakhir aktif
  ditampilkan supaya penilaiannya jujur.
- `/rekap` menarik satu panggilan per hari; hari yang gagal
  ditandai `tidak terbaca`, bukan digagalkan seluruhnya.
- Lampiran dan pesan suara masih diterima seperti sebelumnya;
  runner mengabaikan isinya dan membalas teks tetap.

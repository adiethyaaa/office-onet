# Uji coba tahap 1: kehadiran Pokja di kantor-rpg (peninjauan)

Branch ini (`pokja-tahap-1`) berisi seluruh tahap 1 adaptasi
Pokja: kehadiran, roster, identitas karakter, tampilan, papan,
chat, panel, deploy, dialog, dan dokumen. Penanda
`[POKJA-TAHAP-1]`, `[POKJA-LOG]`, `[POKJA-PAPAN]`, dan
`[POKJA-CHAT]` menandai tempat yang diubah, supaya Mas bisa
memeriksa selisihnya satu per satu. Rincian tiap langkah ada di
dokumen `docs/` (`ROSTER-POKJA.md`, `PEMETAAN-KARAKTER.md`,
`TAMPILAN.md`, `DEMO-POKJA.md`, `PAPAN-POKJA.md`,
`CHAT-POKJA.md`, `PANEL-POKJA.md`, `KEBIJAKAN-SETUP.md`,
`IDENTITAS-OWNER.md`, `E2E-POKJA.md`, `DEPLOY-VPS.md`,
`DIALOG-POKJA.md`, `DOKUMEN-TAHAP-1.md`).

## Berkas yang diubah atau ditambah

- `server/pokja.mjs` — baru. Mesin perkiraan dari perubahan
  data snapshot, penarik ringkasan, dan penyegar dengan cache
  dan cadangan berlapis.
- `server/pokja-log.mjs` — baru. Lipatan sesi dan log
  aktivitas (`?action=sessions`, `?action=audit_logs`) menjadi
  status `working` dan `idle`, dengan bentuk yang sama seperti
  yang dipakai `agent.py` di VPS Tencent.
- `server/server.mjs` — diubah. Rute `/api/presence` mencoba
  sesi dan log dulu, lalu perkiraan, lalu jalur lama. Isi
  jalur lama dipindahkan apa adanya ke dalam `ambilLama`.
- `server/main.mjs` — diubah. Mengirim `POKJA_API_URL` dan
  `POKJA_API_TOKEN` (nama saja di kode) ke `createServer`.
- `server/test/pokja.test.mjs`, `pokja-penyegar.test.mjs`,
  `pokja-log.test.mjs`, `server-pokja.test.mjs`,
  `main-pokja.test.mjs` — baru. Tes unit dan pemeriksaan
  statis untuk berkas-berkas di atas.
- `server/kantor-pokja.env.example` — baru. Hanya nama
  variabel, tanpa nilai.
- Berkas tahap 1 lainnya (roster, papan, chat, panel, deploy,
  dialog, dokumen) tercantum di `docs/DOKUMEN-TAHAP-1.md` dan
  dokumen langkah di `docs/`.

## Menjalankan tes (tanpa token, tanpa jaringan)

Dari folder `server/`:

```
node --test test/*.test.mjs
```

Atau, dengan skrip yang sudah ada di `server/package.json`:

```
npm test
```

Tes yang lama di repo harus tetap lolos; kalau ada yang gagal,
itu regresi dan harus diperbaiki sebelum lanjut.

## Uji coba dengan data nyata (di mesin Mas, dengan env Mas)

Butuh Node.js 24+ dan Git. Nilai rahasia hanya diisi di
terminal Mas sendiri, tidak pernah dikirim ke chat atau
di-commit.

1. Siapkan berkas env di luar repo (misalnya
   `~/.office-onet/data/office-onet.env`, mode 0600) dari
   `server/deploy/office-onet.env.example`. Isi
   `POKJA_API_URL`, `POKJA_API_TOKEN`, dan
   `KANTOR_RPG_ORIGIN=http://localhost:5173`. Isi juga
   `KANTOR_RPG_PROXY_SECRET` dengan satu string acak
   (misalnya hasil `openssl rand -hex 32`); nilai yang sama
   dipakai backend dan server dev pada langkah 3, dan tidak
   boleh ada berkas `proxy-secret` lain di folder data.
2. Buat tautan setup owner sekali pakai (nama pengguna
   dipilih di sini; bawaan `budi` bila dikosongkan):

   ```
   cd server
   node --env-file=<berkas-env-di-luar-repo> main.mjs setup <nama-pengguna>
   ```

   Perintah ini hanya mencetak tautan; backend belum jalan.
3. Jalankan backend dan app dalam dua terminal, dengan env
   yang sama, ditambah `KANTOR_RPG_COOKIE_SECURE=0` (supaya
   cookie sesi jalan di `http://localhost`, tanpa flag
   Secure) dan folder data baru:

   ```
   # terminal 1 (backend)
   cd server
   KANTOR_RPG_DATA=~/.office-onet/data KANTOR_RPG_COOKIE_SECURE=0 node --env-file=<berkas-env-di-luar-repo> main.mjs

   # terminal 2 (app, dari akar repo)
   cd app && npm ci && npm run dev
   ```

   Server dev (`http://localhost:5173`) meneruskan `/api/`
   ke backend lewat proxy yang hanya aktif di `npm run dev`
   (lihat `app/vite.config.ts`); `vite preview` tidak memakai
   proxy ini. Buka tautan setup dari langkah 2, buat sandi
   dan 2FA, lalu login.
4. Periksa kehadiran, papan, dan perintah chat di panel:
   penarikan pertama pada satu tanggal hanya patokan awal,
   jadi daftar Pokja bisa kosong sampai ada login atau
   perubahan data; login tercatat membuat karakter masuk;
   tanpa aktivitas 5 menit berarti idle; logout tercatat
   membuat karakter keluar. Perintah `/laporan`, `/sesi`,
   dan `/audit` menjawab dari data nyata.
5. Matikan akses ke API Pokja untuk memeriksa cadangan:
   jawaban harus kembali ke jalur perkiraan, lalu ke jalur
   lama, bukan galat kosong.

## Kembali ke keadaan semula

```
git checkout -- server/
git checkout main
git branch -D pokja-tahap-1
```

Branch ini sudah di-push; perintah di atas hanya menghapus
salinan lokal. Menghapus branch di remote dilakukan terpisah
setelah Mas menyetujuinya.

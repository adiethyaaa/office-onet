# Uji coba tahap 1: kehadiran Pokja di kantor-rpg (peninjauan)

Branch ini (`pokja-tahap-1`) berisi perubahan tahap 1 untuk
kehadiran Pokja, dengan penanda `[POKJA-TAHAP-1]` dan
`[POKJA-LOG]` di setiap tempat yang diubah, supaya Mas bisa
memeriksa selisihnya satu per satu. Belum ada perubahan di
tampilan (`app/`) dan belum ada penggantian roster, jadi uji
coba pada tahap ini memeriksa API kehadiran dan cadangannya,
bukan karakter 3D-nya.

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
- `docs/` di folder peninjauan (bukan di repo ini):
  `PEMINDAHAN-POKJA.md`, `SAMBUNGAN-SERVER.md`,
  `LOG-AKTIVITAS.md`, `ALUR-AGENT-POKJA.md`.

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

1. Salin `server/kantor-pokja.env.example` menjadi berkas env
   di luar repo, isi `POKJA_API_URL` dan `POKJA_API_TOKEN`
   di sana, dan jangan commit berkas env itu.
2. Jalankan backend dari folder `server/` dengan env tersebut
   terisi di lingkungan proses (misalnya dengan
   `node --env-file=<berkas-env-di-luar-repo> main.mjs`,
   setelah `KANTOR_RPG_PROXY_SECRET` dan folder data disiapkan
   seperti di `INSTALL.md`).
3. Masuk sebagai owner, lalu periksa `/api/presence`:
   penarikan pertama pada satu tanggal hanya patokan awal,
   jadi daftar Pokja bisa kosong sampai ada login atau
   perubahan data; login tercatat membuat karakter masuk;
   tanpa aktivitas 5 menit berarti idle; logout tercatat
   membuat karakter keluar.
4. Matikan akses ke API Pokja untuk memeriksa cadangan:
   jawaban harus kembali ke jalur perkiraan, lalu ke jalur
   lama, bukan galat kosong.

## Kembali ke keadaan semula

```
git checkout -- server/
git checkout main
git branch -D pokja-tahap-1
```

Perintah di atas hanya berlaku kalau branch ini belum
di-push. Kalau sudah di-push, hapus branch di remote
secara terpisah setelah Mas menyetujuinya.

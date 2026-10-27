# Pemetaan id karakter Pokja

Pemetaan ini hanya mengganti identitas pada
`design/world.json` dan `design/characters.json`. Tidak ada
perubahan pada geometri, ruangan, perabot, posisi, kursi,
preferensi aktivitas, model, kulit, rambut, atau pakaian.
Sudah di-push ke branch `pokja-tahap-1` (commit `55b1433`
untuk 9 aktor pertama; pembaruan Masdit/FA pada commit
berikutnya). Pembaruan 28 Oktober 2026 08:13 WIT: karakter
CEO adalah Masdit (pemain), bukan Adiethya; FA menjadi
karyawan biasa ke-10.

## Tabel pemetaan (urutan slot dunia dipertahankan)

| Slot lama | Id baru | Nama tampil | Peran |
| --- | --- | --- | --- |
| ACT-BUDI (pemain) | ACT-MAS | Masdit CEO | CEO |
| ACT-MAX | ACT-ONET | Onet Aspri | Asisten pribadi |
| ACT-HUGO | ACT-KASUARI | Kak Suary | Agen pemantau |
| ACT-NOVA | ACT-CM | Citra | Pokja Mutasi |
| ACT-BRUNO | ACT-RP | Rony | Pokja Mutasi |
| ACT-KEVIN | ACT-ER | Erni | Pokja Mutasi |
| ACT-REX | ACT-NG | Angelina | Pokja Mutasi |
| ACT-ECHO | ACT-SL | Sonya | Pokja Mutasi |
| ACT-LEO | ACT-MJ | Michael | Pokja Mutasi |
| (aktor baru) | ACT-FA | Adiethya | Pokja Mutasi |

ACT-FA duduk di Ruang implementasi & review, kursi
FX-L1-060 (kursi meja kosong di ruangan itu). FA memakai
model yang sama dengan Rony (`CH-NETINSTALL`), karena
hanya ada 9 berkas model 3D dan belum ada model baru;
di `characters.json` tidak ada entri untuk ACT-FA,
identitasnya hanya ada di `world.json` dan roster.

Nama tampil dua entri sistem mengikuti arahan Mas 28 Oktober
2026 02:09 WIT. Kode profil di `server/roster.mjs` tetap
ONET dan KASUARI; hanya nama tampilnya yang berubah, dan
perubahan itu dicatat pada draf roster yang sama.

## Yang diubah, per berkas

- `design/world.json`: pada tiap entri `actors`, hanya `id`,
  `displayName`, dan `role` (kecuali peran CEO yang memang
  sudah `CEO`). `avatarAsset`, `homeRoom`, `homeSeat`,
  `rolePreference`, `kind`, dan `simulated` tidak diubah.
  Selisih terhadap berkas asli: 52 baris (26 baris lama,
  26 baris baru), semuanya pada blok aktor.
- `design/characters.json`: pada tiap entri `characters`,
  hanya `actor`, `displayName`, dan `role`. Seluruh
  spesifikasi tubuh, kulit, mata, rambut, pakaian, dan
  properti tidak diubah. Selisih: 52 baris, semuanya pada
  blok karakter. Pemformatan asli berkas dipertahankan
  (penggantian teks per baris, bukan tulis ulang JSON).

## Yang sengaja TIDAK diubah pada langkah ini

- `design/dialogue.json`: kalimat persona masih milik
  tokoh Hermes dan menyebut Budi/Max/Echo/Leo. Berkas ini
  tidak dipetakan ulang di sini; kode di
  `app/src/game/game.ts` memakai kalimat cadangan `Halo.`
  bila tidak ada kalimat untuk id baru, jadi tidak ada
  galat. Penulisan ulang kalimat menjadi langkah sendiri.
- `design/rooms` dan nama ruangan: empat ruangan masih
  bernama Area Rapat, Studio Kanreg, Studio MKW, dan Area
  CAT. Id ruangan tidak berubah, jadi `homeRoom` tetap
  sah. Penggantian nama ruangan adalah keputusan kosmetik
  tersendiri.
- `app/src/game/game.ts`: sudah diperbarui pada langkah
  tampilan (peta `ACTOR_PROFILE` memakai id baru termasuk
  `ACT-FA`, `PLAYER_ID` `ACT-MAS`, nama pemain
  `Masdit CEO`).
- `app/src/game/scold.ts`: kalimat teguran ditulis ulang
  dengan gaya pegawai birokrasi pada pembaruan yang sama,
  termasuk entri untuk `ACT-FA`.
- Jenis kelamin: tidak ada field kelamin di
  `design/world.json` maupun `design/characters.json`.
  Bawaan laki-laki pada `server/roster.mjs` belum
  mengubah model apa pun; model karakter dibuat dari
  spesifikasi di `characters.json` lewat Blender, jadi
  perubahan penampilan perempuan menunggu daftar jenis
  kelamin dari Mas dan pembuatan ulang aset, bukan
  langkah ini.

## Pemeriksaan yang dilakukan

- Kedua berkas draf lolos baca JSON.
- Id aktor pada `world.json` (10) sama dengan gabungan
  `actorId` pada `server/roster.mjs` (9, termasuk ACT-FA)
  dan id pemain ACT-MAS; field `actor` pada
  `characters.json` (9) sama dengan id dunia tanpa ACT-FA,
  karena FA berbagi model dengan Rony.
- Tidak ada id atau nama tampil lama yang tersisa pada
  field identitas kedua berkas draf (teks deskriptif pada
  catatan siluet yang menyebut nama lama tidak dihitung,
  karena itu bukan identitas karakter).
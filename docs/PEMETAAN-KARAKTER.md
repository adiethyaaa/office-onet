# Pemetaan id karakter Pokja (draf peninjauan)

Draf ini hanya mengganti identitas pada `design/world.json`
dan `design/characters.json`. Tidak ada perubahan pada
geometri, ruangan, perabot, posisi, kursi, preferensi
aktivitas, model, kulit, rambut, atau pakaian. Fork belum
disentuh; berkas di sini hanya untuk diperiksa Mas.

## Tabel pemetaan (urutan slot dunia dipertahankan)

| Slot lama | Id baru | Nama tampil | Peran |
| --- | --- | --- | --- |
| ACT-BUDI (pemain) | ACT-MASDIT | Adiethya | CEO |
| ACT-MAX | ACT-ONET | Onet Aspri | Asisten pribadi |
| ACT-HUGO | ACT-KASUARI | Kak Suary | Agen pemantau |
| ACT-NOVA | ACT-CM | Citra | Pokja Mutasi |
| ACT-BRUNO | ACT-RP | Rony | Pokja Mutasi |
| ACT-KEVIN | ACT-ER | Erni | Pokja Mutasi |
| ACT-REX | ACT-NG | Angelina | Pokja Mutasi |
| ACT-ECHO | ACT-SL | Sonya | Pokja Mutasi |
| ACT-LEO | ACT-MJ | Michael | Pokja Mutasi |

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
- `app/src/game/game.ts`: peta `ACTOR_PROFILE` (id aktor
  ke profil), `PLAYER_ID` (`ACT-BUDI`), dan nama pemain
  `Budi` masih memakai id lama. Akibatnya, setelah draf
  ini disalin: karakter tetap muncul dengan nama baru dan
  bergerak mengikuti simulasi (kemunculan NPC dibaca dari
  daftar `actors` di dunia), tetapi klik untuk bicara
  kepada NPC dan label nama pemain pada papan skor masih
  memakai id lama sampai langkah tampilan memperbarui
  tiga tempat itu. Pergerakan dari `/api/presence` juga
  menunggu langkah tampilan itu, karena panel dan game
  belum memakai id baru di sisi aplikasi.
- `app/src/game/scold.ts`: kalimat teguran masih memakai
  id lama, tetapi kode memakai kalimat cadangan bila id
  tidak ditemukan, jadi tidak ada galat.
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
- Id aktor pada draf `world.json` sama persis dengan id
  aktor pada draf `characters.json` dan sama persis dengan
  `actorId` pada draf `server/roster.mjs` (9 dari 9).
- Tidak ada id atau nama tampil lama yang tersisa pada
  field identitas kedua berkas draf (teks deskriptif pada
  catatan siluet yang menyebut nama lama tidak dihitung,
  karena itu bukan identitas karakter).
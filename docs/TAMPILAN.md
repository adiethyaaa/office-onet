# Langkah tampilan (draf peninjauan)

Draf ini hanya mengganti identitas pada lapisan tampilan
aplikasi. Tidak ada perubahan pada geometri, ruangan,
simulasi, atau backend. Fork belum di-push untuk langkah
ini; berkas draf di sini hanya untuk diperiksa Mas, lalu
disalin ke fork setelah disetujui.

## Berkas yang diubah

- `app/src/game/game.ts`: peta `ACTOR_PROFILE` memakai
  id baru ke profil Pokja (ONET, KASUARI, CM, RP, ER, NG,
  SL, MJ); `PLAYER_ID` menjadi `ACT-MAS`; nama pemain
  bawaan menjadi `Adiethya`; dua teks tampilan yang
  menyebut Hermes menjadi Pokja ("tidak ada profil
  Pokja", "Status kerja dari Pokja..."). Alur
  `applyPresence` tidak diubah: pencocokan sudah memakai
  `actorId`, jadi status dari `/api/presence` kini
  mengenai karakter yang benar.
- `app/src/game/scold.ts`: kunci `SCOLD_LINES` dipetakan
  ulang ke id baru; kalimatnya tidak diubah (penulisan
  ulang kalimat menjadi langkah sendiri; bila id tidak
  ditemukan, kode memakai kalimat cadangan).
- `app/src/mg-preview.ts`: nama pemain pratinjau menjadi
  `Adiethya`.
- `app/src/ui/directory.ts`: daftar "Agen tanpa karakter"
  (Atlas, Clara, Stella dengan profil Hermes) dihapus,
  karena profil-profil itu tidak ada di roster Pokja dan
  semua anggota roster kini punya karakter. Daftar persona
  dari data dunia tidak diubah.
- `app/src/minigames/games/kuis-perpustakaan.ts`: tiga
  pertanyaan peran (Nova, Bruno, Kevin) dan satu
  pertanyaan ruangan Hugo diganti empat pertanyaan
  ruangan (Citra, Rony, Erni, Kak Suary). Alasannya:
  pertanyaan peran memakai peran tiap orang sebagai
  jawaban benar dan peran lain sebagai pengecoh; karena
  enam pengguna Pokja kini berbagi peran yang sama
  ("Pokja Mutasi"), pertanyaan peran tidak lagi punya
  cukup pengecoh yang berbeda dan permainan akan rusak
  (sudah terbukti: `actorByName('Nova')` tidak menemukan
  siapa pun setelah pemetaan design). Pertanyaan ruangan
  dihitung dari data dunia yang sama seperti sebelumnya.
- `app/src/i18n/en/game.ts`, `en/ui.ts`, `en/world.ts`,
  `en/mg/kuis-perpustakaan.ts`: terjemahan Inggris
  mengikuti perubahan di atas (kunci lama yang tidak
  dipakai lagi dihapus; setiap literal baru punya
  terjemahan, sesuai syarat uji i18n).
- `design/world.json`: satu baris, fungsi ruangan CEO
  menjadi "Ruang Adiethya (CEO)" (id ruangan tidak
  berubah; berkas turunan dan generator tidak disentuh
  pada langkah ini).
- Tes unit: `adapter.test.ts` (ACT-NOVA menjadi ACT-CM),
  `idle.test.ts` (ACT-REX menjadi ACT-NG),
  `mg-biliar.test.ts` (pemain "Budi" menjadi
  "Adiethya"), `scold.test.ts` (id-id lama menjadi id
  baru), `mg-kuis-perpustakaan.test.ts` (harapan
  pertanyaan ruangan yang baru).

## Yang sengaja TIDAK diubah pada langkah ini

- `design/dialogue.json`: kalimat persona masih milik
  tokoh Hermes. Kode memakai sapaan cadangan `Halo.`
  bila tidak ada kalimat untuk id baru, jadi tidak ada
  galat. Penulisan ulang kalimat menjadi langkah sendiri.
- `app/src/private/demo.ts`: data contoh papan masih
  memakai nama lama (Hugo, Nova, Clara, dan lain-lain).
  Data contoh Pokja menjadi langkah demo tersendiri.
- `app/src/private/panel.ts` dan teks sesi Telegram/Hermes
  di panel: bagian dari langkah chat, bukan tampilan.
- `server/boards.mjs`: label kata kerja "Bertanya ke
  Budi" masih ada; berkas itu diganti pada langkah
  papan (boards) nanti.
- Tes e2e Playwright (`app/tests/e2e/`): masih memakai
  id, nama, dan alur Hermes/Telegram lama. Tes-tes itu
  membutuhkan browser dan backend berjalan, dan akan
  diperbarui bersama langkah chat/panel. Gerbang langkah
  ini adalah tes unit (`vitest`) dan build aplikasi.
- Nama ruangan "Studio Hugo", "Area Nova", "Studio
  Kevin", "Area Bruno": id ruangan tidak berubah dan
  nama-nama itu adalah label ruangan, bukan identitas
  karakter. Penggantiannya adalah keputusan kosmetik
  tersendiri.
- Jenis kelamin dan model karakter: tidak ada field
  kelamin pada data design; penampilan tidak diubah.

# Draf pengganti roster.mjs (peninjauan, belum disalin ke fork)

Drafnya ada di `server/roster.mjs` pada folder peninjauan ini.
Berkas itu belum disalin ke fork dan belum di-push.

## Yang dibaca sebelum menyusun draf

- `server/roster.mjs` asli: 11 profil Hermes, `actorId`
  ACT-MAX sampai ACT-REX untuk 8 NPC, Atlas/Clara/Stella
  tanpa karakter (`actorId` null), `PRIVATE_PROFILES`
  berisi `yupus` dan `wealth`, dan `byProfile()`.
- Pemakai roster: `server/boards.mjs` (daftar agen papan,
  membaca log Hermes per profil; berkas yang tidak ada
  menghasilkan daftar kosong, tidak galat), `server/server.mjs`
  (rute `/api/agents`, nama percakapan, daftar bisu), dan
  panel `app/src/private/panel.ts` yang menyambung daftar
  agen dan kehadiran lewat `profile` yang sama persis.
- Bentuk kehadiran: `kodePengguna()` mengubah inisial menjadi
  kode huruf besar, misal `CM`; `profile` pada jawaban
  `/api/presence` adalah kode itu. Karena itu `profile` di
  roster harus sama persis dengan kode tersebut, kalau tidak
  panel tidak bisa menyambung status ke nama.
- Karakter di `design/world.json`: ACT-BUDI (pemain/CEO
  Budi), ACT-MAX, ACT-ECHO, ACT-LEO, ACT-NOVA, ACT-HUGO,
  ACT-BRUNO, ACT-KEVIN, ACT-REX. Id-id baru pada draf
  (ACT-MAS, ACT-ONET, ACT-CM, dan seterusnya) belum ada di
  sana, jadi langkah design terpisah masih dibutuhkan
  sebelum karakter 3D bergerak.
- Tes yang memakai profil Hermes: `server/test/api.test.mjs`
  dan `server/test/commands.test.mjs` memakai profil
  `enterprise`, `sipil`, `infra`, `sales`, `leo`, `finance`,
  `legal`, dan `yupus`. Tes-tes itu akan gagal setelah
  roster diganti dan harus diperbarui pada langkah yang
  sama, memakai profil baru dengan penegasan yang sama.

## Isi draf

- FA (`FA`, nama tampil `Adiethya`, ACT-MAS): akun Mas
  sendiri, peran CEO. Tidak ada entri `MAS` terpisah.
  Onet (`ONET`, ACT-ONET), Kasuari (`KASUARI`, ACT-KASUARI).
- Pengguna Pokja yang inisialnya terverifikasi dari sesi,
  log, dan snapshot: CM, RP, ER, NG, SL, MJ, masing-masing
  dengan `actorId` baru ACT-CM dan seterusnya.
- Nama tampil memakai satu kata nama depan, sesuai arahan
  Mas 28 Oktober 2026 01:45 WIT. FA (`Adiethya`) dan SL
  (`Sonya`) terverifikasi langsung dari field nama pada
  endpoint sesi dan log malam itu, lewat backend Kasuari
  yang sama, tanpa akses database langsung. CM, ER, NG,
  dan MJ memakai kata depan dari nama yang sudah
  terverifikasi pada laporan Pokja. RP memakai nama
  panggilan `Rony`, sesuai keputusan Mas 28 Oktober 2026
  01:55 WIT (kata depan nama lengkapnya `Yulius`). Upaya
  mengambil nama lima inisial lain lewat filter inisial
  pada endpoint yang sama tidak mengembalikan baris apa
  pun (aktivitas mereka lebih lama dari 500 baris terakhir
  atau filter tidak didukung), jadi tidak ada nama yang
  ditebak dari sana.
- `gender` memakai bawaan `male` untuk semua entri, sesuai
  arahan Mas sebelum daftar jenis kelamin diberikan.
  Langkah design nanti memakai field ini untuk model
  karakter.
- Stacy tidak masuk draf: ia tercatat sebagai verifikator
  pada tabel KP, tetapi inisial Pokja-nya belum
  terverifikasi dari sesi atau log.
- `PEMETAAN_AKTOR_POKJA` diturunkan dari ROSTER, bukan
  daftar kedua yang ditulis tangan.
- `PRIVATE_PROFILES` mempertahankan `yupus` dan `wealth`
  sebagai penjaga data Kanban lama (tugas untuk profil itu
  tetap disamarkan di papan), bukan sebagai anggota roster,
  supaya `boards.mjs` tidak perlu diubah pada langkah ini.

## Penyambungan yang masih dibutuhkan (di luar roster.mjs)

Di `server/server.mjs`, dua bawaan harus diubah supaya
pemetaan dari roster dipakai, bukan pemetaan kosong:

- penyegar perkiraan: `pemetaanAktor: cfg.pokjaPemetaanAktor ?? PEMETAAN_AKTOR_POKJA`
- penyegar sesi dan log: pemetaan yang sama sebagai bawaan

Tanpa dua baris itu, mengganti roster saja tidak mengubah
`actorId` pada `/api/presence` sama sekali. Impor
`PEMETAAN_AKTOR_POKJA` dari `./roster.mjs` ditambahkan
pada hunk impor yang sudah ada penandanya.

## Dampak sementara yang perlu diketahui Mas

- Panel menampilkan nama baru beserta status kehadiran
  dari Pokja, tetapi karakter 3D belum bergerak sampai
  langkah design memetakan id-id baru ke karakter.
- Papan kerja menampilkan nama baru dengan jumlah tugas
  kosong sampai `boards.mjs` diganti pada langkah
  berikutnya; tidak ada galat dari berkas log yang hilang.
- Chat ke profil baru belum tersambung ke apa pun sampai
  langkah chat (`telegram.mjs`, `dispatcher.mjs`) diganti;
  langkah ini hanya mengganti identitas, bukan jalur chat.
- Seluruh tes server harus dijalankan ulang setelah
  perubahan, dan tes yang memakai profil Hermes harus
  diperbarui pada commit yang sama.

## Keputusan yang masih menunggu Mas

1. Nama tampil RP: `Yulius` (kata depan nama lengkap,
   draf ini) atau `Rony` (nama panggilan).
2. Ganti total seperti draf ini, atau tambah berdampingan
   dengan profil Hermes dipertahankan (panel menjadi
   ramai, tes lama tetap lolos tanpa ubah, tetapi
   pembersihan tertunda).
3. Daftar jenis kelamin, kalau Mas sudah siap memberikannya;
   kalau belum, bawaan laki-laki pada draf tetap dipakai
   sampai Mas memberi tahu.

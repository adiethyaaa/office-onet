# PRD v2.0 kantor-rpg (DRAF)

Status: disetujui Budi 2026-10-13 ("gas kerjakan sekarang"). Implementasi di branch max/prd-v2.
Badan: PRIBADI (calon produk SaaS). Pemilik integrasi: Max.
Dasar: PRD v1.1, rilis live a7cb594 (2026-10-13).

## 0. Keputusan Budi (2026-10-13)

- Tujuan produk: pusat kendali harian tim bot, lalu jadi SaaS kita. Etalase PerumNet boleh memakai hasilnya.
- Fokus v2.0: animasi yang lebih halus dan semua fasilitas kantor bisa dipakai.
- Semua fitur game masuk v2.0 sekaligus, tidak dipecah ke v2.1 sampai v2.3.
- v3 (multiplayer) dilewati. Tidak dibahas di dokumen ini.
- SaaS dan pemasangan lintas platform dicatat di Lampiran A sebagai draf, belum dibahas.
- Game Station: 10 slot, 5 game di v2.0. Tiga game dari Budi (balap 2D tampak drone, fighting dengan karakter karyawan, platformer 2D), dua dari Max (Sambung Kabel, Arena Bom).

## 1. Kondisi sekarang (dicek di kode main a7cb594)

- Animasi memakai AnimationMixer three.js. Klip yang ada: idle, walk, run, sit, type, talk, wave, push. Pergantian klip selalu crossfade 0,2 detik. Walk dan run tidak dicampur, jadi perpindahan jalan ke lari terlihat melompat. Belum ada klip mulai jalan, berhenti, atau belok.
- Kecepatan langkah sudah disamakan dengan kecepatan gerak (timeScale), jadi kaki tidak meluncur.
- Dunia 3D belum punya suara. Yang ada baru nada pesan chat.
- 118 slot kegiatan NPC: chat 27, meja 26, istirahat 24, baca 20, game 8, kopi 6, olahraga 3, biliar 2, peregangan 2. Pemain bisa memakai fasilitas, tetapi hasilnya hanya pose duduk atau berdiri.
- Fasilitas yang sudah ada di world.json: 2 arcade_cabinet, 2 media_console (L2-GAME), billiard_table (L2-BILLIARD), 2 treadmill, exercise_bike, dumbbell_rack, 2 exercise_mat (L2-GYM), coffee_bar (L2-LOUNGE), 2 pantry_counter, 2 rack_42u (L1-SERVER), drafting_table, plan_table, model_shelf (studio Hugo / implementasi), easel (L1-KEVIN), 6 bookshelf (L2-READ), whiteboard 2, lab_bench 3.
- App hanya bergantung pada three.js dan satu font. Tanpa framework UI.

## 2. Tujuan v2.0 dan ukuran berhasil

| Tujuan | Ukuran |
|---|---|
| Gerak avatar terasa halus | Tidak ada lompatan pose saat jalan ke lari, berhenti, atau berbalik. Diperiksa dengan tes snapshot pose per frame dan review visual Budi |
| Setiap fasilitas utama bisa dimainkan | 9 fasilitas punya mini game (bagian 5), masing-masing selesai dalam 30 sampai 120 detik |
| Game Station berisi 5 game | 5 game jalan di keyboard, sentuh, dan stik; skor tersimpan |
| Kantor terdengar hidup | SFX langkah, pintu, fasilitas; BGM per area; mute dan volume tersimpan |
| Unduhan awal tidak membengkak | Bundle awal app naik maksimal 15 kB gzip. Semua game dan audio dimuat saat dipakai |
| Tidak merusak yang sudah ada | Semua tes v1.1 tetap hijau; budget render (250k segitiga, 150 draw call) tetap |

## 3. Animasi dan gerak (REQ-ANIM)

- REQ-ANIM-01 Blend jalan-lari: walk dan run dicampur berdasarkan kecepatan (blend 1D), bukan diganti. Stik yang didorong setengah menghasilkan jalan cepat.
- REQ-ANIM-02 Mulai dan berhenti: klip start (0,25 dtk) dan stop (0,3 dtk, badan sedikit maju lalu tegak). Gerak avatar memakai percepatan dan perlambatan, bukan kecepatan instan.
- REQ-ANIM-03 Belok: badan mencondong ke arah belok saat lari. Berbalik lebih dari 120 derajat memakai klip putar cepat.
- REQ-ANIM-04 Lari: klip run dibuat ulang di Blender dengan ayunan tangan dan badan condong ke depan. Debu kecil di kaki saat mulai lari (partikel ringan, mati di kualitas grafis rendah).
- REQ-ANIM-05 Lapisan atas badan: kepala menoleh ke NPC atau objek yang bisa dipakai dalam radius 3 m. NPC menoleh ke avatar yang lewat dekat.
- REQ-ANIM-06 Durasi crossfade per pasangan klip (tabel transisi), bukan satu angka 0,2 detik untuk semua.
- REQ-ANIM-07 Klip baru untuk fasilitas: angkat beban, lari di treadmill, kayuh sepeda, membidik biliar, menyeduh kopi, mengetik cepat, menggambar di meja, memasang kabel, membaca, main stik, kaget, mengusap kepala, kabur.
- REQ-ANIM-08 Kurangi gerak: bila mode kurangi gerak aktif, condong badan dan partikel dimatikan.
- Aset: semua klip dibuat di Blender lewat skrip (pola blender/ yang ada), satu rig untuk 9 karakter. Budget GLB karakter naik maksimal 25 persen per karakter dan dicatat di ADR baru.

## 4. Suara dan musik (REQ-AUDIO)

- REQ-AUDIO-01 Mesin audio Web Audio API, tanpa pustaka tambahan. Audio baru dimuat setelah interaksi pertama pengguna (aturan autoplay browser).
- REQ-AUDIO-02 SFX: langkah per jenis lantai, pintu buka dan tutup, lift, mesin kopi, bola biliar, alat gym, beep rak server, tombol UI.
- REQ-AUDIO-03 BGM per area: L1 kerja (pelan), lobby, L2 santai, Game Station (chiptune), tiap mini game punya trek sendiri. Pindah area memakai crossfade 1,5 detik.
- REQ-AUDIO-04 Suara posisi: SFX dari fasilitas dan NPC terdengar lebih keras saat dekat (panner 3D).
- REQ-AUDIO-05 Pengaturan: master, musik, efek, mute. Tersimpan di browser. Tombol cepat V di kantor (M sudah dipakai direktori) dan M di dalam mini game.
- REQ-AUDIO-06 Lisensi: semua suara dibuat sendiri. Implementasi: disintesis Web Audio saat berjalan (app/src/audio/audio.ts), jadi tidak ada berkas audio pihak ketiga dan tidak ada lisensi yang perlu dicatat.
- REQ-AUDIO-07 Ukuran: total audio di bawah 3 MB. Implementasi: sekitar 10 kB kode, dimuat saat tombol pertama ditekan.

## 5. Fasilitas dan mini game (REQ-FAC)

Semua mini game memakai rangka yang sama (bagian 7). Pemain mendekati fasilitas, menekan Aksi, lalu kamera mendekat dan mini game dimulai. NPC yang sedang memakai fasilitas menyebabkan pemain diberi pilihan antre atau menantang (untuk biliar).

| Fasilitas | Ruang | Mini game | Mekanik |
|---|---|---|---|
| Treadmill dan sepeda | L2-GYM | Lari Pagi | Tekan bergantian kiri-kanan menjaga ritme; target jarak 60 dtk |
| Rak dumbel | L2-GYM | Angkat Beban | Tekan tepat saat penanda di zona hijau; 10 repetisi |
| Matras | L2-GYM | Peregangan | Ikuti urutan arah (gaya Simon), makin panjang |
| Meja biliar | L2-BILLIARD | Biliar 8-ball | Fisika bola 2D di atas meja 3D; lawan CPU NPC; atur arah dan tenaga |
| Coffee bar | L2-LOUNGE | Barista | Tahan tombol untuk takaran espresso dan susu, lalu latte art pola sederhana |
| Rak server | L1-SERVER | Server Down | Cocokkan kabel patch ke port yang mati sebelum waktu habis; pakai data port ICT dari world.json |
| Meja gambar | Studio Hugo / L1-IMPL | Susun Denah | Puzzle potongan ruang ke denah yang benar; denah diambil dari ruang kantor ini |
| Easel | L1-KEVIN | Desain Poster | Pilih elemen dan warna sesuai brief singkat; dinilai kontras dan tata letak |
| Rak buku | L2-READ | Kuis Perpustakaan | 5 soal pilihan ganda tentang kantor, tim, dan ICT; bank soal di design/ |
| Arcade cabinet dan konsol | L2-GAME | Game Station | Lihat bagian 6 |

- REQ-FAC-01 Setiap mini game bisa dimainkan dengan keyboard, sentuh, dan stik, dan bisa dijeda dan keluar kapan saja.
- REQ-FAC-02 Skor terbaik per mini game tersimpan di browser (demo) atau di server (mode pemilik).
- REQ-FAC-03 NPC juga memakai fasilitas dengan animasi barunya, jadi kegiatan mereka terlihat sama dengan yang dimainkan pemain.
- REQ-FAC-04 Toast yang sudah ada (siapa yang sedang memakai) tetap dipakai.

## 6. Game Station (REQ-ARC)

Ruang L2-GAME berisi 10 slot game. v2.0 mengisi 5 slot, sisanya tampil sebagai kabinet "segera hadir". Game 2D digambar di kanvas 2D dan ditampilkan layar penuh; layar kabinet di dunia 3D menampilkan cuplikan game yang sedang dimainkan.

| No | Game | Isi |
|---|---|---|
| 1 | Balap Drone | Balap 2D tampak atas (dari drone) di sirkuit sekitar kantor. 3 lintasan, 3 putaran, lawan 3 mobil CPU, item turbo |
| 2 | Tarung Kantor | Fighting 2D satu lawan satu dengan 9 karakter karyawan. Tiap karakter punya gerak khas sesuai perannya (contoh: Bruno lempar gulungan kabel, Kevin kuas cat). Mode arcade lawan CPU berurutan. Nama dan desain original, tidak memakai nama atau aset Street Fighter |
| 3 | Lompat Lantai | Platformer 2D: karyawan berlari melewati level bertema lantai kantor, kumpulkan dokumen, hindari kabel kusut. 6 level |
| 4 | Sambung Kabel | Puzzle putar ubin pipa: sambungkan OLT ke semua rumah pelanggan sebelum waktu habis. 20 level, makin besar |
| 5 | Arena Bom | Gaya Bomberman: pasang bom, hancurkan kotak, kalahkan 3 karakter CPU di arena berdenah ruang kantor |

- REQ-ARC-01 Sprite 2D karakter diturunkan dari model Blender (render ortografis per pose), jadi wajah dan warna sama dengan karakter 3D.
- REQ-ARC-02 Papan skor per game: 10 teratas, nama pemain dari avatar.
- REQ-ARC-03 Tiap game satu modul terpisah, dimuat saat dibuka. Ukuran target per game maksimal 150 kB gzip di luar audio.
- REQ-ARC-04 Kontrol sama di semua game: arah, A, B, Start untuk jeda. Profil kontroler v1.1 (Kidal, Tombol terbalik) ikut berlaku.
- REQ-ARC-05 Slot 6 sampai 10 kosong sampai ditentukan Budi. Gagasan cadangan ada di Lampiran B.

## 7. Rangka mini game (REQ-MG)

Pilihan arsitektur: satu rangka mini game, tiap game modul terpisah. Max mengusulkan ini karena game ke-6 sampai ke-10 cukup ditambah sebagai modul, dan unduhan awal tidak bertambah. Phaser tidak dipakai (sekitar 350 kB tambahan dan sistem input kedua).

- REQ-MG-01 Kontrak modul: init, start, update(dt, input), render, pause, dispose, plus metadata (judul, ikon, fasilitas, durasi, kontrol).
- REQ-MG-02 Input terpusat: keyboard, sentuh (tombol layar), stik. Memakai lapisan gamepad v1.1.
- REQ-MG-03 Layanan bersama: skor, audio, jeda, simpan, toast, terjemahan id/en.
- REQ-MG-04 Mode 2D (kanvas) dan mode 3D (kamera dunia mendekat ke fasilitas).
- REQ-MG-05 Seed tetap untuk tes E2E, sama dengan pola simulasi NPC.
- REQ-MG-06 Keluar dari mini game mengembalikan avatar ke posisi semula di depan fasilitas.

## 8. Menegur karyawan (REQ-TEGUR)

- REQ-TEGUR-01 Dekati NPC, pilih Tegur di menu interaksi. Pilihan: tepuk gulungan kertas, ketuk palu mainan, lempar bola kertas.
- REQ-TEGUR-02 Reaksi NPC: kaget, efek bintang kecil, mengusap kepala, satu baris dialog sesuai karakternya, lalu berjalan cepat kembali ke mejanya selama 20 detik.
- REQ-TEGUR-03 Gaya slapstick kartun. Tanpa darah, tanpa luka, tanpa jatuh pingsan.
- REQ-TEGUR-04 NPC yang sedang terhubung ke agen yang bekerja tidak bisa ditegur (status kerja nyata tidak boleh terganggu); app menampilkan "sedang bekerja".
- REQ-TEGUR-05 Teguran hanya visual. Tidak mengirim apa pun ke agen atau Telegram.
- REQ-TEGUR-06 Jeda 10 detik per NPC supaya tidak di-spam.

## 9. Di luar cakupan v2.0

- Multiplayer dan main bersama (v3 dilewati).
- SaaS, akun pelanggan, adapter platform (Lampiran A, draf).
- Game Station slot 6 sampai 10.
- Perubahan denah, ruang, atau gambar kerja CAD.

## 10. Rencana kerja dan gerbang rilis

Satu rilis v2.0, dibangun bertahap di branch dan diuji per bagian sebelum digabung:

1. Rangka mini game, audio, tabel transisi animasi.
2. Klip animasi baru di Blender, blend jalan-lari, mulai, berhenti, belok.
3. Mini game fasilitas (9).
4. Game Station 5 game dan sprite karakter.
5. Tegur karyawan.
6. QA penuh lalu deploy.

Gerbang deploy, sama dengan v1.1: tsc, unit, E2E desktop/tablet/HP, Python, server, safety, budget render, CI hijau, backup conf, verifikasi SHA publik, rollback tercatat. Tambahan: tes tiap mini game bisa dimulai, dijeda, dan selesai dengan seed tetap; ukuran bundle awal dicek otomatis.

## 11. Risiko

- Animasi baru untuk 9 karakter adalah pekerjaan aset terbesar. Mitigasi: satu rig dan satu set klip, dibagi lewat retarget.
- Biliar dan fighting butuh fisika dan hitbox yang terasa benar. Mitigasi: tes deterministik dengan seed, review main oleh Budi.
- Audio di Safari iOS punya batasan autoplay dan format. Mitigasi: aktifkan setelah sentuhan pertama, sediakan AAC.
- Ukuran aset bisa melewati budget. Mitigasi: gerbang ukuran di CI.

## Lampiran A. SaaS dan pemasangan lintas platform (DRAF, belum dibahas)

Catatan untuk dibahas nanti, setelah v2.0.

- Tujuan: kantor-rpg dijual sebagai SaaS. Pelanggan mendapat kantor sendiri berisi agen mereka.
- Bentuk teknis yang diusulkan: inti tidak terikat satu sistem agen, ditambah adapter per platform. Satu adapter memenuhi kontrak: status agen, kirim pesan, terima balasan, daftar tugas, persetujuan aksi berisiko.
- Platform yang ingin didukung: Hermes Agent (sudah jalan), Paperclip, OpenClaw, Claude, ChatGPT. Untuk Claude dan ChatGPT, jalurnya kemungkinan MCP server atau app di dalam chat mereka. Kemampuan tiap platform belum diriset dan harus dicek sebelum dijanjikan.
- Yang perlu diputuskan nanti: akun dan login pelanggan, kantor per pelanggan (denah bawaan atau editor), hosting, harga, batas data, privasi isi chat agen.

## Lampiran B. Gagasan Game Station slot 6 sampai 10 (cadangan)

Belum dipilih. Contoh: Tetris gaya rak server, ular tangga kantor, tebak gambar Kevin, tembak bebek di balkon, ritme mengetik.

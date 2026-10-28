# Dialog persona dan nama ruangan Pokja

Kalimat sapaan NPC (`design/dialogue.json`) ditulis ulang dengan kunci
id aktor Pokja yang baru (9 NPC; pemain ACT-MAS tidak punya entri
karena ia yang menyapa). Sebelum langkah ini, semua kunci masih id
lama sehingga setiap NPC hanya mendapat kalimat cadangan "Halo.".
Kalimat disetujui Mas 2026-10-28, gaya pegawai birokrasi, menyapa
"Pak". Padanan Inggris tiap kalimat ada di
`app/src/i18n/en/content.ts`; entri kalimat lama yang tidak terpakai
dihapus. Kalimat bersifat fiksi (lihat field `status` di berkas
dialog); status kerja nyata tetap hanya dari `/api/presence`.

Nama ruangan diganti nama ruangan Kanreg XIV BKN sesuai keputusan
Mas 2026-10-28; id ruangan tidak berubah, begitu pula penempatan
kursi dan alur:

- L1-IMPL: Ruang implementasi & review -> Ruang Mutasi
- L1-NOVA: Area Spesifikasi ICT -> Ruang Sidigi
- L1-HUGO: Studio Karakter & Arsitektur -> Ruang Wasdal
- L1-KEVIN: Studio Pamflet & Signage -> Ruang Pensiun
- L1-BRUNO: Area Jaringan & Server -> Ruang Tata Usaha
- L1-LAB: Lab ICT -> Lab CAT BKN
- L1-CEO: Ruang CEO -> Ruang Pimpinan (fungsi tetap "Ruang Masdit CEO")
- L1-MEET: Ruang rapat besar -> Ruang Rapat
- L1-DISC: Ruang diskusi -> Ruang Konsultasi
- L1-LOBBY: Lobby & resepsi -> Lobby & Resepsionis
- L1-GALLERY: Galeri portofolio -> Galeri Kanreg
- L1-STORE: Gudang & utilitas -> Gudang
- L2-READ: Perpustakaan / reading nook -> Ruang PPNPN
- L2-GAME: Ruang game -> Ruang Game (kapitalisasi saja)
- L2-CHAT: Diskusi santai -> Ruang Pembinaan
- L2-GARDEN: Taman dalam -> Taman Kasuari

Fungsi ruangan ikut disesuaikan (misalnya Ruang Sidigi: "Sistem
digital dan pemantauan"). Ruangan lain (Ruang server, Gudang L2,
ruang makan, lounge, biliar, gym, koridor, toilet, shaft) tidak
berubah namanya. Padanan Inggris nama/fungsi diperbarui di
`app/src/i18n/en/world.ts`; entri nama/fungsi lama yang tidak
terpakai dihapus. Komentar di dua minigame, tiga pertanyaan kuis
perpustakaan yang menyebut nama ruangan lama ("area Bruno",
"Perpustakaan", "Ruang rapat besar"), dan padanan Inggrisnya
disesuaikan.

Judul/sign kantor menjadi "Kantor Regional XIV BKN": judul halaman,
merek HUD, judul fallback, nama gedung di `world.json`
(`building.name`), nama aplikasi di manifest PWA, dan kalimat
bantuan iOS. Label teknis format berkas layout ("file layout
kantor-rpg") dan slug proyek internal dibiarkan.

Catatan desain di dalam `world.json` (`adjacency`, `assumptions`,
`ict`) yang menyebut nama lama dibiarkan: itu metadata perancangan,
bukan teks yang ditampilkan, dan tidak diterjemahkan.

Diketahui belum diperbarui: berkas turunan `design/derived/`
(`capacity.json`, `room-schedule.*`) masih memuat nama ruangan lama;
generatornya (`design/authoring/seed_world.py`) berada di luar
cakupan tahap 1 dan tidak dijalankan pada langkah ini.

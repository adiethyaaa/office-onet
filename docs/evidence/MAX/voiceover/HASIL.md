# VoiceOver nyata — employee-rpg (REQ-ACCESS-01)

- Tanggal: 2026-10-04 WITA. Target: https://employee-rpg.air-buddy.site/ release `a041f5a1` (commit a041f5a).
- Pembaca layar: **macOS VoiceOver asli** di Safari, Mac mini M4, hanya keyboard. Bukan iOS VoiceOver/TalkBack.
- Cara: `tools/voiceover_probe.py`, `voiceover_keyboard.py`, `voiceover_round4.py` mengirim tombol sungguhan lewat System Events, lalu membaca `content of last phrase` dari VoiceOver. Tidak ada hasil yang disimpulkan; teks yang diucapkan disimpan apa adanya di `probe-1..6.json`.

| # | Skenario DEVICE-VALIDATION §2 | Hasil | Yang diucapkan VoiceOver (ringkas) | Bukti |
|---|---|---|---|---|
| 1 | Muat halaman, tautan lewati | PASS sebagian | Judul "kantor-rpg"; "link Lewati ke direktori" tercapai lewat Shift+Option+Tab (Safari melewati link pada Tab biasa). Badge SIMULASI tidak diperiksa VoiceOver. | probe-3 |
| 2 | Direktori: ruang bernama + Pergi/Info | PASS | "Pergi Ruang rapat besar button", "Pergi Lobby & resepsi button", "Pergi Galeri portofolio button" | probe-1, probe-2 |
| 3 | Temui → dialog → Escape | PASS | "Temui Max button" → "Max web dialog with 6 items Topik lain button" → fokus kembali "Direktori … button" | probe-4, probe-6 |
| 4 | Pindah ruang mengumumkan nama | PASS | "Galeri portofolio" setelah Enter pada Pergi | probe-2 |
| 5 | Prompt tidak berulang tiap frame | PASS lemah | 12 detik diam tanpa pengulangan; tidak mendekati NPC secara fisik | probe-3 |
| 6 | Pengaturan: legend & checkbox | PASS | "… radio button, 1 of 3 Tema group", "… Kualitas grafis group", "Kurangi gerak … unchecked checkbox Gerak dan akses group", "Mode visitor … unchecked checkbox" | probe-3 |
| 7 | Tanpa WebGL (`?nogl=1`) via keyboard | PASS | 16 tombol ruang/persona tercapai | probe-2 |
| 8 | Office Studio: nama tombol | PASS | Setelah memilih "FX-L1-011 · Meja rapat": "Geser ke barat/utara/selatan/timur 0,25 m", "Putar 90 derajat", "Hapus fixture terpilih", "Simpan draft" | probe-6 |

Kegagalan awal yang dipertahankan (probe-1, probe-2, probe-3 3c/8b, probe-4 8, probe-5 8) adalah salah skrip uji: Tab Safari melewati link, ekspektasi fokus dialog yang keliru (app memang mengembalikan fokus ke Direktori, sama dengan `npc.spec.ts`), dan tombol Studio nonaktif sebelum fixture dipilih. Aplikasi tidak diubah untuk meluluskan uji.

Temuan kecil: `<title>` masih "kantor-rpg"; lebih jelas bila deskriptif. Dicatat untuk rilis berikutnya, belum diubah.

Belum tercakup: iOS VoiceOver/TalkBack di HP fisik (menunggu perangkat Budi).

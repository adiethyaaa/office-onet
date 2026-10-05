# Validasi perangkat nyata dan screen reader

Status: **sebagian dijalankan di perangkat nyata (oleh Budi/Max, bukan oleh pelaksana cloud).** Hasil tercatat: iPhone 13 Pro Safari median rata-rata 59,5 FPS (`docs/evidence/DEVICE/2026-10-04-iphone13pro-summary.json`), Mac mini M4 Chrome median 179 FPS (`docs/evidence/MAX/device/summary.json`), macOS VoiceOver Safari 8 skenario lolos (`docs/evidence/MAX/voiceover/HASIL.md`). Masih belum diuji: Android, tablet fisik, iOS VoiceOver, TalkBack. Pelaksana cloud hanya punya Chromium headless SwiftShader; hook dan langkah di bawah diuji di `app/tests/e2e/device.spec.ts`. Jangan menandai perangkat lain terverifikasi sebelum hasilnya dari run nyata.

## 1. FPS perangkat (REQ-PERF-01, ADR-011)

Target berlabel (PRD v0.1 bagian 13): desktop 60 FPS, mobile 30 FPS pada perangkat pilihan Budi (Q-04 belum menentukan perangkat).

Langkah, sama untuk setiap perangkat:
1. Build SHA yang diuji (`docs/progress.md`): `cd app && npm ci && npm run build && npx vite preview --host 0.0.0.0 --port 4173`, atau buka preview yang sudah dipasang Max.
2. Di perangkat, buka `<url>/?perf=route&seconds=60&report=1`. Jangan sentuh layar selama 60 s; autopilot menjalankan rute tetap dua lantai.
3. Panel "Hasil benchmark rute tetap" muncul. Tekan **Salin hasil** atau **Unduh JSON**. JSON berisi `fpsAverage`, `frameMsMedian`, `frameMsP95`, `peak.drawCalls`, `peak.triangles`, dan `device` (user agent, layar, DPR, core CPU, memori, GPU renderer bila browser mengizinkan).
4. Ulangi 3 kali per perangkat; laporkan median dari 3 run. Catat suhu/charging bila mobile.
5. Simpan JSON ke `docs/evidence/DEVICE/<tanggal>-<perangkat>-run<n>.json` lewat PR terpisah.

Lulus bila median `fpsAverage` >= target dan `frameMsP95` <= 2x frame target (desktop 33 ms, mobile 67 ms). Bila tidak lulus: coba `Pengaturan > Kualitas grafis > Ringan`, ulangi, dan catat keduanya; target tidak boleh diturunkan tanpa keputusan Budi.

| Perangkat | Browser | SHA | Run 1/2/3 fpsAverage | Median | p95 ms | Lulus | Penguji |
|---|---|---|---|---|---|---|---|
| (belum dijalankan) | | | | | | | |

## 2. Screen reader (REQ-ACCESS-01)

Pembaca yang diuji: NVDA + Firefox/Chrome (Windows), VoiceOver + Safari (macOS dan iOS), TalkBack + Chrome (Android).

Persiapan: buka `<url>/?a11ylog=1`. Panel "Log pengumuman" di bawah layar mencatat setiap pengumuman live region (nama ruang, prompt, toast, status Studio). Bandingkan dengan yang diucapkan pembaca.

Skenario dan hasil yang diharapkan:
1. Muat halaman: pembaca menyebut judul halaman dan badge "SIMULASI: data demo"; Tab pertama fokus ke tautan "Lewati ke direktori".
2. Enter pada tautan, lalu Tab: fokus masuk ke direktori; setiap ruang dibacakan dengan nama dan tombol "Pergi"/"Info".
3. "Temui Nova": dialog persona terbuka, judul dibacakan, fokus di dalam dialog; Escape menutup dan fokus kembali ke tombol asal.
4. Jalan ke ruang rapat (keyboard WASD atau tombol "Pergi"): pembaca mengumumkan "Ruang rapat besar" sekali (log: `room-name: Ruang rapat besar`).
5. Mendekati NPC: prompt "E: Sapa ..." diumumkan sopan, tidak berulang setiap frame.
6. Pengaturan: grup radio "Tema" dan "Kualitas grafis" dibacakan dengan legend; checkbox "Kurangi gerak" dan "Mode visitor" dibacakan dengan status.
7. Mode tanpa WebGL (`?nogl=1`): semua ruang dan dokumen dapat dicapai hanya dengan keyboard/sapuan pembaca.
8. Office Studio: setiap tombol punya nama ("Geser ke barat 0,25 m" dan seterusnya); status "Ditolak ..." diumumkan.

Lulus bila setiap langkah sesuai dan log tidak menunjukkan pengumuman yang tidak dibacakan atau sebaliknya.

| Pembaca | Platform | SHA | Langkah gagal | Catatan | Penguji |
|---|---|---|---|---|---|
| (belum dijalankan) | | | | | |

## 3. Yang sudah otomatis (bukan pengganti uji fisik)

- axe-core WCAG 2.1 A/AA tiga viewport dua tema (`app/tests/e2e/a11y.spec.ts`), contrast dihitung (`tools/contrast.py`), keyboard/fokus/Escape (`world.spec.ts`, `npc.spec.ts`, `controls.spec.ts`).
- Budget draw call/triangle per frame (`budget.spec.ts`) dan benchmark 60 s di container (`perf.spec.ts`, `KANTOR_PERF=1`): metodologi reproducible, bukan FPS perangkat.

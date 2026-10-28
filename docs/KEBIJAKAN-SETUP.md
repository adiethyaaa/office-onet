# Kebijakan dan setup Pokja (`policy.mjs`, `setup-page.mjs`, hapus adapter)

Draf peninjauan, belum di-push. Rancangan disetujui Mas 2026-10-28 10:06 WIT.

## Yang diubah

- `server/policy.mjs`:
  - `OPTION_INSTRUCTION` ditulis ulang netral Pokja: tanpa Hermes,
    Telegram, lane, jobdesk, dan batas produksi ISP. Kontrak JSON
    tiga pilihan, bahasa Indonesia, dan aturan tanpa rahasia
    dipertahankan, karena dispatcher masih menempelkannya ke
    setiap pesan yang diteruskan ke runner. Tidak ada tes yang
    menegaskan isi teks ini.
  - Entri risiko `isp` (PerumNet) dan `homelab` dihapus. Di fork
    ini balasan baca-saja, jadi kata-kata itu hanya menambah kartu
    persetujuan untuk balasan yang tidak berbuat apa-apa. Gerbang
    rahasia, hapus/reset, deploy, biaya, kirim ke klien, dan
    kredensial dipertahankan beserta `LIMITS`, `parseOptions`,
    dan `sanitizeReply`.
- `server/setup-page.mjs`: hanya teks. "Disimpan di Mac mini" dan
  "Max dan bot lain tidak melihatnya" diganti kalimat netral;
  teks selesai tidak lagi menyebut domain demo. Alur setup tidak
  berubah.
- `app/src/data/adapter.ts` dan `app/tests/unit/adapter.test.ts`
  **dihapus**: tidak ada berkas yang mengimpor adapter, dan jalur
  hidup Pokja (panel → `api.ts` → `game.applyPresence`) tidak
  memakainya. Gerbang `PRIVATE_ENABLED = false` di dalamnya
  menyesatkan karena integrasi Pokja sudah jalan.

## Tes yang diperbarui

- `server/test/policy.test.mjs`: tes "gerbang lain" kini menegaskan
  deploy, client, dan cred, serta menegaskan kata infrastruktur
  lama tidak lagi menahan pesan (sementara `reset ONU pelanggan`
  tetap ditahan gerbang hapus karena menyebut pelanggan).
- `server/test/api.test.mjs`: dua kasus approval memakai gerbang
  deploy dan client; kasus hapus backup tetap memakai gerbang
  hapus; catatan persetujuan dispatcher tidak berubah.

## Yang masih tersisa (di luar langkah ini)

- String nama owner "Budi" di `server/dispatcher.mjs` (catatan
  persetujuan dan peristiwa tugas) masih memakai nama pemilik
  lama; diperbaiki pada langkah identitas owner tersendiri,
  bersama teks approval di spek e2e (`private.spec.ts` masih
  memakai `Restart VM di proxmox2`).
- `server/main.mjs` tidak berubah: penyambungan Pokja sudah benar;
  bawaan folder data dan origin menunggu keputusan deploy Mas.

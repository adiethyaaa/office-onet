# Identitas owner (`dispatcher.mjs`, `server.mjs`, entri i18n mati)

Draf peninjauan, belum di-push. Rancangan disetujui Mas 2026-10-28 10:32 WIT.

## Yang diubah

- `server/dispatcher.mjs` (hanya teks yang terlihat pengguna; alur
  antrean, approval, dan pembatalan tidak berubah):
  - Lima kalimat peristiwa/catatan yang menyebut "Budi" diganti
    tanpa nama: "Agen menunggu keputusan owner.",
    "Ditolak owner; pesan tidak dikirim.",
    "[Persetujuan owner dari panel RPG, hanya untuk tugas ini:
    ...]" (kalimat "Tunjukkan rencana + perintah + jalan mundur
    ... bila aturan lanemu mewajibkan" dihapus karena tidak ada
    eksekusi di fork baca-saja ini), "Disetujui owner, menunggu
    giliran profil.", "Dihentikan owner. ...".
  - Teks dampak kartu persetujuan ditulis ulang jujur: pesan
    hanya diproses sebagai balasan baca-saja dari data Pokja,
    tidak diteruskan ke orang sungguhan, tidak mengubah data.
- `server/server.mjs`: pesan galat 503 saat akun owner belum
  dibuat tidak lagi menyebut tautan setup "dikirim ke Telegram
  Budi"; teks baru mengarahkan menjalankan
  `node server/main.mjs setup` yang mencetak tautan sekali pakai
  ke konsol.
- `app/src/i18n/en/private.ts`: entri mati "Bertanya ke Budi"
  dihapus; tidak ada kode yang memakainya sejak papan ditulis
  ulang.

## Tes yang diperbarui

- `server/test/api.test.mjs`: satu assertion catatan persetujuan
  disesuaikan ke teks baru. Assertion yang sama di spek e2e
  (`private.spec.ts:225`) dicatat untuk langkah e2e.

## Yang sengaja tidak diubah

- Kalimat dialog NPC ("Halo Budi" di `en/content.ts` dan
  `design/dialogue.json`): menunggu keputusan penulisan ulang
  dialog tersendiri.
- Awalan transkrip suara di `server/media.mjs` ("Budi mengirim
  pesan suara"): modul media di luar tahap 1.
- Komentar kode, termasuk `server.mjs:301` ("Budi's choice").
- Nama login bawaan `budi` di setup: nama login sungguhan
  dipilih saat setup.

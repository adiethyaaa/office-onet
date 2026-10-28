# Panel Pokja (`panel.ts`, `api.ts`, terjemahan)

Draf peninjauan, belum di-push. Rancangan disetujui Mas 2026-10-28 09:49 WIT.

## Temuan

Jawaban perintah Pokja tidak tampil di panel: `commandText` tidak
punya cabang untuk hasil `pokja` dari server, jadi catatan
perintahnya bernilai kosong. Selain itu panel masih menampilkan
sisa-sisa Telegram: entri `/telegram` di menu perintah, cabang
tampilan terikat Telegram, dan teks sesi/model Hermes di `/status`.

## Yang diubah

- `app/src/private/panel.ts`:
  - Daftar perintah menu (SLASH) disamakan persis dengan daftar
    server: 10 perintah termasuk 6 perintah Pokja, teks bantuan
    yang sama dengan `server/commands.mjs`.
  - `commandText`: cabang `telegram` dihapus; `pokja` ditampilkan
    apa adanya dari server (`r.text`); `new` dan `status`
    disederhanakan (tanpa sesi, model, dan Telegram).
  - Label mode selalu `Khusus RPG` dengan satu catatan yang sama
    untuk semua profil; cabang Telegram dan `detached` dihapus.
  - Polling saat chat terbuka hanya berjalan bila ada tugas
    berjalan atau agen mengetik; cabang "chat Telegram tetap
    segar" dihapus.
  - Akhiran `dari RPG`/`dari Telegram` pada tiap giliran dihapus;
    server tidak lagi mengirim `via`/`pending`.
  - Komentar header dan komentar menu diperbarui; komentar
    rujukan gaya Telegram (rekaman suara, balasan kutipan,
    pengaturan notifikasi) dibiarkan karena hanya menyebut pola
    UX yang dikenal, bukan integrasi.
- `app/src/private/api.ts`: `CommandResult` ditambah jenis `pokja`
  dan field `text`; field Telegram, sesi, dan model dihapus;
  kanal dipersempit ke `rpg`. `Turn.via` kehilangan `telegram`.
- `app/src/i18n/en/private.ts`: entri baru untuk 6 teks bantuan
  perintah Pokja, catatan panel baru, dan `Percakapan baru
  dimulai.`; entri kalimat Telegram yang dihapus ikut dihapus
  (semuanya sudah diperiksa hanya dipakai di `panel.ts`).

## Yang tidak berubah

- `app/src/private/chat-ui.ts`: hanya tampilan (pemisah tanggal,
  centang, bunyi, judul tab); tidak ada perilaku Telegram di
  dalamnya.
- Teks setup owner yang menyebut tautan dikirim Max lewat
  Telegram: milik langkah setup (`setup-page.mjs`), mekanismenya
  belum diubah.
- Catatan simulasi di `game.ts`/`scold.ts` yang menyatakan tidak
  mengirim apa pun ke Telegram: pernyataan yang benar, dibiarkan.
- Spek e2e (`chat-voice-slash.spec.ts`, `private.spec.ts`) masih
  memakai alur dan fixture Telegram lama; diperbarui pada langkah
  e2e tersendiri.

## Verifikasi

Tidak ada tes unit panel. Gerbangnya: `tsc --noEmit`, build Vite,
dan vitest (termasuk tes kamus yang mensyaratkan setiap literal
`t()` punya entri Inggris). Server tidak berubah pada langkah ini.

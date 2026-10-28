# Deploy office-onet di VPS (systemd + Cloudflare Tunnel)

Draf peninjauan, belum di-push. Tidak ada langkah di dokumen ini yang
dijalankan saat penyusunan draf; semua perintah di bawah dijalankan
operator di VPS pada langkah pemasangan tersendiri, setelah Mas
menyetujui draf dan menjawab pertanyaan domain/tunnel.

## Gambaran

Satu hostname, tiga layanan level user di VPS Ubuntu:

- `office-onet` — backend Node (`server/main.mjs`), hanya `127.0.0.1:3242`.
- `office-onet-static` — `app/scripts/serve-csp.mjs` menyajikan
  `app/dist`, hanya `127.0.0.1:4180`.
- `office-onet-tunnel` — `cloudflared` dengan ingress `/api/*` ke
  backend dan `/*` ke server statis.

Tidak ada nginx, tidak ada Tailscale, tidak ada Mac mini. Berkas
deploy lama (`pasang-mac.sh`, `sambung-nginx.sh`, `muat-launchd.sh`)
tetap ada untuk penyebaran asli dan tidak dipakai di sini. `main.mjs`
tidak berubah: semua konfigurasi lewat env.

## Prasyarat (sekali, di VPS)

1. Node.js 24+ dan `cloudflared` terpasang. Saat draf disusun,
   pemeriksaan baca-saja menunjukkan keduanya belum ada di VPS
   Tencent. Cara pasang mengikuti dokumentasi resmi masing-masing
   (Node lewat repositori Nodesource atau arsip resmi; `cloudflared`
   lewat paket `.deb` resmi Cloudflare). Onet tidak memasangnya
   tanpa persetujuan tersendiri.
2. Tunnel dibuat sekali: lewat dashboard Cloudflare Zero Trust, atau
   `cloudflared tunnel create <nama>` di VPS. Hasilnya: ID tunnel,
   berkas kredensial `~/.cloudflared/<ID>.json`, dan rute DNS
   hostname ke tunnel (`cloudflared tunnel route dns`).
3. Berkas `~/.cloudflared/config.yml` disalin dari
   `server/deploy/cloudflared-config.yml.example`, dengan placeholder
   `<ID-atau-nama-tunnel>`, `<user>`, dan `<hostname-office>` diisi.
   Berkas config yang sudah diisi tidak boleh masuk repo.

## Pasang / rilis baru

```sh
git clone <fork> && cd office-onet
git checkout <sha>
cd app && npm ci && npm run build && cd ..
server/deploy/pasang-vps.sh <sha>
```

Skrip itu memeriksa `node`, `cloudflared`, dan config Tunnel; membuat
`~/office-onet/data/office-onet.env` kosong (mode 0600) dari contoh
bila belum ada, lalu berhenti dan meminta operator mengisinya;
menyalin rilis ke `~/office-onet/releases/<sha>` (hanya `server/`,
`app/dist`, `app/scripts`); mengarahkan symlink `current`; menyalin
tiga unit ke `~/.config/systemd/user/`; lalu
`systemctl --user enable --now` ketiganya. Rilis lama tetap ada,
jadi rollback cukup `pasang-vps.sh <sha-lama>`.

## Rahasia

- `~/office-onet/data/office-onet.env` (0600, di luar repo):
  `POKJA_API_URL`, `POKJA_API_TOKEN`, `KANTOR_RPG_ORIGIN`
  (harus sama persis dengan hostname Tunnel).
- **Jangan buat berkas `proxy-secret` di folder data untuk penyebaran
  Tunnel.** Bila berkas itu ada, `main.mjs` mewajibkan header
  `X-Kantor-Proxy` yang tidak pernah dikirim `cloudflared`, sehingga
  semua `/api/` dijawab 403. Mekanisme proxy-secret hanya untuk
  penyebaran nginx. Skrip pasang memperingatkan bila berkas itu ada.
  (Pesan galat 403 itu sendiri masih menyebut proxy lama
  "employee-rpg"; peninggalan teks, bukan perilaku.)
- Layanan systemd berjalan sebagai user biasa, tanpa hak baru
  (`NoNewPrivileges`), dengan batas memori (backend 512M).

## Smoke test setelah pasang

```sh
curl -s https://<hostname-office>/api/me
# lalu dari checkout SHA yang sama, di mesin mana pun:
cd app && KANTOR_BASE_URL=https://<hostname-office>/ npx playwright test --project=desktop tests/e2e/world.spec.ts tests/e2e/states.spec.ts
```

## Berhenti

```sh
systemctl --user stop office-onet office-onet-static office-onet-tunnel
systemctl --user disable office-onet office-onet-static office-onet-tunnel
```

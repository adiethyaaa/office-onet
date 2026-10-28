#!/bin/bash
# Pasang/rilis office-onet di VPS Ubuntu (systemd level user + Tunnel).
#   server/deploy/pasang-vps.sh <sha>
# Dijalankan DI VPS, dari checkout repo ini. Hanya menyalin berkas,
# membuat folder, dan mengaktifkan unit systemd --user; tidak
# menginstal paket, tidak membuat tunnel, dan tidak menulis nilai
# rahasia apa pun. Baca docs/DEPLOY-VPS.md dulu.
# Rollback: pasang-vps.sh <sha-lama> (rilis lama tetap ada), atau
#   systemctl --user stop office-onet office-onet-static office-onet-tunnel
set -euo pipefail
SHA="${1:?pakai: pasang-vps.sh <sha>}"
SRC="$(cd "$(dirname "$0")/../.." && pwd)"
BASE="$HOME/office-onet"
REL="$BASE/releases/$SHA"
UNIT_DIR="$HOME/.config/systemd/user"

command -v node >/dev/null || { echo "node tidak ditemukan; pasang Node 24+ dulu (lihat docs/DEPLOY-VPS.md)" >&2; exit 2; }
command -v cloudflared >/dev/null || { echo "cloudflared tidak ditemukan; pasang dulu (lihat docs/DEPLOY-VPS.md)" >&2; exit 2; }
node --check "$SRC/server/main.mjs"
[ -s "$HOME/.cloudflared/config.yml" ] || { echo "config Tunnel belum ada di ~/.cloudflared/config.yml; buat tunnel dulu (lihat docs/DEPLOY-VPS.md)" >&2; exit 2; }

mkdir -p "$BASE/releases" "$BASE/data" "$UNIT_DIR"
chmod 700 "$BASE" "$BASE/data"
ENV_FILE="$BASE/data/office-onet.env"
if [ ! -s "$ENV_FILE" ]; then
  cp "$SRC/server/deploy/office-onet.env.example" "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  echo "Berkas env dibuat kosong di $ENV_FILE (mode 0600)."
  echo "Isi POKJA_API_URL, POKJA_API_TOKEN, dan KANTOR_RPG_ORIGIN di sana, lalu jalankan lagi skrip ini."
  exit 3
fi
# Jangan sampai rahasia proxy aktif tanpa sengaja pada penyebaran Tunnel.
if [ -s "$BASE/data/proxy-secret" ]; then
  echo "PERINGATAN: $BASE/data/proxy-secret ada. Pada penyebaran Tunnel berkas itu membuat semua /api/ dijawab 403." >&2
  echo "Hapus/pindahkan berkas itu bila penyebaran ini memakai Tunnel (lihat docs/DEPLOY-VPS.md)." >&2
fi

rm -rf "$REL.tmp"; mkdir -p "$REL.tmp/server" "$REL.tmp/app"
cp -a "$SRC/server/" "$REL.tmp/server/"
rm -rf "$REL.tmp/server/test" "$REL.tmp/server/deploy"
cp -a "$SRC/app/dist" "$REL.tmp/app/dist"
cp -a "$SRC/app/scripts" "$REL.tmp/app/scripts"
rm -rf "$REL"; mv "$REL.tmp" "$REL"
PREV="$(readlink "$BASE/current" 2>/dev/null || true)"
ln -sfn "$REL" "$BASE/current"
echo "current: $REL (sebelumnya: ${PREV:-tidak ada})"

for u in office-onet office-onet-static office-onet-tunnel; do
  cp "$SRC/server/deploy/$u.service" "$UNIT_DIR/$u.service"
done
systemctl --user daemon-reload
systemctl --user enable --now office-onet office-onet-static office-onet-tunnel
sleep 2
systemctl --user --no-pager status office-onet office-onet-static office-onet-tunnel --lines=3 || true
echo "Selesai. Periksa https://<hostname-office>/api/me dan jalankan smoke test di docs/DEPLOY-VPS.md."

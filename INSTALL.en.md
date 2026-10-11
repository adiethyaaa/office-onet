[Bahasa Indonesia](INSTALL.md) · **English**

# Kantor RPG installation guide

Kantor RPG has two parts:

1. **3D app** (`app/`): Vite + three.js. The build output is static files (`app/dist`). This part is enough to walk around the office, see simulated NPCs, and use the directory and documents.
2. **Private backend** (`server/`): Node with no framework. It powers agent chat connected to Telegram through Hermes Agent, push notifications, and attachments. It is optional. Without the backend, the app still runs in simulation mode.

There are three paths: (A) try it on a laptop, (B) deploy the static site, (C) connect the private backend.

---

## Prerequisites

| For | Requires |
|---|---|
| App | Node.js 22+ (tested on 24 and 26), npm, Git |
| Backend | Node.js 24+ (`server/package.json` engines), OpenSSL |
| E2E tests | Playwright Chromium (`npx playwright install chromium`) |
| Rebuilding design assets (optional) | Python 3.11+, `poppler-utils`, Blender 4.0.x; see [docs/REBUILD.md](docs/REBUILD.md) |

The built GLB files, images, and PDFs are already committed, so Python and Blender are **not** needed to run the app.

---

## A. Try it on a laptop (5 minutes)

```bash
git clone https://github.com/air-buddy410/kantor-rpg.git
cd kantor-rpg/app
npm ci
npm run dev            # http://localhost:5173
```

Production build and preview:

```bash
npm run build          # tsc + vite build -> app/dist
npm run preview        # http://127.0.0.1:4173
```

Controls: WASD/arrow keys to walk, Shift to run, Q/Z to rotate the camera, R to straighten the camera, +/- to zoom, E/Enter to interact, H for help. On phones: touch joystick. The NPC simulation is seeded (`?seed=20261001`).

Quality setting (gear icon): `auto`, `low`, or `high`. `auto` mode picks `low` (no shadows) when the GPU is detected as a software renderer.

### Check before use

```bash
cd app
npx tsc --noEmit
npx vitest run                         # unit tests, including the z-fighting gate (coplanar.test.ts)
npx playwright install chromium        # once
npx playwright test                    # E2E desktop/tablet/mobile on port 4173
```

Port 4173 must be free, or already running `vite preview` from the same folder (`reuseExistingServer`). Server tests: `cd server && npm ci && npm test`.

---

## B. Deploy the static site (nginx)

`app/dist` can be served by any static web server. Here is an nginx example with one release per commit, so a rollback only means changing one line:

```bash
# on the build machine
cd app && npm ci && npm run build
SHA=$(git rev-parse --short=7 HEAD)
rsync -az --delete dist/ server:/tmp/staging-$SHA/

# on the server
sudo cp -a /tmp/staging-$SHA /var/www/kantor-rpg/releases/$SHA
```

Minimal vhost:

```nginx
server {
  listen 80;
  server_name office.example.com;
  root /var/www/kantor-rpg/releases/<SHA>;
  index index.html;
  gzip on;
  gzip_types application/javascript text/css application/json application/octet-stream model/gltf-binary;
  add_header Cache-Control "public, no-transform" always;
  add_header X-Content-Type-Options nosniff always;
  location ^~ /assets/ { try_files $uri =404; }
  location / { try_files $uri $uri/ =404; }
}
```

To switch releases: change the `root` line to the new SHA, then run `sudo nginx -t && sudo systemctl reload nginx`. Old releases stay in place for rollback.

Notes:
- Enable gzip for `.glb` (the model is about 5.9 MB raw, about 2.1 MB gzipped).
- `Cache-Control: no-transform` stops CDNs (for example Cloudflare) from injecting scripts. The app has a "same-origin only" test.
- The site must be served over HTTPS for the PWA and push notifications to work.

---

## C. Private backend (agent chat, push, attachments)

The backend reads Hermes Telegram sessions on the machine where Hermes runs, so install it on that machine (for example a Mac mini). The site's nginx then proxies to it.

### Run manually

```bash
cd server
npm ci --omit=dev
KANTOR_RPG_DATA=~/.hermes/kantor-rpg \
KANTOR_RPG_BIND=127.0.0.1 \
KANTOR_RPG_PORT=3242 \
KANTOR_RPG_ORIGIN=https://office.example.com \
node main.mjs
```

| Variable | Default | Meaning |
|---|---|---|
| `KANTOR_RPG_DATA` | `~/.hermes/kantor-rpg` | Data folder (mode 0700): sessions, `proxy-secret`, `vapid.json`, attachments |
| `KANTOR_RPG_PORT` | `3242` | HTTP port |
| `KANTOR_RPG_BIND` | `127.0.0.1` | Bind address. Use a Tailscale/LAN IP if nginx runs on another machine |
| `KANTOR_RPG_ORIGIN` | demo site | Origin allowed to POST (CSRF) |
| `KANTOR_RPG_PROXY_SECRET` | contents of the `proxy-secret` file | Required header from nginx. Requests without it are rejected |

The VAPID keys for push are generated once, automatically, in the data folder. Do not commit the data folder.

### macOS + launchd (the production setup)

```bash
server/deploy/pasang-mac.sh <sha>   # copy to ~/.hermes/kantor-rpg/releases/<sha>, create proxy-secret, install the LaunchAgent
server/deploy/muat-launchd.sh       # restart the id.perumnet.kantor-rpg-api service
```

Logs go to `~/.hermes/log/kantor-rpg-api.log`. Rollback: point the `~/.hermes/kantor-rpg/current` symlink to an older release, then run `launchctl kickstart -k gui/$UID/id.perumnet.kantor-rpg-api`.

`pasang-mac.sh` binds to `KANTOR_RPG_BIND` if set. Otherwise it uses the machine's Tailscale IP (`tailscale ip -4`), and finally falls back to the example `192.168.1.10`. `sambung-nginx.sh` uses the same order for the upstream (`KANTOR_RPG_UPSTREAM`).

### Connect nginx to the backend

```bash
KANTOR_RPG_UPSTREAM=http://<backend-ip>:3242 server/deploy/sambung-nginx.sh
```

This script writes `/etc/nginx/snippets/kantor-rpg-api.conf` (0600, contains the secret header), inserts an `include` into the vhost, backs up the vhost, then runs `nginx -t`. If that fails, the vhost is restored automatically. The hostname and vhost path at the top of the script match the demo server. Change them for your server.

Check: `curl https://office.example.com/api/me` should return 200.

---

## Common problems

- **Black screen / 3D does not appear**: the browser has no WebGL. The app falls back to directory mode. Try a recent Chrome or Safari, or use `?nogl=1` to force the non-3D mode.
- **Flickering surfaces (z-fighting)**: fixed at the source (see [docs/evidence/AUDIT-3D/LAPORAN.md](docs/evidence/AUDIT-3D/LAPORAN.md)). If you add new furniture or GLB files, run `npx vitest run tests/unit/coplanar.test.ts`. The test fails if two surfaces of different colors touch.
- **Old version still loads after deploy**: the PWA service worker. Close all tabs of the site and reopen it, or clear the site data.
- **E2E fails with `ERR_CONNECTION_REFUSED`**: the preview server on 4173 stopped during the run. Run `npm run preview` separately, then retry with `npx playwright test --last-failed`.
- **Agent chat does not appear**: check `/api/me`. If it returns 404/502, nginx has not loaded the API snippet or the backend is not running (`launchctl print gui/$UID/id.perumnet.kantor-rpg-api`).

## Size and budget

- Runtime models about 5.92 MB (characters 4.54 MB), ADR-015 limits: 4.6 MB / 6.0 MB.
- Main JS about 65 kB gzipped, three.js about 169 kB gzipped.
- Checked by `tests/e2e/budget.spec.ts` and `bundle.spec.ts`, plus `node tools/glb_audit.mjs`.

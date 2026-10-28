#!/usr/bin/env node
// Entry point backend privat. Konfigurasi lewat env:
//   KANTOR_RPG_DATA  folder data (default ~/.hermes/kantor-rpg, mode 0700)
//   KANTOR_RPG_PORT  port (default 3242)   KANTOR_RPG_BIND  (default 127.0.0.1)
//   KANTOR_RPG_PROXY_SECRET  header wajib dari nginx (berkas proxy-secret di folder data)
//   KANTOR_RPG_ORIGIN  origin yang boleh POST (default https://employee-rpg.air-buddy.site)
// [POKJA-TAHAP-1] + [POKJA-LOG] Konfigurasi kehadiran Pokja,
// lewat env (nama saja, tanpa nilai di berkas ini; nilainya
// hidup di lingkungan server):
//   POKJA_API_URL / POKJA_API_TOKEN  alamat Pokja yang sama
//     untuk tiga jalur: ringkasan (jalur perkiraan) dan
//     ?action=sessions serta ?action=audit_logs (jalur sesi
//     dan log), persis seperti agent.py di VPS Tencent. Tidak
//     ada env log terpisah, karena alamatnya sama.
// Uji lokal lewat http saja: KANTOR_RPG_COOKIE_SECURE=0 membuat cookie
// sesi tanpa flag Secure, supaya login jalan di http://localhost.
// Bawaan (env tidak disetel) tetap Secure; jangan pakai nilai 0 di
// penyebaran publik.
// `node server/main.mjs setup` mencetak tautan setup owner sekali pakai.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer, createSetup } from './server.mjs';

process.umask(0o077); // db, WAL and setup files stay owner-only
const dataDir = process.env.KANTOR_RPG_DATA ?? path.join(os.homedir(), '.hermes', 'kantor-rpg');
const origin = process.env.KANTOR_RPG_ORIGIN ?? 'https://employee-rpg.air-buddy.site';

if (process.argv[2] === 'setup') {
  console.log(createSetup(dataDir, { username: process.argv[3] ?? 'budi', publicUrl: origin }));
  process.exit(0);
}

const secretFile = path.join(dataDir, 'proxy-secret');
const proxySecret = process.env.KANTOR_RPG_PROXY_SECRET ?? (fs.existsSync(secretFile) ? fs.readFileSync(secretFile, 'utf8').trim() : '');
if (!proxySecret) { console.error('proxy-secret wajib (fail-closed).'); process.exit(2); }
const port = Number(process.env.KANTOR_RPG_PORT ?? 3242);
const bind = process.env.KANTOR_RPG_BIND ?? '127.0.0.1';
// [POKJA-TAHAP-1] + [POKJA-LOG] Nilai kosong berarti kedua
// jalur Pokja mati di server.mjs, bukan galat. Tidak ada nilai
// rahasia yang dicetak atau ditulis di sini; yang diteruskan
// hanya isi env yang sudah ada di lingkungan proses ini.
const pokjaUrl = process.env.POKJA_API_URL ?? '';
const pokjaToken = process.env.POKJA_API_TOKEN ?? '';
const cookieSecure = process.env.KANTOR_RPG_COOKIE_SECURE === '0' ? false : undefined;
const { server } = createServer({ dataDir, proxySecret, allowedOrigin: origin, pokjaUrl, pokjaToken, cookieSecure });
server.listen(port, bind, () => console.log(`kantor-rpg backend ${bind}:${port} data=${dataDir}`));
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => server.close(() => process.exit(0)));

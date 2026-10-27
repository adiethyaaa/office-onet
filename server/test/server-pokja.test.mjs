// Pemeriksaan statis salinan peninjauan server.mjs di folder ini.
// Ini BUKAN tes integrasi server penuh: salinan ini tidak bisa
// dijalankan sendiri karena modul server lain (store, auth,
// boards, telegram, roster) tidak ikut disalin pada langkah ini.
// Yang diperiksa di sini adalah janji penyambungannya: hanya tiga
// hunk bertanda [POKJA-TAHAP-1], jalur lama tetap ada apa adanya,
// dan tidak ada rahasia atau pembacaan process.env di server.mjs.
// Tes integrasi penuh dijalankan nanti di fork, dengan modul
// lengkap dan mesin Pokja suntikan lewat cfg.pokja.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverMjs = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server.mjs"),
  "utf8",
);

test("server.mjs salinan memakai tiga penanda TAHAP-1 dan tiga penanda LOG", () => {
  const tahap1 = serverMjs.match(/\[POKJA-TAHAP-1\]/g) ?? [];
  const log = serverMjs.match(/\[POKJA-LOG\]/g) ?? [];
  assert.equal(tahap1.length, 3);
  assert.equal(log.length, 3);
  assert.match(
    serverMjs,
    /import \{ buatMesinKehadiran, buatPenarikSnapshot, buatPenyegarKehadiran \} from '\.\/pokja\.mjs';/,
  );
  assert.match(
    serverMjs,
    /import \{ buatMesinLogAktivitas, buatPenarikKehadiran, keBentukPresenceLog \} from '\.\/pokja-log\.mjs';/,
  );
  assert.match(serverMjs, /cfg\.pokjaUrl && cfg\.pokjaToken/);
  assert.doesNotMatch(serverMjs, /cfg\.pokjaLogUrl|POKJA_LOG_API_URL/);
  assert.match(serverMjs, /cfg\.pokjaPemetaanAktor/);
  assert.match(serverMjs, /bentukPresence: keBentukPresenceLog/);
});

test("jalur lama presence tetap ada apa adanya di dalam ambilLama", () => {
  assert.match(serverMjs, /const ambilLama = \(\) => \{/);
  assert.match(serverMjs, /buildPresence\(sources, rpg, t\)/);
  assert.match(serverMjs, /presenceMemo = \{ at: t, value: \{ observedAt: new Date\(t\)\.toISOString\(\), agents \} \};/);
  assert.match(serverMjs, /route\('GET', \/\^\\\/api\\\/presence\$\/, \{\}, async \(req, res\) => \{/);
  assert.match(serverMjs, /const ambilPerkiraan = \(\) => penyegarPokja\(new Date\(t\)\.toISOString\(\), t, ambilLama\);/);
  assert.match(serverMjs, /await penyegarLog\(new Date\(t\)\.toISOString\(\), t, ambilPerkiraan\)/);
  assert.match(serverMjs, /send\(res, 200, \{ observedAt: hasil\.observedAt, agents: hasil\.agents \}\);/);
});

test("server.mjs salinan tidak memuat rahasia dan tidak membaca process.env", () => {
  assert.doesNotMatch(serverMjs, /POKJA_API_TOKEN|POKJA_API_URL/);
  assert.doesNotMatch(serverMjs, /process\.env/);
  assert.doesNotMatch(serverMjs, /sk-|ghp_|xoxb-/);
});

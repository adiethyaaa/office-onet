// Pemeriksaan statis salinan peninjauan main.mjs di folder ini.
// Yang diperiksa: hanya nama variabel lingkungan Pokja yang
// diteruskan ke createServer, tanpa env log terpisah (sesi dan
// log memakai alamat yang sama, sesuai agent.py), tanpa nilai
// rahasia, dan perilaku fail-closed proxy-secret yang lama
// tetap utuh.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mainMjs = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "main.mjs"),
  "utf8",
);

test("main.mjs salinan mengirim env Pokja ke createServer, tanpa env log terpisah", () => {
  assert.match(mainMjs, /process\.env\.POKJA_API_URL/);
  assert.match(mainMjs, /process\.env\.POKJA_API_TOKEN/);
  assert.doesNotMatch(mainMjs, /POKJA_LOG_API_URL|POKJA_LOG_API_TOKEN/);
  assert.match(
    mainMjs,
    /createServer\(\{ dataDir, proxySecret, allowedOrigin: origin, pokjaUrl, pokjaToken \}\)/,
  );
});

test("main.mjs salinan tetap fail-closed untuk proxy-secret dan tidak memuat nilai rahasia", () => {
  assert.match(mainMjs, /if \(!proxySecret\) \{ console\.error\('proxy-secret wajib \(fail-closed\)\.'\); process\.exit\(2\); \}/);
  assert.doesNotMatch(mainMjs, /43\.156|pokja\.tu-kanreg14/);
  assert.doesNotMatch(mainMjs, /sk-|ghp_|xoxb-/);
});

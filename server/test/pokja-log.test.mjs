// Tes untuk server/pokja-log.mjs, dengan bentuk data NYATA dari
// endpoint sessions dan audit_logs agent.py di VPS Tencent
// (diperiksa 2026-10-28). Tidak memakai jaringan dan tidak
// memakai rahasia. Dijalankan dari folder server/ adaptasi:
//   node --test test/pokja-log.test.mjs
// Waktu contoh memakai bentuk nyata "YYYY-MM-DD HH:MM:SS"
// tanpa zona, yang dianggap WIT. Nilai action dan module
// hanya memakai nilai yang benar-benar terlihat; nilai lain
// yang tidak dikenal sengaja diuji sebagai diabaikan.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  lipatKehadiran,
  keBentukPresenceLog,
  buatPenarikKehadiran,
  buatMesinLogAktivitas,
  normalisasiSesi,
  normalisasiLog,
  parseWaktu,
} from "../pokja-log.mjs";
import { buatPenyegarKehadiran } from "../pokja.mjs";

const T = (jamMenit) => `2026-10-28 ${jamMenit}:00`;
const TISO = (jamMenit) => `2026-10-28T${jamMenit}:00+07:00`;
let idSesi = 0;
let idLog = 0;

function sesi(inisial, login, terakhir, status, keluar = null, nama = "") {
  idSesi += 1;
  return {
    id: idSesi,
    session_id: `sesi-${idSesi}`,
    inisial,
    nama,
    login_time: login,
    last_active: terakhir,
    logout_time: keluar,
    status,
    ip_address: "203.0.113.9",
  };
}
function log(inisial, waktu, module, action, nama = "") {
  idLog += 1;
  return {
    id: idLog,
    inisial,
    nama,
    module,
    action,
    created_at: waktu,
    target_key: "KUNCI-RAHASIA",
    details: "isi detail yang tidak boleh tampil",
    ip_address: "203.0.113.9",
  };
}
const data = (daftarSesi, daftarLog) => ({ sesi: daftarSesi, log: daftarLog });

test("sesi aktif dan NAV_MENU baru-baru ini berarti bekerja, ringkasan membuka modul", () => {
  const hasil = lipatKehadiran(
    data(
      [sesi("CM", T("08:00"), T("08:04"), "active", null, "Citra")],
      [log("CM", T("08:01"), "AUTH", "LOGIN", "Citra"), log("CM", T("08:04"), "KP", "NAV_MENU", "Citra")],
    ),
    TISO("08:05"),
  );
  assert.equal(hasil.aktif.length, 1);
  assert.equal(hasil.aktif[0].status, "bekerja");
  assert.equal(hasil.aktif[0].user, "CM (Citra)");
  assert.equal(hasil.peristiwa[0].jenis, "masuk");
  const presence = keBentukPresenceLog(hasil.aktif, TISO("08:05"));
  assert.equal(presence.agents[0].status, "working");
  assert.equal(presence.agents[0].profile, "CM");
  assert.match(presence.agents[0].summary, /membuka KP/);
  assert.match(presence.agents[0].summary, /dari sesi dan log Pokja/);
});

test("sesi aktif tanpa aktivitas melewati 5 menit berarti idle, karakter tetap di dalam", () => {
  const hasil = lipatKehadiran(
    data([sesi("CM", T("08:00"), T("08:01"), "active")], [log("CM", T("08:01"), "AUTH", "LOGIN")]),
    TISO("08:10"),
  );
  assert.equal(hasil.aktif[0].status, "idle");
  const presence = keBentukPresenceLog(hasil.aktif, TISO("08:10"));
  assert.equal(presence.agents[0].status, "idle");
  assert.match(presence.agents[0].summary, /Idle/);
  assert.match(presence.agents[0].summary, /sesi masih aktif/);
});

test("semua sesi logged_out berarti sudah keluar, peristiwa keluar pada waktu logout", () => {
  const hasil = lipatKehadiran(
    data(
      [sesi("CM", T("08:00"), T("08:20"), "logged_out", T("08:20"))],
      [log("CM", T("08:20"), "AUTH", "LOGOUT")],
    ),
    TISO("08:21"),
  );
  assert.deepEqual(hasil.aktif, []);
  assert.equal(hasil.peristiwa.at(-1).jenis, "keluar");
  assert.match(hasil.peristiwa.at(-1).keterangan, /logout tercatat/);
});

test("tanpa aktivitas melewati 60 menit keluar sebagai perkiraan, bukan logout", () => {
  const hasil = lipatKehadiran(data([sesi("CM", T("08:00"), T("08:00"), "active")], []), TISO("09:05"));
  assert.deepEqual(hasil.aktif, []);
  assert.match(hasil.peristiwa.at(-1).keterangan, /perkiraan/);
  assert.doesNotMatch(hasil.peristiwa.at(-1).keterangan, /logout tercatat/);
});

test("BUTTON_CLICK disebut beraktivitas, bukan mengedit, dan detail serta IP tidak pernah tampil", () => {
  const hasil = lipatKehadiran(
    data(
      [sesi("CM", T("08:00"), T("08:02"), "active")],
      [log("CM", T("08:02"), "PGA", "BUTTON_CLICK")],
    ),
    TISO("08:03"),
  );
  const presence = keBentukPresenceLog(hasil.aktif, TISO("08:03"));
  assert.match(presence.agents[0].summary, /beraktivitas di PGA/);
  assert.doesNotMatch(presence.agents[0].summary, /mengedit/);
  assert.doesNotMatch(JSON.stringify(hasil), /KUNCI-RAHASIA|203\.0\.113\.9|tidak boleh tampil/);
});

test("aksi yang tidak dikenal diabaikan dan dihitung, log tanpa sesi tidak membuat kehadiran", () => {
  const hasil = lipatKehadiran(
    data(
      [sesi("CM", T("08:00"), T("08:00"), "active")],
      [log("CM", T("08:02"), "KP", "AKSI_TIDAK_DIKENAL"), log("RP", T("08:02"), "KP", "NAV_MENU")],
    ),
    TISO("08:03"),
  );
  assert.equal(hasil.diabaikan, 1);
  assert.equal(hasil.aktif.length, 1);
  assert.equal(hasil.aktif[0].inisial, "CM");
});

test("sesi ganda: satu logged_out dan satu active berarti masih di dalam, login paling awal dipakai", () => {
  const hasil = lipatKehadiran(
    data(
      [
        sesi("FA", T("08:00"), T("08:10"), "logged_out", T("08:10")),
        sesi("FA", T("08:15"), T("08:20"), "active"),
      ],
      [],
    ),
    TISO("08:21"),
  );
  assert.equal(hasil.aktif.length, 1);
  assert.equal(hasil.aktif[0].masukPada, parseWaktu(T("08:15")));
});

test("baris sesi ganda dengan session_id sama memakai aktivitas terakhir yang paling baru", () => {
  const lama = sesi("CM", T("08:00"), T("08:01"), "active");
  const baru = { ...lama, last_active: T("08:04") };
  const hasil = lipatKehadiran(data([lama, baru], []), TISO("08:05"));
  assert.equal(hasil.aktif[0].status, "bekerja");
});

test("baris log ganda dengan id sama dihitung sekali", () => {
  const satu = log("CM", T("08:02"), "KP", "NAV_MENU");
  const hasil = lipatKehadiran(
    data([sesi("CM", T("08:00"), T("08:02"), "active")], [satu, { ...satu }]),
    TISO("08:03"),
  );
  assert.equal(hasil.aktif.length, 1);
});

test("parseWaktu menganggap stempel tanpa zona sebagai WIT, dan normalisasi menolak baris rusak", () => {
  assert.equal(parseWaktu("2026-10-28 08:00:00"), "2026-10-28T01:00:00.000Z");
  assert.equal(parseWaktu("2026-10-28T08:00:00+07:00"), "2026-10-28T01:00:00.000Z");
  assert.throws(() => normalisasiSesi({ inisial: "", login_time: T("08:00"), status: "active" }));
  assert.throws(() => normalisasiSesi({ inisial: "CM", login_time: "bukan-tanggal", status: "active" }));
  assert.throws(() => normalisasiLog({ inisial: "CM", created_at: "bukan-tanggal", action: "LOGIN" }));
  assert.equal(normalisasiLog({ inisial: "CM", created_at: T("08:00"), module: "KP", action: "LOGIN" }).kategori, "login");
  assert.equal(normalisasiLog({ inisial: "CM", created_at: T("08:00"), module: "NAV", action: "NAV_MENU" }).layanan, null);
});

test("penarik memanggil action sessions dan audit_logs di alamat yang sama, dan sesi yang terpotong gagal tertutup", async () => {
  const alamatDilihat = [];
  let headerDilihat = {};
  const ambilPalsu = async (alamat, opsi) => {
    alamatDilihat.push(alamat);
    headerDilihat = opsi.headers;
    if (alamat.includes("action=sessions")) {
      return { ok: true, json: async () => ({ total: 1, waktu_cek: T("08:00"), sessions: [sesi("CM", T("08:00"), T("08:00"), "active")] }) };
    }
    return { ok: true, json: async () => ({ total: 1, waktu_cek: T("08:00"), logs: [log("CM", T("08:00"), "AUTH", "LOGIN")] }) };
  };
  const penarik = buatPenarikKehadiran({ url: "https://contoh.invalid/ringkasan", token: "TOKEN-CONTOH-RAHASIA", ambil: ambilPalsu });
  const hasil = await penarik("2026-10-28");
  assert.deepEqual(alamatDilihat, [
    "https://contoh.invalid/ringkasan?action=sessions&limit=500",
    "https://contoh.invalid/ringkasan?action=audit_logs&limit=500",
  ]);
  assert.equal(headerDilihat["X-Agent-Token"], "TOKEN-CONTOH-RAHASIA");
  assert.equal(hasil.sesi.length, 1);
  assert.equal(hasil.logLengkap, true);
  assert.throws(() => buatPenarikKehadiran({ url: "", token: "x" }));
  assert.throws(() => buatPenarikKehadiran({ url: "https://contoh.invalid", token: "" }));

  const ambilTerpotong = async (alamat) => ({
    ok: true,
    json: async () =>
      alamat.includes("action=sessions")
        ? { total: 5, sessions: [sesi("CM", T("08:00"), T("08:00"), "active")] }
        : { total: 0, logs: [] },
  });
  await assert.rejects(() => buatPenarikKehadiran({ url: "https://contoh.invalid", token: "TOKEN-CONTOH-RAHASIA", ambil: ambilTerpotong })("2026-10-28"), /tidak lengkap/);
  await assert.rejects(
    () => buatPenarikKehadiran({ url: "https://contoh.invalid", token: "TOKEN-CONTOH-RAHASIA", ambil: async () => ({ ok: false, status: 503, json: async () => ({}) }) })("2026-10-28"),
    (galat) => {
      assert.match(galat.message, /503/);
      assert.doesNotMatch(galat.message, /TOKEN-CONTOH-RAHASIA/);
      return true;
    },
  );
});

test("mesin melipat ulang setiap perbarui, dan penyegar berlapis memakai perkiraan saat sesi dan log gagal", async () => {
  const antrean = [
    data([sesi("CM", T("08:00"), T("08:00"), "active")], []),
    data([sesi("CM", T("08:00"), T("08:02"), "active")], [log("CM", T("08:02"), "PGA", "BUTTON_CLICK")]),
  ];
  const mesin = buatMesinLogAktivitas({ penarik: async () => antrean.shift() });
  const pertama = await mesin.perbarui(TISO("08:01"));
  assert.equal(pertama.aktif[0].aksiTerakhir, "aktivitas");
  const kedua = await mesin.perbarui(TISO("08:03"));
  assert.equal(kedua.aktif[0].layananTerakhir, "PGA");

  const mesinPerkiraan = { perbarui: async () => ({ aktif: [] }) };
  const penyegarPerkiraan = buatPenyegarKehadiran({ mesin: mesinPerkiraan, batasCacheMs: 120000 });
  const penyegarLog = buatPenyegarKehadiran({
    mesin: { perbarui: async () => { throw new Error("sesi dan log tidak bisa dibaca"); } },
    batasCacheMs: 30000,
    bentukPresence: keBentukPresenceLog,
  });
  const ambilLama = () => ({ observedAt: TISO("08:03"), agents: [{ profile: "MAX" }] });
  const hasil = await penyegarLog(TISO("08:03"), Date.parse(TISO("08:03")), () => penyegarPerkiraan(TISO("08:03"), Date.parse(TISO("08:03")), ambilLama));
  assert.deepEqual(hasil.agents, []);
});

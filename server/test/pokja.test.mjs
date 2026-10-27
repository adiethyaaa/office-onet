// Tes untuk server/pokja.mjs, gaya tes kantor-rpg (node:test).
// Dijalankan dari folder server/ adaptasi dengan:
//   node --test test/pokja.test.mjs
// Tes ini tidak memakai jaringan dan tidak memakai rahasia apa pun.
// Token contoh di bawah hanya teks contoh untuk memeriksa header.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  keadaanAwal,
  prosesPenarikan,
  snapshotDariRingkasan,
  hitungPerubahan,
  keBentukPresence,
  buatPenarikSnapshot,
  buatMesinKehadiran,
  tanggalWit,
  kodePengguna,
} from "../pokja.mjs";

function jawabanApi() {
  return {
    judul_laporan: "LAPORAN CONTOH",
    waktu_update: "2026-10-27 08:00:00",
    rekap_per_layanan: {
      PGA: {
        perubahan_user: [
          { user: "CM (Citra)", ms: 3, bts: 8, tms: 0, total: 11 },
          { user: "RP (Rony)", ms: 7, bts: 2, tms: 0, total: 9 },
        ],
      },
      PI: { perubahan_user: [] },
      KP: { perubahan_user: [] },
      CASN: { perubahan_user: [] },
      SDP: {
        perubahan_user: [{ user: "NG (Angelina)", ms: 2, bts: 0, tms: 0, total: 2 }],
      },
    },
  };
}

function snapshot(totalCM) {
  return {
    date: "2026-10-27",
    services: {
      PGA: [{ user: "CM (Citra)", ms: totalCM, bts: 0, tms: 0, total: totalCM }],
      PI: [],
      KP: [],
      CASN: [],
      SDP: [],
    },
  };
}

const T0 = "2026-10-27T08:00:00+07:00";
const T2 = "2026-10-27T08:02:00+07:00";
const T18 = "2026-10-27T08:18:00+07:00";

test("tanggalWit memakai zona Asia/Jayapura", () => {
  // 2026-10-26T17:00:00Z adalah 2026-10-27 pukul 00:00 WIT.
  assert.equal(tanggalWit(new Date("2026-10-26T17:00:00Z")), "2026-10-27");
  assert.equal(tanggalWit(new Date("2026-10-27T01:00:00+07:00")), "2026-10-27");
});

test("snapshotDariRingkasan mengubah bentuk API menjadi snapshot", () => {
  const hasil = snapshotDariRingkasan(jawabanApi(), "2026-10-27");
  assert.equal(hasil.date, "2026-10-27");
  assert.equal(hasil.services.PGA.length, 2);
  assert.equal(hasil.services.PGA[0].user, "CM (Citra)");
  assert.equal(hasil.services.PGA[0].total, 11);
  assert.deepEqual(hasil.services.PI, []);
  assert.equal(hasil.services.SDP[0].user, "NG (Angelina)");
});

test("snapshotDariRingkasan menolak bentuk yang tidak sah", () => {
  assert.throws(() => snapshotDariRingkasan(null, "2026-10-27"));
  assert.throws(() => snapshotDariRingkasan({}, "2026-10-27"));
  assert.throws(() => snapshotDariRingkasan(jawabanApi(), "27-10-2026"));
  assert.throws(() =>
    snapshotDariRingkasan(
      { rekap_per_layanan: { PGA: { perubahan_user: [{ user: "", ms: 1, bts: 0, tms: 0, total: 1 }] } } },
      "2026-10-27",
    ),
  );
  assert.throws(() =>
    snapshotDariRingkasan(
      { rekap_per_layanan: { PGA: { perubahan_user: [{ user: "CM (Citra)", ms: "x", bts: 0, tms: 0, total: 1 }] } } },
      "2026-10-27",
    ),
  );
});

test("penarikan pertama hanya patokan awal, perubahan pertama masuk", () => {
  let keadaan = prosesPenarikan(keadaanAwal(), snapshot(11), T0).keadaan;
  const hasil = prosesPenarikan(keadaan, snapshot(12), T2);
  assert.equal(hasil.peristiwa[0].jenis, "masuk");
  assert.equal(hasil.peristiwa[0].lewat, "pintu depan");
  assert.equal(hasil.aktif[0].perubahanTerakhir, "+1 PGA (1 MS)");
});

test("melewati batas 15 menit membuat peristiwa keluar, bukan bukti sesi habis", () => {
  let keadaan = prosesPenarikan(keadaanAwal(), snapshot(11), T0).keadaan;
  keadaan = prosesPenarikan(keadaan, snapshot(12), T2).keadaan;
  const hasil = prosesPenarikan(keadaan, snapshot(12), T18);
  assert.equal(hasil.peristiwa[0].jenis, "keluar");
  assert.match(hasil.peristiwa[0].keterangan, /Bukan bukti sesi habis/);
  assert.deepEqual(hasil.aktif, []);
});

test("penghapusan dan user yang hilang dihitung sebagai aktivitas", () => {
  const perubahan = hitungPerubahan(snapshot(10), snapshot(11));
  assert.equal(perubahan[0].arah, "menghapus");
  assert.equal(perubahan[0].ringkasan, "-1 PGA (1 MS)");
});

test("ganti tanggal mereset dan tidak membuat peristiwa masuk", () => {
  let keadaan = prosesPenarikan(keadaanAwal(), snapshot(11), T0).keadaan;
  keadaan = prosesPenarikan(keadaan, snapshot(12), T2).keadaan;
  const besok = { ...snapshot(5), date: "2026-10-28" };
  const hasil = prosesPenarikan(keadaan, besok, "2026-10-28T08:00:00+07:00");
  assert.equal(hasil.peristiwa[0].jenis, "ganti-hari");
  assert.deepEqual(hasil.aktif, []);
});

test("keBentukPresence memakai pemetaan aktor, dan null kalau tidak dipetakan", () => {
  let keadaan = prosesPenarikan(keadaanAwal(), snapshot(11), T0).keadaan;
  const hasil = prosesPenarikan(keadaan, snapshot(12), T2);
  const tanpaPeta = keBentukPresence(hasil.aktif, T2);
  assert.equal(tanpaPeta.agents[0].actorId, null);
  assert.equal(tanpaPeta.agents[0].profile, "CM");
  assert.equal(tanpaPeta.agents[0].status, "working");
  const denganPeta = keBentukPresence(hasil.aktif, T2, { CM: "ACT-ONET" });
  assert.equal(denganPeta.agents[0].actorId, "ACT-ONET");
  assert.match(denganPeta.agents[0].summary, /bukan status login/);
  assert.equal(kodePengguna("CM (Citra)"), "CM");
});

test("buatPenarikSnapshot gagal tertutup kalau url atau token kosong", () => {
  assert.throws(() => buatPenarikSnapshot({ url: "", token: "contoh" }));
  assert.throws(() => buatPenarikSnapshot({ url: "https://contoh.invalid", token: "" }));
  assert.throws(() => buatPenarikSnapshot({}));
});

test("buatPenarikSnapshot memakai header token dan tanggal di alamat, tanpa membocorkan token saat gagal", async () => {
  let alamatDilihat = "";
  let headerDilihat = {};
  const ambilPalsu = async (alamat, opsi) => {
    alamatDilihat = alamat;
    headerDilihat = opsi.headers;
    return { ok: true, json: async () => jawabanApi() };
  };
  const penarik = buatPenarikSnapshot({
    url: "https://contoh.invalid/ringkasan",
    token: "TOKEN-CONTOH-RAHASIA",
    ambil: ambilPalsu,
  });
  const hasil = await penarik("2026-10-27");
  assert.equal(alamatDilihat, "https://contoh.invalid/ringkasan?start_date=2026-10-27&end_date=2026-10-27");
  assert.equal(headerDilihat["X-Agent-Token"], "TOKEN-CONTOH-RAHASIA");
  assert.equal(hasil.services.PGA[0].total, 11);

  const ambilGagal = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const penarikGagal = buatPenarikSnapshot({
    url: "https://contoh.invalid/ringkasan",
    token: "TOKEN-CONTOH-RAHASIA",
    ambil: ambilGagal,
  });
  await assert.rejects(() => penarikGagal("2026-10-27"), (galat) => {
    assert.match(galat.message, /503/);
    assert.doesNotMatch(galat.message, /TOKEN-CONTOH-RAHASIA/);
    return true;
  });
});

test("buatMesinKehadiran memakai penarik dan menjaga keadaan antar-penarikan", async () => {
  const antrean = [snapshot(11), snapshot(12)];
  const penarikPalsu = async () => antrean.shift();
  const mesin = buatMesinKehadiran({ batasMenit: 15, penarik: penarikPalsu });
  const pertama = await mesin.perbarui(T0);
  assert.deepEqual(pertama.aktif, []);
  const kedua = await mesin.perbarui(T2);
  assert.equal(kedua.peristiwa[0].jenis, "masuk");
  assert.equal(mesin.keadaan().pengguna["CM (Citra)"].terakhirTerlihat, T2);
  assert.throws(() => buatMesinKehadiran({}));
});

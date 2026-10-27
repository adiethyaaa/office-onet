// Tes untuk buatPenyegarKehadiran di ../pokja.mjs: cache dan cadangan
// rute /api/presence, tanpa menjalankan server penuh dan tanpa
// jaringan. Dijalankan dari folder server/ adaptasi dengan:
//   node --test test/pokja-penyegar.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buatPenyegarKehadiran,
  buatMesinKehadiran,
} from "../pokja.mjs";

const T0 = "2026-10-27T08:00:00+07:00";
const MS0 = Date.parse(T0);
const LAMA = { observedAt: T0, agents: [{ profile: "MAX", name: "Max" }] };
const ambilLama = () => LAMA;

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

test("tanpa mesin, jalur lama langsung dipakai", async () => {
  const segarkan = buatPenyegarKehadiran({ mesin: null });
  const hasil = await segarkan(T0, MS0, ambilLama);
  assert.equal(hasil.sumber, "lama");
  assert.deepEqual(hasil.agents, LAMA.agents);
});

test("cache segar tidak memanggil mesin lagi, cache basi memanggil lagi", async () => {
  let panggilan = 0;
  const mesinPalsu = {
    perbarui: async () => {
      panggilan += 1;
      return { aktif: [{ user: "CM (Citra)", pertamaMasuk: T0, terakhirTerlihat: T0, layananTerakhir: "PGA", perubahanTerakhir: "+1 PGA (1 MS)", arahTerakhir: "menambah" }] };
    },
  };
  const segarkan = buatPenyegarKehadiran({ mesin: mesinPalsu, batasCacheMs: 120000 });
  const pertama = await segarkan(T0, MS0, ambilLama);
  assert.equal(pertama.sumber, "pokja");
  assert.equal(panggilan, 1);
  const kedua = await segarkan(T0, MS0 + 119000, ambilLama);
  assert.equal(kedua.sumber, "cache-pokja");
  assert.equal(panggilan, 1);
  const ketiga = await segarkan(T0, MS0 + 121000, ambilLama);
  assert.equal(ketiga.sumber, "pokja");
  assert.equal(panggilan, 2);
});

test("perbaruan gagal setelah cache memakai cache, gagal tanpa cache memakai jalur lama", async () => {
  let harusGagal = false;
  const mesinPalsu = {
    perbarui: async () => {
      if (harusGagal) throw new Error("API Pokja tidak bisa dijangkau");
      return { aktif: [] };
    },
  };
  const segarkan = buatPenyegarKehadiran({ mesin: mesinPalsu, batasCacheMs: 120000 });
  await segarkan(T0, MS0, ambilLama);
  harusGagal = true;
  const dariCache = await segarkan(T0, MS0 + 200000, ambilLama);
  assert.equal(dariCache.sumber, "cache-pokja");

  const segarkanBaru = buatPenyegarKehadiran({
    mesin: { perbarui: async () => { throw new Error("gagal sejak awal"); } },
    batasCacheMs: 120000,
  });
  const dariLama = await segarkanBaru(T0, MS0, ambilLama);
  assert.equal(dariLama.sumber, "lama");
  assert.deepEqual(dariLama.agents, LAMA.agents);
});

test("penarikan pertama menjadi patokan kosong, perubahan pertama masuk setelah cache basi", async () => {
  const antrean = [snapshot(11), snapshot(12)];
  const penarikPalsu = async () => antrean.shift() ?? snapshot(12);
  const mesin = buatMesinKehadiran({ batasMenit: 15, penarik: penarikPalsu });
  const segarkan = buatPenyegarKehadiran({ mesin, batasCacheMs: 120000, pemetaanAktor: { CM: "ACT-ONET" } });
  const pertama = await segarkan(T0, MS0, ambilLama);
  assert.equal(pertama.sumber, "pokja");
  assert.deepEqual(pertama.agents, []);
  const kedua = await segarkan("2026-10-27T08:02:00+07:00", MS0 + 120000, ambilLama);
  assert.equal(kedua.sumber, "cache-pokja");
  const ketiga = await segarkan("2026-10-27T08:02:00+07:00", MS0 + 121000, ambilLama);
  assert.equal(ketiga.agents.length, 1);
  assert.equal(ketiga.agents[0].actorId, "ACT-ONET");
  assert.equal(ketiga.agents[0].status, "working");
  assert.match(ketiga.agents[0].summary, /bukan status login/);
  assert.equal(ketiga.agents[0].replies.length, 0);
  assert.equal(ketiga.agents[0].typing, false);
});

test("tanpa ambilLama, penyegar menolak dengan jelas", async () => {
  const segarkan = buatPenyegarKehadiran({ mesin: null });
  await assert.rejects(() => segarkan(T0, MS0, null));
});

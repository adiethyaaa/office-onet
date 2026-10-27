// Roster Pokja tahap 1: identitas dari sesi/log Pokja, nama tampil
// satu kata nama depan, kelamin bawaan laki-laki, dan pemetaan
// aktor yang diturunkan dari roster yang sama. Sejak 28 Oktober
// 2026, FA adalah karyawan biasa (ACT-FA); CEO Masdit adalah
// pemain dan bukan anggota roster.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROSTER, byProfile, PRIVATE_PROFILES, PEMETAAN_AKTOR_POKJA } from '../roster.mjs';

const NAMA = {
  FA: 'Adiethya', ONET: 'Onet Aspri', KASUARI: 'Kak Suary', CM: 'Citra',
  RP: 'Rony', ER: 'Erni', NG: 'Angelina', SL: 'Sonya', MJ: 'Michael',
};

test('roster berisi sembilan entri Pokja dengan nama depan dan kelamin bawaan', () => {
  assert.deepEqual(ROSTER.map((r) => r.profile), ['FA', 'ONET', 'KASUARI', 'CM', 'RP', 'ER', 'NG', 'SL', 'MJ']);
  for (const r of ROSTER) {
    assert.equal(r.name, NAMA[r.profile]);
    assert.equal(r.gender, 'male');
    assert.equal(typeof r.lane, 'string');
    assert.equal(typeof r.badan, 'string');
  }
  assert.equal(byProfile('CM')?.name, 'Citra');
  assert.equal(byProfile('FA')?.actorId, 'ACT-FA');
  assert.equal(byProfile('FA')?.lane, 'Pengguna Pokja Mutasi');
  assert.equal(byProfile('FA')?.badan, 'POKJA');
  assert.equal(byProfile('RP')?.actorId, 'ACT-RP');
});

test('tidak ada profil Hermes yang tersisa di roster', () => {
  const hermes = ['default', 'echo', 'leo', 'enterprise', 'sipil', 'infra', 'sales', 'labs', 'perumnet', 'finance', 'legal'];
  for (const p of hermes) assert.equal(byProfile(p), null, p);
  assert.equal(byProfile('yupus'), null);
});

test('pemetaan aktor diturunkan dari roster, satu untuk setiap entri berkarakter', () => {
  assert.deepEqual(PEMETAAN_AKTOR_POKJA, {
    FA: 'ACT-FA', ONET: 'ACT-ONET', KASUARI: 'ACT-KASUARI', CM: 'ACT-CM',
    RP: 'ACT-RP', ER: 'ACT-ER', NG: 'ACT-NG', SL: 'ACT-SL', MJ: 'ACT-MJ',
  });
  for (const r of ROSTER) assert.equal(PEMETAAN_AKTOR_POKJA[r.profile], r.actorId);
});

test('profil privat lama hanya menjaga data Kanban lama, bukan anggota roster', () => {
  assert.deepEqual([...PRIVATE_PROFILES].sort(), ['wealth', 'yupus']);
  for (const r of ROSTER) assert.ok(!PRIVATE_PROFILES.has(r.profile));
});

test('server.mjs memakai pemetaan roster sebagai bawaan kedua penyegar', () => {
  const serverMjs = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'server.mjs'), 'utf8');
  assert.match(serverMjs, /PEMETAAN_AKTOR_POKJA \} from '\.\/roster\.mjs';/);
  const pakai = serverMjs.match(/pemetaanAktor: cfg\.pokjaPemetaanAktor \?\? PEMETAAN_AKTOR_POKJA/g) ?? [];
  assert.equal(pakai.length, 2);
});

// Gerbang persetujuan (PRD 17.4): perintah merusak tetap ditahan, obrolan
// dan pertanyaan yang kebetulan memuat kata "reset"/"hapus" tidak.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkMessage } from '../policy.mjs';

const destroy = (text) => checkMessage(text).risks?.some((r) => r.id === 'destroy') ?? false;
const risky = (text) => (checkMessage(text).risks?.length ?? 0) > 0;

test('gerbang hapus/reset: perintah merusak nyata tetap butuh persetujuan', () => {
  for (const t of [
    'hapus data pelanggan lama',
    'Hapus berkas di folder proyek-x',
    'tolong hapus folder backup kemarin',
    'delete the old files',
    'drop table users',
    'rm -rf ~/tmp/proyek',
    'reset database produksi',
    'reset server db-01',
    'reset port 8080 di nginx',
    'wipe disk lama',
    'format ulang laptop kantor',
    'truncate tabel log',
    'kosongkan database staging',
    'hapus semua',
    'hapus aja',
    'reset sekarang',
    'tolong reset',
    'bisa hapus database produksi?',
    'sudah, sekarang hapus repo itu',
    'factory reset router lantai 2',
    // Review kedua (Codex): bentuk yang dulu lolos.
    'Bisa hapus /srv/arsip?',
    'Kalau belum hapus database lama, lakukan sekarang.',
    'Tolong database lama di reset sekarang.',
    'hapus ~/Documents/lama',
    'tidak usah backup, hapus database',
    // Pertanyaan yang menyebut data tetap ditahan (fail-closed): "boleh?" sering berarti "lakukan".
    'Apakah aman hapus database lama?',
    // Review putaran 2.
    'jangan lupa hapus database lama',
    'database lama dihapus ya',
    'file log di server direset aja',
  ]) assert.ok(destroy(t), `harus ditahan: ${t}`);
  // Reset sandi tetap tertangkap gerbang kredensial.
  assert.ok(checkMessage('reset password akun admin').risks.some((r) => r.id === 'cred'));
});

test('gerbang hapus/reset: pertanyaan dan obrolan tidak memicu persetujuan', () => {
  for (const t of [
    'sudah di reset?',
    'sudah direset belum?',
    'apa sudah dihapus?',
    'kenapa tadi di-reset?',
    'reset sesi chat',
    'reset percakapan ini ya',
    'hapus chat yang barusan',
    'hapus filter pencarian',
    'Max, gimana caranya reset tampilan kamera?',
    'apakah perlu reset?',
    'tadi aku sudah hapus fotonya sendiri, makasih',
    'Buat poster promo',
    'Saya tidak mau hapus database ini.',
    'jangan hapus data apa pun',
    'Sudah dihapus semua datanya.',
    'tadi servernya sudah direset sama vendor',
  ]) assert.equal(risky(t), false, `tidak boleh ditahan: ${t} -> ${JSON.stringify(checkMessage(t).risks)}`);
});

test('gerbang lain tidak ikut melemah', () => {
  assert.ok(checkMessage('deploy ke produksi sekarang').risks.some((r) => r.id === 'deploy'));
  assert.ok(checkMessage('kirim penawaran ke klien').risks.some((r) => r.id === 'client'));
  assert.ok(checkMessage('ganti sandi akun admin').risks.some((r) => r.id === 'cred'));
  assert.equal(checkMessage('kartu 4111 1111 1111 1111').ok, false);
  // Kata infrastruktur pemilik lama tidak lagi menahan pesan.
  assert.equal(checkMessage('restart VM 105').risks.length, 0);
  assert.equal(checkMessage('reset ONU pelanggan Kecicang').risks.some((r) => r.id === 'destroy'), true, 'tetap ditahan gerbang hapus karena menyebut pelanggan');
});

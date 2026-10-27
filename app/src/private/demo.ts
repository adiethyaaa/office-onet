// Papan demo untuk pengunjung publik (REQ-BOARD-04): data contoh Pokja
// berlabel `Contoh`. Tidak ada judul tugas, nama berkas, nomor usulan,
// nama instansi, atau peristiwa nyata di bundle.
// Texts stay Indonesian here; panel.ts translates them at render time in demo mode.
import type { Boards } from './api';

export function DEMO_BOARDS(now: number): Boards {
  const h = 3600_000;
  return {
    observedAt: new Date(now).toISOString(),
    mode: 'demo',
    handoffs: { ok: true, source: 'data demo', items: [
      { id: 'demo-h1', project: 'Contoh Usulan KP', badan: 'POKJA', from: 'Citra', to: 'Rony', summary: 'Contoh: berkas usulan sudah diperiksa, siap diverifikasi', diminta: 'Contoh: periksa kelengkapan berkas sebelum diteruskan.', hasFile: true, status: 'Dikerjakan', createdAt: now - 5 * h, ageHours: 5, attention: false, chain: ['Citra', 'Rony', 'Erni'], chainActive: 1 },
      { id: 'demo-h2', project: 'Contoh Berkas PGA', badan: 'POKJA', from: 'Rony', to: 'Erni', summary: 'Contoh: berkas BTS menunggu perbaikan dari instansi', diminta: 'Contoh: catat kekurangan berkas dan teruskan ke instansi.', hasFile: true, status: 'Dikirim', createdAt: now - 30 * h, ageHours: 30, attention: true },
      { id: 'demo-h3', project: 'Contoh Usulan NIP', badan: 'POKJA', from: 'Erni', to: 'Sonya', summary: 'Contoh: draf penetapan sudah disiapkan', diminta: '', hasFile: true, status: 'Selesai', createdAt: now - 50 * h, ageHours: 50, attention: false },
    ] },
    tasks: { ok: true, source: 'data demo', items: [
      { id: 'demo-t1', title: 'Contoh tugas yang diblokir', owner: 'Michael', requester: 'Citra', status: 'blocked', badan: 'POKJA', createdAt: now - 3 * h, ageHours: 3, handoff: false },
      { id: 'demo-t2', title: 'Contoh verifikasi berkas', owner: 'Adiethya', requester: 'Rony', status: 'running', badan: 'POKJA', createdAt: now - 1 * h, ageHours: 1, handoff: false },
      { id: 'demo-t3', title: 'Contoh rekap harian', owner: 'Angelina', requester: 'Citra', status: 'todo', badan: 'POKJA', createdAt: now - 2 * h, ageHours: 2, handoff: true },
      { id: 'demo-t4', title: 'Contoh laporan mingguan', owner: 'Rony', requester: 'Rony', status: 'done', badan: 'POKJA', createdAt: now - 20 * h, ageHours: 20, handoff: false },
    ] },
    log: { ok: true, source: 'data demo', items: [
      { at: now - 2 * 60_000, kind: 'tool', bot: 'Adiethya', verb: 'Memeriksa berkas', object: '', taskId: null },
      { at: now - 5 * 60_000, kind: 'task', bot: 'Michael', verb: 'Tugas diblokir', object: 'Contoh tugas yang diblokir', taskId: 'demo-t1' },
      { at: now - 9 * 60_000, kind: 'tool', bot: 'Kak Suary', verb: 'Melihat ringkasan', object: '', taskId: null },
      { at: now - 14 * 60_000, kind: 'task', bot: 'Adiethya', verb: 'Mengambil tugas', object: 'Contoh verifikasi berkas', taskId: 'demo-t2' },
    ] },
  };
}

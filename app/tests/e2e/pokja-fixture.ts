// Data Pokja buatan untuk spek e2e: ringkasan harian, sesi, dan log audit,
// dengan stempel waktu relatif terhadap jam tes (WIT, tanpa zona).
// Dipakai sebagai `pokjaFetch` suntikan di createServer; tidak ada akses
// jaringan, database, atau rumah Hermes.

/** Format `YYYY-MM-DD HH:MM:SS` dalam zona WIT (+09:00) untuk waktu epoch `ms`. */
export function jamWit(ms: number): string {
  return new Date(ms + 9 * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
}

type FetchPokja = (url: string, opts?: unknown) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/**
 * Fetch palsu yang menjawab tiga bentuk JSON Pokja dari jam tes:
 * ringkasan (tanpa `action`), `?action=sessions`, dan
 * `?action=audit_logs`. `now` adalah jam server tes (Date.now() +
 * clockOffset), supaya sesi/log selalu "hari ini" dan tidak di masa depan.
 */
export function buatFetchPokja(now: () => number): FetchPokja {
  return async (url: string) => {
    const u = new URL(url);
    const t = now();
    const menit = (m: number) => jamWit(t - m * 60_000);
    const jawab = (data: unknown) => ({ ok: true, status: 200, json: async () => data });
    if (u.searchParams.get('action') === 'sessions') {
      return jawab({
        total: 4,
        waktu_cek: menit(0),
        sessions: [
          { id: 1, session_id: 's-er', user_uid: 'u-er', id_inisial: 'ER', inisial: 'ER', user_nama: 'ERNI', nama: 'ERNI', role: 'user', login_at: menit(12), login_time: menit(12), last_active_at: menit(1), last_active: menit(1), logout_at: null, logout_time: null, status: 'active' },
          { id: 2, session_id: 's-mj', user_uid: 'u-mj', id_inisial: 'MJ', inisial: 'MJ', user_nama: 'MICHAEL', nama: 'MICHAEL', role: 'user', login_at: menit(40), login_time: menit(40), last_active_at: menit(3), last_active: menit(3), logout_at: null, logout_time: null, status: 'active' },
          { id: 3, session_id: 's-sl', user_uid: 'u-sl', id_inisial: 'SL', inisial: 'SL', user_nama: 'SONYA LESTIANA', nama: 'SONYA LESTIANA', role: 'user', login_at: menit(90), login_time: menit(90), last_active_at: menit(30), last_active: menit(30), logout_at: null, logout_time: null, status: 'active' },
          { id: 4, session_id: 's-cm', user_uid: 'u-cm', id_inisial: 'CM', inisial: 'CM', user_nama: 'CITRA', nama: 'CITRA', role: 'user', login_at: menit(60), login_time: menit(60), last_active_at: menit(25), last_active: menit(25), logout_at: menit(20), logout_time: menit(20), status: 'logged_out' },
        ],
      });
    }
    if (u.searchParams.get('action') === 'audit_logs') {
      return jawab({
        total: 4,
        waktu_cek: menit(0),
        logs: [
          { id: 1, session_id: 's-er', user_uid: 'u-er', id_inisial: 'ER', inisial: 'ER', user_nama: 'ERNI', nama: 'ERNI', module_name: 'PGA', module: 'PGA', action_type: 'BUTTON_CLICK', action: 'BUTTON_CLICK', created_at: menit(2) },
          { id: 2, session_id: 's-er', user_uid: 'u-er', id_inisial: 'ER', inisial: 'ER', user_nama: 'ERNI', nama: 'ERNI', module_name: 'KP', module: 'KP', action_type: 'NAV_MENU', action: 'NAV_MENU', created_at: menit(5) },
          { id: 3, session_id: 's-er', user_uid: 'u-er', id_inisial: 'ER', inisial: 'ER', user_nama: 'ERNI', nama: 'ERNI', module_name: 'AUTH', module: 'AUTH', action_type: 'LOGIN', action: 'LOGIN', created_at: menit(12) },
          { id: 4, session_id: 's-cm', user_uid: 'u-cm', id_inisial: 'CM', inisial: 'CM', user_nama: 'CITRA', nama: 'CITRA', module_name: 'AUTH', module: 'AUTH', action_type: 'LOGOUT', action: 'LOGOUT', created_at: menit(20) },
        ],
      });
    }
    return jawab({
      judul_laporan: 'Laporan E2E',
      periode_teks: 'hari ini',
      waktu_update: menit(0),
      is_range: false,
      rekap_per_layanan: {
        PGA: { perubahan_user: [{ user: 'CM', ms: 3, bts: 1, tms: 0, total: 4 }, { user: 'ER', ms: 2, bts: 0, tms: 0, total: 2 }] },
        PI: { perubahan_user: [] },
        KP: { perubahan_user: [{ user: 'RP', ms: 4, bts: 1, tms: 0, total: 5 }, { user: 'ER', ms: 1, bts: 0, tms: 0, total: 1 }] },
        CASN: { perubahan_user: [] },
        SDP: { perubahan_user: [{ user: 'SL', ms: 1, bts: 0, tms: 0, total: 1 }] },
      },
    });
  };
}

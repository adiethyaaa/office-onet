// [POKJA-CHAT] Perintah gaya Telegram dari chat game, dijalankan server
// sendiri dan TIDAK pernah diteruskan ke agen. Perintah Pokja
// (/laporan, /rekap, /sesi, /online, /audit, /ping) baca-saja dan
// dijawab langsung dari API Pokja; /new, /stop, /status, /help
// mengatur percakapan. Tidak ada lagi /telegram: sinkronisasi Telegram
// dihapus bersama telegram.mjs, dan percakapan selalu jalur RPG.
import { jawabPerintahPokja } from './pokja-chat.mjs';

export const COMMANDS = [
  { name: 'new', help: 'Mulai percakapan baru' },
  { name: 'stop', help: 'Hentikan tugas yang sedang berjalan' },
  { name: 'status', help: 'Tugas berjalan di percakapan ini' },
  { name: 'help', help: 'Daftar perintah' },
  { name: 'laporan', help: 'Ringkasan Pokja hari ini' },
  { name: 'rekap', help: 'Rekap beberapa hari: /rekap [dari] [sampai]' },
  { name: 'sesi', help: 'Sesi login Pokja hari ini' },
  { name: 'online', help: 'Siapa yang sedang online di Pokja' },
  { name: 'audit', help: 'Aktivitas terakhir: /audit [INISIAL]' },
  { name: 'ping', help: 'Periksa chat Pokja aktif' },
];

const PERINTAH_POKJA = new Set(['laporan', 'rekap', 'sesi', 'online', 'audit', 'ping']);

/**
 * `/word` or `/word@bot` as the first token, like Telegram. A path such as
 * "/Users/x/denah.dwg" is not a command (second slash in the token).
 */
export function parseCommand(text) {
  const m = /^\/([a-z][a-z0-9_]{0,31})(?:@[\w]{1,64})?(?=\s|$)([\s\S]*)$/i.exec(String(text ?? '').trim());
  return m ? { name: m[1].toLowerCase(), args: m[2].trim() } : null;
}

/**
 * Runs one command for conversation `conv`. Returns a structured result the
 * browser renders in its own language; `conversation` is the id to show next.
 * Async karena perintah Pokja mengambil data; hasilnya tetap disimpan
 * lewat command_runs seperti perintah lain, jadi percobaan ulang memakai
 * jawaban pertama dan tidak menarik ulang.
 */
export async function runCommand(cmd, conv, { q, dispatcher, createConversation, setFront, now, terminal, penarik = null }) {
  const known = COMMANDS.some((c) => c.name === cmd.name);
  if (!known) return { kind: 'unknown', name: cmd.name, commands: COMMANDS, conversation: conv.id };
  if (cmd.name === 'help') return { kind: 'help', commands: COMMANDS, conversation: conv.id };

  if (cmd.name === 'stop') {
    const open = q('select id,status from tasks where conversation_id=? order by created_at').all(conv.id).filter((t) => !terminal.has(t.status));
    let stopped = 0;
    for (const t of open) if (!dispatcher.cancel(t.id).error) stopped += 1;
    return { kind: 'stop', stopped, telegram: false, conversation: conv.id };
  }

  if (cmd.name === 'status') {
    const tasks = q('select status, count(*) n from tasks where conversation_id=? group by status').all(conv.id)
      .filter((r) => !terminal.has(r.status) || r.status === 'waiting_owner')
      .map((r) => ({ status: r.status, n: r.n }));
    return {
      kind: 'status', conversation: conv.id, profile: conv.profile,
      channel: 'rpg',
      session: null, telegramSession: null,
      model: null, tasks,
      running: !!dispatcher.running.get(conv.profile),
    };
  }

  if (PERINTAH_POKJA.has(cmd.name)) {
    const hasil = await jawabPerintahPokja({ nama: cmd.name, args: cmd.args, penarik, sekarangMs: now() });
    return { ...hasil, conversation: conv.id };
  }

  // /new
  const busy = q("select count(*) n from tasks where conversation_id=? and status in ('queued','working','blocked')").get(conv.id).n;
  const id = createConversation(conv.profile, 'rpg', 0);
  return { kind: 'new', fromTelegram: false, telegramAvailable: false, stillRunning: busy, conversation: id };
}

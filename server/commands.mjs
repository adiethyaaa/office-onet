// Perintah gaya Telegram dari chat game (/new, /stop, /status, /help, /telegram).
// Dijalankan server sendiri dan TIDAK pernah diteruskan ke agen: dulu "/new"
// yang diketik di RPG masuk ke LLM sebagai teks biasa.
//
// /new pada chat yang terikat Telegram: Hermes belum punya jalur resmi
// non-interaktif untuk merotasi sesi gateway Telegram dari proses lain
// (rotasi hanya lewat pesan /new yang masuk ke gateway itu sendiri, dan
// sessions.json/state.db milik gateway tidak boleh disunting dari luar).
// Maka /new membuka percakapan khusus RPG yang baru (sesi Hermes baru) dan
// mengatakannya terus terang; /telegram kembali ke chat Telegram.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { profileHome } from './telegram.mjs';

export const COMMANDS = [
  { name: 'new', help: 'Mulai percakapan baru' },
  { name: 'stop', help: 'Hentikan tugas yang sedang berjalan' },
  { name: 'status', help: 'Sesi, model, dan tugas berjalan' },
  { name: 'telegram', help: 'Kembali ke chat Telegram bot ini' },
  { name: 'help', help: 'Daftar perintah' },
];

/**
 * `/word` or `/word@bot` as the first token, like Telegram. A path such as
 * "/Users/x/denah.dwg" is not a command (second slash in the token).
 */
export function parseCommand(text) {
  const m = /^\/([a-z][a-z0-9_]{0,31})(?:@[\w]{1,64})?(?=\s|$)([\s\S]*)$/i.exec(String(text ?? '').trim());
  return m ? { name: m[1].toLowerCase(), args: m[2].trim() } : null;
}

/** Model of a Hermes session (state.db row), else the profile's configured default. */
export function modelFor(home, profile, sessionId) {
  const dir = profileHome(home, profile);
  if (sessionId && /^[\w:.-]{1,80}$/.test(sessionId)) {
    try {
      const out = execFileSync('sqlite3', ['-readonly', '-json', path.join(dir, 'state.db'), `select model from sessions where id='${sessionId}'`], { timeout: 4000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      const model = out ? JSON.parse(out)[0]?.model : null;
      if (model) return String(model);
    } catch { /* fall back to config */ }
  }
  try {
    const cfg = fs.readFileSync(path.join(dir, 'config.yaml'), 'utf8');
    return /^model:\s*\n(?:[ \t]+.*\n)*?[ \t]+default:\s*['"]?([^'"\n]+)/m.exec(cfg)?.[1]?.trim() ?? null;
  } catch { return null; }
}

/**
 * Runs one command for conversation `conv`. Returns a structured result the
 * browser renders in its own language; `conversation` is the id to show next.
 */
export function runCommand(cmd, conv, { q, dispatcher, tgSession, createConversation, setFront, home, now, terminal }) {
  const known = COMMANDS.some((c) => c.name === cmd.name);
  if (!known) return { kind: 'unknown', name: cmd.name, commands: COMMANDS, conversation: conv.id };
  if (cmd.name === 'help') return { kind: 'help', commands: COMMANDS, conversation: conv.id };

  if (cmd.name === 'stop') {
    const open = q('select id,status from tasks where conversation_id=? order by created_at').all(conv.id).filter((t) => !terminal.has(t.status));
    let stopped = 0;
    for (const t of open) if (!dispatcher.cancel(t.id).error) stopped += 1;
    return { kind: 'stop', stopped, telegram: conv.channel === 'telegram', conversation: conv.id };
  }

  const tgSid = tgSession(conv.profile);
  if (cmd.name === 'status') {
    const session = conv.channel === 'telegram' ? tgSid : conv.hermes_session;
    const tasks = q('select status, count(*) n from tasks where conversation_id=? group by status').all(conv.id)
      .filter((r) => !terminal.has(r.status) || r.status === 'waiting_owner')
      .map((r) => ({ status: r.status, n: r.n }));
    return {
      kind: 'status', conversation: conv.id, profile: conv.profile,
      channel: conv.channel === 'telegram' ? 'telegram' : conv.detached ? 'rpg-detached' : 'rpg',
      session: session ?? null, telegramSession: tgSid ?? null,
      model: modelFor(home, conv.profile, session), tasks,
      running: !!dispatcher.running.get(conv.profile),
    };
  }

  if (cmd.name === 'telegram') {
    if (!tgSid) return { kind: 'telegram', ok: false, conversation: conv.id };
    let tg = q("select id from conversations where profile=? and channel='telegram' order by updated_at desc limit 1").get(conv.profile);
    if (!tg) tg = { id: createConversation(conv.profile, 'telegram', 0) };
    setFront(conv.profile, tg.id);
    return { kind: 'telegram', ok: true, conversation: tg.id };
  }

  // /new
  const busy = q("select count(*) n from tasks where conversation_id=? and status in ('queued','working','blocked')").get(conv.id).n;
  const fromTelegram = conv.channel === 'telegram';
  // Detached: an RPG-only chat opened from a Telegram-bound one; it stays the
  // bot's chat in the game until /telegram, so reopening the game keeps it.
  const id = createConversation(conv.profile, 'rpg', tgSid ? 1 : 0);
  return { kind: 'new', fromTelegram, telegramAvailable: !!tgSid, stillRunning: busy, conversation: id };
}

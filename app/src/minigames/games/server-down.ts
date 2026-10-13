// Server Down (rack_42u, L1-SERVER). Incident tickets arrive one after another:
// a patch cord fell out or sits in the wrong switch port, so a service is down.
// The player picks the cord on the patch panel and plugs it into the switch
// port named on the ticket. Labels come from the real ICT port map.
import type { GameCtx, GameInstance, GameModule } from '../types';
import { PAL, drawChar, roundRect, text } from '../cast';
import portmapJson from '@design/derived/ict-portmap.json';

export interface PortCable { outletPort: string; room: string; rack: string; patchPanel: string; ppPort: number; switch: string; switchPort: number }
export const PORTMAP = portmapJson as unknown as { cables: PortCable[]; switches: { switch: string; ports: number }[] };

const SESSION = 90;
const TICKET_TIME = 25;
const MAX_ACTIVE = 3;
const PP_N = 8;
const SW_MIN = 12;
const CORD = ['#3c6e91', '#d9a441', '#6f9a58', '#a34a27', '#7a5c99', '#2f8f8a', '#c46a8a', '#8a6d3b'];

/** A window of 8 consecutive cords that share one patch panel and one switch. */
export function pickRack(rand: () => number): { pp: PortCable[]; swPorts: number[] } {
  const groups = new Map<string, PortCable[]>();
  for (const c of PORTMAP.cables) {
    const k = `${c.patchPanel}|${c.switch}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(c);
  }
  const big = [...groups.values()].filter((gr) => gr.length >= PP_N).map((gr) => [...gr].sort((a, b) => a.ppPort - b.ppPort));
  const grp = big[Math.floor(rand() * big.length)];
  const start = Math.floor(rand() * (grp.length - PP_N + 1));
  const pp = grp.slice(start, start + PP_N);
  const used = pp.map((c) => c.switchPort);
  const lo = Math.min(...used), hi = Math.max(...used);
  const span = hi - lo + 1;
  const n = Math.max(SW_MIN, span);
  const total = PORTMAP.switches.find((s) => s.switch === pp[0].switch)?.ports ?? 48;
  let first = Math.max(1, lo - Math.floor((n - span) / 2));
  if (first + n - 1 > total) first = Math.max(1, total - n + 1);
  return { pp, swPorts: Array.from({ length: n }, (_, i) => first + i) };
}

const meta: GameModule['meta'] = {
  id: 'server-down', title: 'Server Down', place: 'rack_42u', music: 'puzzle',
  blurb: 'Tiket insiden masuk bergiliran. Pindahkan kabel patch ke port switch yang benar sebelum SLA habis.',
  controls: ['Kiri/kanan: pilih port, atas/bawah: patch panel atau switch', 'A: ambil kabel, A lagi: tancapkan', 'B: lepas kabel yang dipegang'],
  view: { w: 640, h: 400 }, score: { unit: 'poin', higherIsBetter: true }, touch: ['left', 'right', 'up', 'down', 'a', 'b'],
};

interface Ticket { n: number; idx: number; kind: 'unplug' | 'wrong'; left: number }

function create(ctx: GameCtx): GameInstance {
  const { g, w, h } = ctx;
  const { pp, swPorts } = pickRack(() => ctx.rand());
  const plug: (number | null)[] = pp.map((c) => c.switchPort);
  const tickets: Ticket[] = [];
  let ticketNo = 0;
  let time = 0;
  let spawnT = 1;
  let closed = 0, violations = 0, wrong = 0, bonus = 0;
  let held: number | null = null;
  const cur = { row: 0, col: 0 };
  let msg = ctx.t('Menunggu tiket insiden...');
  let msgBad = false;
  let msgT = 3;
  let ended = false;
  let anim = 0;
  const bruno = ctx.cast.find((c) => c.id === 'CH-NETINSTALL') ?? ctx.cast[0];

  const score = () => Math.max(0, closed * 100 + bonus - violations * 50);
  const hud = () => ctx.setHud(ctx.t('Selesai {c} · SLA {v}', { c: closed, v: violations }));
  const say = (s: string, bad = false) => { msg = s; msgBad = bad; msgT = 2.5; };
  const ticketOf = (idx: number) => tickets.find((t) => t.idx === idx);

  // geometry, shared by render and tap hit-test
  const RX = 236, RW = 392;
  const PPY = 86, SWY = 252;
  const ppX = (i: number) => RX + 34 + (i + 0.5) * ((RW - 68) / PP_N);
  const swX = (i: number) => RX + 34 + (i + 0.5) * ((RW - 68) / swPorts.length);

  function spawn() {
    const free = pp.map((_, i) => i).filter((i) => !ticketOf(i) && held !== i);
    if (!free.length) return;
    const idx = free[Math.floor(ctx.rand() * free.length)];
    const decoys = swPorts.filter((p) => !plug.includes(p));
    let kind: Ticket['kind'] = ctx.rand() < 0.5 ? 'unplug' : 'wrong';
    if (kind === 'wrong' && decoys.length) plug[idx] = decoys[Math.floor(ctx.rand() * decoys.length)];
    else { kind = 'unplug'; plug[idx] = null; }
    tickets.push({ n: ++ticketNo, idx, kind, left: TICKET_TIME });
    ctx.sfx('alarm');
    say(ctx.t('Tiket baru: layanan {o} mati', { o: pp[idx].outletPort }), true);
  }

  function finish() {
    if (ended) return;
    ended = true;
    ctx.end({ score: score(), summary: ctx.t('{c} tiket selesai, {v} SLA dilanggar', { c: closed, v: violations }), won: closed > 0 && violations === 0 });
  }

  function press() {
    if (cur.row === 0) {
      if (held === cur.col) { held = null; say(ctx.t('Kabel dilepas')); ctx.sfx('back'); return; }
      if (!ticketOf(cur.col)) { say(ctx.t('Port ini normal, cek tiket')); ctx.sfx('ui'); return; }
      held = cur.col;
      plug[cur.col] = null;
      ctx.sfx('click');
      cur.row = 1;
      cur.col = Math.min(swPorts.length - 1, Math.max(0, Math.round(((cur.col + 0.5) / PP_N) * swPorts.length - 0.5)));
      say(ctx.t('Pilih port switch untuk {o}', { o: pp[held].outletPort }));
      return;
    }
    if (held === null) { say(ctx.t('Ambil kabel dulu di patch panel'), true); ctx.sfx('ui'); return; }
    const port = swPorts[cur.col];
    if (plug.some((p, i) => p === port && i !== held)) { say(ctx.t('Port {p} sedang dipakai', { p: port }), true); ctx.sfx('wrong'); return; }
    if (port !== pp[held].switchPort) {
      wrong++;
      say(ctx.t('Port {p} salah! Cek label tiket', { p: port }), true);
      ctx.sfx('wrong');
      return;
    }
    plug[held] = port;
    const t = ticketOf(held)!;
    tickets.splice(tickets.indexOf(t), 1);
    closed++;
    bonus += Math.round(t.left * 4);
    say(ctx.t('Tiket #{n} selesai, layanan pulih', { n: t.n }));
    ctx.sfx('connect');
    cur.row = 0;
    cur.col = held;
    held = null;
    hud();
  }

  hud();

  return {
    update(dt, inp) {
      if (ended) return;
      time += dt;
      anim += dt;
      msgT -= dt;
      if (time >= SESSION) { hud(); finish(); return; }
      spawnT -= dt;
      if (spawnT <= 0) {
        if (tickets.length < MAX_ACTIVE) { spawn(); spawnT = 7 + ctx.rand() * 5; } else spawnT = 1;
      }
      for (const t of [...tickets]) {
        t.left -= dt;
        if (t.left <= 0) {
          violations++;
          tickets.splice(tickets.indexOf(t), 1);
          // the on-call team fixes it late; the port goes back so it can fail again
          plug[t.idx] = pp[t.idx].switchPort;
          if (held === t.idx) held = null;
          say(ctx.t('Tiket #{n} kedaluwarsa, SLA terlanggar', { n: t.n }), true);
          ctx.sfx('hurt');
          hud();
        }
      }
      const n = cur.row === 0 ? PP_N : swPorts.length;
      if (inp.hit.left) { cur.col = (cur.col - 1 + n) % n; ctx.sfx('tick'); }
      if (inp.hit.right) { cur.col = (cur.col + 1) % n; ctx.sfx('tick'); }
      if (inp.hit.up || inp.hit.down) {
        const to = inp.hit.up ? 0 : 1;
        if (to !== cur.row) {
          const frac = (cur.col + 0.5) / n;
          cur.row = to;
          const m = to === 0 ? PP_N : swPorts.length;
          cur.col = Math.min(m - 1, Math.max(0, Math.round(frac * m - 0.5)));
          ctx.sfx('tick');
        }
      }
      if (inp.hit.b && held !== null) { held = null; say(ctx.t('Kabel dilepas')); ctx.sfx('back'); }
      if (inp.tap) {
        const { x, y } = inp.tap;
        if (Math.abs(y - PPY) < 34) { for (let i = 0; i < PP_N; i++) if (Math.abs(x - ppX(i)) < 20) { cur.row = 0; cur.col = i; press(); break; } }
        else if (Math.abs(y - SWY) < 26) { for (let i = 0; i < swPorts.length; i++) if (Math.abs(x - swX(i)) < 13) { cur.row = 1; cur.col = i; press(); break; } }
      } else if (inp.hit.a) press();
    },
    render() {
      g.fillStyle = PAL.bg;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#e4d6bb';
      g.fillRect(0, h - 30, w, 30);

      text(g, ctx.t('Tiket insiden'), 16, 22, 17, PAL.ink, 'left');
      text(g, ctx.t('{s} dtk', { s: Math.max(0, Math.ceil(SESSION - time)) }), 214, 22, 17, SESSION - time < 15 ? PAL.red : PAL.ink2, 'right');
      if (!tickets.length) text(g, ctx.t('Semua layanan normal'), 113, 70, 14, PAL.green);
      tickets.forEach((t, i) => {
        const y = 40 + i * 76;
        const c = pp[t.idx];
        g.fillStyle = held === t.idx ? '#fff3d6' : PAL.surface;
        roundRect(g, 10, y, 206, 68, 8);
        g.fillStyle = PAL.red;
        g.fillRect(10, y + 8, 4, 52);
        text(g, `#${t.n} ${c.outletPort}`, 22, y + 14, 14, PAL.ink, 'left');
        text(g, ctx.t('ke {sw} port {p}', { sw: c.switch, p: c.switchPort }), 22, y + 31, 13, PAL.accent, 'left');
        text(g, t.kind === 'unplug' ? ctx.t('Kabel tercabut') : ctx.t('Salah port'), 22, y + 46, 11, PAL.ink2, 'left', 400);
        g.fillStyle = 'rgba(29,42,35,0.15)';
        g.fillRect(22, y + 56, 184, 5);
        g.fillStyle = t.left < 8 ? PAL.red : PAL.green;
        g.fillRect(22, y + 56, 184 * Math.max(0, t.left / TICKET_TIME), 5);
      });
      drawChar(g, bruno, 40, h - 6, 70, 1, held !== null ? 'special' : 'idle', anim);
      text(g, ctx.t('Bruno: label tiket = port switch'), 78, h - 15, 12, PAL.ink, 'left');

      // rack
      g.fillStyle = '#2a2d31';
      roundRect(g, RX, 8, RW, 356, 8);
      g.fillStyle = '#3a3e44';
      g.fillRect(RX + 10, 18, 14, 336);
      g.fillRect(RX + RW - 24, 18, 14, 336);
      g.fillStyle = '#1b1d20';
      for (let y = 22; y < 350; y += 9) { g.fillRect(RX + 15, y, 4, 3); g.fillRect(RX + RW - 19, y, 4, 3); }
      text(g, `${pp[0].rack} / ${pp[0].patchPanel}`, RX + 34, 30, 12, '#e9e2d0', 'left');
      text(g, ctx.t('Patch panel'), RX + RW - 30, 30, 11, '#cfc8b8', 'right', 400);
      g.fillStyle = '#d8d4cb';
      roundRect(g, RX + 30, PPY - 36, RW - 60, 66, 4);
      for (let k = 0; k < 3; k++) {
        const y = 150 + k * 17;
        g.fillStyle = '#41464d';
        g.fillRect(RX + 30, y, RW - 60, 13);
        g.fillStyle = Math.floor(anim * 2 + k) % 3 === 0 && !ctx.reducedMotion ? '#9be37a' : '#4f8f3f';
        g.fillRect(RX + RW - 50, y + 5, 5, 4);
      }
      g.fillStyle = '#20242a';
      roundRect(g, RX + 30, SWY - 24, RW - 60, 50, 4);
      g.strokeStyle = '#5a6068';
      g.lineWidth = 1;
      g.strokeRect(RX + 30.5, SWY - 23.5, RW - 61, 49);

      for (let i = 0; i < PP_N; i++) {
        const x = ppX(i);
        const down = !!ticketOf(i);
        text(g, String(pp[i].ppPort).padStart(2, '0'), x, PPY - 27, 10, PAL.ink);
        text(g, pp[i].outletPort.replace(/^TO-/, ''), x, PPY - 15, 9, PAL.ink);
        g.fillStyle = '#1c1c1c';
        g.fillRect(x - 10, PPY - 6, 20, 16);
        g.fillStyle = down ? (Math.floor(anim * 3) % 2 && !ctx.reducedMotion ? '#ff6a4d' : PAL.red) : '#3fae4f';
        g.beginPath(); g.arc(x + 14, PPY + 2, 3.5, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < swPorts.length; i++) {
        const x = swX(i);
        g.fillStyle = '#0d0e10';
        g.fillRect(x - 8, SWY - 6, 16, 13);
        g.fillStyle = plug.includes(swPorts[i]) ? '#4fd36a' : '#3a3e44';
        g.fillRect(x + 4, SWY - 14, 4, 3);
      }
      g.lineWidth = 4;
      g.lineCap = 'round';
      for (let i = 0; i < PP_N; i++) {
        const x0 = ppX(i), y0 = PPY + 8;
        g.strokeStyle = CORD[i % CORD.length];
        g.beginPath();
        g.moveTo(x0, y0);
        if (held === i) {
          const tx = cur.row === 0 ? ppX(cur.col) : swX(cur.col);
          const ty = cur.row === 0 ? PPY + 46 : SWY - 30;
          g.bezierCurveTo(x0, y0 + 60, tx, ty - 40, tx, ty);
        } else if (plug[i] === null) {
          const sway = ctx.reducedMotion ? 0 : Math.sin(anim * 2 + i) * 3;
          g.bezierCurveTo(x0, y0 + 30, x0 + 10 + sway, y0 + 40, x0 + 6 + sway, y0 + 52);
        } else {
          const x1 = swX(swPorts.indexOf(plug[i]!)), y1 = SWY;
          g.bezierCurveTo(x0, y0 + 70, x1, y1 - 70, x1, y1);
        }
        g.stroke();
      }
      // switch labels go on top of the cords so they stay readable
      g.fillStyle = '#2a2d31';
      g.fillRect(RX + 30, SWY + 30, RW - 60, 22);
      text(g, `${pp[0].switch} · ${ctx.t('Switch akses')}`, RX + 34, SWY + 41, 12, '#e9e2d0', 'left');
      for (let i = 0; i < swPorts.length; i++) text(g, String(swPorts[i]), swX(i), SWY + 19, 10, '#e9e2d0');
      g.strokeStyle = PAL.gold;
      g.lineWidth = 3;
      if (cur.row === 0) g.strokeRect(ppX(cur.col) - 19, PPY - 34, 38, 50);
      else g.strokeRect(swX(cur.col) - 12, SWY - 20, 24, 48);

      g.fillStyle = msgBad ? '#f6d9cf' : '#e6efe0';
      roundRect(g, RX + 30, 320, RW - 60, 32, 6);
      text(g, msgT > 0 || held !== null ? msg : ctx.t('Panah: pilih port · A: ambil/tancap'), RX + RW / 2, 336, 13, msgBad ? PAL.red : PAL.green);
    },
    snapshot: () => ({
      time: Math.round(time * 100) / 100,
      closed, violations, wrong, bonus, score: score(), ended, held,
      cursor: { ...cur },
      pp: pp.map((c) => ({ outlet: c.outletPort, pp: `${c.patchPanel}-${c.ppPort}`, sw: c.switch, port: c.switchPort })),
      swPorts: [...swPorts],
      plug: [...plug],
      tickets: tickets.map((t) => ({ n: t.n, idx: t.idx, kind: t.kind, left: Math.round(t.left * 100) / 100, outlet: pp[t.idx].outletPort, sw: pp[t.idx].switch, want: pp[t.idx].switchPort })),
    }),
  };
}

export default { meta, create } satisfies GameModule;

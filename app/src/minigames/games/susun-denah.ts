// Susun Denah (drafting_table, Studio Hugo). Floor plan puzzle: rooms from
// world.json are snapped to a coarse 1.5 m grid, a handful of them is cut out
// of the plan and the player puts each piece back into its place. Three plans
// per session, 60 s each.
import type { GameCtx, GameInstance, GameModule } from '../types';
import { PAL, drawChar, roundRect, text } from '../cast';
import worldJson from '@design/world.json';

export const CELL_M = 1.5;
const PLANS = 3;
const PLAN_TIME = 60;
const PIECES = 7;
const MAX_W = 12;

interface WorldRoom { id: string; floor: string; name: string; polygon: number[][] }
const WORLD = worldJson as unknown as { floors: { id: string; level: number; envelope: number[][] }[]; rooms: WorldRoom[] };

export interface RoomCell { id: string; floor: string; name: string; x: number; y: number; w: number; h: number }

/** Room bounding boxes on the coarse grid. Rounding is monotonic, so rooms that tile in metres still tile in cells. */
export function roomCells(floor: string): RoomCell[] {
  return WORLD.rooms.filter((r) => r.floor === floor).map((r) => {
    const xs = r.polygon.map((p) => p[0]), ys = r.polygon.map((p) => p[1]);
    const x0 = Math.round(Math.min(...xs) / CELL_M), x1 = Math.round(Math.max(...xs) / CELL_M);
    const y0 = Math.round(Math.min(...ys) / CELL_M), y1 = Math.round(Math.max(...ys) / CELL_M);
    return { id: r.id, floor: r.floor, name: r.name, x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }).filter((c) => c.w > 0 && c.h > 0);
}

export function floorCells(floor: string) {
  const env = WORLD.floors.find((f) => f.id === floor)!.envelope;
  return { w: Math.round(Math.max(...env.map((p) => p[0])) / CELL_M), h: Math.round(Math.max(...env.map((p) => p[1])) / CELL_M) };
}

const meta: GameModule['meta'] = {
  id: 'susun-denah', title: 'Susun Denah', place: 'drafting_table', music: 'puzzle',
  blurb: 'Potongan ruang lepas dari denah kantor. Kembalikan tiap ruang ke tempatnya sebelum waktu habis.',
  controls: ['Panah atau D-pad: pilih potongan, lalu geser', 'A: ambil potongan, A lagi: taruh', 'B: kembalikan potongan ke baki', 'Ketuk potongan, lalu ketuk posisinya di denah'],
  view: { w: 640, h: 400 }, score: { unit: 'poin', higherIsBetter: true }, touch: ['left', 'right', 'up', 'down', 'a', 'b'],
};

interface Piece extends RoomCell { placed: boolean; tx: number; ty: number }

function create(ctx: GameCtx): GameInstance {
  const { g, w, h } = ctx;
  const used = new Set<string>();
  let planNo = 0;
  let floor = 'L1';
  let fw = 21, fh = 16;
  let context: RoomCell[] = [];
  let pieces: Piece[] = [];
  let left = PLAN_TIME;
  let sel = 0;
  let holding = false;
  const pos = { x: 0, y: 0 };
  let placedTotal = 0, timeBonus = 0, wrong = 0, plansDone = 0;
  let msg = '';
  let msgBad = false;
  let msgT = 0;
  let pause = 0;
  let ended = false;
  let anim = 0;
  const hugo = ctx.cast.find((c) => c.id === 'CH-ARCHITECT') ?? ctx.cast[0];

  // layout
  const FX = 14, FY = 70, CP = 14;
  const TX = 330, TY = 44, TW = 298, TH = 344;
  let tscale = 1;

  const say = (s: string, bad = false) => { msg = s; msgBad = bad; msgT = 2.2; };
  const score = () => placedTotal * 50 + timeBonus;
  const hud = () => ctx.setHud(ctx.t('Denah {n}/{m} · {p} poin', { n: Math.min(planNo, PLANS), m: PLANS, p: score() }));
  const open = () => pieces.filter((p) => !p.placed);

  function layoutTray() {
    // shelf packing; shrink the tray scale until everything fits
    for (tscale = 1; tscale > 0.4; tscale -= 0.05) {
      let x = 0, y = 0, row = 0, ok = true;
      const sorted = [...pieces].sort((a, b) => b.h - a.h || b.w - a.w || a.id.localeCompare(b.id));
      for (const p of sorted) {
        const pw = p.w * CP * tscale, ph = p.h * CP * tscale;
        if (x + pw > TW - 16) { x = 0; y += row + 8; row = 0; }
        if (y + ph > TH - 40) { ok = false; break; }
        p.tx = TX + 8 + x; p.ty = TY + 32 + y;
        x += pw + 8; row = Math.max(row, ph);
      }
      if (ok) return;
    }
  }

  function nextPlan() {
    planNo++;
    floor = planNo === 1 ? 'L1' : planNo === 2 ? 'L2' : ctx.rand() < 0.5 ? 'L1' : 'L2';
    ({ w: fw, h: fh } = floorCells(floor));
    const all = roomCells(floor);
    const cand = all.filter((r) => r.w <= MAX_W && r.w * r.h >= 2);
    const fresh = cand.filter((r) => !used.has(r.id));
    const pool = fresh.length >= PIECES ? fresh : [...fresh, ...cand.filter((r) => used.has(r.id))];
    const chosen: RoomCell[] = [];
    const bag = fresh.length >= PIECES ? [...pool] : [...fresh];
    while (chosen.length < PIECES && bag.length) chosen.push(bag.splice(Math.floor(ctx.rand() * bag.length), 1)[0]);
    const rest = pool.filter((r) => !chosen.includes(r));
    while (chosen.length < PIECES && rest.length) chosen.push(rest.splice(Math.floor(ctx.rand() * rest.length), 1)[0]);
    chosen.forEach((r) => used.add(r.id));
    pieces = chosen.map((r) => ({ ...r, placed: false, tx: 0, ty: 0 }));
    context = all.filter((r) => !chosen.some((c) => c.id === r.id));
    layoutTray();
    left = PLAN_TIME;
    sel = 0;
    holding = false;
    say(ctx.t('Denah {n}: susun {k} ruang', { n: planNo, k: pieces.length }));
    hud();
  }

  function finish(won: boolean) {
    if (ended) return;
    ended = true;
    hud();
    ctx.end({ score: score(), won, summary: won ? ctx.t('{d} denah selesai, {p} potongan pas', { d: plansDone, p: placedTotal }) : ctx.t('Waktu habis di denah {n}, {p} potongan pas', { n: planNo, p: placedTotal }) });
  }

  function pick(i: number) {
    sel = i;
    holding = true;
    const p = open()[i];
    pos.x = Math.max(0, Math.min(fw - p.w, Math.floor((fw - p.w) / 2)));
    pos.y = Math.max(0, Math.min(fh - p.h, Math.floor((fh - p.h) / 2)));
    ctx.sfx('click');
  }

  function drop() {
    const p = open()[sel];
    if (!p) return;
    if (pos.x === p.x && pos.y === p.y) {
      p.placed = true;
      placedTotal++;
      holding = false;
      ctx.sfx('connect');
      say(ctx.t('Pas!'));
      sel = 0;
      if (!open().length) {
        plansDone++;
        timeBonus += Math.floor(left);
        ctx.sfx('right');
        say(ctx.t('Denah {n} selesai! Bonus waktu {s}', { n: planNo, s: Math.floor(left) }));
        pause = 1.4;
      }
      hud();
    } else {
      wrong++;
      ctx.sfx('wrong');
      say(ctx.t('Belum pas, coba posisi lain'), true);
    }
  }

  nextPlan();

  return {
    update(dt, inp) {
      if (ended) return;
      anim += dt;
      msgT -= dt;
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0) { if (plansDone >= PLANS) finish(true); else nextPlan(); }
        return;
      }
      left -= dt;
      if (left <= 0) { left = 0; ctx.sfx('alarm'); finish(false); return; }
      const list = open();
      if (inp.tap) {
        const { x, y } = inp.tap;
        const ti = list.findIndex((p) => !(holding && list[sel] === p) && x >= p.tx && x <= p.tx + p.w * CP * tscale && y >= p.ty && y <= p.ty + p.h * CP * tscale);
        if (ti >= 0) { pick(ti); return; }
        if (holding && x >= FX && x < FX + fw * CP && y >= FY && y < FY + fh * CP) {
          const p = list[sel];
          pos.x = Math.max(0, Math.min(fw - p.w, Math.round((x - FX) / CP - p.w / 2)));
          pos.y = Math.max(0, Math.min(fh - p.h, Math.round((y - FY) / CP - p.h / 2)));
          drop();
        }
        return;
      }
      if (!holding) {
        if (inp.hit.right || inp.hit.down) { sel = (sel + 1) % list.length; ctx.sfx('tick'); }
        if (inp.hit.left || inp.hit.up) { sel = (sel - 1 + list.length) % list.length; ctx.sfx('tick'); }
        if (inp.hit.a) pick(sel);
        return;
      }
      const p = list[sel];
      const dx = (inp.hit.right ? 1 : 0) - (inp.hit.left ? 1 : 0);
      const dy = (inp.hit.down ? 1 : 0) - (inp.hit.up ? 1 : 0);
      if (dx || dy) {
        pos.x = Math.max(0, Math.min(fw - p.w, pos.x + dx));
        pos.y = Math.max(0, Math.min(fh - p.h, pos.y + dy));
        ctx.sfx('tick');
      }
      if (inp.hit.b) { holding = false; ctx.sfx('back'); return; }
      if (inp.hit.a) drop();
    },
    render() {
      g.fillStyle = '#e9dcc2';
      g.fillRect(0, 0, w, h);
      // drafting sheet
      g.fillStyle = '#fbf7ee';
      roundRect(g, 4, 4, 318, 392, 8);
      text(g, ctx.t('Denah {n}/{m} · Lantai {f}', { n: planNo, m: PLANS, f: floor.replace('L', '') }), 16, 22, 17, PAL.ink, 'left');
      text(g, ctx.t('{s} dtk', { s: Math.ceil(left) }), 310, 22, 17, left < 10 ? PAL.red : PAL.ink2, 'right');
      g.fillStyle = 'rgba(29,42,35,0.15)';
      g.fillRect(16, 38, 294, 5);
      g.fillStyle = left < 10 ? PAL.red : PAL.green;
      g.fillRect(16, 38, 294 * (left / PLAN_TIME), 5);
      text(g, ctx.t('Grid 1,5 m'), 16, 56, 11, PAL.ink2, 'left', 400);

      g.fillStyle = '#ffffff';
      g.fillRect(FX, FY, fw * CP, fh * CP);
      g.strokeStyle = 'rgba(60,110,145,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      for (let i = 0; i <= fw; i++) { g.moveTo(FX + i * CP + 0.5, FY); g.lineTo(FX + i * CP + 0.5, FY + fh * CP); }
      for (let j = 0; j <= fh; j++) { g.moveTo(FX, FY + j * CP + 0.5); g.lineTo(FX + fw * CP, FY + j * CP + 0.5); }
      g.stroke();
      for (const r of context) {
        g.fillStyle = '#e7e0d1';
        g.fillRect(FX + r.x * CP + 1, FY + r.y * CP + 1, r.w * CP - 2, r.h * CP - 2);
      }
      for (const p of pieces) {
        if (p.placed) continue;
        g.setLineDash([4, 3]);
        g.strokeStyle = PAL.blue;
        g.lineWidth = 1.5;
        g.strokeRect(FX + p.x * CP + 1.5, FY + p.y * CP + 1.5, p.w * CP - 3, p.h * CP - 3);
        g.setLineDash([]);
        if (p.w >= 2 && p.h >= 2) text(g, p.id.replace(/^L\d-/, ''), FX + (p.x + p.w / 2) * CP, FY + (p.y + p.h / 2) * CP, 8, PAL.blue, 'center', 400);
      }
      pieces.forEach((p, i) => { if (p.placed) drawPiece(p, FX + p.x * CP, FY + p.y * CP, CP, i, false); });
      g.strokeStyle = PAL.ink;
      g.lineWidth = 2.5;
      g.strokeRect(FX, FY, fw * CP, fh * CP);

      // tray
      g.fillStyle = '#d9c7a4';
      roundRect(g, TX, TY - 6, TW, TH, 8);
      text(g, ctx.t('Baki potongan'), TX + 10, TY + 12, 14, PAL.ink, 'left');
      const list = open();
      list.forEach((p, i) => {
        if (holding && i === sel) return;
        drawPiece(p, p.tx, p.ty, CP * tscale, pieces.indexOf(p), !holding && i === sel);
      });
      if (holding && list[sel]) {
        const p = list[sel];
        g.globalAlpha = 0.85;
        drawPiece(p, FX + pos.x * CP, FY + pos.y * CP, CP, pieces.indexOf(p), true);
        g.globalAlpha = 1;
      }
      drawChar(g, hugo, 40, 392, 72, 1, pause > 0 ? 'win' : 'idle', anim);
      text(g, ctx.t('Hugo: cocokkan bentuk dengan garis putus-putus'), 72, 372, 12, PAL.ink2, 'left');
      if (msgT > 0 || pause > 0) {
        g.fillStyle = msgBad ? '#f6d9cf' : '#e6efe0';
        roundRect(g, TX + 8, TY + TH - 42, TW - 16, 28, 6);
        text(g, msg, TX + TW / 2, TY + TH - 28, 13, msgBad ? PAL.red : PAL.green);
      } else {
        text(g, holding ? ctx.t('Geser dengan panah, A: taruh') : ctx.t('Pilih potongan, A: ambil'), TX + TW / 2, TY + TH - 28, 12, PAL.ink);
      }
    },
    snapshot: () => ({
      plan: planNo, floor, left: Math.round(left * 100) / 100, sel, holding, pos: { ...pos },
      placedTotal, timeBonus, wrong, plansDone, score: score(), ended,
      pieces: pieces.map((p) => ({ id: p.id, name: p.name, floor: p.floor, x: p.x, y: p.y, w: p.w, h: p.h, placed: p.placed })),
      openIds: open().map((p) => p.id),
    }),
  };

  function drawPiece(p: Piece, x: number, y: number, cp: number, i: number, hi: boolean) {
    const pw = p.w * cp, ph = p.h * cp;
    const hues = ['#f2c48d', '#b9d8c2', '#c9d7ec', '#efc1b4', '#d9cdea', '#f0dd9a', '#c7e1e0'];
    g.fillStyle = hues[i % hues.length];
    g.fillRect(x + 1, y + 1, pw - 2, ph - 2);
    g.strokeStyle = hi ? PAL.accent : PAL.ink2;
    g.lineWidth = hi ? 3 : 1.5;
    g.strokeRect(x + 1, y + 1, pw - 2, ph - 2);
    fitLabel(p.name, x + pw / 2, y + ph / 2, pw - 4, ph - 4);
  }

  function fitLabel(s: string, cx: number, cy: number, maxW: number, maxH: number) {
    const words = s.split(' ');
    for (let size = 11; size >= 6; size--) {
      g.font = `700 ${size}px 'Alegreya Sans', system-ui, sans-serif`;
      const lines: string[] = [];
      let cur = '';
      for (const wd of words) {
        const t = cur ? `${cur} ${wd}` : wd;
        if (g.measureText(t).width <= maxW || !cur) cur = t; else { lines.push(cur); cur = wd; }
      }
      if (cur) lines.push(cur);
      const lh = size + 1;
      const fits = lines.every((l) => g.measureText(l).width <= maxW) && lines.length * lh <= maxH;
      if (fits || size === 6) {
        const shown = lines.slice(0, Math.max(1, Math.floor(maxH / lh)));
        shown.forEach((l, k) => text(g, l, cx, cy - ((shown.length - 1) * lh) / 2 + k * lh, size, PAL.ink));
        return;
      }
    }
  }
}

export default { meta, create } satisfies GameModule;

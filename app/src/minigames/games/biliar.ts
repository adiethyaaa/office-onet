// Biliar 8-Ball (billiard table, L2-BILLIARD). Top-down eight ball against a
// CPU teammate. Equal-mass elastic discs, cushion bounce and rolling friction,
// sub-stepped so a fast ball never tunnels through another.
import type { CastMember, GameCtx, GameInstance, GameModule, InputState } from '../types';
import { PAL, drawToken, roundRect, text } from '../cast';

export const R = 8;
export const TABLE = { x0: 70, y0: 84, x1: 570, y1: 334 };
const MIDX = (TABLE.x0 + TABLE.x1) / 2;
const MIDY = (TABLE.y0 + TABLE.y1) / 2;
export const POCKETS = [
  { x: TABLE.x0, y: TABLE.y0, r: 16 }, { x: MIDX, y: TABLE.y0 - 3, r: 14 }, { x: TABLE.x1, y: TABLE.y0, r: 16 },
  { x: TABLE.x0, y: TABLE.y1, r: 16 }, { x: MIDX, y: TABLE.y1 + 3, r: 14 }, { x: TABLE.x1, y: TABLE.y1, r: 16 },
];
export const HEAD = { x: TABLE.x0 + 125, y: MIDY };
export const FOOT = { x: TABLE.x0 + 375, y: MIDY };
const DECEL = 190;
const DAMP = 0.35;
const E_BALL = 0.96;
const E_RAIL = 0.78;
export const MIN_SPEED = 120;
export const MAX_SPEED = 1150;
export const MAX_SHOTS = 40;
export const TIME_LIMIT = 600;
const AIM_LEN = 190;

export type Group = 'solid' | 'stripe';
export interface Ball { n: number; x: number; y: number; vx: number; vy: number; down: boolean }
export type PhysEvent = { kind: 'pocket'; n: number } | { kind: 'hit'; a: number; b: number; v: number } | { kind: 'rail'; n: number; v: number };
export interface Rules { turn: 0 | 1; groups: (Group | null)[]; winner: 0 | 1 | null }

export const groupOf = (n: number): Group | null => (n >= 1 && n <= 7 ? 'solid' : n >= 9 && n <= 15 ? 'stripe' : null);
const other = (gr: Group): Group => (gr === 'solid' ? 'stripe' : 'solid');
const speedOf = (b: Ball) => Math.hypot(b.vx, b.vy);
export const angDiff = (a: number, b: number) => { let d = (a - b) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

/** Fresh rack: cue on the head spot, triangle apex on the foot spot. */
export function rack(rand: () => number): Ball[] {
  const shuffle = <T,>(a: T[]) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const solids = shuffle([1, 2, 3, 4, 5, 6, 7]);
  const stripes = shuffle([9, 10, 11, 12, 13, 14, 15]);
  let cA = solids.pop()!, cB = stripes.pop()!;
  if (rand() < 0.5) [cA, cB] = [cB, cA];
  const rest = shuffle([...solids, ...stripes]);
  const balls: Ball[] = [{ n: 0, x: HEAD.x, y: HEAD.y, vx: 0, vy: 0, down: false }];
  for (let row = 0; row < 5; row++) {
    for (let k = 0; k <= row; k++) {
      // 8 in the middle of row 3, one of each group on the back corners
      const n = row === 2 && k === 1 ? 8 : row === 4 && k === 0 ? cA : row === 4 && k === 4 ? cB : rest.pop()!;
      balls.push({ n, x: FOOT.x + row * (2 * R * 0.866 + 0.5), y: FOOT.y + (k - row / 2) * (2 * R + 0.5), vx: 0, vy: 0, down: false });
    }
  }
  return balls;
}

/** Resolve one contact between equal masses; returns the closing speed (0 = no impact). */
export function collide(a: Ball, b: Ball, e = E_BALL): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d >= 2 * R || d === 0) return 0;
  const nx = dx / d, ny = dy / d;
  const push = (2 * R - d) / 2;
  a.x -= nx * push; a.y -= ny * push;
  b.x += nx * push; b.y += ny * push;
  const vrel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (vrel <= 0) return 0;
  const j = ((1 + e) / 2) * vrel;
  a.vx -= j * nx; a.vy -= j * ny;
  b.vx += j * nx; b.vy += j * ny;
  return vrel;
}

export function physicsStep(balls: Ball[], dt: number, ev: PhysEvent[] = []) {
  let maxV = 0;
  for (const b of balls) if (!b.down) maxV = Math.max(maxV, speedOf(b));
  if (maxV === 0) return;
  // a ball never moves more than 0.4 R per sub-step
  const n = Math.min(120, Math.max(1, Math.ceil((maxV * dt) / (R * 0.4))));
  const h = dt / n;
  const { x0, y0, x1, y1 } = TABLE;
  for (let s = 0; s < n; s++) {
    for (const b of balls) {
      if (b.down || (b.vx === 0 && b.vy === 0)) continue;
      b.x += b.vx * h;
      b.y += b.vy * h;
      const p = POCKETS.find((q) => Math.hypot(b.x - q.x, b.y - q.y) < q.r);
      if (p) { b.down = true; b.vx = 0; b.vy = 0; b.x = p.x; b.y = p.y; ev.push({ kind: 'pocket', n: b.n }); continue; }
      if (b.x < x0 + R) { b.x = x0 + R; if (b.vx < 0) { ev.push({ kind: 'rail', n: b.n, v: -b.vx }); b.vx = -b.vx * E_RAIL; } }
      if (b.x > x1 - R) { b.x = x1 - R; if (b.vx > 0) { ev.push({ kind: 'rail', n: b.n, v: b.vx }); b.vx = -b.vx * E_RAIL; } }
      if (b.y < y0 + R) { b.y = y0 + R; if (b.vy < 0) { ev.push({ kind: 'rail', n: b.n, v: -b.vy }); b.vy = -b.vy * E_RAIL; } }
      if (b.y > y1 - R) { b.y = y1 - R; if (b.vy > 0) { ev.push({ kind: 'rail', n: b.n, v: b.vy }); b.vy = -b.vy * E_RAIL; } }
    }
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i];
      if (a.down) continue;
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j];
        if (b.down || Math.abs(b.x - a.x) >= 2 * R || Math.abs(b.y - a.y) >= 2 * R) continue;
        const v = collide(a, b);
        if (v > 0) ev.push({ kind: 'hit', a: a.n, b: b.n, v });
      }
    }
    for (const b of balls) {
      const sp = speedOf(b);
      if (sp === 0) continue;
      const ns = Math.max(0, (sp - DECEL * h) * (1 - DAMP * h));
      b.vx *= ns / sp;
      b.vy *= ns / sp;
    }
  }
}

export const moving = (balls: Ball[]) => balls.some((b) => !b.down && (b.vx !== 0 || b.vy !== 0));

/** Where the aim line ends: first ball contact (ghost position) or a cushion, capped at maxLen. */
export function aimRay(balls: Ball[], angle: number, maxLen: number): { x: number; y: number; hit: Ball | null } {
  const c = balls[0];
  const dx = Math.cos(angle), dy = Math.sin(angle);
  let best = maxLen;
  let hit: Ball | null = null;
  const { x0, y0, x1, y1 } = TABLE;
  if (dx > 1e-6) best = Math.min(best, (x1 - R - c.x) / dx);
  if (dx < -1e-6) best = Math.min(best, (x0 + R - c.x) / dx);
  if (dy > 1e-6) best = Math.min(best, (y1 - R - c.y) / dy);
  if (dy < -1e-6) best = Math.min(best, (y0 + R - c.y) / dy);
  for (const b of balls) {
    if (b === c || b.down) continue;
    const fx = c.x - b.x, fy = c.y - b.y;
    const bq = fx * dx + fy * dy;
    const disc = bq * bq - (fx * fx + fy * fy - 4 * R * R);
    if (disc < 0) continue;
    const t = -bq - Math.sqrt(disc);
    if (t > 0 && t < best) { best = t; hit = b; }
  }
  best = Math.max(0, best);
  return { x: c.x + dx * best, y: c.y + dy * best, hit };
}

function pathClear(balls: Ball[], ax: number, ay: number, bx: number, by: number, skip: number[]) {
  const vx = bx - ax, vy = by - ay;
  const L2 = vx * vx + vy * vy || 1;
  for (const b of balls) {
    if (b.down || skip.includes(b.n)) continue;
    const t = Math.max(0, Math.min(1, ((b.x - ax) * vx + (b.y - ay) * vy) / L2));
    if (Math.hypot(ax + vx * t - b.x, ay + vy * t - b.y) < 2 * R - 0.5) return false;
  }
  return true;
}

const powerFor = (v: number) => Math.max(0.2, Math.min(1, (v - MIN_SPEED) / (MAX_SPEED - MIN_SPEED)));

/** Easiest pot among `targets` by the ghost-ball method; null when nothing is makeable. */
export function plan(balls: Ball[], targets: number[]): { angle: number; power: number; target: number } | null {
  const c = balls[0];
  const { x0, y0, x1, y1 } = TABLE;
  let best: { angle: number; power: number; target: number; score: number } | null = null;
  for (const t of balls) {
    if (t.down || !targets.includes(t.n)) continue;
    for (const p of POCKETS) {
      const L2 = Math.hypot(p.x - t.x, p.y - t.y);
      if (L2 < 1) continue;
      const ux = (p.x - t.x) / L2, uy = (p.y - t.y) / L2;
      const gx = t.x - ux * 2 * R, gy = t.y - uy * 2 * R;
      if (gx < x0 + R || gx > x1 - R || gy < y0 + R || gy > y1 - R) continue;
      const L1 = Math.hypot(gx - c.x, gy - c.y);
      if (L1 < 1) continue;
      const cos = ((gx - c.x) * ux + (gy - c.y) * uy) / L1;
      if (cos < 0.3) continue;
      if (!pathClear(balls, c.x, c.y, gx, gy, [0, t.n]) || !pathClear(balls, t.x, t.y, p.x, p.y, [0, t.n])) continue;
      const score = (cos * cos * 1000) / (L1 + L2 * 1.6 + 60);
      if (best && score <= best.score) continue;
      const vObj = Math.sqrt(2 * DECEL * (L2 + 50));
      const vHit = vObj / Math.max(0.35, cos * 0.98);
      const v0 = Math.sqrt(vHit * vHit + 2 * DECEL * L1) * 1.25;
      best = { angle: Math.atan2(gy - c.y, gx - c.x), power: powerFor(v0), target: t.n, score };
    }
  }
  return best ? { angle: best.angle, power: best.power, target: best.target } : null;
}

export function targetsFor(rules: Rules, s: 0 | 1, balls: Ball[]): number[] {
  const gr = rules.groups[s];
  const live = balls.filter((b) => !b.down && b.n !== 0);
  if (!gr) return live.filter((b) => b.n !== 8).map((b) => b.n);
  const own = live.filter((b) => groupOf(b.n) === gr).map((b) => b.n);
  return own.length ? own : [8];
}

/**
 * House rules, applied once the balls stop. Mutates `rules`.
 * `pocketed` lists balls sunk on this shot in order; `balls` is the state after it.
 */
export function resolveShot(rules: Rules, pocketed: number[], balls: Ball[]): { foul: boolean; keep: boolean; assigned: Group | null; eight: boolean } {
  const s = rules.turn;
  const o = (1 - s) as 0 | 1;
  const cue = pocketed.includes(0);
  const objs = pocketed.filter((n) => n !== 0 && n !== 8);
  if (pocketed.includes(8)) {
    const gr = rules.groups[s];
    // the group had to be cleared on earlier shots, not on this one
    const cleared = !!gr && balls.every((b) => groupOf(b.n) !== gr || (b.down && !pocketed.includes(b.n)));
    rules.winner = cleared && !cue ? s : o;
    return { foul: cue, keep: false, assigned: null, eight: true };
  }
  let assigned: Group | null = null;
  if (!rules.groups[s] && objs.length && !cue) {
    assigned = groupOf(objs[0])!;
    rules.groups[s] = assigned;
    rules.groups[o] = other(assigned);
  }
  const own = rules.groups[s] ? objs.filter((n) => groupOf(n) === rules.groups[s]).length : 0;
  const keep = !cue && own > 0;
  if (!keep) rules.turn = o;
  return { foul: cue, keep, assigned, eight: false };
}

/** Ball in hand, simplified: the cue goes back to the head spot, or the nearest free spot. */
export function respotCue(balls: Ball[]) {
  const c = balls[0];
  c.down = false; c.vx = 0; c.vy = 0;
  const free = (x: number, y: number) => balls.every((b) => b === c || b.down || Math.hypot(b.x - x, b.y - y) >= 2 * R + 1);
  for (let k = 0; k < 40; k++) {
    const dy = (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (2 * R + 2);
    const dx = -Math.floor(k / 12) * (2 * R + 2);
    if (free(HEAD.x + dx, HEAD.y + dy)) { c.x = HEAD.x + dx; c.y = HEAD.y + dy; return; }
  }
  c.x = HEAD.x; c.y = HEAD.y;
}

const COL = ['#fbf6ea', '#e8b923', '#2f5fa8', '#c23b2b', '#6a3f9a', '#e07a2b', '#2f7d4a', '#7d2a2a', '#1b1b1b'];
const ballColor = (n: number) => COL[n <= 8 ? n : n - 8];

const meta: GameModule['meta'] = {
  id: 'biliar', title: 'Biliar 8-Ball', place: 'billiard_table', music: 'lounge',
  blurb: '8-ball tampak atas melawan rekan tim. Masukkan semua bolamu, lalu bola 8.',
  controls: [
    'Kiri/kanan: putar tongkat, atas/bawah: putar halus',
    'Tahan A untuk isi tenaga, lepas untuk pukul',
    'Atau ketuk A untuk mulai isi, ketuk A lagi untuk pukul',
    'B: batal pukul. Bola putih masuk = foul',
  ],
  view: { w: 640, h: 400 }, score: { unit: 'poin', higherIsBetter: true }, touch: ['left', 'right', 'up', 'down', 'a', 'b'],
};

function create(ctx: GameCtx): GameInstance {
  const { g, w, h } = ctx;
  const me = ctx.cast.find((c) => c.id === ctx.playerId) ?? ctx.cast[0];
  const pool = ctx.cast.filter((c) => c.id !== 'CH-CEO');
  const foe: CastMember = pool[Math.floor(ctx.rand() * pool.length)] ?? me;
  const skill = 0.01 + ctx.rand() * 0.02;
  const balls = rack(ctx.rand);
  const rules: Rules = { turn: 0, groups: [null, null], winner: null };
  let phase: 'aim' | 'roll' | 'pause' | 'over' = 'aim';
  let aim = 0;
  let power = 0;
  let powerDir = 1;
  let charging = false;
  let latched = false;
  let chargeT = 0;
  let cpu = { angle: 0, power: 0.5, t: 0 };
  let hint = { angle: 0, power: 1 };
  let shots = 0;
  let time = 0;
  let pauseT = 0;
  let overT = 0;
  let ended = false;
  let pocketedNow: number[] = [];
  let msg = '';
  let banner = '';
  let sfxGap = 0;
  let fouls = 0;
  let result = { score: 0, summary: '', won: false };
  const nameOf = (s: 0 | 1) => (s === 0 ? ctx.t('Kamu') : foe.name);
  const downOf = (gr: Group | null) => (gr ? balls.filter((b) => b.down && groupOf(b.n) === gr).length : 0);
  const hud = () => ctx.setHud(ctx.t('Kamu {a} · {name} {b} · Giliran {n}/40', { a: downOf(rules.groups[0]), name: foe.name, b: downOf(rules.groups[1]), n: Math.min(MAX_SHOTS, shots + 1) }));

  const shotPlan = (s: 0 | 1) => {
    if (shots === 0) {
      const apex = balls.filter((b) => b.n !== 0).reduce((m, b) => (b.x < m.x ? b : m));
      return { angle: Math.atan2(apex.y - balls[0].y, apex.x - balls[0].x), power: 1 };
    }
    const t = targetsFor(rules, s, balls);
    const p = plan(balls, t);
    if (p) return p;
    const c = balls[0];
    const near = balls.filter((b) => !b.down && t.includes(b.n)).sort((a, b) => Math.hypot(a.x - c.x, a.y - c.y) - Math.hypot(b.x - c.x, b.y - c.y))[0];
    return near ? { angle: Math.atan2(near.y - c.y, near.x - c.x), power: 0.55 } : { angle: aim, power: 0.4 };
  };

  const startTurn = () => {
    phase = 'aim';
    power = 0; charging = false; latched = false; chargeT = 0;
    const p = shotPlan(rules.turn);
    hint = { angle: p.angle, power: p.power };
    if (rules.turn === 1) {
      cpu = { angle: p.angle + (ctx.rand() * 2 - 1) * skill, power: Math.min(1, Math.max(0.2, p.power * (0.92 + ctx.rand() * 0.16))), t: 0 };
      msg = ctx.t('{name} membidik...', { name: foe.name });
    } else if (!msg) msg = ctx.t('Giliranmu. Bidik lalu pukul.');
    hud();
  };

  const shoot = (angle: number, p: number) => {
    const c = balls[0];
    const v = MIN_SPEED + Math.max(0.04, p) * (MAX_SPEED - MIN_SPEED);
    c.vx = Math.cos(angle) * v;
    c.vy = Math.sin(angle) * v;
    aim = angle;
    shots++;
    pocketedNow = [];
    phase = 'roll';
    charging = false;
    msg = '';
    ctx.sfx('clack', { gain: 0.4 + p * 0.6 });
  };

  const finish = (won: boolean | null, reason: string) => {
    const mine = downOf(rules.groups[0]);
    const score = mine * 100 + (won ? 1000 : 0);
    const summary = won ? ctx.t('Menang melawan {name}! {n} bola masuk.', { name: foe.name, n: mine })
      : won === null ? ctx.t('Seri melawan {name}. {n} bola masuk.', { name: foe.name, n: mine })
        : ctx.t('Kalah dari {name}. {n} bola masuk.', { name: foe.name, n: mine });
    result = { score, summary, won: !!won };
    banner = reason;
    msg = summary;
    phase = 'over';
    overT = 1.8;
    ctx.sfx(won ? 'win' : 'lose');
    hud();
  };

  const judge = () => {
    const a = downOf(rules.groups[0]), b = downOf(rules.groups[1]);
    finish(a > b ? true : a < b ? false : null, ctx.t('Batas tercapai: dinilai dari sisa bola'));
  };

  const resolve = () => {
    const s = rules.turn;
    const out = resolveShot(rules, pocketedNow, balls);
    if (rules.winner !== null) {
      const shooterWon = rules.winner === s;
      const why = shooterWon
        ? (s === 0 ? ctx.t('Bola 8 masuk. Kamu menang!') : ctx.t('{name} memasukkan bola 8', { name: foe.name }))
        : out.foul
          ? (s === 0 ? ctx.t('Bola putih ikut masuk bersama bola 8') : ctx.t('{name} memasukkan bola putih bersama bola 8', { name: foe.name }))
          : (s === 0 ? ctx.t('Bola 8 masuk terlalu awal') : ctx.t('{name} memasukkan bola 8 terlalu awal', { name: foe.name }));
      finish(rules.winner === 0, why);
      return;
    }
    if (out.foul) {
      fouls++;
      respotCue(balls);
      msg = ctx.t('Foul! Bola putih masuk. {name} dapat bola di tangan.', { name: nameOf(rules.turn) });
      ctx.sfx('wrong');
    } else if (out.assigned) {
      msg = rules.groups[0] === 'solid' ? ctx.t('Kamu main bola penuh (1-7).') : ctx.t('Kamu main bola belang (9-15).');
      ctx.sfx('right');
    } else if (out.keep) msg = ctx.t('Masuk! {name} lanjut.', { name: nameOf(s) });
    else msg = ctx.t('Giliran {name}.', { name: nameOf(rules.turn) });
    if (shots >= MAX_SHOTS || time >= TIME_LIMIT) { judge(); return; }
    phase = 'pause';
    pauseT = 0.9;
    hud();
  };

  startTurn();

  const update = (dt: number, inp: InputState) => {
    if (phase === 'over') {
      overT -= dt;
      if (overT <= 0 && !ended) { ended = true; ctx.end(result); }
      return;
    }
    time += dt;
    sfxGap = Math.max(0, sfxGap - dt);
    if (phase === 'aim' && time >= TIME_LIMIT) { judge(); return; }
    if (phase === 'pause') {
      pauseT -= dt;
      if (pauseT <= 0) startTurn();
      return;
    }
    if (phase === 'roll') {
      const ev: PhysEvent[] = [];
      physicsStep(balls, dt, ev);
      for (const e of ev) {
        if (e.kind === 'pocket') { pocketedNow.push(e.n); ctx.sfx('pocket'); }
        else if (e.kind === 'hit' && sfxGap <= 0 && e.v > 20) { ctx.sfx('ball', { gain: Math.min(1, e.v / 600) }); sfxGap = 0.03; }
      }
      if (!moving(balls)) resolve();
      return;
    }
    if (rules.turn === 1) {
      cpu.t += dt;
      const d = angDiff(cpu.angle, aim);
      const stepA = 2.4 * dt;
      aim += Math.abs(d) <= stepA ? d : Math.sign(d) * stepA;
      if (cpu.t > 0.7 && Math.abs(angDiff(cpu.angle, aim)) < 1e-6) {
        charging = true;
        power = Math.min(cpu.power, power + dt / 1.1);
        if (power >= cpu.power && cpu.t > 1.2) shoot(cpu.angle, cpu.power);
      }
      return;
    }
    const fine = (inp.down.down ? 1 : 0) - (inp.down.up ? 1 : 0);
    aim += inp.ax * 1.4 * dt + fine * 0.22 * dt;
    if (!charging) {
      if (inp.hit.a) { charging = true; latched = false; chargeT = 0; power = 0; powerDir = 1; }
      return;
    }
    if (inp.hit.b) { charging = false; power = 0; msg = ctx.t('Pukulan dibatalkan.'); return; }
    chargeT += dt;
    power += (powerDir * dt) / 1.3;
    if (power >= 1) { power = 1; powerDir = -1; }
    if (power <= 0) { power = 0; powerDir = 1; }
    if (latched) { if (inp.hit.a) shoot(aim, power); }
    else if (!inp.down.a) {
      if (chargeT < 0.15) { latched = true; msg = ctx.t('Ketuk A lagi untuk memukul.'); }
      else shoot(aim, power);
    }
  };

  const fit = (s: string, x: number, y: number, size: number, maxW: number, color: string) => {
    let sz = size;
    g.font = `700 ${sz}px 'Alegreya Sans', system-ui, sans-serif`;
    while (sz > 9 && g.measureText(s).width > maxW) { sz -= 1; g.font = `700 ${sz}px 'Alegreya Sans', system-ui, sans-serif`; }
    text(g, s, x, y, sz, color);
  };

  const drawBall = (b: Ball) => {
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath(); g.arc(b.x + 1.5, b.y + 2, R, 0, Math.PI * 2); g.fill();
    const col = ballColor(b.n);
    g.fillStyle = b.n >= 9 ? COL[0] : col;
    g.beginPath(); g.arc(b.x, b.y, R, 0, Math.PI * 2); g.fill();
    if (b.n >= 9) {
      g.save();
      g.beginPath(); g.arc(b.x, b.y, R, 0, Math.PI * 2); g.clip();
      g.fillStyle = col;
      g.fillRect(b.x - R, b.y - R * 0.55, R * 2, R * 1.1);
      g.restore();
    }
    if (b.n > 0) {
      g.fillStyle = COL[0];
      g.beginPath(); g.arc(b.x, b.y, 3.8, 0, Math.PI * 2); g.fill();
      text(g, String(b.n), b.x, b.y + 0.3, b.n >= 10 ? 5 : 6, '#1b1b1b');
    }
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.beginPath(); g.arc(b.x - 2.6, b.y - 2.8, 2, 0, Math.PI * 2); g.fill();
  };

  const panel = (s: 0 | 1) => {
    const x = s === 0 ? 8 : 402;
    const active = rules.turn === s && phase !== 'over';
    if (active) { g.fillStyle = PAL.gold; roundRect(g, x - 3, 3, 236, 56, 12); }
    g.fillStyle = PAL.surface;
    roundRect(g, x, 6, 230, 50, 10);
    drawToken(g, s === 0 ? me : foe, x + 24, 32, 15, time, active);
    text(g, s === 0 ? ctx.t('Kamu') : foe.name, x + 46, 21, 16, PAL.ink, 'left');
    const gr = rules.groups[s];
    const label = gr === 'solid' ? ctx.t('Penuh (1-7)') : gr === 'stripe' ? ctx.t('Belang (9-15)') : ctx.t('Meja terbuka');
    text(g, label, x + 46, 42, 12, PAL.ink2, 'left', 600);
    if (gr) {
      const nums = gr === 'solid' ? [1, 2, 3, 4, 5, 6, 7] : [9, 10, 11, 12, 13, 14, 15];
      nums.forEach((n, i) => {
        const b = balls.find((q) => q.n === n)!;
        g.globalAlpha = b.down ? 0.22 : 1;
        drawBall({ n, x: x + 140 + (i % 4) * 22, y: 21 + Math.floor(i / 4) * 20, vx: 0, vy: 0, down: false });
        g.globalAlpha = 1;
      });
    }
  };

  const render = () => {
    g.fillStyle = PAL.bg;
    g.fillRect(0, 0, w, h);
    panel(0);
    panel(1);
    text(g, ctx.t('Giliran {n}/40', { n: Math.min(MAX_SHOTS, shots + (phase === 'roll' ? 0 : 1)) }), w / 2, 20, 15, PAL.ink);
    const left = Math.max(0, TIME_LIMIT - time);
    text(g, `${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, w / 2, 42, 15, left < 60 ? PAL.red : PAL.ink2);
    const { x0, y0, x1, y1 } = TABLE;
    g.fillStyle = '#6b3f22';
    roundRect(g, x0 - 22, y0 - 22, x1 - x0 + 44, y1 - y0 + 44, 14);
    g.fillStyle = '#245a40';
    g.fillRect(x0 - 8, y0 - 8, x1 - x0 + 16, y1 - y0 + 16);
    g.fillStyle = '#2f7a55';
    g.fillRect(x0, y0, x1 - x0, y1 - y0);
    g.fillStyle = '#e8d9b5';
    for (let i = 1; i < 8; i++) {
      if (i === 4) continue;
      const dx = x0 + ((x1 - x0) * i) / 8;
      g.fillRect(dx - 1.5, y0 - 16, 3, 3); g.fillRect(dx - 1.5, y1 + 13, 3, 3);
    }
    for (let i = 1; i < 4; i++) { const dy = y0 + ((y1 - y0) * i) / 4; g.fillRect(x0 - 16, dy - 1.5, 3, 3); g.fillRect(x1 + 13, dy - 1.5, 3, 3); }
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(HEAD.x, y0); g.lineTo(HEAD.x, y1); g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.2)';
    g.beginPath(); g.arc(FOOT.x, FOOT.y, 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#15110e';
    for (const p of POCKETS) { g.beginPath(); g.arc(p.x, p.y, p.r - 2, 0, Math.PI * 2); g.fill(); }
    for (const b of balls) if (!b.down) drawBall(b);
    const c = balls[0];
    if (phase === 'aim' && !c.down) {
      const ray = aimRay(balls, aim, AIM_LEN);
      g.strokeStyle = rules.turn === 0 ? 'rgba(255,250,240,0.85)' : 'rgba(255,250,240,0.35)';
      g.lineWidth = 1.5;
      g.setLineDash([5, 4]);
      g.beginPath(); g.moveTo(c.x, c.y); g.lineTo(ray.x, ray.y); g.stroke();
      g.setLineDash([]);
      if (ray.hit) {
        g.beginPath(); g.arc(ray.x, ray.y, R, 0, Math.PI * 2); g.stroke();
        const nx = ray.hit.x - ray.x, ny = ray.hit.y - ray.y, nl = Math.hypot(nx, ny) || 1;
        g.strokeStyle = 'rgba(217,164,65,0.95)';
        g.beginPath(); g.moveTo(ray.hit.x, ray.hit.y); g.lineTo(ray.hit.x + (nx / nl) * 34, ray.hit.y + (ny / nl) * 34); g.stroke();
      }
      const dx = Math.cos(aim), dy = Math.sin(aim);
      const back = R + 4 + power * 46;
      const sx = c.x - dx * back, sy = c.y - dy * back;
      const ex = sx - dx * 230, ey = sy - dy * 230;
      g.lineCap = 'round';
      g.lineWidth = 5; g.strokeStyle = '#c89b5e';
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(ex, ey); g.stroke();
      g.lineWidth = 6; g.strokeStyle = '#3a2414';
      g.beginPath(); g.moveTo(sx - dx * 170, sy - dy * 170); g.lineTo(ex, ey); g.stroke();
      g.lineWidth = 4; g.strokeStyle = '#eaf2f5';
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx - dx * 6, sy - dy * 6); g.stroke();
      g.lineCap = 'butt';
    }
    g.fillStyle = PAL.surface;
    roundRect(g, 8, 362, 624, 32, 10);
    text(g, ctx.t('Tenaga'), 22, 378, 14, PAL.ink, 'left');
    g.fillStyle = PAL.sand;
    roundRect(g, 80, 371, 150, 14, 7);
    if (power > 0) {
      g.fillStyle = power > 0.8 ? PAL.red : power > 0.5 ? PAL.gold : PAL.green;
      roundRect(g, 80, 371, Math.max(14, 150 * power), 14, 7);
    }
    if (msg) fit(msg, 434, 378, 14, 380, phase === 'over' ? PAL.accent : PAL.ink);
    if (phase === 'over') {
      g.fillStyle = 'rgba(29,42,35,0.82)';
      roundRect(g, 130, 168, 380, 84, 14);
      fit(banner, w / 2, 196, 18, 350, '#fffaf0');
      text(g, ctx.t('Skor: {n} poin', { n: result.score }), w / 2, 226, 16, PAL.gold);
    }
  };

  return {
    update,
    render,
    snapshot: () => ({
      phase, turn: rules.turn, shots, time: Math.round(time * 100) / 100, groups: [...rules.groups], winner: rules.winner,
      aim, power, charging, latched, hint: { ...hint }, foe: foe.name, fouls,
      cue: { x: balls[0].x, y: balls[0].y },
      mine: downOf(rules.groups[0]), theirs: downOf(rules.groups[1]),
      down: balls.filter((b) => b.down).map((b) => b.n), score: result.score,
    }),
  };
}

export default { meta, create } satisfies GameModule;

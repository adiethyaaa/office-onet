// Balap Drone (Game Station slot 1). Top-down racer: a drone camera follows the
// player's car and the world does not rotate (left/right turns the car relative
// to its nose). Three laps against three CPU drivers from the team. A lap only
// counts after every checkpoint gate was crossed in order, so cutting across
// the grass gains nothing.
import type { CastMember, GameCtx, GameInstance, GameModule } from '../types';
import { PAL, drawToken, roundRect, text } from '../cast';

export interface Track { name: string; hw: number; pts: [number, number][] }

/** Control points double as checkpoint gates; index 0 is the start/finish line. */
export const TRACKS: Track[] = [
  { name: 'Sirkuit Parkiran', hw: 64, pts: [[500, 300], [1000, 260], [1500, 300], [1820, 560], [1760, 960], [1400, 1160], [900, 1160], [450, 1060], [240, 720], [280, 420]] },
  { name: 'Jalur Taman', hw: 62, pts: [[600, 320], [1100, 300], [1600, 360], [2000, 560], [2040, 1000], [1660, 1220], [1260, 1000], [940, 1160], [1000, 1560], [600, 1720], [260, 1380], [240, 820], [340, 460]] },
  { name: 'Putaran Gudang', hw: 60, pts: [[700, 300], [1300, 260], [1760, 560], [2200, 380], [2560, 780], [2380, 1380], [1800, 1520], [1500, 1140], [1120, 1440], [620, 1520], [300, 1140], [320, 560]] },
];
export const LAPS = 3;
export const LIMIT = 240;
export const SUB = 16;
export const V_ROAD = 270;
export const V_GRASS = 115;
const V_TURBO = 390;
const V_REV = -90;
const ACC = 230;
const BRAKE = 380;
const TURN = 2.7;
const CAR_R = 15;
const TURBO_TIME = 1.6;
const GATE_R = 20;
const CPU_IDS = ['CH-SUPERVISOR', 'CH-NETINSTALL', 'CH-ICTSPEC'];

const meta: GameModule['meta'] = {
  id: 'balap-drone', title: 'Balap Drone', place: 'arcade', music: 'race',
  blurb: 'Balap tampak atas di sirkuit sekitar kantor. 3 putaran.',
  controls: ['Kiri/kanan: setir', 'A: gas, B: rem atau mundur', 'X: turbo (3 kali)', 'Lewati semua gerbang emas berurutan agar putaran dihitung'],
  view: { w: 640, h: 400 }, score: { unit: 'detik', higherIsBetter: false, time: true }, touch: ['left', 'right', 'a', 'b', 'x'],
};

interface Car {
  c: CastMember; cpu: boolean; skill: number;
  x: number; y: number; ang: number; v: number;
  lap: number; next: number; done: boolean; finishT: number; place: number;
  turbos: number; turbo: number; onRoad: boolean; bump: number;
}

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Closed Catmull-Rom loop through the control points; sample i*SUB is control point i. */
export function buildPath(pts: [number, number][]): [number, number][] {
  const n = pts.length;
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let s = 0; s < SUB; s++) {
      const u = s / SUB, u2 = u * u, u3 = u2 * u;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * u + (2 * a - 5 * b + 4 * c - d) * u2 + (-a + 3 * b - 3 * c + d) * u3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

function segDist(px: number, py: number, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const u = clamp(((px - a[0]) * dx + (py - a[1]) * dy) / l2, 0, 1);
  return Math.hypot(px - a[0] - u * dx, py - a[1] - u * dy);
}

export function distToRoad(path: [number, number][], x: number, y: number) {
  let bd = Infinity;
  for (let i = 0; i < path.length; i++) bd = Math.min(bd, segDist(x, y, path[i], path[(i + 1) % path.length]));
  return bd;
}

function create(ctx: GameCtx): GameInstance {
  const { g, w, h } = ctx;
  const castOf = (id: string) => ctx.cast.find((c) => c.id === id) ?? ctx.cast[0];
  const paths = TRACKS.map((tr) => buildPath(tr.pts));
  let phase: 'select' | 'count' | 'race' | 'done' = 'select';
  let sel = 0;
  let lastAx = 0;
  let count = 3;
  let raceT = 0;
  let doneT = 0;
  let clock = 0;
  let finished = 0;
  let engineT = 0;
  let crashCd = 0;
  let cars: Car[] = [];
  let tr = TRACKS[0];
  let path = paths[0];
  let ended = false;
  let msg = '';
  let msgT = 0;

  const setup = () => {
    tr = TRACKS[sel];
    path = paths[sel];
    const [x0, y0] = tr.pts[0], [x1, y1] = tr.pts[1];
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const fx = Math.cos(ang), fy = Math.sin(ang);
    const skills = [0.9, 0.93, 0.955].map((s) => s + ctx.rand() * 0.02);
    // grid: the player starts last, so the race opens with overtaking
    const order = [...CPU_IDS.map((id, i) => ({ id, cpu: true, skill: skills[i] })), { id: ctx.playerId, cpu: false, skill: 1 }];
    cars = order.map((o, i) => {
      const back = 50 + i * 42, side = (i % 2 ? 1 : -1) * 26;
      return {
        c: castOf(o.id), cpu: o.cpu, skill: o.skill,
        x: x0 - fx * back - fy * side, y: y0 - fy * back + fx * side, ang, v: 0,
        lap: 0, next: 1, done: false, finishT: 0, place: 0, turbos: 3, turbo: 0, onRoad: true, bump: 0,
      };
    });
    phase = 'count';
    count = 3;
    ctx.sfx('beep');
  };

  const player = () => cars[cars.length - 1];
  const progress = (k: Car) => {
    const n = tr.pts.length;
    const passed = k.lap * n + ((k.next - 1 + n) % n);
    const [tx, ty] = tr.pts[k.next];
    return passed - Math.hypot(k.x - tx, k.y - ty) / 100000;
  };
  const ranking = () => [...cars].sort((a, b) => (a.done && b.done ? a.place - b.place : a.done ? -1 : b.done ? 1 : progress(b) - progress(a)));
  const posOf = (k: Car) => ranking().indexOf(k) + 1;
  const fmt = (s: number) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`;

  const hud = () => {
    if (!cars.length) { ctx.setHud(ctx.t('Pilih lintasan')); return; }
    const p = player();
    ctx.setHud(ctx.t('Putaran {l}/{n} · Posisi {p}/4 · {s}', { l: Math.min(p.lap + 1, LAPS), n: LAPS, p: p.done ? p.place : posOf(p), s: fmt(raceT) }));
  };
  hud();

  /** Nearest path sample, searched only around the current gate pair (cheap and never jumps across the infield). */
  const nearWindow = (k: Car) => {
    const M = path.length;
    const from = ((k.next - 1) * SUB - SUB / 2 + M) % M;
    let best = 0, bd = Infinity;
    for (let j = 0; j < SUB * 2; j++) {
      const i = (from + j) % M;
      const d = Math.hypot(k.x - path[i][0], k.y - path[i][1]);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  };

  const drive = (k: Car, dt: number, steer: number, gas: boolean, brake: boolean, turboHit: boolean) => {
    if (turboHit && k.turbos > 0 && k.turbo <= 0) {
      k.turbos--; k.turbo = TURBO_TIME;
      if (!k.cpu) ctx.sfx('turbo');
    }
    k.turbo = Math.max(0, k.turbo - dt);
    k.onRoad = distToRoad(path, k.x, k.y) <= tr.hw;
    const vmax = k.cpu ? V_ROAD * k.skill : V_ROAD;
    const cap = k.turbo > 0 && k.onRoad ? V_TURBO : k.onRoad ? vmax : V_GRASS;
    if (k.turbo > 0) k.v += ACC * 1.6 * dt;
    else if (gas) k.v += ACC * dt;
    else if (brake) k.v -= (k.v > 0 ? BRAKE : ACC * 0.6) * dt;
    else k.v -= Math.sign(k.v) * Math.min(Math.abs(k.v), 90 * dt);
    if (k.v > cap) k.v = Math.max(cap, k.v - 520 * dt);
    if (k.v < V_REV) k.v = V_REV;
    k.ang = wrap(k.ang + clamp(steer, -1, 1) * TURN * clamp(Math.abs(k.v) / 90, 0, 1) * Math.sign(k.v) * dt);
    k.x += Math.cos(k.ang) * k.v * dt;
    k.y += Math.sin(k.ang) * k.v * dt;
    k.bump = Math.max(0, k.bump - dt);
    const [cx, cy] = tr.pts[k.next];
    if (!k.done && Math.hypot(k.x - cx, k.y - cy) < tr.hw + GATE_R) {
      if (k.next === 0) {
        k.lap++;
        if (k.lap >= LAPS) {
          k.done = true; k.finishT = raceT; k.place = ++finished;
          if (!k.cpu) ctx.sfx(k.place === 1 ? 'win' : 'confirm');
        } else if (!k.cpu) { ctx.sfx('coin'); msg = ctx.t('Putaran {l}/{n}', { l: k.lap + 1, n: LAPS }); msgT = 0; }
      } else if (!k.cpu) ctx.sfx('tick');
      k.next = (k.next + 1) % tr.pts.length;
    }
  };

  const cpuControl = (k: Car, dt: number) => {
    const near = nearWindow(k);
    const [tx, ty] = path[(near + 5) % path.length];
    const diff = wrap(Math.atan2(ty - k.y, tx - k.x) - k.ang);
    const ad = Math.abs(diff);
    const gas = ad < 0.5 || k.v < 140;
    const brake = ad > 0.9 && k.v > 150;
    const turboHit = !k.done && ad < 0.08 && k.onRoad && raceT > 6 && ctx.rand() < 0.004;
    drive(k, dt, diff * 2.6, gas, brake, turboHit);
  };

  const collide = () => {
    for (let i = 0; i < cars.length; i++) for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i], b = cars[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
      if (d > 0 && d < CAR_R * 2) {
        const push = (CAR_R * 2 - d) / 2, nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
        a.v *= 0.97; b.v *= 0.97;
        if ((!a.cpu || !b.cpu) && crashCd <= 0) { ctx.sfx('crash', { gain: 0.6 }); crashCd = 0.5; a.bump = b.bump = 0.25; }
      }
    }
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    const p = player();
    if (p.done) {
      ctx.end({ score: Math.round(p.finishT * 10) / 10, won: p.place === 1, summary: ctx.t('Finis posisi {p} dari 4 di {track}, waktu {s}', { p: p.place, track: ctx.t(tr.name), s: fmt(p.finishT) }) });
    } else {
      ctx.end({ score: 0, won: false, summary: ctx.t('Tidak finis dalam {n} detik', { n: LIMIT }) });
    }
  };

  return {
    update(dt, inp) {
      clock += dt;
      crashCd = Math.max(0, crashCd - dt);
      if (phase === 'select') {
        const edge = inp.ax > 0.5 && lastAx <= 0.5 ? 1 : inp.ax < -0.5 && lastAx >= -0.5 ? -1 : 0;
        lastAx = inp.ax;
        const d = inp.hit.right ? 1 : inp.hit.left ? -1 : edge;
        if (d) { sel = (sel + d + TRACKS.length) % TRACKS.length; ctx.sfx('ui'); }
        if (inp.hit.a) { ctx.sfx('confirm'); setup(); hud(); }
        return;
      }
      if (phase === 'count') {
        const before = Math.ceil(count);
        count -= dt;
        if (count <= 0) { phase = 'race'; msg = ctx.t('Jalan!'); msgT = 0; ctx.sfx('start'); }
        else if (Math.ceil(count) !== before) ctx.sfx('beep');
        return;
      }
      raceT += dt;
      msgT += dt;
      doneT += dt;
      const p = player();
      for (const k of cars) {
        if (k.cpu) cpuControl(k, dt);
        else if (phase === 'race') drive(k, dt, inp.ax, inp.down.a || inp.down.up, inp.down.b || inp.down.down, inp.hit.x || inp.hit.y);
        else drive(k, dt, 0, false, true, false);
      }
      collide();
      engineT -= dt;
      if (engineT <= 0 && phase === 'race') { engineT = 0.22; ctx.sfx('engine', { rate: 0.8 + Math.abs(p.v) / V_ROAD, gain: 0.5 }); }
      if (phase === 'race') {
        if (p.done) { phase = 'done'; doneT = 0; msg = ctx.t('Finis! Posisi {p}', { p: p.place }); }
        else if (raceT >= LIMIT) { phase = 'done'; doneT = 0; msg = ctx.t('Waktu habis'); ctx.sfx('lose'); }
      } else if (phase === 'done' && doneT > 1.8) finish();
      hud();
    },

    render() {
      if (phase === 'select') { renderSelect(); return; }
      const p = player();
      const shake = !ctx.reducedMotion && p.bump > 0 ? Math.sin(clock * 80) * 3 : 0;
      // camera leads a little in the driving direction so the road ahead is visible
      const camX = p.x + Math.cos(p.ang) * p.v * 0.22 + shake;
      const camY = p.y + Math.sin(p.ang) * p.v * 0.22;
      const ox = w / 2 - camX, oy = h / 2 - camY;
      g.fillStyle = PAL.grass;
      g.fillRect(0, 0, w, h);
      const T = 80;
      const i0 = Math.floor((camX - w / 2) / T), j0 = Math.floor((camY - h / 2) / T);
      for (let i = i0; i <= i0 + Math.ceil(w / T) + 1; i++) for (let j = j0; j <= j0 + Math.ceil(h / T) + 1; j++) {
        const sx = i * T + ox, sy = j * T + oy;
        if ((i + j) & 1) { g.fillStyle = '#6a9453'; g.fillRect(sx, sy, T, T); }
        const hsh = Math.abs(((i * 73856093) ^ (j * 19349663)) % 97);
        if (hsh < 9) {
          const tx = i * T + 20 + (hsh * 7) % 40, ty = j * T + 20 + (hsh * 13) % 40;
          if (distToRoad(path, tx, ty) > tr.hw + 40) drawTree(tx + ox, ty + oy, 14 + (hsh % 4) * 3);
        }
      }
      g.save();
      g.translate(ox, oy);
      g.lineJoin = 'round';
      g.lineCap = 'round';
      const loop = () => { g.beginPath(); g.moveTo(path[0][0], path[0][1]); for (const q of path) g.lineTo(q[0], q[1]); g.closePath(); };
      loop(); g.strokeStyle = '#e9dfc9'; g.lineWidth = tr.hw * 2 + 12; g.stroke();
      loop(); g.strokeStyle = PAL.road; g.lineWidth = tr.hw * 2; g.stroke();
      loop(); g.setLineDash([22, 22]); g.strokeStyle = 'rgba(255,250,240,0.45)'; g.lineWidth = 3; g.stroke(); g.setLineDash([]);
      gate(0, true);
      if (!p.done) gate(p.next, false);
      for (const k of [...cars].sort((a, b) => a.y - b.y)) drawCar(k);
      g.restore();
      renderHud(p);
    },

    snapshot: () => {
      const p = cars.length ? player() : null;
      return {
        phase, sel, track: tr.name, raceT: Math.round(raceT * 100) / 100,
        player: p ? { x: p.x, y: p.y, ang: p.ang, v: p.v, lap: p.lap, next: p.next, done: p.done, place: p.place, onRoad: p.onRoad, turbos: p.turbos, turbo: p.turbo, pos: p.done ? p.place : posOf(p) } : null,
        cpus: cars.filter((k) => k.cpu).map((k) => ({ id: k.c.id, lap: k.lap, next: k.next, done: k.done, finishT: Math.round(k.finishT * 100) / 100, place: k.place })),
      };
    },
  };

  function gate(i: number, start: boolean) {
    const n = tr.pts.length;
    const [x, y] = tr.pts[i];
    const a = tr.pts[(i + 1) % n], b = tr.pts[(i - 1 + n) % n];
    g.save();
    g.translate(x, y);
    g.rotate(Math.atan2(a[1] - b[1], a[0] - b[0]));
    const hw = tr.hw;
    if (start) {
      const sq = 8;
      for (let r = -hw; r < hw; r += sq) for (let c = 0; c < 2; c++) {
        g.fillStyle = ((Math.round(r / sq) + c) & 1) ? '#1d2a23' : '#fffaf0';
        g.fillRect(-sq + c * sq, r, sq, sq);
      }
    } else {
      const pulse = ctx.reducedMotion ? 0.55 : 0.45 + Math.sin(clock * 6) * 0.2;
      g.fillStyle = `rgba(217,164,65,${pulse})`;
      g.fillRect(-3, -hw, 6, hw * 2);
      g.fillStyle = PAL.gold;
      for (const s of [-1, 1]) { g.beginPath(); g.arc(0, s * (hw + 8), 7, 0, Math.PI * 2); g.fill(); }
    }
    g.restore();
  }

  function drawCar(k: Car) {
    g.save();
    g.translate(k.x, k.y);
    g.rotate(k.ang);
    if (k.turbo > 0) {
      g.fillStyle = 'rgba(217,164,65,0.85)';
      g.beginPath(); g.moveTo(-20, -6); g.lineTo(-38 - (ctx.reducedMotion ? 0 : Math.sin(clock * 50) * 5), 0); g.lineTo(-20, 6); g.fill();
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    roundRect(g, -19, -9, 42, 24, 7);
    g.fillStyle = '#2b2b2b';
    for (const [wx, wy] of [[-16, -14], [7, -14], [-16, 9], [7, 9]]) g.fillRect(wx, wy, 11, 5);
    g.fillStyle = k.c.main;
    roundRect(g, -21, -11, 42, 22, 7);
    g.fillStyle = k.c.accent;
    g.fillRect(-21, -2, 42, 4);
    g.fillStyle = 'rgba(191,224,230,0.9)';
    roundRect(g, 9, -8, 7, 16, 3);
    g.restore();
    drawToken(g, k.c, k.x - Math.cos(k.ang) * 3, k.y - Math.sin(k.ang) * 3, 9, clock, Math.abs(k.v) > 20);
    const label = k.cpu ? k.c.name : ctx.t('Kamu');
    g.font = "700 11px 'Alegreya Sans', system-ui, sans-serif";
    const tw = g.measureText(label).width + 10;
    g.fillStyle = k.cpu ? 'rgba(29,42,35,0.78)' : 'rgba(184,69,46,0.92)';
    roundRect(g, k.x - tw / 2, k.y - 38, tw, 15, 5);
    text(g, label, k.x, k.y - 30, 11, '#fffaf0');
  }

  function drawTree(x: number, y: number, r: number) {
    if (x < -r || y < -r || x > w + r || y > h + r) return;
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.beginPath(); g.ellipse(x + 4, y + 6, r, r * 0.7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = PAL.green;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#2f6a4e';
    g.beginPath(); g.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, Math.PI * 2); g.fill();
  }

  function renderHud(p: Car) {
    g.fillStyle = 'rgba(255,250,240,0.93)';
    roundRect(g, 10, 10, 156, 86, 10);
    text(g, ctx.t('Putaran {l}/{n}', { l: Math.min(p.lap + 1, LAPS), n: LAPS }), 22, 28, 17, PAL.ink, 'left');
    text(g, ctx.t('Posisi {p}/4', { p: p.done ? p.place : posOf(p) }), 22, 51, 17, PAL.accent, 'left');
    text(g, fmt(raceT), 22, 74, 17, PAL.ink2, 'left');
    text(g, ctx.t('Turbo'), 132, 54, 12, PAL.ink2);
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i < p.turbos ? PAL.gold : 'rgba(29,42,35,0.18)';
      g.beginPath(); g.moveTo(112 + i * 14, 66); g.lineTo(122 + i * 14, 74); g.lineTo(112 + i * 14, 82); g.closePath(); g.fill();
    }
    // minimap
    const xs = tr.pts.map((q) => q[0]), ys = tr.pts.map((q) => q[1]);
    const minX = Math.min(...xs) - 80, minY = Math.min(...ys) - 80;
    const sc = Math.min(120 / (Math.max(...xs) + 80 - minX), 84 / (Math.max(...ys) + 80 - minY));
    const mx = w - 140, my = 10;
    g.fillStyle = 'rgba(255,250,240,0.93)';
    roundRect(g, mx, my, 130, 94, 10);
    g.save();
    g.translate(mx + 5, my + 5);
    g.beginPath();
    path.forEach((q, i) => (i ? g.lineTo((q[0] - minX) * sc, (q[1] - minY) * sc) : g.moveTo((q[0] - minX) * sc, (q[1] - minY) * sc)));
    g.closePath();
    g.strokeStyle = PAL.road; g.lineWidth = 4; g.stroke();
    if (!p.done) { const [nx, ny] = tr.pts[p.next]; g.fillStyle = PAL.gold; g.beginPath(); g.arc((nx - minX) * sc, (ny - minY) * sc, 4, 0, Math.PI * 2); g.fill(); }
    for (const k of cars) {
      g.fillStyle = k.cpu ? k.c.main : PAL.red;
      g.beginPath(); g.arc((k.x - minX) * sc, (k.y - minY) * sc, k.cpu ? 3 : 4.5, 0, Math.PI * 2); g.fill();
    }
    g.restore();
    if (phase === 'count') banner(String(Math.ceil(count)), 64);
    else if (phase === 'done') banner(msg, 34);
    else {
      if (msg && msgT < 1.2) banner(msg, 34);
      if (!p.onRoad) bottom(ctx.t('Rumput! Kembali ke aspal'), PAL.red);
      else if (raceT < 8) bottom(ctx.t('Lewati gerbang emas berurutan'), PAL.ink);
      else if (LIMIT - raceT < 30) bottom(ctx.t('Sisa waktu {s} detik', { s: Math.ceil(LIMIT - raceT) }), PAL.red);
    }
  }

  function banner(s: string, size: number) {
    g.font = `800 ${size}px 'Alegreya Sans', system-ui, sans-serif`;
    const bw = g.measureText(s).width + 48;
    g.fillStyle = 'rgba(29,42,35,0.82)';
    roundRect(g, w / 2 - bw / 2, h / 2 - size * 0.9 - 40, bw, size * 1.8, 14);
    text(g, s, w / 2, h / 2 - 40, size, '#fffaf0', 'center', 800);
  }

  function bottom(s: string, color: string) {
    g.font = "700 16px 'Alegreya Sans', system-ui, sans-serif";
    const bw = g.measureText(s).width + 28;
    g.fillStyle = 'rgba(255,250,240,0.93)';
    roundRect(g, w / 2 - bw / 2, h - 44, bw, 30, 10);
    text(g, s, w / 2, h - 29, 16, color);
  }

  function renderSelect() {
    g.fillStyle = PAL.bg;
    g.fillRect(0, 0, w, h);
    text(g, ctx.t('Balap Drone'), w / 2, 30, 28, PAL.green, 'center', 800);
    text(g, ctx.t('Pilih lintasan'), w / 2, 58, 17, PAL.ink2);
    const t0 = TRACKS[sel], p0 = paths[sel];
    const xs = t0.pts.map((q) => q[0]), ys = t0.pts.map((q) => q[1]);
    const minX = Math.min(...xs) - 100, minY = Math.min(...ys) - 100;
    const spanX = Math.max(...xs) + 100 - minX, spanY = Math.max(...ys) + 100 - minY;
    const bw = 380, bh = 210, bx = w / 2 - bw / 2, by = 78;
    const sc = Math.min(bw / spanX, bh / spanY);
    g.fillStyle = PAL.grass;
    roundRect(g, bx - 10, by - 6, bw + 20, bh + 12, 14);
    g.save();
    g.translate(bx + (bw - spanX * sc) / 2, by + (bh - spanY * sc) / 2);
    g.beginPath();
    p0.forEach((q, i) => (i ? g.lineTo((q[0] - minX) * sc, (q[1] - minY) * sc) : g.moveTo((q[0] - minX) * sc, (q[1] - minY) * sc)));
    g.closePath();
    g.lineJoin = 'round';
    g.strokeStyle = '#e9dfc9'; g.lineWidth = t0.hw * 2 * sc + 4; g.stroke();
    g.strokeStyle = PAL.road; g.lineWidth = t0.hw * 2 * sc; g.stroke();
    t0.pts.forEach((q, i) => { g.fillStyle = i === 0 ? '#fffaf0' : PAL.gold; g.beginPath(); g.arc((q[0] - minX) * sc, (q[1] - minY) * sc, i === 0 ? 5 : 3, 0, Math.PI * 2); g.fill(); });
    g.restore();
    text(g, `◀  ${ctx.t(t0.name)}  ▶`, w / 2, by + bh + 30, 22, PAL.ink, 'center', 800);
    text(g, ctx.t('{n} gerbang · 3 putaran · {i}/{m}', { n: t0.pts.length, i: sel + 1, m: TRACKS.length }), w / 2, by + bh + 54, 15, PAL.ink2);
    text(g, ctx.t('Kiri/kanan: ganti lintasan · A: mulai'), w / 2, h - 18, 15, PAL.accent);
  }
}

export default { meta, create } satisfies GameModule;

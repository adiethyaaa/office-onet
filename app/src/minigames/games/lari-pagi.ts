// Lari Pagi (treadmill and exercise bike, L2-GYM). Rhythm runner: alternate
// left and right on the beat. A step close to the target interval raises the
// speed toward the cap of the current segment; off-beat steps, the same foot
// twice or standing still lower it. Mashing faster than the beat, or holding a
// very high speed, drains stamina; at zero the runner is winded for a moment.
import type { GameCtx, GameInstance, GameModule } from '../types';
import { PAL, drawChar, roundRect, text } from '../cast';

export const DURATION = 60;
const FRAMES = DURATION * 60;

/** Tempo plan: step interval (s) and the speed cap it allows (km/h). */
export const SEGMENTS = [
  { until: 10, beat: 0.5, cap: 10, name: 'Pemanasan' },
  { until: 25, beat: 0.4, cap: 14, name: 'Lari' },
  { until: 38, beat: 0.34, cap: 18, name: 'Sprint' },
  { until: 50, beat: 0.4, cap: 14, name: 'Lari' },
  { until: 60, beat: 0.32, cap: 19, name: 'Sprint akhir' },
];
export const PERFECT = 0.14;
export const GOOD = 0.3;
const TOO_FAST = 0.65;
const WIN_METERS = 200;

const meta: GameModule['meta'] = {
  id: 'lari-pagi', title: 'Lari Pagi', place: 'treadmill', music: 'gym',
  blurb: 'Lari 60 detik di treadmill. Tekan kiri dan kanan bergantian mengikuti ketukan.',
  controls: ['Kiri dan kanan (atau A dan B) bergantian: langkah', 'Tekan saat lingkaran ritme penuh untuk menambah kecepatan', 'Terlalu cepat menguras stamina'],
  view: { w: 640, h: 400 }, score: { unit: 'meter', higherIsBetter: true }, touch: ['left', 'right', 'a', 'b'],
};

type Grade = 'pas' | 'bagus' | 'meleset' | 'cepat' | 'salah';
const FEEDBACK: Record<Grade, string> = { pas: 'Pas!', bagus: 'Bagus', meleset: 'Meleset', cepat: 'Terlalu cepat', salah: 'Kaki salah' };

export const segmentAt = (t: number) => SEGMENTS.find((s) => t < s.until) ?? SEGMENTS[SEGMENTS.length - 1];

function create(ctx: GameCtx): GameInstance {
  const { g, w, h } = ctx;
  const me = ctx.cast.find((c) => c.id === ctx.playerId) ?? ctx.cast[0];
  let frame = 0;
  let time = 0;
  let speed = 0;
  let dist = 0;
  let stamina = 100;
  let winded = 0;
  let lastFoot: 'L' | 'R' | null = null;
  let sinceStep = 9;
  let runT = 0;
  let belt = 0;
  let fb: Grade | null = null;
  let fbT = 0;
  let combo = 0;
  let bestCombo = 0;
  const counts: Record<Grade, number> = { pas: 0, bagus: 0, meleset: 0, cepat: 0, salah: 0 };
  let segName = SEGMENTS[0].name;
  let ended = false;

  const hud = () => ctx.setHud(ctx.t('{m} m · {v} km/jam · {s} detik', { m: Math.floor(dist), v: speed.toFixed(1), s: Math.ceil(DURATION - time) }));
  hud();

  const grade = (gr: Grade) => {
    fb = gr; fbT = 0.6; counts[gr]++;
    if (gr === 'pas' || gr === 'bagus') { combo++; bestCombo = Math.max(bestCombo, combo); } else combo = 0;
  };

  const step = (foot: 'L' | 'R') => {
    const seg = segmentAt(time);
    if (winded > 0) { ctx.sfx('breath', { gain: 0.5 }); return; }
    if (foot === lastFoot) {
      grade('salah');
      speed = Math.max(0, speed - 1.2);
      ctx.sfx('wrong', { gain: 0.5 });
      sinceStep = 0;
      return;
    }
    const ratio = sinceStep / seg.beat;
    const first = lastFoot === null || sinceStep > seg.beat * 2.5;
    lastFoot = foot;
    sinceStep = 0;
    ctx.sfx('step', { rate: foot === 'L' ? 0.9 : 1.1 });
    if (first) { speed = Math.min(seg.cap, speed + 0.6); return; }
    if (ratio < TOO_FAST) {
      grade('cepat');
      speed = Math.min(seg.cap + 2, speed + 0.25);
      stamina -= 7;
      return;
    }
    const off = Math.abs(ratio - 1);
    if (off <= PERFECT) {
      grade('pas');
      speed = Math.min(seg.cap, speed + 0.5 + Math.max(0, seg.cap - speed) * 0.18);
      if (combo % 8 === 0) ctx.sfx('beep', { rate: 1.4, gain: 0.5 });
    } else if (off <= GOOD) {
      grade('bagus');
      // near-misses hold a jog; only on-beat steps reach the segment cap
      const jog = seg.cap * 0.75;
      speed = speed < jog ? Math.min(jog, speed + 0.25 + (jog - speed) * 0.08) : Math.max(jog, speed - 0.15);
    } else {
      grade('meleset');
      speed = speed > 5 ? Math.max(5, speed - 0.9) : Math.min(5, speed + 0.3);
    }
  };

  const finish = () => {
    if (ended) return;
    ended = true;
    const m = Math.round(dist);
    ctx.sfx(m >= WIN_METERS ? 'win' : 'confirm');
    ctx.end({ score: m, won: m >= WIN_METERS, summary: ctx.t('{m} meter, rata-rata {v} km/jam, ritme pas {p} kali', { m, v: (dist / DURATION * 3.6).toFixed(1), p: counts.pas }) });
  };

  return {
    update(dt, inp) {
      if (ended) return;
      frame++;
      time = frame / 60;
      const seg = segmentAt(time);
      if (seg.name !== segName) { segName = seg.name; ctx.sfx('alarm', { gain: 0.4 }); }
      sinceStep += dt;
      fbT = Math.max(0, fbT - dt);
      const left = inp.hit.left || inp.hit.a;
      const right = inp.hit.right || inp.hit.b;
      if (left && !right) step('L');
      else if (right && !left) step('R');
      if (winded > 0) {
        winded = Math.max(0, winded - dt);
        speed = Math.max(4, speed - 6 * dt);
        stamina = Math.min(100, stamina + 14 * dt);
      } else {
        if (sinceStep > seg.beat * 1.6) speed = Math.max(0, speed - 4 * dt);
        if (speed > seg.cap) speed = Math.max(seg.cap, speed - 2.5 * dt);
        speed = Math.max(0, speed - 0.25 * dt);
        stamina -= Math.max(0, speed - 16) * 0.8 * dt;
        if (speed < 12) stamina += (speed < 6 ? 9 : 5) * dt;
        stamina = Math.min(100, stamina);
        if (stamina <= 0) { stamina = 0; winded = 3; combo = 0; ctx.sfx('hurt'); }
      }
      dist += (speed / 3.6) * dt;
      runT += dt * Math.min(1.3, 0.35 + speed / 16);
      belt = (belt + speed * 6 * dt) % 40;
      if (frame % 6 === 0) hud();
      if (frame >= FRAMES) { hud(); finish(); }
    },

    render() {
      const seg = segmentAt(time);
      // wall, window with morning sky, floor
      g.fillStyle = PAL.sand;
      g.fillRect(0, 0, w, h);
      g.fillStyle = PAL.sky;
      roundRect(g, 200, 40, 240, 120, 10);
      g.fillStyle = '#f6d58a';
      g.beginPath(); g.arc(250, 120, 22, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#9cc28a';
      g.beginPath(); g.ellipse(330, 165, 140, 36, 0, Math.PI, Math.PI * 2); g.fill();
      g.strokeStyle = PAL.surface; g.lineWidth = 6;
      g.strokeRect(200, 40, 240, 120);
      g.beginPath(); g.moveTo(320, 40); g.lineTo(320, 160); g.stroke();
      g.fillStyle = '#d7c7a6';
      g.fillRect(0, 300, w, 100);
      // treadmill
      g.fillStyle = '#3a3a38';
      roundRect(g, 170, 286, 300, 30, 12);
      g.fillStyle = PAL.road;
      g.fillRect(186, 290, 268, 14);
      g.fillStyle = 'rgba(255,250,240,0.25)';
      for (let x = 186 - belt; x < 454; x += 40) g.fillRect(Math.max(186, x), 292, 6, 10);
      g.fillStyle = '#5b5b58';
      g.fillRect(430, 196, 10, 92);
      roundRect(g, 404, 184, 62, 22, 6);
      g.fillStyle = PAL.blue;
      g.fillRect(410, 189, 50, 12);
      const pose = speed < 0.8 ? 'idle' : winded > 0 ? 'walk' : 'run';
      drawChar(g, me, 320, 292, 150, 1, pose, runT);
      // stats panel
      g.fillStyle = 'rgba(255,250,240,0.95)';
      roundRect(g, 14, 14, 168, 112, 12);
      text(g, ctx.t('Jarak'), 26, 32, 14, PAL.ink2, 'left');
      text(g, ctx.t('{m} m', { m: Math.floor(dist) }), 26, 56, 28, PAL.ink, 'left', 800);
      text(g, ctx.t('Kecepatan'), 26, 84, 14, PAL.ink2, 'left');
      text(g, ctx.t('{v} km/jam', { v: speed.toFixed(1) }), 26, 106, 22, PAL.accent, 'left', 800);
      // time and segment panel
      g.fillStyle = 'rgba(255,250,240,0.95)';
      roundRect(g, w - 182, 14, 168, 112, 12);
      text(g, ctx.t('Sisa waktu'), w - 170, 32, 14, PAL.ink2, 'left');
      text(g, `${Math.ceil(DURATION - time - 1e-9)}`, w - 170, 58, 28, PAL.ink, 'left', 800);
      text(g, ctx.t(seg.name), w - 170, 86, 18, PAL.green, 'left', 800);
      text(g, ctx.t('Batas {v} km/jam', { v: seg.cap }), w - 170, 108, 14, PAL.ink2, 'left');
      // stamina bar
      const sx = w - 182, sy = 138;
      text(g, winded > 0 ? ctx.t('Kelelahan!') : ctx.t('Stamina'), sx + 2, sy + 8, 14, winded > 0 ? PAL.red : PAL.ink2, 'left');
      g.fillStyle = 'rgba(29,42,35,0.15)';
      roundRect(g, sx, sy + 20, 168, 14, 7);
      g.fillStyle = stamina < 25 ? PAL.red : stamina < 50 ? PAL.gold : PAL.green;
      if (stamina > 1) roundRect(g, sx, sy + 20, 168 * stamina / 100, 14, 7);
      renderRhythm(seg.beat);
    },

    snapshot: () => ({
      time: Math.round(time * 1000) / 1000, frame, speed: Math.round(speed * 100) / 100, dist: Math.round(dist * 100) / 100,
      stamina: Math.round(stamina * 10) / 10, winded: winded > 0, lastFoot, seg: segName, beat: segmentAt(time).beat, sinceStep, counts: { ...counts }, bestCombo,
    }),
  };

  function renderRhythm(beat: number) {
    const cx = w / 2, cy = 352;
    g.fillStyle = 'rgba(255,250,240,0.95)';
    roundRect(g, cx - 214, cy - 34, 428, 68, 14);
    // foot pads; the one to press next glows
    const want = lastFoot === 'L' ? 'R' : 'L';
    const pad = (x: number, label: string, on: boolean) => {
      g.fillStyle = on ? PAL.green : 'rgba(29,42,35,0.12)';
      roundRect(g, x - 34, cy - 22, 68, 44, 10);
      text(g, label, x, cy, 16, on ? '#fffaf0' : PAL.ink2, 'center', 800);
    };
    pad(cx - 172, ctx.t('◀ Kiri'), want === 'L');
    pad(cx + 172, ctx.t('Kanan ▶'), want === 'R');
    // ring fills from the last step; the gold band is the on-beat window
    const r = 24;
    const frac = Math.min(1.6, sinceStep / beat);
    g.lineWidth = 8;
    g.strokeStyle = 'rgba(29,42,35,0.12)';
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.strokeStyle = PAL.gold;
    g.lineWidth = 12;
    g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2 - PERFECT * Math.PI * 2, -Math.PI / 2 + PERFECT * Math.PI * 2); g.stroke();
    const onBeat = Math.abs(frac - 1) <= PERFECT;
    g.strokeStyle = onBeat ? PAL.green : frac < TOO_FAST ? PAL.red : PAL.blue;
    g.lineWidth = 6;
    g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.min(1, frac) * Math.PI * 2); g.stroke();
    // feedback word in the gap between the ring and the pads
    if (fb && fbT > 0) {
      const col = fb === 'pas' ? PAL.green : fb === 'bagus' ? PAL.blue : PAL.red;
      text(g, ctx.t(FEEDBACK[fb]), cx - 86, cy, 14, col, 'center', 800);
    }
    if (combo >= 4) text(g, ctx.t('Ritme x{n}', { n: combo }), cx + 86, cy, 14, PAL.accent, 'center', 800);
  }
}

export default { meta, create } satisfies GameModule;

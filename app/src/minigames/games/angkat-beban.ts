// Angkat Beban (dumbbell rack, L2-GYM). Timing game: a marker swings along a
// vertical bar; press A while it sits in the green zone. Ten reps, each one
// with a smaller zone and a faster marker. The chosen weight multiplies the
// score but also speeds the marker up.
import type { GameCtx, GameInstance, GameModule } from '../types';
import { PAL, drawChar, text, roundRect, type Pose } from '../cast';

export const REPS = 10;
export const WEIGHTS = [5, 10, 15];
const SPEED_MUL: Record<number, number> = { 5: 1, 10: 1.2, 15: 1.4 };
/** Points per rep before the weight multiplier. */
export const PTS = { full: 10, near: 4, far: 2, timeout: 0 };
const BASE_SPEED = 0.55; // bar lengths per second
const REP_TIMEOUT = 6;
const READY = 0.7;
const LIFT_TIME = 1.5;

const meta: GameModule['meta'] = {
  id: 'angkat-beban', title: 'Angkat Beban', place: 'dumbbell_rack', music: 'gym',
  blurb: 'Tekan A saat penanda di zona hijau. 10 repetisi, makin lama makin cepat.',
  controls: ['Kiri/kanan: pilih berat (5, 10, 15 kg)', 'A: mulai lalu angkat saat penanda di zona hijau', 'Beban berat mengalikan skor tapi penanda lebih cepat'],
  view: { w: 640, h: 400 }, score: { unit: 'poin', higherIsBetter: true }, touch: ['left', 'right', 'a'],
};

type Grade = 'full' | 'near' | 'far' | 'timeout';

export function zoneHalf(rep: number) { return 0.13 - (0.08 * rep) / (REPS - 1); }
export function markerSpeed(rep: number, kg: number) { return BASE_SPEED * SPEED_MUL[kg] * (1 + rep * 0.09); }

function create(ctx: GameCtx): GameInstance {
  const { g, w, h } = ctx;
  const me = ctx.cast.find((c) => c.id === ctx.playerId) ?? ctx.cast[0];
  const coach = ctx.cast.find((c) => c.id === 'CH-NETINSTALL') ?? ctx.cast[1];

  let phase: 'pick' | 'swing' | 'lift' | 'done' = 'pick';
  let pick = 0;
  let kg = WEIGHTS[0];
  let rep = 0;
  let pos = 0.5, dir = 1;
  let zoneC = 0.5;
  let repTime = 0;
  let lift = 0, liftFull = false;
  let points = 0;
  const grades: Grade[] = [];
  let time = 0, flash = 0;
  let lastGrade: Grade | null = null;

  const score = () => points * kg;
  const hud = () => ctx.setHud(phase === 'pick'
    ? ctx.t('Pilih berat')
    : ctx.t('Rep {r}/10 · {s} poin', { r: Math.min(REPS, rep + (phase === 'swing' ? 1 : 0)), s: score() }));

  function nextRep() {
    phase = 'swing';
    // brief set-up pause: marker holds still and A is ignored
    repTime = -READY;
    const hw = zoneHalf(rep);
    zoneC = hw + 0.05 + ctx.rand() * (1 - 2 * hw - 0.1);
    // start far from the zone so the first pass is a fair read
    pos = zoneC > 0.5 ? 0.02 : 0.98;
    dir = pos < 0.5 ? 1 : -1;
    hud();
  }

  function judge(timeout: boolean) {
    const hw = zoneHalf(rep);
    const d = Math.abs(pos - zoneC);
    const grade: Grade = timeout ? 'timeout' : d <= hw ? 'full' : d <= hw * 2.5 ? 'near' : 'far';
    grades.push(grade);
    points += PTS[grade];
    lastGrade = grade;
    liftFull = grade === 'full';
    phase = 'lift';
    lift = 0;
    flash = 0.35;
    ctx.sfx(grade === 'full' ? 'clank' : grade === 'timeout' ? 'wrong' : 'thud', { rate: grade === 'full' ? 1 : 0.8 });
    if (grade === 'full') ctx.sfx('breath');
    rep++;
    hud();
  }

  hud();

  return {
    update(dt, inp) {
      time += dt;
      flash = Math.max(0, flash - dt);
      if (phase === 'done') return;
      if (phase === 'pick') {
        if (inp.hit.left && pick > 0) { pick--; ctx.sfx('ui'); }
        if (inp.hit.right && pick < WEIGHTS.length - 1) { pick++; ctx.sfx('ui'); }
        kg = WEIGHTS[pick];
        if (inp.hit.a) { ctx.sfx('confirm'); nextRep(); }
        return;
      }
      if (phase === 'lift') {
        lift += dt / LIFT_TIME;
        if (lift >= 1) {
          if (rep >= REPS) {
            phase = 'done';
            const full = grades.filter((x) => x === 'full').length;
            ctx.sfx(full >= 7 ? 'win' : 'confirm');
            ctx.end({ score: score(), won: full >= 7, summary: ctx.t('{f}/10 angkat penuh · {kg} kg', { f: full, kg }) });
          } else nextRep();
        }
        return;
      }
      repTime += dt;
      if (repTime < 0) return;
      pos += dir * markerSpeed(rep, kg) * dt;
      if (pos >= 1) { pos = 2 - pos; dir = -1; }
      if (pos <= 0) { pos = -pos; dir = 1; }
      if (inp.hit.a) judge(false);
      else if (repTime >= REP_TIMEOUT) judge(true);
    },

    render() {
      g.fillStyle = PAL.sand;
      g.fillRect(0, 0, w, h);
      // gym wall: mirror strip and rubber floor
      g.fillStyle = '#dfe9ea';
      g.fillRect(30, 40, 360, 220);
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath(); g.moveTo(70, 40); g.lineTo(130, 40); g.lineTo(60, 260); g.lineTo(30, 260); g.closePath(); g.fill();
      g.strokeStyle = '#b9a98c'; g.lineWidth = 4; g.strokeRect(30, 40, 360, 220);
      g.fillStyle = '#3f4744';
      g.fillRect(0, h - 70, w, 70);
      g.fillStyle = '#4b5551';
      for (let x = 0; x < w; x += 80) g.fillRect(x, h - 70, 2, 70);
      drawRack(g, 410, h - 70);

      const feet = h - 74;
      const charH = 190;
      const charX = 210;
      let pose: Pose = 'idle';
      let stage = 0;
      if (phase === 'lift') {
        // up then back down
        const k = lift < 0.55 ? lift / 0.55 : Math.max(0, 1 - (lift - 0.55) / 0.45);
        const top = liftFull ? 2 : 1;
        stage = Math.round(k * top);
        pose = stage === 2 ? 'win' : stage === 1 ? 'punch' : 'idle';
      } else if (phase === 'done') { pose = 'win'; stage = 2; }
      // idle bob would shift the hands away from the drawn dumbbells
      drawChar(g, me, charX, feet, charH, 1, pose, phase === 'pick' ? time : 0);
      if (phase !== 'pick') drawHeldDumbbells(g, charX, feet, charH, stage, kg);
      text(g, ctx.t('Kamu'), charX, h - 40, 15, PAL.surface);
      drawChar(g, coach, 80, feet, 120, 1, lastGrade === 'full' && phase === 'lift' ? 'win' : 'idle', time);
      text(g, ctx.t('Pelatih'), 80, h - 40, 15, PAL.surface);

      if (phase === 'pick') {
        g.fillStyle = 'rgba(255,250,240,0.95)';
        roundRect(g, 150, 70, 340, 200, 16);
        text(g, ctx.t('Pilih berat'), 320, 100, 24, PAL.ink);
        WEIGHTS.forEach((wk, i) => {
          const x = 210 + i * 110, sel = i === pick;
          g.fillStyle = sel ? PAL.green : '#e7dcc4';
          roundRect(g, x - 44, 124, 88, 82, 12);
          drawDumbbellIcon(g, x, 152, 0.7 + i * 0.15, sel ? '#f4ecdc' : '#4d4a46');
          text(g, ctx.t('{kg} kg', { kg: wk }), x, 186, 18, sel ? PAL.surface : PAL.ink);
        });
        text(g, ctx.t('Skor x{m}, penanda x{s}', { m: kg, s: SPEED_MUL[kg].toFixed(1) }), 320, 228, 15, PAL.ink2, 'center', 600);
        text(g, ctx.t('◀ ▶ pilih · A mulai'), 320, 252, 15, PAL.accent);
        return;
      }

      // timing bar
      const bx = 560, by = 40, bh = 290, bw = 36;
      g.fillStyle = 'rgba(29,42,35,0.85)';
      roundRect(g, bx - bw / 2 - 8, by - 8, bw + 16, bh + 16, 12);
      g.fillStyle = '#e9e1cf';
      g.fillRect(bx - bw / 2, by, bw, bh);
      const hw = zoneHalf(Math.min(rep, REPS - 1));
      const show = phase === 'swing' ? zoneHalf(rep) : hw;
      // pos 0 = bottom
      const yOf = (p: number) => by + bh - p * bh;
      g.fillStyle = 'rgba(217,164,65,0.55)';
      g.fillRect(bx - bw / 2, yOf(Math.min(1, zoneC + show * 2.5)), bw, (Math.min(1, zoneC + show * 2.5) - Math.max(0, zoneC - show * 2.5)) * bh);
      g.fillStyle = '#4f9a5c';
      g.fillRect(bx - bw / 2, yOf(zoneC + show), bw, show * 2 * bh);
      const my = yOf(pos);
      g.fillStyle = PAL.red;
      g.beginPath(); g.moveTo(bx - bw / 2 - 14, my - 8); g.lineTo(bx - bw / 2 - 2, my); g.lineTo(bx - bw / 2 - 14, my + 8); g.fill();
      g.fillStyle = PAL.ink;
      g.fillRect(bx - bw / 2 - 2, my - 2, bw + 4, 4);
      text(g, ctx.t('{kg} kg', { kg }), bx, by + bh + 26, 16, PAL.surface);

      // rep pips
      for (let i = 0; i < REPS; i++) {
        const gr = grades[i];
        g.fillStyle = gr === 'full' ? '#4f9a5c' : gr === 'near' ? PAL.gold : gr ? PAL.red : 'rgba(29,42,35,0.2)';
        g.beginPath(); g.arc(250 + i * 22, 24, 7, 0, Math.PI * 2); g.fill();
      }
      text(g, ctx.t('Rep {r}/10', { r: Math.min(REPS, rep + (phase === 'swing' ? 1 : 0)) }), 236, 24, 16, PAL.ink, 'right');
      text(g, ctx.t('{s} poin', { s: score() }), 462, 110, 20, PAL.ink);

      if (phase === 'swing') text(g, repTime < 0 ? ctx.t('Siap...') : ctx.t('Tekan A di zona hijau!'), 210, 66, 20, PAL.green);
      if (phase === 'lift' && lastGrade) {
        const msg = lastGrade === 'full' ? ctx.t('Angkat penuh!') : lastGrade === 'timeout' ? ctx.t('Terlalu lama') : ctx.t('Setengah angkat');
        text(g, msg, 210, 66, 24, lastGrade === 'full' ? PAL.green : PAL.red);
        if (lastGrade !== 'timeout') text(g, `+${PTS[lastGrade] * kg}`, 462, 140, 20, PAL.accent);
      }
      if (flash > 0 && !ctx.reducedMotion && lastGrade === 'full') { g.fillStyle = `rgba(255,250,240,${flash})`; g.fillRect(0, 0, w, h); }
    },

    snapshot: () => ({ phase, pick, kg, rep, pos: Math.round(pos * 10000) / 10000, zoneC: Math.round(zoneC * 10000) / 10000, zoneHalf: zoneHalf(Math.min(rep, REPS - 1)), speed: markerSpeed(Math.min(rep, REPS - 1), kg), points, score: score(), grades: [...grades] }),
  };
}

/** Hands follow drawChar's arm angles for idle (0), punch (1, front raise) and win (2, overhead). */
function drawHeldDumbbells(g: CanvasRenderingContext2D, x: number, feet: number, hgt: number, stage: number, kg: number) {
  const u = hgt / 100;
  const arms: [number, number, number][] = stage === 2 ? [[-11, 2.9, 0], [9, -2.9, 0]] : stage === 1 ? [[-11, 0.4, 0], [9, -Math.PI / 2, 10]] : [[-11, 0.1, 0], [9, -0.1, 0]];
  const plate = 0.75 + (kg / 15) * 0.5;
  for (const [dx, a, ext] of arms) {
    const hx = x + dx * u - Math.sin(a) * (22 + ext) * u;
    const hy = feet - 60 * u + Math.cos(a) * (22 + ext) * u;
    drawDumbbellIcon(g, hx, hy, plate * u * 0.42, '#2e3431');
  }
}

function drawDumbbellIcon(g: CanvasRenderingContext2D, x: number, y: number, s: number, c: string) {
  g.fillStyle = '#9aa19c';
  g.fillRect(x - 16 * s, y - 2 * s, 32 * s, 4 * s);
  g.fillStyle = c;
  roundRect(g, x - 20 * s, y - 11 * s, 8 * s, 22 * s, 2 * s);
  roundRect(g, x + 12 * s, y - 11 * s, 8 * s, 22 * s, 2 * s);
}

function drawRack(g: CanvasRenderingContext2D, x: number, floor: number) {
  g.fillStyle = '#2e3431';
  g.fillRect(x, floor - 110, 8, 110);
  g.fillRect(x + 112, floor - 110, 8, 110);
  g.fillRect(x, floor - 72, 120, 6);
  g.fillRect(x, floor - 30, 120, 6);
  for (let i = 0; i < 4; i++) {
    drawDumbbellIcon(g, x + 22 + i * 26, floor - 82, 0.55 + i * 0.06, i % 2 ? '#3c6e91' : '#a34a27');
    drawDumbbellIcon(g, x + 22 + i * 26, floor - 40, 0.75 + i * 0.05, '#1d2a23');
  }
}

export default { meta, create } satisfies GameModule;

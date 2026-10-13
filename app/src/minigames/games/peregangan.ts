// Peregangan (exercise mat, L2-GYM). Follow-the-sequence: the coach shows a
// growing list of stretch directions, the player repeats it. Each round adds
// one move. Three mistakes end the session.
import type { Btn, GameCtx, GameInstance, GameModule } from '../types';
import { PAL, drawChar, text, roundRect } from '../cast';

const DIRS: Btn[] = ['up', 'right', 'down', 'left'];
const ARROW: Record<string, string> = { up: '▲', right: '▶', down: '▼', left: '◀' };
const LABEL: Record<string, string> = { up: 'Tangan ke atas', right: 'Condong kanan', down: 'Sentuh lutut', left: 'Condong kiri' };

const meta: GameModule['meta'] = {
  id: 'peregangan', title: 'Peregangan', place: 'exercise_mat', music: 'calm',
  blurb: 'Lihat urutan gerakan, lalu ulangi. Tiap ronde bertambah satu gerakan.',
  controls: ['Panah atau D-pad: pilih gerakan', 'Tiga kali salah, sesi selesai'],
  view: { w: 640, h: 400 }, score: { unit: 'gerakan', higherIsBetter: true }, touch: ['left', 'up', 'down', 'right'],
};

function create(ctx: GameCtx): GameInstance {
  const { g, w, h } = ctx;
  const seq: Btn[] = [];
  let phase: 'show' | 'input' | 'feedback' = 'show';
  let showIdx = 0;
  let timer = 0.6;
  let inputIdx = 0;
  let mistakes = 0;
  let best = 0;
  let pose: Btn | null = null;
  let flash = 0;
  let ok = true;
  let time = 0;
  const me = ctx.cast.find((c) => c.id === ctx.playerId)!;
  const coach = ctx.cast.find((c) => c.id === 'CH-QA') ?? ctx.cast[1];
  const grow = () => { seq.push(DIRS[Math.floor(ctx.rand() * 4)]); phase = 'show'; showIdx = 0; timer = 0.7; inputIdx = 0; };
  grow();
  grow();
  const hud = () => ctx.setHud(ctx.t('Ronde {n} · Salah {m}/3', { n: seq.length - 1, m: mistakes }));
  hud();

  return {
    update(dt, inp) {
      time += dt;
      flash = Math.max(0, flash - dt);
      if (phase === 'show') {
        timer -= dt;
        if (timer <= 0) {
          if (showIdx < seq.length) { pose = seq[showIdx]; ctx.sfx('beep', { rate: 1 + DIRS.indexOf(seq[showIdx]) * 0.12 }); showIdx++; timer = ctx.reducedMotion ? 0.8 : 0.6; }
          else { pose = null; phase = 'input'; }
        } else if (timer < 0.18) pose = null;
        return;
      }
      if (phase === 'feedback') {
        timer -= dt;
        if (timer <= 0) {
          if (mistakes >= 3) { ctx.end({ score: best, summary: ctx.t('Urutan terpanjang: {n} gerakan', { n: best }), won: best >= 5 }); return; }
          if (ok) grow(); else { phase = 'show'; showIdx = 0; timer = 0.7; inputIdx = 0; }
          hud();
        }
        return;
      }
      const pressed = DIRS.find((d) => inp.hit[d]);
      if (!pressed) return;
      pose = pressed;
      flash = 0.2;
      if (pressed === seq[inputIdx]) {
        ctx.sfx('beep', { rate: 1 + DIRS.indexOf(pressed) * 0.12 });
        inputIdx++;
        if (inputIdx === seq.length) { best = Math.max(best, seq.length); ok = true; phase = 'feedback'; timer = 0.7; ctx.sfx('right'); }
      } else {
        mistakes++;
        ok = false;
        phase = 'feedback';
        timer = 0.9;
        ctx.sfx('wrong');
        hud();
      }
    },
    render() {
      g.fillStyle = PAL.sand;
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#d7c7a6';
      g.fillRect(0, h - 70, w, 70);
      g.fillStyle = PAL.green;
      roundRect(g, 120, h - 82, 400, 18, 9);
      // coach on the left shows, player on the right repeats
      const coachPose = phase === 'show' && pose ? pose : null;
      drawStretch(g, coach, 190, h - 70, coachPose, time);
      drawStretch(g, me, 450, h - 70, phase !== 'show' ? pose : null, time);
      text(g, ctx.t('Pelatih'), 190, h - 30, 16, PAL.ink2);
      text(g, ctx.t('Kamu'), 450, h - 30, 16, PAL.ink2);
      const msg = phase === 'show' ? ctx.t('Perhatikan...') : phase === 'input' ? ctx.t('Ulangi: {i}/{n}', { i: inputIdx, n: seq.length }) : ok ? ctx.t('Tepat!') : ctx.t('Salah, ulangi dari awal');
      text(g, msg, w / 2, 34, 26, phase === 'feedback' && !ok ? PAL.red : PAL.ink);
      if (pose) text(g, `${ARROW[pose]} ${ctx.t(LABEL[pose])}`, w / 2, 72, 20, PAL.accent);
      // progress dots
      for (let i = 0; i < seq.length; i++) {
        g.fillStyle = i < inputIdx && phase !== 'show' ? PAL.green : 'rgba(29,42,35,0.2)';
        g.beginPath(); g.arc(w / 2 - (seq.length - 1) * 9 + i * 18, 102, 6, 0, Math.PI * 2); g.fill();
      }
      if (flash > 0) { g.fillStyle = `rgba(255,250,240,${flash})`; g.fillRect(0, 0, w, h); }
    },
    snapshot: () => ({ seq: [...seq], phase, inputIdx, mistakes, best }),
  };
}

function drawStretch(g: CanvasRenderingContext2D, c: GameCtx['cast'][number], x: number, y: number, p: Btn | null, t: number) {
  g.save();
  g.translate(x, y);
  if (p === 'left') g.rotate(-0.25);
  if (p === 'right') g.rotate(0.25);
  if (p === 'down') g.scale(1, 0.82);
  drawChar(g, c, 0, 0, 170, 1, p === 'up' ? 'win' : p === 'down' ? 'crouch' : 'idle', t);
  g.restore();
}

export default { meta, create } satisfies GameModule;

// Tarung Kantor (Game Station slot 2). Side-view one-on-one fighter in arcade
// mode: pick a teammate, then beat three CPU rivals in a row, best of three
// rounds each. Losing a match ends the run with the points earned so far.
import type { CastMember, GameCtx, GameInstance, GameModule } from '../types';
import { PAL, drawChar, roundRect, text, type Pose } from '../cast';

const meta: GameModule['meta'] = {
  id: 'tarung-kantor', title: 'Tarung Kantor', place: 'arcade', music: 'fight',
  blurb: 'Satu lawan satu dengan karakter tim. Kalahkan 3 lawan berturut-turut.',
  controls: [
    'Kiri/Kanan: jalan, Atas: lompat, Bawah: jongkok',
    'Tahan arah menjauhi lawan: blok',
    'A: pukul, B: tendang, X: jurus khas (meter penuh)',
  ],
  view: { w: 640, h: 360 }, score: { unit: 'poin', higherIsBetter: true },
  touch: ['left', 'right', 'up', 'down', 'a', 'b', 'x'],
};

const GROUND = 322;
const XMIN = 26;
const XMAX = 614;
const CH = 110;
const GRAV = 1500;
const ROUND_TIME = 60;
const BLOCK_FACTOR = 0.2;

type AtkKind = 'punch' | 'kick' | 'special';
interface AtkSpec { s: number; a: number; r: number; dmg: number; range: number; y0: number; y1: number; stun: number; kb: number }
// s = startup, a = active, r = recovery (seconds); range is measured from 10 units in front of the body.
const ATK: Record<'punch' | 'kick', AtkSpec> = {
  punch: { s: 0.06, a: 0.08, r: 0.12, dmg: 5, range: 46, y0: -92, y1: -56, stun: 0.24, kb: 120 },
  kick: { s: 0.15, a: 0.1, r: 0.24, dmg: 10, range: 72, y0: -62, y1: -16, stun: 0.38, kb: 240 },
};
const SPECIAL_START = 0.18;
const SPECIAL_TOTAL = 0.5;

type FxKind = 'kabel' | 'wifi' | 'pensil' | 'drone' | 'kuas' | 'penggaris' | 'clipboard' | 'stempel' | 'dasi';
const SPECIAL_OF: Record<string, FxKind> = {
  'CH-NETINSTALL': 'kabel', 'CH-ICTSPEC': 'wifi', 'CH-DESIGNER': 'pensil', 'CH-ASSISTANT': 'drone', 'CH-VISUAL': 'kuas',
  'CH-ARCHITECT': 'penggaris', 'CH-SUPERVISOR': 'clipboard', 'CH-QA': 'stempel', 'CH-CEO': 'dasi',
};
const RANGED: FxKind[] = ['kabel', 'wifi', 'pensil', 'drone', 'stempel'];

interface Ctl { l: boolean; r: boolean; u: boolean; d: boolean; a: boolean; b: boolean; x: boolean }
const NO_CTL: Ctl = { l: false, r: false, u: false, d: false, a: false, b: false, x: false };

interface Fighter {
  c: CastMember; x: number; y: number; vx: number; vy: number; face: 1 | -1;
  hp: number; meter: number; atk: { kind: AtkKind; t: number; hit: boolean; spawned: boolean } | null;
  stun: number; blockstun: number; guard: boolean; crouch: boolean; walk: number; ko: boolean; win: boolean;
}

interface Fx {
  kind: FxKind; owner: 0 | 1; x: number; y: number; vx: number; vy: number; w: number; h: number;
  life: number; t: number; dmg: number; kb: number; stun: number; hit: boolean; face: 1 | -1;
  attach: { dx: number; dy: number } | null; delay: number;
}

interface HitLog { by: 0 | 1; kind: string; raw: number; dmg: number; blocked: boolean }

const LEVELS = [
  { think: 0.5, aggr: 0.55, block: 0.12, atk: 0.42, spec: 0.5 },
  { think: 0.34, aggr: 0.7, block: 0.3, atk: 0.55, spec: 0.7 },
  { think: 0.22, aggr: 0.8, block: 0.5, atk: 0.65, spec: 0.9 },
];

function create(ctx: GameCtx): GameInstance {
  const { g, w, h } = ctx;
  const cast = ctx.cast;
  const SP: Record<FxKind, { name: string; desc: string }> = {
    kabel: { name: ctx.t('Lempar Gulungan Kabel'), desc: ctx.t('Proyektil kabel melaju ke depan') },
    wifi: { name: ctx.t('Tembakan Sinyal WiFi'), desc: ctx.t('Gelombang sinyal cepat jarak jauh') },
    pensil: { name: ctx.t('Lemparan Pensil Warna'), desc: ctx.t('Pensil tajam melesat lurus') },
    drone: { name: ctx.t('Drone Asisten'), desc: ctx.t('Drone kecil terbang pelan, pukulan keras') },
    kuas: { name: ctx.t('Sapuan Kuas Cat'), desc: ctx.t('Sapuan jarak dekat, memukul mundur') },
    penggaris: { name: ctx.t('Penggaris T Panjang'), desc: ctx.t('Sodokan penggaris dengan jangkauan panjang') },
    clipboard: { name: ctx.t('Clipboard Berputar'), desc: ctx.t('Berputar mengenai depan dan belakang') },
    stempel: { name: ctx.t('Cap REJECT'), desc: ctx.t('Stempel jatuh dari atas kepala lawan') },
    dasi: { name: ctx.t('Rapat Mendadak'), desc: ctx.t('Dorongan dasi, lawan terlempar jauh') },
  };

  let phase: 'select' | 'intro' | 'fight' | 'roundEnd' | 'matchEnd' | 'over' = 'select';
  let sel = Math.max(0, cast.findIndex((c) => c.id === ctx.playerId));
  let time = 0;
  let timer = 0;
  let clock = ROUND_TIME;
  let round = 1;
  let pWins = 0;
  let cWins = 0;
  let opIdx = 0;
  let score = 0;
  let opponents: CastMember[] = [];
  let banner = '';
  let matchWon = false;
  let hitstop = 0;
  let shake = 0;
  const fx: Fx[] = [];
  const sparks: { x: number; y: number; t: number; big: boolean }[] = [];
  const hits: HitLog[] = [];
  const specials: string[] = [];
  const ai = { think: 0, intent: 'idle' as 'idle' | 'approach' | 'retreat', blockT: 0, lastPAtk: false, lastFx: 0 };
  let P: Fighter = mkFighter(cast[sel], 170, 1);
  let C: Fighter = mkFighter(cast[(sel + 1) % cast.length], 470, -1);

  function mkFighter(c: CastMember, x: number, face: 1 | -1): Fighter {
    return { c, x, y: GROUND, vx: 0, vy: 0, face, hp: 100, meter: 0, atk: null, stun: 0, blockstun: 0, guard: false, crouch: false, walk: 0, ko: false, win: false };
  }

  const hud = () => ctx.setHud(phase === 'select' ? ctx.t('Pilih karakter') : ctx.t('Lawan {n}/3 · {s} poin', { n: opIdx + 1, s: score }));
  hud();

  function startMatch() {
    C = mkFighter(opponents[opIdx], 470, -1);
    round = 1; pWins = 0; cWins = 0;
    startRound();
  }

  // Super meter carries over between rounds of a match, like a real arcade cabinet.
  function startRound() {
    const pm = P.meter, cm = C.meter;
    P = mkFighter(P.c, 170, 1); P.meter = pm;
    C = mkFighter(C.c, 470, -1); C.meter = cm;
    fx.length = 0;
    clock = ROUND_TIME;
    ai.think = 0.3; ai.intent = 'idle'; ai.blockT = 0; ai.lastPAtk = false; ai.lastFx = 0;
    phase = 'intro';
    timer = 1.6;
    ctx.sfx('start');
    hud();
  }

  function confirmSelect() {
    const pool = cast.filter((_, i) => i !== sel);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(ctx.rand() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    opponents = pool.slice(0, 3);
    P = mkFighter(cast[sel], 170, 1);
    opIdx = 0;
    ctx.sfx('confirm');
    startMatch();
  }

  // ---- combat ----
  function hurtbox(f: Fighter) {
    return { x0: f.x - 18, x1: f.x + 18, y0: f.y - (f.crouch ? 72 : 100), y1: f.y };
  }
  function overlap(a: { x0: number; x1: number; y0: number; y1: number }, b: { x0: number; x1: number; y0: number; y1: number }) {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
  }

  function applyHit(att: Fighter, def: Fighter, raw: number, kb: number, stun: number, dir: number, kind: string) {
    if (def.ko) return;
    const grounded = def.y >= GROUND;
    // dir is the travel direction of the blow; the defender must face against it to guard.
    const fromFront = def.face === -dir;
    const blocked = grounded && !def.atk && def.stun <= 0 && (def.guard || def.blockstun > 0) && fromFront;
    const dmg = blocked ? raw * BLOCK_FACTOR : raw;
    def.hp = Math.max(0, def.hp - dmg);
    const by: 0 | 1 = att === P ? 0 : 1;
    hits.push({ by, kind, raw, dmg: Math.round(dmg * 100) / 100, blocked });
    if (hits.length > 40) hits.shift();
    if (blocked) {
      def.blockstun = stun * 0.6;
      def.vx = dir * kb * 0.5;
      ctx.sfx('block');
      hitstop = 0.03;
    } else {
      def.stun = stun;
      def.vx = dir * kb;
      if (!grounded) def.vy = -260;
      def.atk = null;
      def.crouch = false;
      ctx.sfx(kind === 'special' ? 'thud' : 'hit', { rate: kind === 'punch' ? 1.2 : 0.9 });
      hitstop = kind === 'punch' ? 0.05 : 0.08;
      if (!ctx.reducedMotion) shake = kind === 'punch' ? 0.12 : 0.22;
    }
    sparks.push({ x: (att.x + def.x) / 2 + dir * 8, y: def.y - (def.crouch ? 55 : 70), t: 0.25, big: !blocked && kind !== 'punch' });
    if (kind !== 'special') att.meter = Math.min(100, att.meter + dmg * 2.4);
    def.meter = Math.min(100, def.meter + dmg * 1.6);
    if (by === 0) { score += Math.round(dmg * 10); hud(); }
    if (def.hp <= 0) {
      def.ko = true; def.stun = 0; def.blockstun = 0; def.atk = null;
      def.vy = -320; def.vx = dir * 220;
      ctx.sfx('explode');
    }
  }

  function spawnSpecial(f: Fighter, owner: 0 | 1) {
    const kind = SPECIAL_OF[f.c.id] ?? 'dasi';
    specials.push(`${f.c.id}:${kind}`);
    const opp = owner === 0 ? C : P;
    const base: Fx = { kind, owner, x: f.x + f.face * 30, y: f.y - 66, vx: 0, vy: 0, w: 26, h: 26, life: 2.5, t: 0, dmg: 12, kb: 220, stun: 0.5, hit: false, face: f.face, attach: null, delay: 0 };
    switch (kind) {
      case 'kabel': Object.assign(base, { vx: f.face * 300, w: 28, h: 28, dmg: 14 }); break;
      case 'wifi': Object.assign(base, { vx: f.face * 430, w: 26, h: 44, dmg: 11, kb: 180 }); break;
      case 'pensil': Object.assign(base, { vx: f.face * 370, y: f.y - 76, w: 34, h: 10, dmg: 12 }); break;
      case 'drone': Object.assign(base, { vx: f.face * 170, y: f.y - 86, w: 30, h: 22, dmg: 16, life: 3.6 }); break;
      case 'kuas': Object.assign(base, { attach: { dx: 46, dy: -56 }, w: 72, h: 78, life: 0.2, dmg: 16, kb: 460, stun: 0.55 }); break;
      case 'penggaris': Object.assign(base, { attach: { dx: 92, dy: -70 }, w: 150, h: 18, life: 0.22, dmg: 14, kb: 280 }); break;
      case 'clipboard': Object.assign(base, { attach: { dx: 0, dy: -60 }, w: 132, h: 72, life: 0.5, dmg: 15, kb: 300 }); break;
      case 'stempel': Object.assign(base, { x: opp.x, y: 40, w: 60, h: 40, delay: 0.35, life: 1.6, dmg: 18, kb: 120, stun: 0.7 }); break;
      case 'dasi': Object.assign(base, { attach: { dx: 58, dy: -58 }, w: 100, h: 84, life: 0.26, dmg: 12, kb: 760, stun: 0.6 }); break;
    }
    fx.push(base);
    ctx.sfx(kind === 'stempel' ? 'stamp' : kind === 'wifi' ? 'power' : 'whoosh');
  }

  function stepFighter(f: Fighter, o: Fighter, ctl: Ctl, dt: number) {
    const grounded = f.y >= GROUND;
    if (f.ko || f.win) {
      f.guard = false;
    } else {
      if (grounded && !f.atk && f.stun <= 0) f.face = o.x >= f.x ? 1 : -1;
      const toward = f.face === 1 ? ctl.r : ctl.l;
      const away = f.face === 1 ? ctl.l : ctl.r;
      f.walk = 0;
      if (f.stun > 0) {
        f.stun -= dt;
        f.guard = false;
      } else if (f.blockstun > 0) {
        f.blockstun -= dt;
        f.guard = true;
      } else if (f.atk) {
        f.guard = false;
        const a = f.atk;
        a.t += dt;
        if (a.kind === 'special') {
          if (grounded) f.vx = 0;
          if (!a.spawned && a.t >= SPECIAL_START) { a.spawned = true; spawnSpecial(f, f === P ? 0 : 1); }
          if (a.t >= SPECIAL_TOTAL) f.atk = null;
        } else {
          const s = ATK[a.kind];
          if (grounded) f.vx = a.kind === 'kick' && a.t < s.s ? f.face * 40 : 0;
          if (!a.hit && a.t >= s.s && a.t < s.s + s.a) {
            const box = f.face > 0
              ? { x0: f.x + 10, x1: f.x + 10 + s.range, y0: f.y + s.y0, y1: f.y + s.y1 }
              : { x0: f.x - 10 - s.range, x1: f.x - 10, y0: f.y + s.y0, y1: f.y + s.y1 };
            if (overlap(box, hurtbox(o)) && !o.ko) { a.hit = true; applyHit(f, o, s.dmg, s.kb, s.stun, f.face, a.kind); }
          }
          if (f.atk && a.t >= s.s + s.a + s.r) f.atk = null;
        }
      } else if (grounded) {
        f.crouch = false;
        f.guard = false;
        if (ctl.x && f.meter >= 100) { f.meter = 0; f.atk = { kind: 'special', t: 0, hit: false, spawned: false }; f.vx = 0; }
        else if (ctl.a) { f.atk = { kind: 'punch', t: 0, hit: false, spawned: false }; ctx.sfx('swat', { gain: 0.5 }); }
        else if (ctl.b) { f.atk = { kind: 'kick', t: 0, hit: false, spawned: false }; ctx.sfx('whoosh', { rate: 0.8 }); }
        else if (ctl.u) { f.vy = -560; f.vx = (toward ? 1 : away ? -1 : 0) * f.face * 170; ctx.sfx('jump'); }
        else {
          f.crouch = ctl.d;
          f.guard = away;
          f.vx = f.crouch ? 0 : toward ? f.face * 160 : away ? -f.face * 120 : 0;
          f.walk = f.vx === 0 ? 0 : 1;
        }
      } else {
        f.guard = false;
        if (ctl.a) f.atk = { kind: 'punch', t: 0, hit: false, spawned: false };
        else if (ctl.b) f.atk = { kind: 'kick', t: 0, hit: false, spawned: false };
      }
    }
    if (f.y < GROUND || f.vy < 0) {
      f.vy += GRAV * dt;
      f.y += f.vy * dt;
      if (f.y >= GROUND) {
        f.y = GROUND; f.vy = 0;
        if (f.atk && f.atk.kind !== 'special') f.atk = null;
        if (!f.ko) f.vx = 0;
      }
    } else if (f.stun > 0 || f.blockstun > 0 || f.ko) {
      const dec = 900 * dt;
      f.vx = Math.abs(f.vx) <= dec ? 0 : f.vx - Math.sign(f.vx) * dec;
    }
    f.x = Math.min(XMAX, Math.max(XMIN, f.x + f.vx * dt));
  }

  function separate() {
    if (P.ko || C.ko) return;
    const dx = C.x - P.x;
    if (Math.abs(P.y - C.y) > 70 || Math.abs(dx) >= 36) return;
    const push = (36 - Math.abs(dx)) / 2;
    const s = dx === 0 ? P.face : Math.sign(dx);
    P.x = Math.min(XMAX, Math.max(XMIN, P.x - s * push));
    C.x = Math.min(XMAX, Math.max(XMIN, C.x + s * push));
    // a fighter pinned at the wall still needs room
    if (Math.abs(C.x - P.x) < 36) {
      if ((s > 0 && P.x <= XMIN + 0.01) || (s < 0 && P.x >= XMAX - 0.01)) C.x = P.x + s * 36;
      else P.x = C.x - s * 36;
    }
  }

  function stepFx(dt: number) {
    for (const e of fx) {
      e.t += dt;
      e.life -= dt;
      const ownerF = e.owner === 0 ? P : C;
      const target = e.owner === 0 ? C : P;
      let active = true;
      if (e.attach) {
        e.x = ownerF.x + e.face * e.attach.dx;
        e.y = ownerF.y + e.attach.dy;
      } else if (e.kind === 'stempel') {
        if (e.delay > 0) { e.delay -= dt; e.x += (target.x - e.x) * Math.min(1, dt * 6); active = false; }
        else if (e.y < GROUND - 24) { e.vy = 980; e.y = Math.min(GROUND - 24, e.y + e.vy * dt); }
        else { active = false; if (e.life > 0.3) { e.life = 0.3; ctx.sfx('stamp'); } }
      } else {
        e.x += e.vx * dt;
        if (e.kind === 'drone') e.y = ownerF.y - 86 + Math.sin(e.t * 8) * 6;
      }
      if (!active || e.hit || target.ko) continue;
      const box = { x0: e.x - e.w / 2, x1: e.x + e.w / 2, y0: e.y - e.h / 2, y1: e.y + e.h / 2 };
      if (overlap(box, hurtbox(target))) {
        e.hit = true;
        const dir = e.kind === 'clipboard' || e.kind === 'stempel' ? (target.x >= ownerF.x ? 1 : -1) : e.face;
        applyHit(ownerF, target, e.dmg, e.kb, e.stun, dir, 'special');
        if (RANGED.includes(e.kind) && e.kind !== 'stempel') e.life = Math.min(e.life, 0.08);
      }
    }
    for (let i = fx.length - 1; i >= 0; i--) {
      const e = fx[i];
      if (e.life <= 0 || e.x < -60 || e.x > w + 60) fx.splice(i, 1);
    }
  }

  function aiCtl(dt: number): Ctl {
    const L = LEVELS[Math.min(opIdx, LEVELS.length - 1)];
    const ctl: Ctl = { ...NO_CTL };
    const dist = Math.abs(P.x - C.x);
    const towardRight = P.x >= C.x;
    const holdToward = () => { if (towardRight) ctl.r = true; else ctl.l = true; };
    const holdAway = () => { if (towardRight) ctl.l = true; else ctl.r = true; };
    const pAtk = !!P.atk;
    const threatFx = fx.filter((e) => e.owner === 0).length;
    if ((pAtk && !ai.lastPAtk && dist < 130) || threatFx > ai.lastFx) {
      if (ctx.rand() < L.block) ai.blockT = 0.45;
    }
    ai.lastPAtk = pAtk;
    ai.lastFx = threatFx;
    if (C.stun > 0 || C.atk || C.ko) return ctl;
    if (ai.blockT > 0) { ai.blockT -= dt; holdAway(); return ctl; }
    ai.think -= dt;
    if (ai.think <= 0) {
      ai.think = L.think * (0.6 + 0.8 * ctx.rand());
      const kind = SPECIAL_OF[C.c.id] ?? 'dasi';
      const reach = kind === 'penggaris' ? 170 : kind === 'dasi' ? 120 : 100;
      const r = ctx.rand();
      if (C.meter >= 100 && r < L.spec && (RANGED.includes(kind) || dist < reach)) { ctl.x = true; return ctl; }
      if (dist < 62) {
        if (r < L.atk) { if (ctx.rand() < 0.6) ctl.a = true; else ctl.b = true; return ctl; }
        ai.intent = r < L.atk + 0.2 ? 'retreat' : 'idle';
      } else if (dist < 88 && r < L.atk * 0.6) {
        ctl.b = true; return ctl;
      } else if (r < L.aggr) ai.intent = 'approach';
      else if (r < L.aggr + 0.1) { ctl.u = true; holdToward(); return ctl; }
      else ai.intent = ctx.rand() < 0.5 ? 'idle' : 'retreat';
    }
    if (ai.intent === 'approach' && dist > 44) holdToward();
    if (ai.intent === 'retreat') holdAway();
    return ctl;
  }

  function endRound() {
    let winner: 0 | 1 | -1;
    if (C.ko && !P.ko) winner = 0;
    else if (P.ko && !C.ko) winner = 1;
    else if (P.hp > C.hp) winner = 0;
    else if (C.hp > P.hp) winner = 1;
    else winner = -1;
    banner = !P.ko && !C.ko ? ctx.t('Waktu habis') : ctx.t('KO!');
    if (winner === 0) {
      pWins++;
      const tb = Math.ceil(clock) * 20;
      const perfect = P.hp >= 100 ? 1000 : 0;
      score += tb + perfect;
      P.win = true;
      banner += ' ' + (perfect ? ctx.t('Sempurna! +{b}', { b: tb + perfect }) : ctx.t('Bonus waktu +{b}', { b: tb }));
      ctx.sfx('right');
    } else if (winner === 1) {
      cWins++;
      C.win = true;
      ctx.sfx('wrong');
    } else {
      banner += ' ' + ctx.t('Seri');
    }
    P.atk = null; C.atk = null;
    phase = 'roundEnd';
    timer = 2.2;
    hud();
  }

  function afterRound() {
    // round cap stops endless draws
    if (pWins >= 2 || cWins >= 2 || round >= 5) {
      matchWon = pWins > cWins;
      if (matchWon) { score += 1000 * (opIdx + 1); ctx.sfx('win'); } else ctx.sfx('lose');
      phase = 'matchEnd';
      timer = 2.6;
      hud();
      return;
    }
    round++;
    startRound();
  }

  function afterMatch() {
    if (!matchWon) {
      phase = 'over';
      ctx.end({ score, won: false, summary: ctx.t('Mengalahkan {n} dari 3 lawan', { n: opIdx }) });
      return;
    }
    if (opIdx >= 2) {
      phase = 'over';
      ctx.end({ score, won: true, summary: ctx.t('Juara! Mengalahkan 3 lawan') });
      return;
    }
    opIdx++;
    P.meter = 0;
    startMatch();
  }

  return {
    update(dt, inp) {
      time += dt;
      shake = Math.max(0, shake - dt);
      for (const s of sparks) s.t -= dt;
      while (sparks.length && sparks[0].t <= 0) sparks.shift();
      if (phase === 'over') return;
      if (phase === 'select') {
        if (inp.hit.left) { sel = (sel + cast.length - 1) % cast.length; ctx.sfx('ui'); }
        if (inp.hit.right) { sel = (sel + 1) % cast.length; ctx.sfx('ui'); }
        if (inp.tap) {
          const i = slotAt(inp.tap.x, inp.tap.y);
          if (i >= 0) { if (i === sel) { confirmSelect(); return; } sel = i; ctx.sfx('ui'); }
        }
        if (inp.hit.a) confirmSelect();
        return;
      }
      if (phase === 'intro' || phase === 'roundEnd' || phase === 'matchEnd') {
        timer -= dt;
        stepFighter(P, C, NO_CTL, dt);
        stepFighter(C, P, NO_CTL, dt);
        stepFx(dt);
        if (timer <= 0) {
          if (phase === 'intro') phase = 'fight';
          else if (phase === 'roundEnd') afterRound();
          else afterMatch();
        }
        return;
      }
      if (hitstop > 0) { hitstop -= dt; return; }
      clock = Math.max(0, clock - dt);
      const pc: Ctl = {
        l: inp.down.left || inp.ax < -0.4, r: inp.down.right || inp.ax > 0.4,
        u: inp.down.up || inp.ay < -0.5, d: inp.down.down || inp.ay > 0.5,
        a: inp.hit.a, b: inp.hit.b, x: inp.hit.x,
      };
      const cc = aiCtl(dt);
      stepFighter(P, C, pc, dt);
      stepFighter(C, P, cc, dt);
      separate();
      stepFx(dt);
      if (P.ko || C.ko || clock <= 0) endRound();
    },
    render() {
      if (phase === 'select') { renderSelect(); return; }
      g.save();
      if (shake > 0 && !ctx.reducedMotion) g.translate(Math.sin(time * 90) * shake * 20, Math.cos(time * 77) * shake * 12);
      renderArena();
      const order = P.atk ? [C, P] : [P, C];
      for (const f of order) {
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.beginPath(); g.ellipse(f.x, GROUND + 2, 26, 6, 0, 0, Math.PI * 2); g.fill();
        drawChar(g, f.c, f.x, f.y, CH, f.face, poseOf(f, f === P ? C : P), time);
      }
      for (const e of fx) drawFx(e);
      for (const s of sparks) {
        const k = s.t / 0.25;
        g.strokeStyle = s.big ? PAL.gold : '#fffaf0';
        g.lineWidth = 3;
        const n = ctx.reducedMotion ? 4 : 8;
        const r0 = 6 + (1 - k) * (s.big ? 22 : 14);
        g.beginPath();
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          g.moveTo(s.x + Math.cos(a) * r0 * 0.5, s.y + Math.sin(a) * r0 * 0.5);
          g.lineTo(s.x + Math.cos(a) * r0, s.y + Math.sin(a) * r0);
        }
        g.stroke();
      }
      g.restore();
      renderHud();
      renderBanner();
    },
    snapshot: () => ({
      phase, sel, selId: cast[sel]?.id, opIdx, round, pWins, cWins, clock: Math.round(clock * 100) / 100, score,
      opponents: opponents.map((o) => o.id),
      p: fsnap(P), c: fsnap(C),
      fx: fx.map((e) => e.kind), hits: hits.slice(-10), specials: [...specials],
    }),
  };

  function fsnap(f: Fighter) {
    return { id: f.c.id, x: Math.round(f.x * 10) / 10, y: Math.round(f.y * 10) / 10, hp: Math.round(f.hp * 100) / 100, meter: Math.round(f.meter), face: f.face, atk: f.atk?.kind ?? null, stun: f.stun > 0, guard: f.guard, ko: f.ko };
  }

  function poseOf(f: Fighter, o: Fighter): Pose {
    if (f.ko) return 'ko';
    if (f.win) return 'win';
    if (f.stun > 0) return 'hurt';
    if (f.blockstun > 0) return 'block';
    if (f.atk) return f.atk.kind;
    if (f.y < GROUND) return 'jump';
    if (f.crouch) return 'crouch';
    if (f.guard && (o.atk || fx.some((e) => e.owner !== (f === P ? 0 : 1)) || Math.abs(o.x - f.x) < 110)) return 'block';
    if (f.walk) return 'walk';
    return 'idle';
  }

  // ---- drawing ----
  function slotAt(x: number, y: number) {
    if (y < 268 || y > 352) return -1;
    const i = Math.floor((x - 8) / 70);
    return i >= 0 && i < cast.length && (x - 8) % 70 <= 64 ? i : -1;
  }

  function renderSelect() {
    g.fillStyle = PAL.bg;
    g.fillRect(0, 0, w, h);
    g.fillStyle = PAL.green;
    g.fillRect(0, 0, w, 50);
    text(g, ctx.t('Pilih Karakter'), w / 2, 26, 26, PAL.surface);
    const c = cast[sel];
    g.fillStyle = PAL.sand;
    roundRect(g, 40, 62, 220, 196, 14);
    g.fillStyle = 'rgba(0,0,0,0.14)';
    g.beginPath(); g.ellipse(150, 246, 50, 9, 0, 0, Math.PI * 2); g.fill();
    drawChar(g, c, 150, 246, 170, 1, Math.floor(time * 1.2) % 3 === 2 ? 'special' : 'idle', time);
    text(g, c.name, 290, 86, 30, PAL.ink, 'left', 800);
    text(g, ctx.t(c.role), 290, 116, 16, PAL.ink2, 'left', 600);
    const sp = SP[SPECIAL_OF[c.id] ?? 'dasi'];
    text(g, ctx.t('Jurus khas: {n}', { n: sp.name }), 290, 152, 18, PAL.accent, 'left', 800);
    text(g, sp.desc, 290, 178, 15, PAL.ink, 'left', 600);
    text(g, ctx.t('Kiri/Kanan: pilih · A: konfirmasi'), 290, 222, 15, PAL.ink2, 'left', 600);
    for (let i = 0; i < cast.length; i++) {
      const x = 8 + i * 70;
      g.fillStyle = i === sel ? PAL.accent : 'rgba(29,42,35,0.18)';
      roundRect(g, x - 3, 265, 70, 90, 10);
      g.fillStyle = i === sel ? PAL.surface : PAL.sand;
      roundRect(g, x, 268, 64, 84, 8);
      drawChar(g, cast[i], x + 32, 332, 58, 1, 'idle', i === sel ? time : 0);
      text(g, cast[i].name, x + 32, 343, 11, PAL.ink, 'center', 800);
    }
  }

  function renderArena() {
    g.fillStyle = '#eadfc8';
    g.fillRect(-20, -20, w + 40, GROUND + 20);
    for (let i = 0; i < 3; i++) {
      const x = 70 + i * 190;
      g.fillStyle = '#8a7a63';
      roundRect(g, x - 4, 66, 148, 118, 6);
      g.fillStyle = PAL.sky;
      g.fillRect(x, 70, 140, 110);
      g.fillStyle = '#d7ecef';
      g.fillRect(x + 8, 140, 40, 40); g.fillRect(x + 60, 126, 30, 54); g.fillRect(x + 100, 148, 34, 32);
      g.fillStyle = '#8a7a63';
      g.fillRect(x + 68, 70, 4, 110);
      g.fillRect(x, 122, 140, 4);
    }
    g.fillStyle = '#c9b48f';
    g.fillRect(-20, 200, w + 40, 6);
    for (const dx of [40, 330]) {
      g.fillStyle = '#9b7b55';
      g.fillRect(dx, 248, 200, 12);
      g.fillRect(dx + 10, 260, 8, GROUND - 260); g.fillRect(dx + 182, 260, 8, GROUND - 260);
      g.fillStyle = '#2f3a36';
      roundRect(g, dx + 30, 216, 52, 32, 3);
      g.fillStyle = '#7fb3c8';
      g.fillRect(dx + 34, 220, 44, 22);
      g.fillStyle = '#2f3a36';
      g.fillRect(dx + 52, 246, 8, 4);
      g.fillStyle = PAL.surface;
      g.fillRect(dx + 120, 240, 40, 8);
      g.fillStyle = PAL.accent;
      g.fillRect(dx + 170, 236, 10, 12);
    }
    g.fillStyle = PAL.grass;
    g.beginPath(); g.ellipse(606, 250, 20, 30, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#9b5a3c';
    g.fillRect(594, 274, 24, 22);
    g.fillStyle = '#c7ae86';
    g.fillRect(-20, GROUND, w + 40, h - GROUND + 20);
    g.strokeStyle = 'rgba(80,60,40,0.18)';
    g.lineWidth = 1;
    g.beginPath();
    for (let x = 0; x < w + 40; x += 64) { g.moveTo(x, GROUND); g.lineTo(x - 20, h); }
    g.moveTo(0, GROUND + 18); g.lineTo(w, GROUND + 18);
    g.stroke();
  }

  function renderHud() {
    const bar = (x: number, f: Fighter, right: boolean) => {
      g.fillStyle = PAL.ink;
      roundRect(g, x - 2, 10, 264, 20, 6);
      g.fillStyle = '#5a2a1e';
      g.fillRect(x, 12, 260, 16);
      const ww = 260 * (f.hp / 100);
      g.fillStyle = f.hp > 30 ? PAL.gold : PAL.red;
      g.fillRect(right ? x + 260 - ww : x, 12, ww, 16);
      text(g, f.c.name, right ? x + 260 : x, 42, 15, PAL.ink, right ? 'right' : 'left', 800);
      const mx = right ? x + 100 : x;
      g.fillStyle = PAL.ink;
      roundRect(g, mx - 2, h - 18, 164, 12, 4);
      g.fillStyle = f.meter >= 100 ? PAL.blue : '#7c8f9b';
      const mw = 160 * (f.meter / 100);
      g.fillRect(right ? mx + 160 - mw : mx, h - 16, mw, 8);
    };
    bar(14, P, false);
    bar(366, C, true);
    if (P.meter >= 100) text(g, ctx.t('Jurus siap (X)'), 14, h - 28, 13, PAL.ink, 'left', 800);
    if (C.meter >= 100) text(g, ctx.t('Jurus siap'), 626, h - 28, 13, PAL.ink, 'right', 800);
    g.fillStyle = PAL.green;
    roundRect(g, 296, 6, 48, 40, 8);
    text(g, String(Math.ceil(clock)), 320, 27, 22, PAL.surface, 'center', 800);
    for (let i = 0; i < 2; i++) {
      g.fillStyle = i < pWins ? PAL.gold : 'rgba(29,42,35,0.25)';
      g.beginPath(); g.arc(282 - i * 12, 42, 4.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = i < cWins ? PAL.gold : 'rgba(29,42,35,0.25)';
      g.beginPath(); g.arc(358 + i * 12, 42, 4.5, 0, Math.PI * 2); g.fill();
    }
    text(g, ctx.t('Lawan {n}/3', { n: opIdx + 1 }), 320, 58, 12, PAL.ink2, 'center', 700);
  }

  function renderBanner() {
    let big = '', small = '';
    if (phase === 'intro') {
      big = timer > 0.5 ? ctx.t('Ronde {n}', { n: round }) : ctx.t('Mulai!');
      small = round === 1 && timer > 0.5 ? ctx.t('{a} melawan {b}', { a: P.c.name, b: C.c.name }) : '';
    } else if (phase === 'roundEnd') {
      big = banner;
    } else if (phase === 'matchEnd' || phase === 'over') {
      big = matchWon ? (opIdx >= 2 ? ctx.t('Juara!') : ctx.t('Kamu menang!')) : ctx.t('Kamu kalah');
      small = ctx.t('{s} poin', { s: score });
    }
    if (!big) return;
    g.fillStyle = 'rgba(29,42,35,0.82)';
    roundRect(g, 120, 108, 400, small ? 84 : 58, 14);
    text(g, big, w / 2, 137, big.length > 24 ? 22 : 30, PAL.surface, 'center', 800);
    if (small) text(g, small, w / 2, 172, 16, PAL.gold, 'center', 700);
  }

  function drawFx(e: Fx) {
    const ownerC = (e.owner === 0 ? P : C).c;
    g.save();
    g.translate(e.x, e.y);
    switch (e.kind) {
      case 'kabel': {
        g.rotate(e.t * 12 * e.face);
        g.strokeStyle = '#e07a2a'; g.lineWidth = 5;
        g.beginPath(); g.arc(0, 0, 12, 0, Math.PI * 2); g.stroke();
        g.strokeStyle = '#2b2b2b'; g.lineWidth = 2;
        g.beginPath(); g.arc(0, 0, 7, 0, Math.PI * 1.5); g.stroke();
        g.beginPath(); g.moveTo(12, 0); g.lineTo(22, 6); g.stroke();
        break;
      }
      case 'wifi': {
        g.scale(e.face, 1);
        g.strokeStyle = PAL.blue; g.lineWidth = 4;
        for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(-14, 0, 8 + i * 8, -0.8, 0.8); g.stroke(); }
        g.fillStyle = PAL.blue; g.beginPath(); g.arc(-14, 0, 3.5, 0, Math.PI * 2); g.fill();
        break;
      }
      case 'pensil': {
        g.scale(e.face, 1);
        g.fillStyle = ownerC.accent; g.fillRect(-17, -4, 26, 8);
        g.fillStyle = '#f2d7a6'; g.beginPath(); g.moveTo(9, -4); g.lineTo(17, 0); g.lineTo(9, 4); g.fill();
        g.fillStyle = '#e88aa0'; g.fillRect(-21, -4, 4, 8);
        break;
      }
      case 'drone': {
        g.fillStyle = '#3a4a52'; roundRect(g, -12, -6, 24, 12, 4);
        g.fillStyle = PAL.gold; g.beginPath(); g.arc(e.face * 8, 0, 3, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#3a4a52'; g.lineWidth = 2;
        g.beginPath(); g.moveTo(-12, -6); g.lineTo(-14, -11); g.moveTo(12, -6); g.lineTo(14, -11); g.stroke();
        const sp = Math.abs(Math.sin(e.t * 40)) * 9 + 2;
        g.fillStyle = 'rgba(58,74,82,0.5)';
        g.fillRect(-14 - sp, -13, sp * 2, 3); g.fillRect(14 - sp, -13, sp * 2, 3);
        break;
      }
      case 'kuas': {
        g.scale(e.face, 1);
        const k = Math.min(1, e.t / 0.12);
        g.strokeStyle = ownerC.accent; g.lineWidth = 16; g.lineCap = 'round';
        g.beginPath(); g.arc(-30, 0, 44, -1.1, -1.1 + 2.2 * k); g.stroke();
        g.lineCap = 'butt';
        g.fillStyle = '#9b7b55'; g.fillRect(-40, -6, 24, 6);
        break;
      }
      case 'penggaris': {
        g.scale(e.face, 1);
        const k = Math.min(1, e.t / 0.08);
        g.fillStyle = '#d9b36c';
        g.fillRect(-75 - 75 * (1 - k), -5, 150 * k + 4, 10);
        g.fillRect(-79 - 75 * (1 - k), -18, 8, 36);
        g.fillStyle = '#6b5332';
        for (let i = 0; i < 12; i++) g.fillRect(-70 - 75 * (1 - k) + i * 12 * k, -5, 1.5, 5);
        break;
      }
      case 'clipboard': {
        const a = e.t * 22;
        for (const s of [0, Math.PI]) {
          const px = Math.cos(a + s) * 52, py = Math.sin(a + s) * 16;
          g.save(); g.translate(px, py); g.rotate(a * 1.5);
          g.fillStyle = '#9b6b3e'; g.fillRect(-11, -14, 22, 28);
          g.fillStyle = PAL.surface; g.fillRect(-8, -9, 16, 20);
          g.fillStyle = '#7a7a7a'; g.fillRect(-5, -16, 10, 5);
          g.restore();
        }
        break;
      }
      case 'stempel': {
        if (e.delay > 0) {
          g.fillStyle = 'rgba(184,69,46,0.25)';
          g.beginPath(); g.ellipse(0, GROUND - e.y + 2, 30, 6, 0, 0, Math.PI * 2); g.fill();
        }
        g.fillStyle = '#5a3a24'; g.fillRect(-7, -38, 14, 22);
        g.beginPath(); g.arc(0, -40, 10, 0, Math.PI * 2); g.fill();
        g.fillStyle = PAL.red; roundRect(g, -30, -16, 60, 30, 4);
        text(g, ctx.t('REJECT'), 0, -1, 13, PAL.surface, 'center', 800);
        break;
      }
      case 'dasi': {
        g.scale(e.face, 1);
        const k = Math.min(1, e.t / 0.12);
        g.strokeStyle = 'rgba(163,74,39,0.5)'; g.lineWidth = 4;
        for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(-10 + i * 10, 0, 20 + i * 12 * k, -0.9, 0.9); g.stroke(); }
        g.fillStyle = ownerC.accent;
        g.beginPath(); g.moveTo(-34, -8); g.lineTo(-34 + 50 * k, -4); g.lineTo(-24 + 50 * k, 0); g.lineTo(-34 + 50 * k, 4); g.lineTo(-34, 8); g.fill();
        break;
      }
    }
    g.restore();
  }
}

export default { meta, create } satisfies GameModule;

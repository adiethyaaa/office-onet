import { describe, expect, it } from 'vitest';
import { run, type Run } from './mg-harness';
import tarung, { ATK, BUFFER, HITSTOP } from '../../src/minigames/games/tarung-kantor';
import type { Btn } from '../../src/minigames/types';

interface F { id: string; x: number; y: number; hp: number; meter: number; face: number; atk: string | null; atkT: number; jab: number; stun: boolean; guard: boolean; ko: boolean; flash: boolean; combo: number }
interface Hit { by: number; kind: string; raw: number; dmg: number; blocked: boolean }
interface S { phase: string; sel: number; selId: string; opIdx: number; round: number; pWins: number; cWins: number; clock: number; score: number; opponents: string[]; p: F; c: F; hitstop: number; frozen: number; pops: number; stars: number; fx: string[]; hits: Hit[]; specials: string[] }

const snap = (r: Run) => r.snap() as unknown as S;

/** Walk in, then punch when close; fire the signature move whenever the meter is full. */
function aggressive(f: number, raw: Record<string, unknown>) {
  const s = raw as unknown as S;
  if (s.phase !== 'fight') return {};
  const toward: Btn = s.c.x >= s.p.x ? 'right' : 'left';
  if (s.p.meter >= 100 && f % 4 === 0) return { press: ['x'] as Btn[] };
  if (Math.abs(s.c.x - s.p.x) > 46) return { held: [toward] };
  return f % 8 === 0 ? { press: ['a'] as Btn[] } : {};
}

/** Start a match with the character at `sel` (index in the cast). */
function startWith(r: Run, sel: number) {
  const now = snap(r).sel;
  const n = r.ctx.cast.length;
  const steps = (sel - now + n) % n;
  for (let i = 0; i < steps; i++) r.step(2, [], ['right']);
  r.step(1, [], ['a']);
  expect(snap(r).phase).toBe('intro');
  for (let g = 0; g < 600 && snap(r).phase !== 'fight'; g++) r.step(1);
}


/** Walk until the rival is in punch reach and both fighters are free to act. */
function closeIn(r: Run, maxFrames = 600) {
  for (let i = 0; i < maxFrames; i++) {
    const s = snap(r);
    if (s.phase === 'fight' && Math.abs(s.c.x - s.p.x) <= 44 && !s.p.atk && !s.c.atk && !s.p.stun && !s.c.stun && !s.c.guard && s.hitstop === 0) return true;
    r.step(1, s.phase === 'fight' && Math.abs(s.c.x - s.p.x) > 44 ? [s.c.x > s.p.x ? 'right' : 'left'] : []);
  }
  return false;
}

/** Punch from close range until one connects unblocked; returns the frame state right after contact. */
function landPunch(r: Run) {
  for (let tries = 0; tries < 40; tries++) {
    if (!closeIn(r)) continue;
    const before = snap(r).hits.filter((x) => x.by === 0).length;
    for (let f = 0; f < 10; f++) {
      r.step(1, [], f === 0 ? ['a'] : []);
      const s = snap(r);
      const mine = s.hits.filter((x) => x.by === 0);
      if (mine.length > before) { if (!mine[mine.length - 1].blocked) return s; break; }
    }
    r.step(30);
  }
  throw new Error('no punch landed');
}

describe('mini game: tarung-kantor', () => {
  it('select screen picks 3 distinct rivals from the cast, never the chosen fighter', () => {
    const r = run(tarung, 11);
    expect(snap(r).phase).toBe('select');
    expect(snap(r).selId).toBe('CH-CEO');
    r.step(2, [], ['right']);
    const picked = snap(r).selId;
    r.step(1, [], ['a']);
    const s = snap(r);
    expect(s.opponents).toHaveLength(3);
    expect(new Set(s.opponents).size).toBe(3);
    expect(s.opponents).not.toContain(picked);
    expect(s.p.id).toBe(picked);
    expect(s.c.id).toBe(s.opponents[0]);
  });

  it('punch A lowers rival HP inside reach and does nothing from far away', () => {
    const r = run(tarung, 5);
    startWith(r, snap(r).sel);
    const far = snap(r);
    expect(Math.abs(far.c.x - far.p.x)).toBeGreaterThan(150);
    r.step(1, [], ['a']);
    r.step(20);
    expect(snap(r).c.hp).toBe(100);
    expect(snap(r).hits.filter((h) => h.by === 0)).toHaveLength(0);
    // close in, then jab until one lands
    let landed: Hit | undefined;
    for (let g = 0; g < 60 * 20 && !landed; g++) {
      const s = snap(r);
      if (s.phase !== 'fight') { r.step(1); continue; }
      const d = Math.abs(s.c.x - s.p.x);
      if (d > 44) r.step(1, [s.c.x > s.p.x ? 'right' : 'left']);
      else { const before = s.c.hp; r.step(1, [], ['a']); r.step(12); const after = snap(r); landed = after.hits.find((h) => h.by === 0 && h.kind === 'punch'); if (landed) expect(after.c.hp).toBeLessThan(before); }
    }
    expect(landed).toBeTruthy();
    expect(landed!.raw).toBe(5);
  });

  it('blocking (holding away) cuts damage by 80%', () => {
    const r = run(tarung, 3);
    startWith(r, snap(r).sel);
    let blocked: Hit | undefined;
    for (let g = 0; g < 60 * 60 && !blocked && !r.result; g++) {
      const s = snap(r);
      const away: Btn = s.c.x >= s.p.x ? 'left' : 'right';
      r.step(1, s.phase === 'fight' ? [away] : []);
      blocked = snap(r).hits.find((h) => h.by === 1 && h.blocked);
    }
    expect(blocked).toBeTruthy();
    expect(blocked!.dmg).toBeCloseTo(blocked!.raw * 0.2, 5);
    expect(r.sfx).toContain('block');
  });

  it('an aggressive policy beats the first CPU in a round; a passive one loses', () => {
    const a = run(tarung, 20261013);
    startWith(a, snap(a).sel);
    a.play((f, s) => ((s as unknown as S).pWins >= 1 || (s as unknown as S).opIdx > 0 ? { held: [] } : aggressive(f, s)), 200);
    const sa = snap(a);
    expect(sa.pWins >= 1 || sa.opIdx > 0).toBe(true);
    expect(sa.score).toBeGreaterThan(0);

    const p = run(tarung, 20261013);
    startWith(p, snap(p).sel);
    const res = p.play(() => ({}), 400);
    expect(res).not.toBeNull();
    expect(res!.won).toBe(false);
    expect(snap(p).pWins).toBe(0);
  });

  it('the arcade run ends with ctx.end; aggressive play scores more than standing still', () => {
    const a = run(tarung, 99);
    startWith(a, snap(a).sel);
    const res = a.play(aggressive, 1500);
    expect(res).not.toBeNull();
    expect(typeof res!.won).toBe('boolean');
    expect(res!.score).toBe(snap(a).score);
    const idle = run(tarung, 99);
    startWith(idle, snap(idle).sel);
    const ri = idle.play(() => ({}), 600)!;
    expect(res!.score).toBeGreaterThan(ri.score);
  });

  it('every character fires a signature move without errors', () => {
    const fired = new Set<string>();
    for (let i = 0; i < 9; i++) {
      const r = run(tarung, 100 + i);
      startWith(r, i);
      const id = snap(r).p.id;
      let mine: string | undefined;
      for (let g = 0; g < 60 * 120 && !mine && !r.result; g++) {
        r.play(aggressive, 1 / 60);
        mine = snap(r).specials.find((x) => x.startsWith(id + ':'));
      }
      expect(mine, id).toBeTruthy();
      // let the effect play out
      r.step(60 * 3);
      fired.add(mine!.split(':')[1]);
    }
    expect(fired.size).toBe(9);
  });

  it('A starts the punch on the same frame and it is active within 3 frames', () => {
    const r = run(tarung, 5);
    startWith(r, snap(r).sel);
    r.sfx.length = 0;
    r.step(1, [], ['a']);
    expect(snap(r).p.atk).toBe('punch');
    expect(r.sfx).toContain('swat');
    expect(ATK.punch.s).toBeLessThanOrEqual(3 / 60 + 1e-9);
    expect(ATK.kick.s).toBeLessThanOrEqual(6 / 60 + 1e-9);
  });

  it('a landed punch freezes the fight for 3 to 5 frames with flash, number and stars', () => {
    const r = run(tarung, 8);
    startWith(r, snap(r).sel);
    const hitAt = landPunch(r);
    expect(hitAt.hitstop).toBe(HITSTOP.punch);
    expect(HITSTOP.punch).toBeGreaterThanOrEqual(3);
    expect(HITSTOP.special).toBeLessThanOrEqual(5);
    expect(hitAt.c.flash).toBe(true);
    expect(hitAt.pops).toBeGreaterThan(0);
    expect(hitAt.stars).toBeGreaterThan(0);
    const frozen0 = hitAt.frozen;
    const pos = [hitAt.p.x, hitAt.c.x, hitAt.clock];
    r.step(HITSTOP.punch);
    const s = snap(r);
    expect(s.frozen - frozen0).toBe(HITSTOP.punch);
    expect([s.p.x, s.c.x, s.clock]).toEqual(pos);
    r.step(2);
    expect(snap(r).c.x).not.toBe(hitAt.c.x);
  });

  it('knockback pushes the rival away from the blow', () => {
    const r = run(tarung, 8);
    startWith(r, snap(r).sel);
    const s0 = landPunch(r);
    const dir = Math.sign(s0.c.x - s0.p.x);
    r.step(HITSTOP.punch + 12);
    const s1 = snap(r);
    expect((s1.c.x - s0.c.x) * dir).toBeGreaterThan(8);
  });

  it('presses made during recovery are buffered and fire when the move ends', () => {
    const r = run(tarung, 5);
    startWith(r, snap(r).sel);
    r.step(1, [], ['a']); // whiff from afar
    const total = Math.round((ATK.punch.s + ATK.punch.a + ATK.punch.r) * 60);
    const early = Math.floor(BUFFER * 60) - 2;
    r.step(total - early - 1);
    expect(snap(r).p.atk).toBe('punch');
    r.step(1, [], ['b']);
    let kicked = false;
    for (let i = 0; i < early + 3 && !kicked; i++) { r.step(1); kicked = snap(r).p.atk === 'kick'; }
    expect(kicked).toBe(true);
  });

  it('a punch that connects cancels straight into a kick', () => {
    const r = run(tarung, 8);
    startWith(r, snap(r).sel);
    landPunch(r);
    r.step(1, [], ['b']); // pressed during hit-stop
    let f = 0;
    for (; f < 12 && snap(r).p.atk !== 'kick'; f++) r.step(1);
    expect(snap(r).p.atk).toBe('kick');
    // the uncancelled punch would still be recovering for several more frames
    expect(f).toBeLessThan(HITSTOP.punch + 3);
  });

  it('Y guards in place without walking away', () => {
    const r = run(tarung, 5);
    startWith(r, snap(r).sel);
    const x0 = snap(r).p.x;
    r.step(20, ['y']);
    const s = snap(r);
    expect(s.p.guard).toBe(true);
    expect(s.p.x).toBe(x0);
  });

  it('the CPU does not read inputs: it cannot guard a fresh punch it was not already guarding', () => {
    let fresh = 0, blockedFresh = 0;
    for (const seed of [21, 22, 23]) {
      const r = run(tarung, seed);
      startWith(r, snap(r).sel);
      for (let k = 0; k < 15 && !r.result; k++) {
        if (!closeIn(r, 300)) break;
        const before = JSON.stringify(snap(r).hits);
        r.step(1, [], ['a']);
        r.step(8);
        const after = snap(r).hits;
        const last = after[after.length - 1];
        if (JSON.stringify(after) !== before && last.by === 0 && last.kind === 'punch') { fresh++; if (last.blocked) blockedFresh++; }
        r.step(20);
      }
    }
    expect(fresh).toBeGreaterThan(10);
    expect(blockedFresh / fresh).toBeLessThan(0.2);
  });

  it('is deterministic for the same seed', () => {
    const go = () => {
      const r = run(tarung, 4242);
      startWith(r, 3);
      r.play(aggressive, 120);
      return JSON.stringify(r.snap()) + JSON.stringify(r.result);
    };
    expect(go()).toBe(go());
  });
});

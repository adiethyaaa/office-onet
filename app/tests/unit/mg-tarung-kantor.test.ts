import { describe, expect, it } from 'vitest';
import { run, type Run } from './mg-harness';
import tarung from '../../src/minigames/games/tarung-kantor';
import type { Btn } from '../../src/minigames/types';

interface F { id: string; x: number; y: number; hp: number; meter: number; face: number; atk: string | null; stun: boolean; guard: boolean; ko: boolean }
interface Hit { by: number; kind: string; raw: number; dmg: number; blocked: boolean }
interface S { phase: string; sel: number; selId: string; opIdx: number; round: number; pWins: number; cWins: number; clock: number; score: number; opponents: string[]; p: F; c: F; fx: string[]; hits: Hit[]; specials: string[] }

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

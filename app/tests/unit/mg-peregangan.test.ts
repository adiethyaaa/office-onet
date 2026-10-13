import { describe, expect, it } from 'vitest';
import { run } from './mg-harness';
import peregangan, { MAX_LEN, showStep } from '../../src/minigames/games/peregangan';
import type { Btn } from '../../src/minigames/types';

type S = { seq: Btn[]; phase: string; inputIdx: number; mistakes: number; best: number; streak: number; buffered: Btn | null };
const PAD: Record<string, { x: number; y: number }> = { up: { x: 320, y: 180 }, down: { x: 320, y: 248 }, left: { x: 286, y: 214 }, right: { x: 354, y: 214 } };

describe('mini game: peregangan', () => {
  it('a perfect player keeps growing the sequence; three mistakes end it with the best length', () => {
    const r = run(peregangan);
    let rounds = 0;
    for (let guard = 0; guard < 60 * 120 && rounds < 4; guard++) {
      const s = r.snap() as S;
      if (s.phase === 'input') {
        r.step(1, [], [s.seq[s.inputIdx]]);
        if ((r.snap() as S).phase === 'feedback') rounds++;
      } else r.step(1);
    }
    const best = (r.snap() as S).best;
    expect(best).toBeGreaterThanOrEqual(5);
    expect((r.snap() as S).streak).toBe(4);
    let fails = 0;
    for (let guard = 0; guard < 60 * 60 && !r.result; guard++) {
      const s = r.snap() as S;
      if (s.phase === 'input') {
        r.step(1, [], [s.seq[s.inputIdx] === 'up' ? 'down' : 'up']);
        fails++;
      } else r.step(1);
    }
    expect(fails).toBe(3);
    expect(r.result?.score).toBe(best);
    expect(r.sfx).toContain('wrong');
  });

  it('repeating a full 12-move sequence ends the session with a win', () => {
    const r = run(peregangan, 11);
    for (let guard = 0; guard < 60 * 180 && !r.result; guard++) {
      const s = r.snap() as S;
      r.step(1, [], s.phase === 'input' ? [s.seq[s.inputIdx]] : []);
    }
    expect(r.result).not.toBeNull();
    expect(r.result!.score).toBe(MAX_LEN);
    expect(r.result!.won).toBe(true);
    expect(r.sfx).toContain('win');
  });

  it('the coach shows faster as the sequence grows', () => {
    expect(showStep(10)).toBeLessThan(showStep(2));
    expect(showStep(30)).toBeGreaterThanOrEqual(0.36);
  });

  it('a press made just before the turn opens is buffered, not lost', () => {
    const r = run(peregangan, 3);
    const probe = run(peregangan, 3);
    let firstInput = 0;
    while ((probe.snap() as S).phase === 'show' && firstInput < 600) { probe.step(1); firstInput++; }
    r.step(firstInput - 4);
    expect((r.snap() as S).phase).toBe('show');
    const want = (r.snap() as S).seq[0];
    r.step(1, [], [want]);
    r.step(4);
    const s = r.snap() as S;
    expect(s.inputIdx).toBe(1);
    expect(s.mistakes).toBe(0);
  });

  it('tapping the on-canvas arrows works like the d-pad', () => {
    const r = run(peregangan, 5);
    for (let guard = 0; guard < 60 * 60 && (r.snap() as S).best < 3; guard++) {
      const s = r.snap() as S;
      r.step(1, [], [], undefined, s.phase === 'input' ? PAD[s.seq[s.inputIdx]] : null);
    }
    expect((r.snap() as S).best).toBeGreaterThanOrEqual(3);
    expect((r.snap() as S).mistakes).toBe(0);
  });

  it('same seed, same session', () => {
    const go = (seed: number) => {
      const r = run(peregangan, seed);
      let n = 0;
      r.play((_f, raw) => {
        const s = raw as S;
        if (s.phase !== 'input') return {};
        n++;
        return { press: [n % 7 === 0 ? (s.seq[s.inputIdx] === 'up' ? 'down' : 'up') : s.seq[s.inputIdx]] };
      }, 180);
      return JSON.stringify([r.result, r.snap()]);
    };
    expect(go(8)).toBe(go(8));
  });
});

import { describe, expect, it } from 'vitest';
import { run } from './mg-harness';
import peregangan from '../../src/minigames/games/peregangan';

describe('mini game: peregangan', () => {
  it('a perfect player keeps growing the sequence; three mistakes end it with the best length', () => {
    const r = run(peregangan);
    // Perfect play for 4 rounds: press each shown move once input opens.
    let rounds = 0;
    for (let guard = 0; guard < 60 * 120 && rounds < 4; guard++) {
      const s = r.snap() as { seq: string[]; phase: string; inputIdx: number };
      if (s.phase === 'input') {
        const want = s.seq[s.inputIdx] as 'up';
        r.step(1, [], [want]);
        const after = r.snap() as { phase: string };
        if (after.phase === 'feedback') rounds++;
      } else r.step(1);
    }
    const best = (r.snap() as { best: number }).best;
    expect(best).toBeGreaterThanOrEqual(5);
    // Now fail three times on purpose.
    let fails = 0;
    for (let guard = 0; guard < 60 * 60 && !r.result; guard++) {
      const s = r.snap() as { seq: string[]; phase: string; inputIdx: number };
      if (s.phase === 'input') {
        const wrong = s.seq[s.inputIdx] === 'up' ? 'down' : 'up';
        r.step(1, [], [wrong]);
        fails++;
      } else r.step(1);
    }
    expect(fails).toBe(3);
    expect(r.result?.score).toBe(best);
    expect(r.sfx).toContain('wrong');
  });
});

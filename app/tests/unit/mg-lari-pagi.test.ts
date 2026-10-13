import { describe, expect, it } from 'vitest';
import { run } from './mg-harness';
import lari, { DURATION, segmentAt, SEGMENTS } from '../../src/minigames/games/lari-pagi';
import type { Btn } from '../../src/minigames/types';

type S = { time: number; frame: number; speed: number; dist: number; stamina: number; winded: boolean; lastFoot: string | null; beat: number; sinceStep: number; counts: Record<string, number>; bestCombo: number };

/** Steps exactly on the beat of the current segment, alternating feet. */
function onBeat(keys: [Btn, Btn] = ['left', 'right']) {
  let next = 0.5;
  let foot = 0;
  return (f: number, s: Record<string, unknown>) => {
    const t = (f + 1) / 60;
    if (t + 1e-9 < next) return {};
    next = t + (s as S).beat;
    const k = keys[foot];
    foot ^= 1;
    return { press: [k] };
  };
}

describe('mini game: lari-pagi', () => {
  it('ends exactly at 60 seconds (frame 3600) with the distance as score', () => {
    const r = run(lari);
    r.step(DURATION * 60 - 1);
    expect(r.result).toBeNull();
    expect((r.snap() as S).frame).toBe(3599);
    r.step(1);
    expect(r.result).not.toBeNull();
    expect((r.snap() as S).time).toBe(60);
    expect(r.result!.score).toBe(0);
  });

  it('on-beat alternating steps run much farther than mashing one button', () => {
    const good = run(lari);
    const rg = good.play(onBeat(), 61)!;
    const sg = good.snap() as S;
    const mash = run(lari);
    const rm = mash.play((f) => (f % 6 === 0 ? { press: ['left'] } : {}), 61)!;
    const sameSlow = run(lari);
    const rs = sameSlow.play(onBeat(['right', 'right']), 61)!;
    expect(rg.score).toBeGreaterThan(200);
    expect(rg.won).toBe(true);
    expect(sg.counts.pas).toBeGreaterThan(100);
    expect(rm.score).toBeLessThan(rg.score / 4);
    expect(rs.score).toBeLessThan(rg.score / 4);
    expect(rg.summary).toContain(`${rg.score} meter`);
  });

  it('A and B work as left and right too', () => {
    const r = run(lari);
    const res = r.play(onBeat(['a', 'b']), 61)!;
    expect(res.score).toBeGreaterThan(200);
  });

  it('off-beat alternating (too slow) scores less than on-beat; standing still drops speed to zero', () => {
    const slow = run(lari);
    let next = 0.5, foot = 0;
    const rs = slow.play((f, s) => {
      const t = (f + 1) / 60;
      if (t < next) return {};
      next = t + (s as S).beat * 1.6;
      foot ^= 1;
      return { press: [foot ? 'left' : 'right'] as Btn[] };
    }, 61)!;
    const good = run(lari).play(onBeat(), 61)!;
    expect(rs.score).toBeLessThan(good.score * 0.6);

    const r = run(lari);
    r.play(onBeat(), 20);
    expect((r.snap() as S).speed).toBeGreaterThan(10);
    r.step(60 * 6);
    expect((r.snap() as S).speed).toBe(0);
  });

  it('alternating much faster than the beat drains stamina until the runner is winded', () => {
    const r = run(lari);
    let foot = 0;
    let winded = false;
    r.play((f, s) => {
      if ((s as S).winded) winded = true;
      if (f % 5) return {};
      foot ^= 1;
      return { press: [foot ? 'left' : 'right'] as Btn[] };
    }, 30);
    expect(winded).toBe(true);
    expect(r.sfx).toContain('hurt');
  });

  it('segments cover the full 60 s', () => {
    expect(SEGMENTS[SEGMENTS.length - 1].until).toBe(DURATION);
    expect(segmentAt(0).name).toBe('Pemanasan');
    expect(segmentAt(59.9).name).toBe('Sprint akhir');
  });

  it('same seed and input gives the same run', () => {
    const a = run(lari, 5); const ra = a.play(onBeat(), 61);
    const b = run(lari, 5); const rb = b.play(onBeat(), 61);
    expect(ra).toEqual(rb);
    expect(a.snap()).toEqual(b.snap());
  });
});

import { describe, expect, it } from 'vitest';
import { run } from './mg-harness';
import angkat, { HALF_TIMEOUT, PERFECT_SHARE, PTS, REPS, comboBonus, markerSpeed, zoneHalf } from '../../src/minigames/games/angkat-beban';
import type { Btn } from '../../src/minigames/types';

type Snap = { phase: string; pick: number; kg: number; rep: number; half: number; locked: boolean; pos: number; zoneC: number; zoneHalf: number; speed: number; points: number; score: number; grades: string[]; halves: string[]; streak: number; bestStreak: number };

/** Press A only when the marker sits in the perfect core of the zone (read from the snapshot). */
function precise(_f: number, raw: Record<string, unknown>): { press?: Btn[] } {
  const s = raw as Snap;
  if (s.phase !== 'swing' || s.locked) return {};
  return Math.abs(s.pos - s.zoneC) < s.zoneHalf * PERFECT_SHARE * 0.8 ? { press: ['a'] } : {};
}

function start(seed: number, rightPresses: number) {
  const r = run(angkat, seed);
  r.step(2);
  for (let i = 0; i < rightPresses; i++) { r.step(1, [], ['right']); r.step(1); }
  r.step(1, [], ['a']);
  return r;
}

describe('mini game: angkat-beban', () => {
  it('perfect presses every half give the full score plus combo for the weight', () => {
    let expected = 0;
    for (let n = 1; n <= REPS * 2; n++) expected += PTS.perfect + comboBonus(n);
    for (const [presses, kg] of [[0, 5], [1, 10], [2, 15]] as const) {
      const r = start(5, presses);
      expect((r.snap() as Snap).kg).toBe(kg);
      const res = r.play(precise, 120);
      expect(res).not.toBeNull();
      const s = r.snap() as Snap;
      expect(s.grades).toEqual(Array(REPS).fill('perfect'));
      expect(s.halves).toHaveLength(REPS * 2);
      expect(s.bestStreak).toBe(REPS * 2);
      expect(res!.score).toBe(expected * kg);
      expect(res!.won).toBe(true);
    }
  });

  it('a press is judged on the same frame it lands', () => {
    const r = start(7, 0);
    // wait for the marker to sit in the zone, then press once
    for (let i = 0; i < 600; i++) {
      if (precise(0, r.snap()).press) break;
      r.step(1);
    }
    const before = (r.snap() as Snap).halves.length;
    r.step(1, [], ['a']);
    const s = r.snap() as Snap;
    expect(s.halves.length).toBe(before + 1);
    expect(s.half).toBe(1);
    expect(r.sfx).toContain('clank');
  });

  it('canvas tap works as A, both in the weight picker and while lifting', () => {
    const r = run(angkat, 3);
    r.step(2);
    r.step(1, [], [], undefined, { x: 430, y: 160 });
    expect((r.snap() as Snap).pick).toBe(2);
    expect((r.snap() as Snap).phase).toBe('pick');
    r.step(1, [], [], undefined, { x: 430, y: 160 });
    expect((r.snap() as Snap).phase).toBe('swing');
    expect((r.snap() as Snap).kg).toBe(15);
    r.step(5);
    r.step(1, [], [], undefined, { x: 300, y: 200 });
    expect((r.snap() as Snap).halves).toHaveLength(1);
  });

  it('a double tap cannot judge two halves at once', () => {
    const r = start(3, 0);
    r.step(10);
    r.step(1, [], ['a']);
    r.step(1, [], ['a']);
    expect((r.snap() as Snap).halves).toHaveLength(1);
  });

  it('mashing A at random times scores lower', () => {
    const good = start(9, 1).play(precise, 120)!;
    const r = start(9, 1);
    const res = r.play((f, raw) => ((raw as Snap).phase === 'swing' && f % 23 === 0 ? { press: ['a'] } : {}), 120)!;
    expect(res).not.toBeNull();
    expect(res.score).toBeLessThan(good.score);
    expect((r.snap() as Snap).grades.filter((x) => x !== 'perfect' && x !== 'full').length).toBeGreaterThan(0);
  });

  it('ends after the tenth rep (twenty presses), not before', () => {
    const r = start(3, 0);
    for (let f = 0; f < 60 * 120 && !r.result; f++) {
      r.step(1, [], precise(f, r.snap()).press ?? []);
      expect((r.snap() as Snap).rep).toBeLessThanOrEqual(REPS);
      if ((r.snap() as Snap).rep < REPS) expect(r.result).toBeNull();
    }
    expect(r.result).not.toBeNull();
    expect((r.snap() as Snap).grades).toHaveLength(REPS);
  });

  it('a player who never presses still finishes (each press times out)', () => {
    const r = start(4, 0);
    const res = r.play(() => ({}), REPS * 2 * HALF_TIMEOUT + 10);
    expect(res).not.toBeNull();
    expect(res!.score).toBe(0);
    expect(res!.won).toBe(false);
    expect((r.snap() as Snap).grades).toEqual(Array(REPS).fill('timeout'));
  });

  it('zone shrinks and marker speeds up each rep; heavier weight is faster', () => {
    for (let i = 1; i < REPS; i++) {
      expect(zoneHalf(i)).toBeLessThan(zoneHalf(i - 1));
      expect(markerSpeed(i, 5)).toBeGreaterThan(markerSpeed(i - 1, 5));
    }
    expect(zoneHalf(REPS - 1)).toBeGreaterThan(0.03);
    expect(markerSpeed(0, 15)).toBeGreaterThan(markerSpeed(0, 10));
    expect(markerSpeed(0, 10)).toBeGreaterThan(markerSpeed(0, 5));
  });

  it('same seed, same run', () => {
    const go = (seed: number) => {
      const r = start(seed, 2);
      const res = r.play((f, raw) => ((raw as Snap).phase === 'swing' && f % 31 === 0 ? { press: ['a'] } : {}), 120);
      return JSON.stringify([res, r.snap()]);
    };
    expect(go(21)).toBe(go(21));
    expect(go(21)).not.toBe(go(22));
  });
});

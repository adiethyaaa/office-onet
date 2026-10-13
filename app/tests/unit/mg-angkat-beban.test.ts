import { describe, expect, it } from 'vitest';
import { run } from './mg-harness';
import angkat, { PTS, REPS, markerSpeed, zoneHalf } from '../../src/minigames/games/angkat-beban';
import type { Btn } from '../../src/minigames/types';

type Snap = { phase: string; pick: number; kg: number; rep: number; pos: number; zoneC: number; zoneHalf: number; speed: number; points: number; score: number; grades: string[] };

/** Press A only when the marker is well inside the green zone (read from the snapshot). */
function precise(_f: number, raw: Record<string, unknown>): { press?: Btn[] } {
  const s = raw as Snap;
  if (s.phase !== 'swing') return {};
  return Math.abs(s.pos - s.zoneC) < s.zoneHalf * 0.4 ? { press: ['a'] } : {};
}

function start(seed: number, rightPresses: number) {
  const r = run(angkat, seed);
  r.step(2);
  for (let i = 0; i < rightPresses; i++) { r.step(1, [], ['right']); r.step(1); }
  r.step(1, [], ['a']);
  return r;
}

describe('mini game: angkat-beban', () => {
  it('pressing inside the zone every rep gives the full score for the weight', () => {
    for (const [presses, kg] of [[0, 5], [1, 10], [2, 15]] as const) {
      const r = start(5, presses);
      expect((r.snap() as Snap).kg).toBe(kg);
      const res = r.play(precise, 120);
      expect(res).not.toBeNull();
      const s = r.snap() as Snap;
      expect(s.grades).toEqual(Array(REPS).fill('full'));
      expect(res!.score).toBe(REPS * PTS.full * kg);
      expect(res!.won).toBe(true);
    }
  });

  it('mashing A at random times scores lower', () => {
    const good = start(9, 1).play(precise, 120)!;
    const r = start(9, 1);
    const res = r.play((f, raw) => ((raw as Snap).phase === 'swing' && f % 23 === 0 ? { press: ['a'] } : {}), 120)!;
    expect(res).not.toBeNull();
    expect(res.score).toBeLessThan(good.score);
    expect((r.snap() as Snap).grades.filter((x) => x !== 'full').length).toBeGreaterThan(0);
  });

  it('ends exactly after the tenth rep, not before', () => {
    const r = start(3, 0);
    let endedAt = -1;
    for (let f = 0; f < 60 * 120 && !r.result; f++) {
      const before = (r.snap() as Snap).rep;
      r.step(1, [], precise(f, r.snap()).press ?? []);
      if (r.result) endedAt = before;
      else expect((r.snap() as Snap).rep).toBeLessThanOrEqual(REPS);
    }
    expect(endedAt).toBe(REPS);
    expect((r.snap() as Snap).grades).toHaveLength(REPS);
  });

  it('a player who never presses still finishes (each rep times out)', () => {
    const r = start(4, 0);
    const res = r.play(() => ({}), 120);
    expect(res).not.toBeNull();
    expect(res!.score).toBe(0);
    expect(res!.won).toBe(false);
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

import { describe, expect, it } from 'vitest';
import { mulberry, run } from './mg-harness';
import barista, { makeOrders, zoneScore, starsFor, GAUGES, GRIND } from '../../src/minigames/games/barista';
import { buildCast } from '../../src/minigames/cast';
import type { Btn } from '../../src/minigames/types';

type Snap = { phase: string; order: number; kind: string | null; value: number; started: boolean; artIdx: number; art: Btn[]; zone: [number, number]; stepScores: number[][]; stars: number[]; total: number; orders: string[] };
type Policy = (f: number, s: Record<string, unknown>) => { held?: Btn[]; press?: Btn[] };

const perfect: Policy = (f, raw) => {
  const s = raw as unknown as Snap;
  if (s.phase !== 'step') return {};
  if (s.kind === 'grind') {
    if (s.value < s.zone[0] + 0.2) return f % 2 ? { press: ['a'] } : {};
    return { press: ['b'] };
  }
  if (s.kind === 'art') return f % 3 === 0 ? { press: [s.art[s.artIdx]] } : {};
  return s.value < (s.zone[0] + s.zone[1]) / 2 ? { held: ['a'] } : {};
};

const sloppy: Policy = (f, raw) => {
  const s = raw as unknown as Snap;
  if (s.phase !== 'step') return {};
  if (s.kind === 'grind') return f % 2 ? { press: ['a'] } : {};
  if (s.kind === 'art') {
    const want = s.art[s.artIdx];
    return f % 3 === 0 ? { press: [want === 'up' ? 'left' : 'up'] } : {};
  }
  return { held: ['a'] };
};

describe('mini game: barista', () => {
  it('scores a step 100 in the zone and falls off outside it', () => {
    expect(zoneScore(27, GAUGES.extract.lo, GAUGES.extract.hi, GAUGES.extract.per)).toBe(100);
    expect(zoneScore(40, GAUGES.extract.lo, GAUGES.extract.hi, GAUGES.extract.per)).toBeLessThanOrEqual(10);
    expect(zoneScore(18, GRIND.lo, GRIND.hi, GRIND.per)).toBe(100);
    expect(zoneScore(24, GRIND.lo, GRIND.hi, GRIND.per)).toBe(0);
    expect(starsFor(95)).toBe(3);
    expect(starsFor(70)).toBe(2);
    expect(starsFor(20)).toBe(1);
  });

  it('orders come from the seed: five different drinks for five teammates, never the player', () => {
    const cast = buildCast();
    const a = makeOrders(mulberry(9), cast), b = makeOrders(mulberry(9), cast), c = makeOrders(mulberry(10), cast);
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
    expect(new Set(a.map((o) => o.drink)).size).toBe(5);
    expect(new Set(a.map((o) => o.who)).size).toBe(5);
    expect(a.some((o) => o.who === 'CH-CEO')).toBe(false);
  });

  it('a precise barista finishes all five orders with high step scores and ends the game', () => {
    const r = run(barista, 11);
    const res = r.play(perfect, 240);
    expect(res).not.toBeNull();
    const s = r.snap() as unknown as Snap;
    const all = s.stepScores.flat();
    expect(all.length).toBe(17);
    expect(Math.min(...all)).toBeGreaterThanOrEqual(90);
    expect(s.stars).toEqual([3, 3, 3, 3, 3]);
    expect(res!.score).toBe(s.total);
    expect(res!.won).toBe(true);
  });

  it('a sloppy barista gets low step scores and fewer stars', () => {
    const r = run(barista, 11);
    const res = r.play(sloppy, 240);
    expect(res).not.toBeNull();
    const s = r.snap() as unknown as Snap;
    const all = s.stepScores.flat();
    expect(all.reduce((a, b) => a + b, 0) / all.length).toBeLessThan(25);
    expect(s.stars.every((n) => n === 1)).toBe(true);
    expect(res!.won).toBe(false);
  });

  it('an idle player still ends: each order times out', () => {
    const r = run(barista, 3);
    const res = r.play(() => ({}), 260);
    expect(res).not.toBeNull();
    expect(res!.score).toBe(0);
  });

  it('same seed, same session', () => {
    const a = run(barista, 77), b = run(barista, 77);
    const ra = a.play(perfect, 240), rb = b.play(perfect, 240);
    expect(ra).toEqual(rb);
    expect(a.snap()).toEqual(b.snap());
  });
});

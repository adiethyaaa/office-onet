import { describe, expect, it } from 'vitest';
import { mulberry, run } from './mg-harness';
import barista, { makeOrders, zoneScore, starsFor, GAUGES, GRIND, TAP_LATCH } from '../../src/minigames/games/barista';
import { buildCast } from '../../src/minigames/cast';
import type { Btn } from '../../src/minigames/types';

type Snap = { latched: boolean; step: number; phase: string; order: number; kind: string | null; value: number; started: boolean; artIdx: number; art: Btn[]; zone: [number, number]; stepScores: number[][]; stars: number[]; total: number; orders: string[] };
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

  /** Advance to the first hold-gauge step (extract) by grinding perfectly. */
  const toExtract = (seed: number) => {
    const r = run(barista, seed);
    for (let f = 0; f < 60 * 20; f++) {
      const s = r.snap() as unknown as Snap;
      if (s.phase === 'step' && s.kind === 'extract') return r;
      const p = s.kind === 'grind' && s.phase === 'step' ? perfect(f, s as unknown as Record<string, unknown>) : {};
      r.step(1, p.held ?? [], p.press ?? []);
    }
    throw new Error('no extract');
  };

  it('a hold gauge also works by tap: a short tap starts the pour, the next tap stops it', () => {
    const r = toExtract(11);
    r.step(1, [], ['a']);
    r.step(1);
    let s = r.snap() as unknown as Snap;
    expect(s.started).toBe(true);
    expect(s.latched).toBe(true);
    const zone = s.zone;
    // keeps pouring without A held
    for (let f = 0; f < 600 && (r.snap() as unknown as Snap).value < (zone[0] + zone[1]) / 2; f++) r.step(1);
    expect((r.snap() as unknown as Snap).phase).toBe('step');
    r.step(1, [], ['a']);
    s = r.snap() as unknown as Snap;
    expect(s.phase).toBe('stepDone');
    expect(s.stepScores[0][1]).toBe(100);
  });

  it('a long hold still ends the step on release (classic control unchanged)', () => {
    const r = toExtract(11);
    r.step(Math.ceil(TAP_LATCH * 60) + 5, ['a']);
    r.step(1);
    expect((r.snap() as unknown as Snap).phase).toBe('stepDone');
  });

  it('tapping the workstation acts as A, and A skips the result wait after a short grace', () => {
    const r = run(barista, 11);
    while ((r.snap() as unknown as Snap).phase !== 'step') r.step(1);
    r.step(1, [], [], undefined, { x: 420, y: 140 });
    expect((r.snap() as unknown as Snap).value).toBeGreaterThan(1);
    // finish grinding via the on-screen Done chip
    r.step(1, [], [], undefined, { x: 560, y: 240 });
    expect((r.snap() as unknown as Snap).phase).toBe('stepDone');
    r.step(15);
    r.step(1, [], ['a']);
    const s = r.snap() as unknown as Snap;
    expect(s.phase).toBe('step');
    expect(s.step).toBe(1);
  });

  it('latte art accepts taps on the side of the cup', () => {
    const r = run(barista, 11);
    for (let f = 0; f < 60 * 200; f++) {
      const s = r.snap() as unknown as Snap;
      if (s.phase === 'step' && s.kind === 'art') break;
      const p = perfect(f, s as unknown as Record<string, unknown>);
      r.step(1, p.held ?? [], p.press ?? []);
    }
    const s0 = r.snap() as unknown as Snap;
    expect(s0.kind).toBe('art');
    const off: Record<string, [number, number]> = { up: [0, -60], down: [0, 60], left: [-60, 0], right: [60, 0] };
    for (const d of s0.art) { const [dx, dy] = off[d]; r.step(1, [], [], undefined, { x: 300 + dx, y: 210 + dy }); r.step(2); }
    const s1 = r.snap() as unknown as Snap;
    expect(s1.stepScores[s1.order].at(-1)).toBe(100);
  });
});

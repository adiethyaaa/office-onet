import { describe, expect, it } from 'vitest';
import { mulberry, run } from './mg-harness';
import sambung, { SPIN_T, LEVELS, generateLevel, litCells, maskOf, sizeFor, solved, timeFor } from '../../src/minigames/games/sambung-kabel';

type Snap = { spinning: number; cursor: number; level: number; phase: string; score: number; timeLeft: number; size: number; need: number[]; rot: number[]; moves: number; housesLit: number; houses: number; geom: { ox: number; oy: number; cell: number } };

/** Tap the first tile that is not yet in its solution orientation. */
const solver = (_f: number, s: Record<string, unknown>) => {
  const S = s as Snap;
  if (S.phase !== 'play') return {};
  const i = S.need.findIndex((k) => k > 0);
  if (i < 0) return {};
  const { ox, oy, cell } = S.geom;
  return { tap: { x: ox + (i % S.size) * cell + cell / 2, y: oy + Math.floor(i / S.size) * cell + cell / 2 } };
};

describe('mini game: sambung-kabel generator', () => {
  it('every level of 3 seeds is unsolved at start and solved by the stored rotations', () => {
    for (const seed of [1, 77, 20261013]) {
      const rand = mulberry(seed);
      let prevSize = 0;
      for (let lv = 1; lv <= LEVELS; lv++) {
        const L = generateLevel(lv, rand);
        expect(L.size).toBe(sizeFor(lv));
        expect(L.size).toBeGreaterThanOrEqual(prevSize);
        prevSize = L.size;
        expect(L.houses.length).toBeGreaterThanOrEqual(2);
        expect(L.olt % L.size).toBe(0);
        expect(solved(L)).toBe(false);
        const fixed = { ...L, rot: L.rot.map(() => 0) };
        expect(solved(fixed)).toBe(true);
        const lit = litCells(fixed);
        for (const hh of L.houses) expect(lit[hh]).toBe(true);
      }
      expect(prevSize).toBe(8);
    }
  });

  it('rotating a tile changes connectivity', () => {
    const L = generateLevel(5, mulberry(9));
    const fixed = { ...L, rot: L.rot.map(() => 0) };
    const before = litCells(fixed).filter(Boolean).length;
    let changed = 0;
    for (const hh of L.houses) {
      const r = { ...fixed, rot: [...fixed.rot] };
      r.rot[hh] = 1;
      expect(maskOf(r, hh)).not.toBe(maskOf(fixed, hh));
      if (!solved(r) || litCells(r).filter(Boolean).length !== before) changed++;
    }
    expect(changed).toBeGreaterThan(0);
  });
});

describe('mini game: sambung-kabel play', () => {
  it('a tap rotates the tile under it and lights houses as they connect', () => {
    const r = run(sambung, 5);
    const s0 = r.snap() as Snap;
    const i = s0.need.findIndex((k) => k > 0);
    const { ox, oy, cell } = s0.geom;
    r.step(1, [], [], undefined, { x: ox + (i % s0.size) * cell + cell / 2, y: oy + Math.floor(i / s0.size) * cell + cell / 2 });
    const s1 = r.snap() as Snap;
    expect(s1.rot[i]).toBe((s0.rot[i] + 1) % 4);
    expect(s1.moves).toBe(1);
    expect(r.sfx).toContain('rotate');
    // B undoes it from the cursor
    r.step(1, [], ['b']);
    expect((r.snap() as Snap).rot[i]).toBe(s0.rot[i]);
  });

  it('solving a level advances to the next with score 100 + time left', () => {
    const r = run(sambung, 11);
    let guard = 0;
    while ((r.snap() as Snap).level === 1 && guard++ < 60 * 30) r.play(solver, 1 / 60);
    const s = r.snap() as Snap;
    expect(s.level).toBe(2);
    expect(s.score).toBeGreaterThan(100);
    expect(s.score).toBeLessThanOrEqual(100 + timeFor(1));
    expect(r.sfx).toContain('connect');
  });

  it('a perfect solver clears all 20 levels and wins', () => {
    const r = run(sambung, 20261013);
    const res = r.play(solver, 200);
    expect(res?.won).toBe(true);
    expect(res!.score).toBeGreaterThan(LEVELS * 100);
    expect((r.snap() as Snap).level).toBe(LEVELS);
  });

  it('running out of time ends the run as a loss', () => {
    const r = run(sambung, 3);
    const res = r.play(() => ({}), 120);
    expect(res).not.toBeNull();
    expect(res!.won).toBe(false);
    expect(res!.score).toBe(0);
    expect((r.snap() as Snap).timeLeft).toBe(0);
  });

  it('is deterministic for a seed', () => {
    const go = (seed: number) => {
      const r = run(sambung, seed);
      r.play((f, s) => (f % 3 === 0 ? solver(f, s) : {}), 40);
      return JSON.stringify(r.snap());
    };
    expect(go(42)).toBe(go(42));
    expect(go(42)).not.toBe(go(43));
  });

  it('fast taps on one tile all count and the spin never outlasts SPIN_T', () => {
    const r = run(sambung, 5);
    const s0 = r.snap() as Snap;
    const i = s0.need.findIndex((k) => k > 0);
    const { ox, oy, cell } = s0.geom;
    const tap = { x: ox + (i % s0.size) * cell + cell / 2, y: oy + Math.floor(i / s0.size) * cell + cell / 2 };
    for (let k = 0; k < 3; k++) r.step(1, [], [], undefined, tap);
    const s1 = r.snap() as Snap;
    expect(s1.moves).toBe(3);
    expect(s1.rot[i]).toBe((s0.rot[i] + 3) % 4);
    expect(s1.spinning).toBe(1);
    r.step(Math.ceil(SPIN_T * 60) + 1);
    expect((r.snap() as Snap).spinning).toBe(0);
    expect(SPIN_T).toBeLessThanOrEqual(0.12);
  });

  it('a tap outside the grid is ignored and A still rotates the cursor tile that frame', () => {
    const r = run(sambung, 5);
    const s0 = r.snap() as Snap;
    const i = s0.need.findIndex((k) => k > 0);
    // move the cursor onto a rotatable tile with arrows
    const cx = i % s0.size, cy = Math.floor(i / s0.size);
    let c = s0.cursor;
    while (c % s0.size !== cx) { r.step(1, [], [c % s0.size < cx ? 'right' : 'left']); c = (r.snap() as Snap).cursor; }
    while (Math.floor(c / s0.size) !== cy) { r.step(1, [], [Math.floor(c / s0.size) < cy ? 'down' : 'up']); c = (r.snap() as Snap).cursor; }
    r.step(1, [], ['a'], undefined, { x: 20, y: 20 });
    const s1 = r.snap() as Snap;
    expect(s1.cursor).toBe(i);
    expect(s1.moves).toBe(1);
    expect(s1.rot[i]).toBe((s0.rot[i] + 1) % 4);
  });
});

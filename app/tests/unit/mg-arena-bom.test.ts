import { describe, expect, it } from 'vitest';
import { run } from './mg-harness';
import arena, { BOX, FLOOR, GH, GW, WALL, blast, isPillar } from '../../src/minigames/games/arena-bom';

type P = { id: string; x: number; y: number; alive: boolean; maxBombs: number; range: number };
type Snap = { phase: string; round: number; wins: number; losses: number; score: number; kills: number; boxesBroken: number; suicides: number; suicideTimes: number[]; playT: number; roundT: number; bombs: number; boxes: number; players: P[] };

const open = () => {
  const g = new Uint8Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) g[y * GW + x] = isPillar(x, y) ? WALL : FLOOR;
  return g;
};
const at = (x: number, y: number) => y * GW + x;

describe('mini game: arena-bom blast rules', () => {
  it('a blast stops at a pillar and breaks only the first cabinet in a line', () => {
    const g = open();
    g[at(3, 1)] = BOX;
    g[at(4, 1)] = BOX;
    const r = blast(g, [{ x: 1, y: 1, range: 5 }], 0);
    expect(r.boxes).toEqual([at(3, 1)]);
    expect(r.flame.has(at(3, 1))).toBe(true);
    expect(r.flame.has(at(4, 1))).toBe(false);
    // (1,1) has the border to the north and west; (2,1) is open but (2,2) is a pillar
    expect(r.flame.has(at(1, 0))).toBe(false);
    expect(r.flame.has(at(1, 2))).toBe(true);
    const r2 = blast(g, [{ x: 3, y: 3, range: 4 }], 0);
    expect(r2.flame.has(at(3, 2))).toBe(true);
    expect(r2.flame.has(at(4, 3))).toBe(true);
    // (2,2)/(4,2) style pillars never burn
    for (const c of r2.flame.keys()) expect(g[c]).not.toBe(WALL);
  });

  it('bombs chain: one blast sets off another in range, which reaches further', () => {
    const g = open();
    const bombs = [{ x: 1, y: 1, range: 2 }, { x: 3, y: 1, range: 2 }, { x: 5, y: 1, range: 2 }, { x: 9, y: 1, range: 1 }];
    const r = blast(g, bombs, 0);
    expect(r.fired.sort()).toEqual([0, 1, 2]);
    expect(r.flame.has(at(7, 1))).toBe(true);
    expect(r.flame.has(at(9, 1))).toBe(false);
  });
});

describe('mini game: arena-bom play', () => {
  it('CPU players rarely blow themselves up in the first 30 s', () => {
    let bad = 0;
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    for (const seed of seeds) {
      const r = run(arena, seed);
      // the player hides in its corner, holding still
      r.play(() => ({}), 32);
      const s = r.snap() as Snap;
      if (s.suicideTimes.some((t) => t <= 30)) bad++;
    }
    expect(bad).toBeLessThanOrEqual(2);
  });

  it('CPUs break cabinets and the arena changes', () => {
    const r = run(arena, 4);
    const before = (r.snap() as Snap).boxes;
    r.play(() => ({}), 20);
    expect((r.snap() as Snap).boxes).toBeLessThan(before);
    expect(r.sfx).toContain('explode');
  });

  it('a player who just stands in the corner loses rounds and the match ends', () => {
    for (const seed of [11, 12, 13]) {
      const r = run(arena, seed);
      const res = r.play(() => ({}), 600);
      expect(res).not.toBeNull();
      expect(res!.won).toBe(false);
      const s = r.snap() as Snap;
      expect(s.losses).toBeGreaterThanOrEqual(2);
      expect(s.round).toBeGreaterThanOrEqual(2);
    }
  });

  it('the player can walk, place a bomb, and gets hurt by standing on it', () => {
    const r = run(arena, 21);
    r.step(100);
    const s0 = r.snap() as Snap;
    expect(s0.phase).toBe('play');
    r.step(1, [], ['a']);
    expect((r.snap() as Snap).bombs).toBeGreaterThanOrEqual(1);
    r.step(10, ['right']);
    const s1 = r.snap() as Snap;
    expect(s1.players[0].x).toBeGreaterThan(1);
    // walk back onto own bomb and wait for it
    r.step(10, ['left']);
    r.step(150);
    expect((r.snap() as Snap).players[0].alive).toBe(false);
  });

  it('corner correction slides the player into a lane', () => {
    const r = run(arena, 21);
    r.step(100);
    // (1,1): south is open (1,2); start slightly off lane then push down
    r.step(4, ['right']);
    const s0 = (r.snap() as Snap).players[0];
    expect(s0.x).toBeGreaterThan(1);
    r.step(30, ['down']);
    const s1 = (r.snap() as Snap).players[0];
    expect(s1.x).toBe(1);
    expect(s1.y).toBeGreaterThan(1);
  });

  it('is deterministic for a seed', () => {
    const go = (seed: number) => {
      const r = run(arena, seed);
      const res = r.play((f) => ({ held: f % 240 < 30 ? ['down'] : f % 240 < 60 ? ['right'] : [], press: f % 240 === 70 ? ['a'] : [] }), 600);
      return JSON.stringify([res, r.snap()]);
    };
    const a = go(99);
    expect(a).toBe(go(99));
    expect(a).not.toBe(go(100));
  });
});

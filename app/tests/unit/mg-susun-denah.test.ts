import { describe, expect, it } from 'vitest';
import { run, type Run } from './mg-harness';
import susunDenah, { CELL_M, roomCells } from '../../src/minigames/games/susun-denah';
import worldJson from '@design/world.json';

type P = { id: string; name: string; floor: string; x: number; y: number; w: number; h: number; placed: boolean };
type Snap = { plan: number; floor: string; sel: number; holding: boolean; pos: { x: number; y: number }; placedTotal: number; plansDone: number; wrong: number; score: number; timeBonus: number; pieces: P[]; openIds: string[] };
const S = (r: Run) => r.snap() as unknown as Snap;

/** Place the currently selected open piece at (x, y) with the keyboard. */
function placeSelected(r: Run, x: number, y: number) {
  r.step(1, [], ['a']);
  for (let g = 0; g < 60; g++) {
    const p = S(r).pos;
    if (p.x === x && p.y === y) break;
    r.step(1, [], [p.x < x ? 'right' : p.x > x ? 'left' : p.y < y ? 'down' : 'up']);
  }
  r.step(1, [], ['a']);
}

function solvePlan(r: Run) {
  const plan = S(r).plan;
  while (!r.result && S(r).plan === plan && S(r).openIds.length) {
    const s = S(r);
    const p = s.pieces.find((k) => k.id === s.openIds[s.sel])!;
    placeSelected(r, p.x, p.y);
  }
  for (let i = 0; i < 120 && !r.result && S(r).plan === plan; i++) r.step(1);
}

describe('mini game: susun-denah', () => {
  it('pieces are real rooms from world.json with names and grid boxes from their polygons', () => {
    const w = worldJson as unknown as { rooms: { id: string; name: string; floor: string; polygon: number[][] }[] };
    const s = S(run(susunDenah, 4));
    expect(s.pieces.length).toBeGreaterThanOrEqual(6);
    expect(s.pieces.length).toBeLessThanOrEqual(10);
    for (const p of s.pieces) {
      const room = w.rooms.find((r) => r.id === p.id)!;
      expect(room.name).toBe(p.name);
      expect(room.floor).toBe(p.floor);
      const xs = room.polygon.map((q) => q[0]);
      expect(p.x).toBe(Math.round(Math.min(...xs) / CELL_M));
    }
    // grid boxes on one floor do not overlap (rooms tile in metres)
    const cells = roomCells('L1');
    const seen = new Set<string>();
    for (const c of cells) for (let i = 0; i < c.w; i++) for (let j = 0; j < c.h; j++) {
      const k = `${c.x + i},${c.y + j}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it('a wrong spot does not snap; the right spot does', () => {
    const r = run(susunDenah, 8);
    const s = S(r);
    const p = s.pieces.find((k) => k.id === s.openIds[0])!;
    r.step(1, [], ['a']);
    const at = S(r).pos;
    if (at.x === p.x && at.y === p.y) r.step(1, [], [p.x > 0 ? 'left' : 'right']);
    r.step(1, [], ['a']);
    expect(S(r).wrong).toBe(1);
    expect(S(r).placedTotal).toBe(0);
    expect(S(r).holding).toBe(true);
    for (let g = 0; g < 60; g++) {
      const q = S(r).pos;
      if (q.x === p.x && q.y === p.y) break;
      r.step(1, [], [q.x < p.x ? 'right' : q.x > p.x ? 'left' : q.y < p.y ? 'down' : 'up']);
    }
    r.step(1, [], ['a']);
    expect(S(r).placedTotal).toBe(1);
    expect(S(r).pieces.find((k) => k.id === p.id)!.placed).toBe(true);
  });

  it('placing every piece finishes the plan; three plans end the game with a win', () => {
    const r = run(susunDenah, 21);
    const seen = new Set<string>();
    for (let k = 0; k < 3 && !r.result; k++) {
      const s = S(r);
      expect(s.plan).toBe(k + 1);
      s.pieces.forEach((p) => seen.add(p.id));
      solvePlan(r);
      expect(S(r).plansDone).toBe(k + 1);
    }
    expect(r.result?.won).toBe(true);
    const s = S(r);
    expect(r.result!.score).toBe(s.placedTotal * 50 + s.timeBonus);
    expect(s.timeBonus).toBeGreaterThan(0);
    expect(seen.size).toBeGreaterThan(14);
  });

  it('time runs out after 60 s on a plan', () => {
    const r = run(susunDenah, 2);
    r.step(60 * 59);
    expect(r.result).toBeNull();
    r.step(60 * 2);
    expect(r.result?.won).toBe(false);
    expect(r.result?.score).toBe(0);
  });

  it('same seed gives the same plans', () => {
    const a = run(susunDenah, 77), b = run(susunDenah, 77);
    solvePlan(a); solvePlan(b);
    expect(a.snap()).toEqual(b.snap());
    expect(run(susunDenah, 1).snap()).not.toEqual(run(susunDenah, 5).snap());
  });
});

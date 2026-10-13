import { describe, expect, it } from 'vitest';
import { mulberry, run, type Run } from './mg-harness';
import type { Btn, InputState } from '../../src/minigames/types';
import { BTNS } from '../../src/minigames/types';
import susunDenah, { CELL_M, roomCells } from '../../src/minigames/games/susun-denah';
import worldJson from '@design/world.json';

type P = { id: string; name: string; floor: string; x: number; y: number; w: number; h: number; placed: boolean; tx: number; ty: number };
type Snap = { plan: number; floor: string; sel: number; holding: boolean; pos: { x: number; y: number }; dragging: boolean; tscale: number; placedTotal: number; plansDone: number; wrong: number; score: number; timeBonus: number; pieces: P[]; openIds: string[] };
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

  it('drag with the pointer: press a tray piece, move over its outline, release places it', () => {
    const L = live(8);
    const s = L.snap();
    const p = s.pieces.find((k) => k.id === s.openIds[0])!;
    const FX = 14, FY = 70, CP = 14;
    const gx = p.tx + 4, gy = p.ty + 4;
    const ox = 4 / s.tscale, oy = 4 / s.tscale;
    // press on the piece (tap + ptr down on the same frame, as the host sends them)
    L.feed({ tap: { x: gx, y: gy }, ptr: { x: gx, y: gy, down: true } });
    expect(L.snap().dragging).toBe(true);
    const tx = FX + p.x * CP + ox, ty = FY + p.y * CP + oy;
    for (let k = 1; k <= 5; k++) L.feed({ ptr: { x: gx + ((tx - gx) * k) / 5, y: gy + ((ty - gy) * k) / 5, down: true } });
    expect(L.snap().pos).toEqual({ x: p.x, y: p.y });
    expect(L.snap().placedTotal).toBe(0);
    L.feed({ ptr: { x: tx, y: ty, down: false } });
    expect(L.snap().dragging).toBe(false);
    expect(L.snap().placedTotal).toBe(1);
    expect(L.snap().pieces.find((k) => k.id === p.id)!.placed).toBe(true);
  });

  it('dragging a piece back over the tray returns it without a miss', () => {
    const L = live(8);
    const s = L.snap();
    const p = s.pieces.find((k) => k.id === s.openIds[0])!;
    L.feed({ tap: { x: p.tx + 3, y: p.ty + 3 }, ptr: { x: p.tx + 3, y: p.ty + 3, down: true } });
    L.feed({ ptr: { x: 120, y: 150, down: true } });
    L.feed({ ptr: { x: 600, y: 350, down: true } });
    L.feed({ ptr: { x: 600, y: 350, down: false } });
    expect(L.snap().holding).toBe(false);
    expect(L.snap().wrong).toBe(0);
  });

  it('tap a tray piece, then tap its outline, places it (no pointer data needed)', () => {
    const r = run(susunDenah, 8);
    const s = S(r);
    const p = s.pieces.find((k) => k.id === s.openIds[2])!;
    r.step(1, [], [], undefined, { x: p.tx + 2, y: p.ty + 2 });
    expect(S(r).holding).toBe(true);
    expect(S(r).openIds[S(r).sel]).toBe(p.id);
    r.step(1, [], [], undefined, { x: 14 + (p.x + p.w / 2) * 14, y: 70 + (p.y + p.h / 2) * 14 });
    expect(S(r).placedTotal).toBe(1);
  });

  it('a held arrow auto-repeats so a piece crosses the plan without many presses', () => {
    const r = run(susunDenah, 8);
    r.step(1, [], ['a']);
    const x0 = S(r).pos.x;
    r.step(1, [], ['left']);
    r.step(30, ['left']);
    expect(S(r).pos.x).toBeLessThan(x0 - 3);
  });

  it('the tray stays in reading order so arrows walk it left to right, top to bottom', () => {
    const s = S(run(susunDenah, 4));
    const open = s.openIds.map((id) => s.pieces.find((k) => k.id === id)!);
    for (let i = 1; i < open.length; i++) expect(open[i].ty > open[i - 1].ty || (open[i].ty === open[i - 1].ty && open[i].tx > open[i - 1].tx)).toBe(true);
    // tray leaves room for the status lines at the bottom
    for (const p of open) expect(p.ty + p.h * 14 * s.tscale).toBeLessThanOrEqual(44 + 344 - 100);
  });
});

/** A game instance fed frame by frame with pointer data (the shared harness has no ptr). */
function live(seed: number) {
  const ctx = { ...run(susunDenah, seed).ctx, rand: mulberry(seed) };
  const inst = susunDenah.create(ctx);
  const none = Object.fromEntries(BTNS.map((b) => [b, false])) as Record<Btn, boolean>;
  return {
    snap: () => inst.snapshot!() as unknown as Snap,
    feed(o: { tap?: { x: number; y: number }; ptr?: InputState['ptr'] }) {
      inst.update(1 / 60, { down: none, hit: none, ax: 0, ay: 0, tap: o.tap ?? null, ptr: o.ptr ?? null });
    },
  };
}

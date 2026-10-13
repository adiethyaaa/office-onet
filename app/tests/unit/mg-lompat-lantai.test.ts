import { describe, expect, it } from 'vitest';
import { run, mulberry } from './mg-harness';
import lompat, { LEVELS, TILE, findTile, makeGame, type LevelDef } from '../../src/minigames/games/lompat-lantai';
import type { Btn, GameModule } from '../../src/minigames/types';

type Snap = { level: number; lives: number; px: number; py: number; vx: number; vy: number; onGround: boolean; phase: string; docs: number; stomps: number; score: number; deaths: number; lastHurt: string; enemies: { x: number; y: number; alive: boolean }[] };

const solid = (c: string | undefined) => c === '#' || c === 'B';

/** Hold right; jump at gaps, at walls and cable piles just ahead, and at nearby printers. */
function bot(levels: LevelDef[]) {
  return (_f: number, raw: Record<string, unknown>): { held?: Btn[]; press?: Btn[] } => {
    const s = raw as Snap;
    const rows = levels[s.level].rows;
    const at = (x: number, y: number) => rows[y]?.[x] ?? '.';
    if (!s.onGround) return { held: ['right', ...(s.vy < 0 ? (['a'] as Btn[]) : [])] };
    const feet = Math.floor((s.py - 1) / TILE);
    const front = s.px + 6;
    let jump = false;
    const under = at(Math.floor(front / TILE), feet + 1);
    if (!solid(under) && under !== '-') jump = true;
    for (let d = 0; d < 3; d++) {
      const tx = Math.floor((front + 2) / TILE) + d;
      const dist = tx * TILE - front;
      const c = at(tx, feet), up = at(tx, feet - 1);
      if ((solid(c) || solid(up)) && dist < 14) jump = true;
      if (c === '^' && dist < 18) jump = true;
    }
    for (const e of s.enemies) if (e.alive && e.x > s.px && e.x - s.px < 48 && Math.abs(e.y - s.py) < 24) jump = true;
    return jump ? { held: ['right', 'a'], press: ['a'] } : { held: ['right'] };
  };
}

function single(level: number, lives = 30): GameModule {
  return { meta: lompat.meta, create: (ctx) => makeGame(ctx, { levels: [LEVELS[level]], lives }) };
}

describe('mini game: lompat-lantai', () => {
  it('has six valid levels: rectangular, start and exit, closed floor under the start', () => {
    expect(LEVELS).toHaveLength(6);
    for (const L of LEVELS) {
      const w = L.rows[0].length;
      expect(L.rows.every((r) => r.length === w)).toBe(true);
      expect(L.rows.join('').replace(/[.#B\-^DPCSE]/g, '')).toBe('');
      const s = findTile(L.rows, 'S')!, e = findTile(L.rows, 'E')!;
      expect(s).not.toBeNull();
      expect(e).not.toBeNull();
      expect(e.x).toBeGreaterThan(s.x);
      expect(L.rows[s.y + 1][s.x]).toBe('#');
      expect(L.rows[e.y + 1][e.x]).toBe('#');
      expect(L.rows.join('').split('S').length - 1).toBe(1);
      expect(L.rows.join('').split('D').length - 1).toBeGreaterThanOrEqual(5);
    }
  });

  it('a hold-right-and-jump policy clears every level on its own', () => {
    LEVELS.forEach((_L, i) => {
      const r = run(single(i));
      const res = r.play(bot([LEVELS[i]]), 120);
      expect((r.snap() as Snap).deaths, `level ${i + 1}`).toBeLessThanOrEqual(2);
      expect(res, `level ${i + 1}`).not.toBeNull();
      expect(res!.won, `level ${i + 1}`).toBe(true);
    });
  });

  it('the policy plays the full game to an end call with a score', () => {
    const r = run(lompat);
    let last: Snap | null = null;
    const pol = (f: number, s: Record<string, unknown>) => { last = s as Snap; return bot(LEVELS)(f, s); };
    const res = r.play(pol, 600);
    expect(res).not.toBeNull();
    expect(res!.score).toBe((last as unknown as Snap).score);
    expect(res!.won).toBe(true);
    expect(res!.score).toBeGreaterThan(6 * 500);
    expect(r.sfx).toContain('jump');
  });

  it('touching tangled cable costs a life and respawns; three hits end the run', () => {
    const lv: LevelDef = { name: 'Lobi', theme: 'lobby', par: 30, rows: ['#..........', '#.S..^^...E', '###########'] };
    const r = run({ meta: lompat.meta, create: (ctx) => makeGame(ctx, { levels: [lv] }) });
    r.play((_f, s) => ((s as Snap).deaths >= 1 ? {} : { held: ['right'] }), 3);
    let s = r.snap() as Snap;
    expect(s.lives).toBe(2);
    expect(s.lastHurt).toBe('spike');
    r.step(90);
    s = r.snap() as Snap;
    expect(s.phase).toBe('play');
    expect(Math.round(s.px)).toBe(2 * TILE + TILE / 2);
    const res = r.play(() => ({ held: ['right'] }), 20);
    expect(res?.won).toBe(false);
    expect(r.sfx).toContain('hurt');
  });

  it('stomping a printer from above defeats it; walking into it hurts', () => {
    const side: LevelDef = { name: 'Lobi', theme: 'lobby', par: 30, rows: ['#...............', '#.S......P.....E', '################'] };
    const a = run({ meta: lompat.meta, create: (ctx) => makeGame(ctx, { levels: [side] }) });
    for (let i = 0; i < 240 && (a.snap() as Snap).deaths === 0; i++) a.step(1, ['right']);
    let s = a.snap() as Snap;
    expect(s.lastHurt).toBe('enemy');
    expect(s.lives).toBe(2);
    expect(s.enemies[0].alive).toBe(true);

    // Drop onto a printer pacing on a fenced floor: it can only come from below us.
    const top: LevelDef = { name: 'Lobi', theme: 'lobby', par: 30, rows: [
      '#..............',
      '#.S............',
      '#######........',
      '#..............',
      '#.........P....',
      '#..###########E',
      '###############'] };
    const b = run({ meta: lompat.meta, create: (ctx) => makeGame(ctx, { levels: [top] }) });
    // walk off the ledge and keep steering toward the printer
    b.play((_f, raw) => {
      const q = raw as Snap;
      const e = q.enemies[0];
      if (!e.alive || q.deaths > 0) return {};
      return { held: q.px < e.x - 2 ? ['right'] : q.px > e.x + 2 ? ['left'] : [] };
    }, 4);
    s = b.snap() as Snap;
    expect(s.deaths).toBe(0);
    expect(s.stomps).toBe(1);
    expect(s.enemies[0].alive).toBe(false);
    expect(s.score).toBe(200);
  });

  it('documents add 100 points and the exit adds a time bonus', () => {
    const lv: LevelDef = { name: 'Lobi', theme: 'lobby', par: 30, rows: ['#.........', '#.S.DD...E', '##########'] };
    const r = run({ meta: lompat.meta, create: (ctx) => makeGame(ctx, { levels: [lv] }) });
    const res = r.play(() => ({ held: ['right'] }), 10);
    expect(res?.won).toBe(true);
    const s = r.snap() as Snap;
    expect(s.docs).toBe(2);
    expect(res!.score).toBeGreaterThan(200);
    expect(res!.score).toBeLessThanOrEqual(200 + 300);
  });

  it('holding A jumps higher than tapping it', () => {
    const lv: LevelDef = { name: 'Lobi', theme: 'lobby', par: 30, rows: ['#.........', '#.........', '#.........', '#.........', '#.........', '#.S......E', '##########'] };
    const peak = (hold: boolean) => {
      const r = run({ meta: lompat.meta, create: (ctx) => makeGame(ctx, { levels: [lv] }) });
      r.step(2);
      r.step(1, hold ? ['a'] : [], ['a']);
      let min = Infinity;
      for (let i = 0; i < 60; i++) { r.step(1, hold ? ['a'] : []); min = Math.min(min, (r.snap() as Snap).py); }
      return 6 * TILE - min;
    };
    expect(peak(true)).toBeGreaterThan(peak(false) * 1.5);
  });

  it('coyote time and jump buffer forgive slightly late and early presses', () => {
    const ledge: LevelDef = { name: 'Lobi', theme: 'lobby', par: 30, rows: ['#..........', '#..........', '#..........', '#.S........', '####.......', '#.........E', '###########'] };
    const r = run({ meta: lompat.meta, create: (ctx) => makeGame(ctx, { levels: [ledge] }) });
    let left = -1;
    for (let i = 0; i < 200; i++) {
      r.step(1, ['right']);
      const s = r.snap() as Snap;
      if (!s.onGround && s.vy >= 0) { left = i; break; }
    }
    expect(left).toBeGreaterThan(0);
    r.step(2, ['right']);
    r.step(1, ['right', 'a'], ['a']);
    expect((r.snap() as Snap).vy).toBeLessThan(-300);
    expect(r.sfx).toContain('jump');

    // buffer: press A a few frames before landing, without pressing again
    const flat: LevelDef = { name: 'Lobi', theme: 'lobby', par: 30, rows: ['#.........', '#.........', '#.........', '#.........', '#.S......E', '##########'] };
    const b = run({ meta: lompat.meta, create: (ctx) => makeGame(ctx, { levels: [flat] }) });
    b.step(2);
    b.step(1, [], ['a']);
    for (let i = 0; i < 120; i++) { b.step(1); const q = b.snap() as Snap; if (q.vy > 0 && q.py > 5 * TILE - 10) break; }
    expect((b.snap() as Snap).onGround).toBe(false);
    b.step(1, [], ['a']);
    let rejumped = false;
    for (let i = 0; i < 6; i++) { b.step(1); if ((b.snap() as Snap).vy < -300) rejumped = true; }
    expect(rejumped).toBe(true);
  });

  it('same seed, same run', () => {
    const go = (seed: number) => {
      const r = run(lompat, seed);
      const rnd = mulberry(seed);
      const p = bot(LEVELS);
      const res = r.play((f, s) => (rnd() < 0.05 ? {} : p(f, s)), 600);
      return JSON.stringify([res, r.snap()]);
    };
    expect(go(11)).toBe(go(11));
  });
});

import { describe, expect, it } from 'vitest';
import { run } from './mg-harness';
import biliar, { POCKETS, R, TABLE, HEAD, collide, physicsStep, moving, resolveShot, angDiff, type Ball, type PhysEvent, type Rules } from '../../src/minigames/games/biliar';
import type { Btn } from '../../src/minigames/types';

type Snap = { phase: string; turn: number; shots: number; aim: number; power: number; charging: boolean; hint: { angle: number; power: number }; score: number; fouls: number; mine: number; theirs: number; foe: string; cue: { x: number; y: number }; down: number[] };

const ball = (n: number, x: number, y: number, vx = 0, vy = 0): Ball => ({ n, x, y, vx, vy, down: false });

/** Auto-aim player: turn to the suggested angle, hold A until the suggested power, release. */
function autoAim(errSeed = 0) {
  let k = errSeed;
  return (_f: number, s: Record<string, unknown>): { held?: Btn[]; press?: Btn[]; axis?: { x: number; y: number } } => {
    const p = s as unknown as Snap;
    if (p.phase !== 'aim' || p.turn !== 0) return {};
    k = (k * 1103515245 + 12345) % 2147483648;
    const d = angDiff(p.hint.angle, p.aim);
    if (!p.charging) {
      if (Math.abs(d) > 1e-4) return { axis: { x: Math.max(-1, Math.min(1, d / (1.4 / 60))), y: 0 } };
      return { press: ['a'], axis: { x: 0, y: 0 } };
    }
    if (p.power + 1 / 78 < p.hint.power) return { held: ['a'], axis: { x: 0, y: 0 } };
    return { axis: { x: 0, y: 0 } };
  };
}

describe('mini game: biliar physics', () => {
  it('a straight head-on hit between equal balls swaps velocities (almost)', () => {
    const a = ball(0, 200, 200, 400, 0);
    const b = ball(1, 200 + 2 * R - 0.5, 200);
    collide(a, b);
    expect(Math.abs(a.vx)).toBeLessThan(20);
    expect(b.vx).toBeGreaterThan(380);
    expect(a.vx + b.vx).toBeCloseTo(400, 6);
  });

  it('balls do not tunnel: a fast cue ball still stops at the object ball', () => {
    const balls = [ball(0, 150, 209, 1150, 0), ball(1, 220, 209)];
    const ev: PhysEvent[] = [];
    for (let i = 0; i < 6; i++) physicsStep(balls, 1 / 60, ev);
    expect(ev.some((e) => e.kind === 'hit')).toBe(true);
    expect(balls[0].x).toBeLessThan(balls[1].x);
  });

  it('friction brings every ball to rest and cushions keep balls on the table', () => {
    const balls = [ball(0, 300, 200, 900, 640), ball(3, 400, 150, -500, 300), ball(9, 250, 260, 0, -700)];
    let f = 0;
    while (moving(balls) && f < 60 * 30) { physicsStep(balls, 1 / 60); f++; }
    expect(moving(balls)).toBe(false);
    expect(f).toBeLessThan(60 * 15);
    for (const b of balls) if (!b.down) {
      expect(b.x).toBeGreaterThanOrEqual(TABLE.x0 + R - 1e-6);
      expect(b.x).toBeLessThanOrEqual(TABLE.x1 - R + 1e-6);
      expect(b.y).toBeGreaterThanOrEqual(TABLE.y0 + R - 1e-6);
      expect(b.y).toBeLessThanOrEqual(TABLE.y1 - R + 1e-6);
    }
  });

  it('a ball rolled into a corner pocket is counted', () => {
    const p = POCKETS[0];
    const b = ball(5, p.x + 80, p.y + 80, -300, -300);
    const ev: PhysEvent[] = [];
    for (let i = 0; i < 120 && moving([b]); i++) physicsStep([b], 1 / 60, ev);
    expect(b.down).toBe(true);
    expect(ev).toContainEqual({ kind: 'pocket', n: 5 });
  });
});

describe('mini game: biliar rules', () => {
  const table = (down: number[]) => Array.from({ length: 16 }, (_, n) => ({ ...ball(n, 0, 0), down: down.includes(n) }));

  it('first ball pocketed assigns the groups and keeps the turn', () => {
    const r: Rules = { turn: 0, groups: [null, null], winner: null };
    const out = resolveShot(r, [11, 2], table([11, 2]));
    expect(r.groups).toEqual(['stripe', 'solid']);
    expect(out.keep).toBe(true);
    expect(r.turn).toBe(0);
  });

  it('cue ball in the pocket is a foul and passes the turn', () => {
    const r: Rules = { turn: 0, groups: ['solid', 'stripe'], winner: null };
    const out = resolveShot(r, [3, 0], table([3, 0]));
    expect(out.foul).toBe(true);
    expect(r.turn).toBe(1);
  });

  it('the 8 early loses, the 8 last wins', () => {
    const early: Rules = { turn: 0, groups: ['solid', 'stripe'], winner: null };
    resolveShot(early, [8], table([1, 8]));
    expect(early.winner).toBe(1);
    const late: Rules = { turn: 1, groups: ['solid', 'stripe'], winner: null };
    resolveShot(late, [8], table([9, 10, 11, 12, 13, 14, 15, 8]));
    expect(late.winner).toBe(1);
  });

  it('in the game, scratching the cue moves the turn to the CPU and respots the cue', () => {
    const r = run(biliar, 7);
    const target = Math.atan2(TABLE.y0 - HEAD.y, TABLE.x0 - HEAD.x);
    r.play((_f, s) => {
      const p = s as unknown as Snap;
      const d = angDiff(target, p.aim);
      if (Math.abs(d) > 1e-4) return { axis: { x: Math.max(-1, Math.min(1, d / (1.4 / 60))), y: 0 } };
      if (!p.charging) return { press: ['a'], axis: { x: 0, y: 0 } };
      return p.power < 0.45 ? { held: ['a'], axis: { x: 0, y: 0 } } : { axis: { x: 0, y: 0 } };
    }, 3);
    while ((r.snap() as unknown as Snap).phase === 'roll') r.step(1);
    const s = r.snap() as unknown as Snap;
    expect(s.shots).toBe(1);
    expect(s.fouls).toBe(1);
    expect(s.turn).toBe(1);
    expect(s.down).not.toContain(0);
    expect(Math.hypot(s.cue.x - HEAD.x, s.cue.y - HEAD.y)).toBeLessThan(60);
    expect(r.sfx).toContain('wrong');
  });

  it('tap A, then tap A again also shoots (touch-friendly)', () => {
    const r = run(biliar, 3);
    r.step(1, [], ['a']);
    r.step(2);
    expect((r.snap() as { latched: boolean }).latched).toBe(true);
    r.step(30);
    r.step(1, [], ['a']);
    expect((r.snap() as unknown as Snap).phase).toBe('roll');
  });
});

describe('mini game: biliar full match', () => {
  it('auto-aim player vs CPU finishes within the limits with a sane score', () => {
    for (const seed of [1, 2, 3, 11, 20261013]) {
      const r = run(biliar, seed);
      const res = r.play(autoAim(seed), 60 * 15);
      expect(res, `seed ${seed}`).not.toBeNull();
      const s = r.snap() as unknown as Snap;
      expect(s.shots).toBeLessThanOrEqual(40);
      expect(res!.score).toBe(s.mine * 100 + (res!.won ? 1000 : 0));
      expect(r.sfx).toContain('pocket');
      expect(s.foe).not.toBe('Budi');
    }
  });

  it('a player who never shoots still gets an ending at the time limit', () => {
    const r = run(biliar, 5);
    const res = r.play(() => ({}), 60 * 11);
    expect(res).not.toBeNull();
    expect((r.snap() as { time: number }).time).toBeGreaterThanOrEqual(600);
  });

  it('same seed gives the same match', () => {
    const a = run(biliar, 42), b = run(biliar, 42);
    const ra = a.play(autoAim(1), 60 * 15), rb = b.play(autoAim(1), 60 * 15);
    expect(ra).toEqual(rb);
    expect(a.snap()).toEqual(b.snap());
  });
});

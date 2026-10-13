import { describe, expect, it } from 'vitest';
import { run } from './mg-harness';
import balap, { TRACKS, LAPS, DRIFT_TIERS } from '../../src/minigames/games/balap-drone';
import type { Btn } from '../../src/minigames/types';

type P = { x: number; y: number; ang: number; v: number; lap: number; next: number; done: boolean; place: number; onRoad: boolean; turbos: number; turbo: number; pos: number; steer: number; slip: number; drift: number; driftCharge: number };
type S = { phase: string; sel: number; track: string; raceT: number; player: P | null; cruise: boolean; wallHits: number; bounds: { x0: number; y0: number; x1: number; y1: number }; cpus: { lap: number; done: boolean; finishT: number; place: number }[] };

const wrap = (a: number) => { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; };
/** Steer toward a world point, full gas unless the turn is sharp. */
function aim(p: P, tx: number, ty: number, extra: Btn[] = []) {
  const d = wrap(Math.atan2(ty - p.y, tx - p.x) - p.ang);
  const held: Btn[] = [...extra];
  if (Math.abs(d) < 1.2 || p.v < 120) held.push('a');
  else held.push('b');
  return { held, axis: { x: Math.max(-1, Math.min(1, d * 3)), y: 0 } };
}

function startRace(trackIndex: number, seed = 7) {
  const r = run(balap, seed);
  for (let i = 0; i < trackIndex; i++) { r.step(1, [], ['right']); r.step(1); }
  r.step(1, [], ['a']);
  return r;
}

/** Autopilot: drive at the next checkpoint gate. Uses turbo on straights. */
function autopilot(trackIndex: number) {
  return (_f: number, s: Record<string, unknown>) => {
    const st = s as S;
    const p = st.player;
    if (!p || st.phase !== 'race') return {};
    const [tx, ty] = TRACKS[trackIndex].pts[p.next];
    const d = Math.abs(wrap(Math.atan2(ty - p.y, tx - p.x) - p.ang));
    const turbo = d < 0.1 && p.turbo === 0 && st.raceT > 10 && Math.floor(st.raceT) % 20 === 0;
    return { ...aim(p, tx, ty), press: turbo ? (['x'] as Btn[]) : [] };
  };
}

describe('mini game: balap-drone', () => {
  it('has at least 2 data-driven tracks, selectable with left/right before the countdown', () => {
    expect(TRACKS.length).toBeGreaterThanOrEqual(2);
    const r = run(balap, 1);
    expect((r.snap() as S).phase).toBe('select');
    r.step(1, [], ['right']);
    expect((r.snap() as S).sel).toBe(1);
    r.step(1, [], ['left']); r.step(1, [], ['left']);
    expect((r.snap() as S).sel).toBe(TRACKS.length - 1);
    r.step(1, [], ['a']);
    const s = r.snap() as S;
    expect(s.phase).toBe('count');
    expect(s.track).toBe(TRACKS[TRACKS.length - 1].name);
    // 3-2-1: nothing moves during the countdown, even with gas held
    r.step(60 * 2.9, ['a']);
    expect((r.snap() as S).player!.v).toBe(0);
    r.step(20, ['a']);
    expect((r.snap() as S).phase).toBe('race');
  });

  it('CPU drivers finish 3 laps on their own while the player sits still; idle player loses at 240 s', () => {
    const r = startRace(0);
    const res = r.play(() => ({}), 260);
    const s = r.snap() as S;
    expect(s.cpus.every((c) => c.done && c.place >= 1 && c.place <= 3)).toBe(true);
    expect(s.cpus.map((c) => c.place).sort()).toEqual([1, 2, 3]);
    expect(Math.max(...s.cpus.map((c) => c.finishT))).toBeLessThan(200);
    expect(res).not.toBeNull();
    expect(res!.won).toBe(false);
    expect(res!.score).toBe(0);
  });

  it.each(TRACKS.map((_, i) => i))('player on an autopilot to the next checkpoint finishes track %i', (ti) => {
    const r = startRace(ti);
    const res = r.play(autopilot(ti), 250);
    const s = r.snap() as S;
    expect(res).not.toBeNull();
    expect(s.player!.done).toBe(true);
    expect(s.player!.lap).toBe(LAPS);
    expect(res!.score).toBeGreaterThan(30);
    expect(res!.score).toBeLessThan(240);
    expect(res!.won).toBe(s.player!.place === 1);
    expect(res!.summary).toContain(`posisi ${s.player!.place}`);
    expect(s.player!.turbos).toBeLessThan(3);
    expect(r.sfx).toContain('turbo');
  });

  it('cutting across the grass to the finish line does not count a lap', () => {
    const r = startRace(0);
    const pts = TRACKS[0].pts;
    let sawGrass = false;
    let nearFinish = 0;
    for (let f = 0; f < 60 * 70 && !r.result; f++) {
      const s = r.snap() as S;
      const p = s.player!;
      if (s.phase !== 'race') { r.step(1); continue; }
      // take gates 1..4, then head straight for the start line across the infield
      const target = p.next >= 1 && p.next <= 4 ? pts[p.next] : pts[0];
      if (!p.onRoad) sawGrass = true;
      if (Math.hypot(p.x - pts[0][0], p.y - pts[0][1]) < 60) nearFinish++;
      const a = aim(p, target[0], target[1]);
      r.step(1, a.held, [], a.axis);
    }
    const p = (r.snap() as S).player!;
    expect(sawGrass).toBe(true);
    expect(nearFinish).toBeGreaterThan(10);
    expect(p.lap).toBe(0);
    expect(p.next).toBe(5);
  });

  it('grass slows the car below road speed', () => {
    const r = startRace(0);
    // drive straight off the road (turn hard right from the start heading)
    r.play((f, s) => ((s as S).phase === 'race' ? { held: ['a'], axis: { x: f % 240 < 30 ? 1 : 0, y: 0 } } : {}), 9);
    const p = (r.snap() as S).player!;
    expect(p.onRoad).toBe(false);
    expect(p.v).toBeLessThanOrEqual(116);
  });

  it('turbo works at most 3 times', () => {
    const r = startRace(0);
    r.step(60 * 3.2);
    for (let i = 0; i < 6; i++) { r.step(1, ['a'], ['x']); r.step(110, ['a']); }
    expect((r.snap() as S).player!.turbos).toBe(0);
    expect(r.sfx.filter((n) => n === 'turbo').length).toBe(3);
  });

  it('digital steering eases in and recentres, analog input steers proportionally', () => {
    const r = startRace(0);
    r.step(60 * 3.2, ['a']);
    r.step(1, ['a', 'right']);
    const s1 = (r.snap() as S).player!.steer;
    expect(s1).toBeGreaterThan(0);
    expect(s1).toBeLessThan(0.5);
    r.step(10, ['a', 'right']);
    expect((r.snap() as S).player!.steer).toBe(1);
    r.step(6, ['a']);
    expect((r.snap() as S).player!.steer).toBe(0);
    r.step(20, ['a'], [], { x: 0.4, y: 0 });
    expect((r.snap() as S).player!.steer).toBeCloseTo(0.4, 5);
  });

  it('holding B in a hard turn drifts and releasing it gives a boost straight away', () => {
    const r = startRace(0);
    r.step(60 * 3.2);
    r.step(80, ['a']);
    const v0 = (r.snap() as S).player!.v;
    expect(v0).toBeGreaterThan(150);
    let drifted = false;
    // flick left to start the slide, then counter-steer to hold a gentle line on the road
    for (let i = 0; i < Math.ceil(DRIFT_TIERS[0] * 60) + 16; i++) {
      r.step(1, ['a', 'b', i < 6 ? 'left' : 'right']);
      if ((r.snap() as S).player!.drift !== 0) drifted = true;
    }
    const mid = (r.snap() as S).player!;
    expect(drifted).toBe(true);
    expect(Math.abs(mid.slip)).toBeGreaterThan(5);
    expect(mid.driftCharge).toBeGreaterThanOrEqual(DRIFT_TIERS[0]);
    r.step(1, ['a']);
    const after = (r.snap() as S).player!;
    expect(after.drift).toBe(0);
    expect(after.turbo).toBeGreaterThan(0);
    expect(after.v).toBeGreaterThan(mid.v);
    expect(after.turbos).toBe(3);
  });

  it('driving into the outer fence slides along it instead of sticking', () => {
    const r = startRace(0);
    r.step(60 * 3.2);
    // aim up and a little right, into the top fence
    let hit = false;
    for (let i = 0; i < 60 * 25 && !hit; i++) {
      const p = (r.snap() as S).player!;
      const d = wrap(-Math.PI / 2 + 0.5 - p.ang);
      r.step(1, ['a'], [], { x: Math.max(-1, Math.min(1, d * 3)), y: 0 });
      hit = (r.snap() as S).wallHits > 0;
    }
    expect(hit).toBe(true);
    const a = (r.snap() as S).player!;
    r.step(30, ['a'], [], { x: 0, y: 0 });
    const b = (r.snap() as S).player!;
    expect(Math.hypot(b.x - a.x, b.y - a.y)).toBeGreaterThan(20);
    const { bounds } = r.snap() as S;
    expect(b.y).toBeGreaterThanOrEqual(bounds.y0);
  });

  it('Y toggles auto throttle so the car drives without holding A', () => {
    const r = startRace(0);
    r.step(1, [], ['y']);
    expect((r.snap() as S).cruise).toBe(true);
    r.step(60 * 4);
    expect((r.snap() as S).player!.v).toBeGreaterThan(100);
  });

  it('same seed gives the same race', () => {
    const play = () => { const r = startRace(1, 99); const res = r.play(autopilot(1), 250); return { res, s: r.snap() }; };
    const a = play(), b = play();
    expect(a.res).toEqual(b.res);
    expect(a.s).toEqual(b.s);
  });
});

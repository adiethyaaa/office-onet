import { beforeAll, describe, expect, it } from 'vitest';
import world from '@design/world.json';
import walls from '@design/derived/walls.json';
import { NavGrid } from '../../src/world/navgrid';
import { IdleSim } from '../../src/sim/idle';
import { AGENT_GAP } from '../../src/sim/agents';
import { PUSH_THROUGH_S, Player } from '../../src/game/player';
import type { DerivedWalls, FloorId, Vec2, World } from '../../src/world/types';

const W = world as unknown as World;
const WALLS = walls as unknown as DerivedWalls;
let nav: Record<FloorId, NavGrid>;
beforeAll(() => { nav = { L1: new NavGrid(W, WALLS, 'L1'), L2: new NavGrid(W, WALLS, 'L2') }; });
const d = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);

describe('CEO / persona collision', () => {
  it('cancelling a giving-way route clears the old goal, hold, blocker and floor link', () => {
    const sim = new IdleSim(W, nav, { seed: 11, startHour: 9 });
    const npc = sim.npcs[1];
    npc.phase = 'travel';
    npc.resumeTo = [2.15, 12.55];
    npc.holdUntil = 999;
    npc.yieldTo = sim.npcs[0].id;
    npc.yieldSince = 12;
    npc.via = { link: 'old-link', to: 'L2', arrive: [17, 9] };
    sim['fail'](npc, 'stuck');
    expect(npc.resumeTo).toBeNull();
    expect(npc.holdUntil).toBe(0);
    expect(npc.yieldTo).toBeNull();
    expect(npc.yieldSince).toBe(0);
    expect(npc.via).toBeNull();
  });
  it('a walking NPC never closes in on the CEO standing in the corridor, and is not stuck for good (30 min)', () => {
    const sim = new IdleSim(W, nav, { seed: 11, startHour: 9 });
    const player: Vec2 = [17, 9.25]; // L1 corridor in front of the core: busiest crossing
    sim.setPlayer('L1', player);
    let violations = 0;
    const prev = new Map<string, number>();
    const lastMove = new Map<string, number>();
    const lastPos = new Map<string, Vec2>();
    let longestStill = 0;
    for (let t = 0; t < 1800; t += 0.1) {
      sim.step(0.1);
      for (const n of sim.npcs) {
        const was = prev.get(n.id);
        const now = n.floor === 'L1' ? d(n.pos, player) : Infinity;
        // A step that ends inside the gap and closer than before is a collision.
        if (was !== undefined && now < AGENT_GAP - 1e-6 && now < was - 1e-6) violations++;
        prev.set(n.id, now);
        const moving = n.phase === 'travel' || n.phase === 'recover';
        const lp = lastPos.get(n.id);
        if (!moving || !lp || d(n.pos, lp) > 1e-4) lastMove.set(n.id, sim.time);
        lastPos.set(n.id, [n.pos[0], n.pos[1]]);
        longestStill = Math.max(longestStill, sim.time - lastMove.get(n.id)!);
      }
    }
    expect(violations).toBe(0);
    expect(sim.yields).toBeGreaterThan(0);
    expect(longestStill).toBeLessThan(10);
    for (const n of sim.npcs) expect(Object.values(n.stats.activities).reduce((a, b) => a + b, 0), n.id).toBeGreaterThan(2);
  });

  it('no NPC freezes on a corner-clipping step (seeds 2, 3, 11, 23; 30 min each)', () => {
    // Seed 11 froze Kevin for good before lineWalkable became an exact traversal.
    // With eight personas seed 11 trapped Bruno behind a treadmill user and
    // seed 2 livelocked Max and Echo giving way through each other (149 s).
    for (const seed of [2, 3, 11, 23]) {
      const sim = new IdleSim(W, nav, { seed, startHour: 9 });
      const since = new Map<string, number>();
      const last = new Map<string, Vec2>();
      let worst = 0;
      for (let t = 0; t < 1800; t += 0.1) {
        sim.step(0.1);
        for (const n of sim.npcs) {
          const lp = last.get(n.id);
          const moving = n.phase === 'travel' || n.phase === 'recover';
          if (!moving || !lp || d(n.pos, lp) > 1e-4) since.set(n.id, sim.time);
          last.set(n.id, [n.pos[0], n.pos[1]]);
          worst = Math.max(worst, sim.time - since.get(n.id)!);
        }
      }
      expect(worst, `seed ${seed}`).toBeLessThan(10);
    }
  });

  it('no walking step ever closes in on another agent (zero overlap steps; seeds 42 for 2 h, 11 and 3 for 30 min, CEO standing in the busiest corridor)', () => {
    // R2: the earlier test only capped deep overlaps at 0.2 percent of pair
    // steps. Now any step by a walking NPC that ends inside the gap of another
    // agent and closer than before is a failure, including the CEO.
    const runs: [number, number][] = [[42, 7200], [11, 1800], [3, 1800]];
    const violations: string[] = [];
    for (const [seed, seconds] of runs) {
      const sim = new IdleSim(W, nav, { seed, startHour: 8.5, minutesPerSecond: 2 });
      const player: Vec2 = [17, 9.25];
      sim.setPlayer('L1', player);
      const prev = new Map<string, number>();
      for (let t = 0; t < seconds; t += 0.1) {
        sim.step(0.1);
        const agents = [...sim.npcs.map((n) => ({ id: n.id, floor: n.floor, pos: n.pos, walking: n.phase === 'travel' || n.phase === 'recover' })), { id: 'player', floor: 'L1' as FloorId, pos: player, walking: false }];
        for (let i = 0; i < agents.length; i++) for (let j = i + 1; j < agents.length; j++) {
          const a = agents[i];
          const b = agents[j];
          const key = `${a.id}|${b.id}`;
          if (a.floor !== b.floor) { prev.delete(key); continue; }
          const dist = d(a.pos, b.pos);
          const before = prev.get(key);
          prev.set(key, dist);
          if ((a.walking || b.walking) && before !== undefined && dist < AGENT_GAP - 1e-6 && dist < before - 1e-6) {
            if (violations.length < 10) violations.push(`seed ${seed} t=${sim.time.toFixed(1)} ${key} ${before.toFixed(3)}->${dist.toFixed(3)}`);
            else violations.push('');
          }
        }
      }
      for (const n of sim.npcs) expect(Object.keys(n.stats.activities).length, `${seed} ${n.id} variety`).toBeGreaterThanOrEqual(2);
    }
    expect(violations.length, violations.slice(0, 10).join('\n')).toBe(0);
  });

  it('the CEO stops at a persona and slides around instead of passing through', () => {
    const p = new Player([10, 9.25], 'L1', 0);
    const npc: Vec2 = [11.2, 9.25];
    let minD = Infinity;
    for (let k = 0; k < 120; k++) {
      p.step(1 / 30, [1, 0.15], false, nav.L1, [npc]);
      minD = Math.min(minD, d(p.pos, npc));
    }
    expect(minD).toBeGreaterThanOrEqual(AGENT_GAP - 0.02);
    expect(p.pos[0]).toBeGreaterThan(npc[0]); // got past by sliding
  });

  it('pushing straight into a persona for 2 s walks through it, then collision is back', () => {
    const p = new Player([10, 9.25], 'L1', 0);
    const npc: Vec2 = [11.2, 9.25];
    let t = 0;
    let through = -1;
    for (let k = 0; k < 240; k++) {
      p.step(1 / 30, [1, 0], false, nav.L1, [npc]);
      t += 1 / 30;
      if (through < 0 && p.ghost) through = t;
    }
    // Blocked first (head-on, no tangent to slide on), through after about 2 s of pushing.
    expect(through).toBeGreaterThan(PUSH_THROUGH_S);
    expect(through).toBeLessThan(PUSH_THROUGH_S + 0.8);
    expect(p.ghostBy).toBe('push');
    expect(p.pos[0]).toBeGreaterThan(npc[0] + AGENT_GAP);
    expect(p.ghost).toBe(false);
    // Walking back into the same persona is blocked again.
    const back = p.pos[0];
    for (let k = 0; k < 30; k++) p.step(1 / 30, [-1, 0], false, nav.L1, [npc]);
    expect(p.pos[0]).toBeGreaterThanOrEqual(npc[0] + AGENT_GAP - 0.02);
    expect(p.pos[0]).toBeLessThan(back);
  });

  it('running walks straight through a persona without waiting', () => {
    const p = new Player([10, 9.25], 'L1', 0);
    const npc: Vec2 = [11.2, 9.25];
    for (let k = 0; k < 45; k++) p.step(1 / 30, [1, 0], true, nav.L1, [npc]);
    expect(p.ghostBy).toBe('run');
    expect(p.pos[0]).toBeGreaterThan(npc[0] + AGENT_GAP);
  });

  it('a short bump does not pass through: the push timer drains when the CEO backs off', () => {
    const p = new Player([10, 9.25], 'L1', 0);
    const npc: Vec2 = [11.2, 9.25];
    for (let k = 0; k < 45; k++) p.step(1 / 30, [1, 0], false, nav.L1, [npc]); // 1.5 s push
    for (let k = 0; k < 30; k++) p.step(1 / 30, [-1, 0], false, nav.L1, [npc]);
    for (let k = 0; k < 30; k++) p.step(1 / 30, [1, 0], false, nav.L1, [npc]); // 1 s push
    expect(p.ghost).toBe(false);
    expect(p.pos[0]).toBeLessThan(npc[0]);
  });

  it('ghosting never lets the CEO through walls', () => {
    const p = new Player([10, 9.25], 'L1', 0);
    p.ghost = true;
    const start: Vec2 = [p.pos[0], p.pos[1]];
    for (let k = 0; k < 600; k++) p.step(1 / 30, [0, 1], true, nav.L1, []);
    expect(nav.L1.walkableAt(p.pos)).toBe(true);
    expect(d(start, p.pos)).toBeGreaterThan(0);
  });
});

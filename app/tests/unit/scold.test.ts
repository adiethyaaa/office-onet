import { beforeAll, describe, expect, it } from 'vitest';
import world from '@design/world.json';
import walls from '@design/derived/walls.json';
import { NavGrid } from '../../src/world/navgrid';
import { IdleSim, SCOLD_COOLDOWN_SECONDS, SCOLD_RUSH_SECONDS } from '../../src/sim/idle';
import type { DerivedWalls, FloorId, World } from '../../src/world/types';

const W = world as unknown as World;
let nav: Record<FloorId, NavGrid>;
beforeAll(() => { nav = { L1: new NavGrid(W, walls as unknown as DerivedWalls, 'L1'), L2: new NavGrid(W, walls as unknown as DerivedWalls, 'L2') }; });

function sim(seed = 11) {
  // 12:00 is lunch break: personas are off their desks, so a reprimand has somewhere to send them.
  const s = new IdleSim(W, nav, { seed, startHour: 12.1, minutesPerSecond: 0.2 });
  for (let i = 0; i < 300; i++) s.step(0.1);
  return s;
}

describe('reprimand (REQ-TEGUR)', () => {
  it('sends the persona to its own desk at double speed and keeps it there for 20 s', () => {
    const s = sim();
    const npc = s.npcs.find((n) => n.id === 'ACT-ER')!;
    expect(s.scold(npc.id)).toBe('ok');
    const desk = W.activitySlots.find((x) => x.activity === 'desk' && x.fixture === W.actors.find((a) => a.id === npc.id)!.homeSeat)!;
    expect(npc.slot).toBe(desk.id);
    expect(['travel', 'perform']).toContain(npc.phase);
    const start = s.time;
    let reached = false;
    for (let i = 0; i < 600 && s.time - start < SCOLD_RUSH_SECONDS - 0.5; i++) {
      s.step(0.1);
      if (npc.phase === 'perform' && npc.slot === desk.id) reached = true;
      if (reached) expect(npc.activity).toBe('desk');
    }
    expect(reached).toBe(true);
  });

  it('cooldown: a second reprimand within 10 s is refused, later it works', () => {
    const s = sim();
    expect(s.scold('ACT-MJ')).toBe('ok');
    expect(s.scold('ACT-MJ')).toBe('cooldown');
    for (let t = 0; t < SCOLD_COOLDOWN_SECONDS + 0.2; t += 0.1) s.step(0.1);
    expect(s.scold('ACT-MJ')).toBe('ok');
  });

  it('a persona whose agent is really working cannot be reprimanded, and its state is untouched', () => {
    const s = sim();
    const npc = s.npcs.find((n) => n.id === 'ACT-CM')!;
    npc.workStatus = 'working';
    const before = JSON.stringify({ phase: npc.phase, slot: npc.slot, activity: npc.activity });
    expect(s.scold(npc.id)).toBe('working');
    expect(JSON.stringify({ phase: npc.phase, slot: npc.slot, activity: npc.activity })).toBe(before);
    expect(s.scold('ACT-NOBODY')).toBe('missing');
  });

  it('is deterministic for a seed', () => {
    const a = sim(5); const b = sim(5);
    a.scold('ACT-RP'); b.scold('ACT-RP');
    for (let i = 0; i < 200; i++) { a.step(0.1); b.step(0.1); }
    expect(a.npcs.map((n) => [n.id, n.pos])).toEqual(b.npcs.map((n) => [n.id, n.pos]));
  });
});

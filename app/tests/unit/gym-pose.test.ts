import { describe, expect, it } from 'vitest';
import worldJson from '@design/world.json';
import type { World } from '../../src/world/types';
import { GYM_MOUNTS, fixturePoint, gymMount } from '../../src/game/gym-pose';

const world = worldJson as unknown as World;

// Budi 2026-10-14: personas on the treadmill stood between the machines and the
// bike rider was not on the bike. The body now goes on the machine itself.
describe('gym machines: personas use them, not stand beside them', () => {
  it('fixture-local points follow the fixture rotation', () => {
    expect(fixturePoint({ pos: [10, 20], rot: 0 }, [0, -0.25])).toEqual([10, 19.75]);
    const p = fixturePoint({ pos: [10, 20], rot: 180 }, [0, -0.25]);
    expect(p[0]).toBeCloseTo(10, 9);
    expect(p[1]).toBeCloseTo(20.25, 9);
  });

  it('every treadmill and exercise bike puts its user inside its own footprint, on the belt or saddle', () => {
    const gym = world.fixtures.filter((f) => f.type in GYM_MOUNTS);
    expect(gym.map((f) => f.type).sort()).toEqual(['exercise_bike', 'treadmill', 'treadmill']);
    for (const fx of gym) {
      const m = gymMount(fx)!;
      const a = (-fx.rot * Math.PI) / 180;
      const dx = m.pos[0] - fx.pos[0], dy = m.pos[1] - fx.pos[1];
      const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
      expect(Math.abs(lx), fx.id).toBeLessThan(fx.size[0] / 2 - 0.15);
      expect(Math.abs(ly), fx.id).toBeLessThan(fx.size[1] / 2 - 0.1);
      // and the persona has a slot on it to get there
      expect(world.activitySlots.some((s) => s.fixture === fx.id && s.activity === 'exercise'), fx.id).toBe(true);
    }
    expect(gymMount(world.fixtures.find((f) => f.type === 'treadmill'))!.clip).toBe('run');
    expect(gymMount(world.fixtures.find((f) => f.type === 'exercise_bike'))!.clip).toBe('bike');
    expect(gymMount(world.fixtures.find((f) => f.type === 'desk'))).toBeNull();
  });
});

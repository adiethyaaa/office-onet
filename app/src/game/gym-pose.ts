// Where a persona stands or sits on gym machines while using them, and which
// clip plays. The activity slot's own point is the approach cell next to the
// machine (it must be walkable); the body goes on the machine itself.
import type { Fixture } from '../world/types';

export interface GymMount {
  /** Point on the machine in fixture-local metres (Blender x, y; +y = console side). */
  local: [number, number];
  /** Height of the standing/seat reference above the floor (m). */
  lift: number;
  /** Clip played while on the machine. */
  clip: string;
}

// Treadmill: belt top 0.168 m (blender/furniture g_treadmill), jog on the belt.
// Exercise bike: saddle top at the 0.45 m seat height the seated clips assume,
// at local y -0.25 (g_exercise_bike), so the "bike" clip pedals the cranks.
export const GYM_MOUNTS: Record<string, GymMount> = {
  treadmill: { local: [0, -0.15], lift: 0.168, clip: 'run' },
  exercise_bike: { local: [0, -0.25], lift: 0, clip: 'bike' },
};

/** World (x, y) of a fixture-local point; same rotation as fixtureMatrix in world/build.ts. */
export function fixturePoint(fx: Pick<Fixture, 'pos' | 'rot'>, local: [number, number]): [number, number] {
  const a = (fx.rot * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return [fx.pos[0] + local[0] * c - local[1] * s, fx.pos[1] + local[0] * s + local[1] * c];
}

/** Body point and clip for a persona using this fixture, or null when it is not a gym machine. */
export function gymMount(fx: Pick<Fixture, 'type' | 'pos' | 'rot'> | undefined): { pos: [number, number]; lift: number; clip: string } | null {
  const m = fx ? GYM_MOUNTS[fx.type] : undefined;
  if (!fx || !m) return null;
  return { pos: fixturePoint(fx, m.local), lift: m.lift, clip: m.clip };
}

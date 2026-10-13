import { describe, expect, it } from 'vitest';
import { PAD_PROFILES, PAD_PROFILE_IDS, isPadProfile, stickAxes } from '../../src/input/pad-profiles';
import { stick } from '../../src/input/gamepad';

describe('gamepad profiles', () => {
  it('has exactly the three profiles shown in Settings', () => {
    expect([...PAD_PROFILE_IDS]).toEqual(['standar', 'kidal', 'santai']);
    expect(isPadProfile('kidal')).toBe(true);
    expect(isPadProfile('turbo')).toBe(false);
  });
  it('standard walks with the left stick, left-handed with the right stick', () => {
    expect(stickAxes(PAD_PROFILES.standar)).toEqual({ move: [0, 1], look: [2, 3] });
    expect(stickAxes(PAD_PROFILES.kidal)).toEqual({ move: [2, 3], look: [0, 1] });
  });
  it('relaxed is slower, tolerates more drift and does not run at full tilt', () => {
    const s = PAD_PROFILES.santai;
    expect(s.lookYaw).toBeLessThan(PAD_PROFILES.standar.lookYaw);
    expect(s.autoRun).toBe(false);
    // A tilt of 0.28 moves the avatar on Standard but is drift on Relaxed.
    expect(stick(0.28, 0, PAD_PROFILES.standar.dead)[0]).toBeGreaterThan(0);
    expect(stick(0.28, 0, s.dead)).toEqual([0, 0]);
  });
});

import { describe, expect, it } from 'vitest';
import { stick } from '../../src/input/gamepad';

describe('gamepad stick dead zone', () => {
  it('ignores drift inside the dead zone', () => {
    expect(stick(0.1, -0.15)).toEqual([0, 0]);
  });
  it('starts near zero just past the zone and reaches full tilt', () => {
    const [x] = stick(0.25, 0);
    expect(x).toBeGreaterThan(0);
    expect(x).toBeLessThan(0.1);
    const [fx, fy] = stick(1, 0);
    expect(fx).toBeCloseTo(1, 5);
    expect(fy).toBe(0);
  });
  it('keeps the direction of a diagonal', () => {
    const [x, y] = stick(0.6, 0.6);
    expect(x).toBeCloseTo(y, 6);
    expect(Math.hypot(x, y)).toBeLessThanOrEqual(1);
  });
});

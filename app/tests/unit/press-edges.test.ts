import { describe, expect, it } from 'vitest';
import { PressEdges, isFreshKey, padButtons } from '../../src/input/press-edges';

// QA v2.1: one press must open exactly one layer (office -> Game Station -> game).
describe('PressEdges (held buttons do not fall through layers)', () => {
  it('a button held when the layer opens is not a press until released', () => {
    const e = new PressEdges([true, false]);
    expect(e.next([true, false])(0)).toBe(false);
    expect(e.next([true, false])(0)).toBe(false);
    expect(e.next([false, false])(0)).toBe(false);
    expect(e.next([true, false])(0)).toBe(true);
  });

  it('a fresh press fires once, on the poll it goes down', () => {
    const e = new PressEdges();
    expect(e.next([false, true])(1)).toBe(true);
    expect(e.next([false, true])(1)).toBe(false);
  });

  it('padButtons reads the first connected pad and treats analog > 0.5 as pressed', () => {
    const pad = { connected: true, buttons: [{ pressed: false, value: 0.8 }, { pressed: true, value: 1 }, { pressed: false, value: 0.2 }] } as unknown as Gamepad;
    expect(padButtons([null, pad])).toEqual([true, true, false]);
    expect(padButtons([null])).toEqual([]);
    expect(padButtons(undefined)).toEqual([]);
  });

  it('keyboard auto-repeat is not a fresh key', () => {
    expect(isFreshKey({ repeat: true })).toBe(false);
    expect(isFreshKey({ repeat: false })).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { mulberry, run, type Run } from './mg-harness';
import type { Btn, InputState } from '../../src/minigames/types';
import { BTNS } from '../../src/minigames/types';
import desainPoster, { BGS, BRIEFS, ICONS, INKS, LAYOUTS, STYLES, MIN_START_CONTRAST, contrast, grade, type Choice } from '../../src/minigames/games/desain-poster';

type Snap = { dragging: boolean; brief: number; briefIds: number[]; phase: string; row: number; choice: Choice; total: number; grades: number[]; ended: boolean };
const S = (r: Run) => r.snap() as unknown as Snap;
const bgi = (id: string) => BGS.findIndex((b) => b.id === id);
const inki = (id: string) => INKS.findIndex((b) => b.id === id);
const sti = (id: string) => STYLES.findIndex((b) => b.id === id);

/** The best poster for a brief by brute force over every option. */
function best(id: number): Choice {
  const b = BRIEFS[id];
  let top: Choice = { bg: 0, style: 0, icon: 0, layout: 0, ink: 0 };
  let topScore = -1;
  for (let bg = 0; bg < BGS.length; bg++) for (let style = 0; style < STYLES.length; style++) for (let ink = 0; ink < INKS.length; ink++) {
    const c = { bg, style, icon: ICONS.indexOf(b.icon), layout: 0, ink };
    const s = grade(b, c).total;
    if (s > topScore) { topScore = s; top = c; }
  }
  return top;
}

/** Drive the property rows with arrows until the poster equals `want`, then press A. */
function build(r: Run, want: Choice) {
  const keys: (keyof Choice)[] = ['bg', 'style', 'icon', 'layout', 'ink'];
  keys.forEach((k, row) => {
    for (let g = 0; g < 10 && S(r).row !== row; g++) r.step(1, [], ['down']);
    for (let g = 0; g < 20 && S(r).choice[k] !== want[k]; g++) r.step(1, [], ['right']);
  });
  r.step(1, [], ['a']);
}

describe('mini game: desain-poster', () => {
  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  it('low contrast scores low, an on-brief poster scores high', () => {
    const wifi = BRIEFS[0];
    const good = grade(wifi, { bg: bgi('Kuning'), style: sti('Besar miring santai'), icon: ICONS.indexOf('wifi'), layout: LAYOUTS.indexOf('atas'), ink: inki('Hitam') });
    expect(good.ratio).toBeGreaterThan(4.5);
    expect(good.total).toBe(100);
    const faint = grade(wifi, { bg: bgi('Kuning'), style: sti('Besar miring santai'), icon: ICONS.indexOf('wifi'), layout: LAYOUTS.indexOf('atas'), ink: inki('Putih') });
    expect(faint.ratio).toBeLessThan(3);
    expect(faint.contrast).toBeLessThan(20);
    expect(faint.total).toBeLessThan(good.total - 20);
    const offBrief = grade(BRIEFS[1], { bg: bgi('Oranye'), style: sti('Kecil'), icon: ICONS.indexOf('dumbbell'), layout: LAYOUTS.indexOf('bawah'), ink: inki('Abu-abu') });
    expect(offBrief.total).toBeLessThan(40);
    for (const b of BRIEFS) expect(grade(b, best(b.id)).total).toBeGreaterThanOrEqual(92);
  });

  it('three briefs per session; a careful designer wins', () => {
    const r = run(desainPoster, 6);
    for (let k = 0; k < 3; k++) {
      const s = S(r);
      expect(s.phase).toBe('edit');
      build(r, best(s.briefIds[k]));
      expect(S(r).phase).toBe('review');
      r.step(60 * 1);
      r.step(1, [], ['a']);
    }
    expect(r.result).not.toBeNull();
    expect(r.result!.won).toBe(true);
    expect(r.result!.score).toBe(S(r).grades.reduce((a, b) => a + b, 0));
    expect(S(r).grades.length).toBe(3);
  });

  it('an idle player still ends after three timed briefs', () => {
    const r = run(desainPoster, 3);
    r.step(60 * 3 * (45 + 7) + 30);
    expect(r.result).not.toBeNull();
    expect(S(r).grades.length).toBe(3);
  });

  it('same seed gives the same briefs and grades', () => {
    const a = run(desainPoster, 12), b = run(desainPoster, 12);
    a.step(60 * 200); b.step(60 * 200);
    expect(a.result).toEqual(b.result);
    expect(a.snap()).toEqual(b.snap());
    expect(new Set(S(a).briefIds).size).toBe(3);
  });

  it('tapping the right half of a row steps forward, the left half of the value steps back, the label only selects', () => {
    const r = run(desainPoster, 6);
    const PX = 300, RY = 132, RH = 40;
    const c0 = S(r).choice;
    r.step(1, [], [], undefined, { x: PX + 310, y: RY + 2 * RH + 15 });
    expect(S(r).row).toBe(2);
    expect(S(r).choice.icon).toBe((c0.icon + 1) % ICONS.length);
    r.step(1, [], [], undefined, { x: PX + 140, y: RY + 2 * RH + 15 });
    expect(S(r).choice.icon).toBe(c0.icon);
    r.step(1, [], [], undefined, { x: PX + 30, y: RY + 4 * RH + 15 });
    expect(S(r).row).toBe(4);
    expect(S(r).choice).toEqual(c0);
  });

  it('a double press on submit does not skip Kevin\'s review', () => {
    const r = run(desainPoster, 6);
    r.step(1, [], ['a']);
    expect(S(r).phase).toBe('review');
    r.step(3);
    r.step(1, [], ['a']);
    expect(S(r).phase).toBe('review');
    expect(S(r).brief).toBe(0);
    r.step(30);
    r.step(1, [], ['a']);
    expect(S(r).brief).toBe(1);
  });

  it('dragging the headline on the poster changes the layout', () => {
    const ctx = { ...run(desainPoster, 6).ctx, rand: mulberry(6) };
    const inst = desainPoster.create(ctx);
    const none = Object.fromEntries(BTNS.map((b) => [b, false])) as Record<Btn, boolean>;
    const feed = (tap: InputState['tap'], ptr: InputState['ptr']) => inst.update(1 / 60, { down: none, hit: none, ax: 0, ay: 0, tap, ptr });
    const snap = () => inst.snapshot!() as unknown as Snap;
    feed({ x: 140, y: 200 }, { x: 140, y: 200, down: true });
    expect(snap().dragging).toBe(true);
    feed(null, { x: 140, y: 90, down: true });
    expect(LAYOUTS[snap().choice.layout]).toBe('atas');
    feed(null, { x: 140, y: 300, down: true });
    expect(LAYOUTS[snap().choice.layout]).toBe('bawah');
    feed(null, { x: 140, y: 300, down: false });
    expect(snap().dragging).toBe(false);
    expect(LAYOUTS[snap().choice.layout]).toBe('bawah');
  });

  it('the starting poster is never blank (ink equal to paper)', () => {
    for (let seed = 1; seed <= 60; seed++) {
      const c = S(run(desainPoster, seed)).choice;
      expect(contrast(BGS[c.bg].hex, INKS[c.ink].hex)).toBeGreaterThanOrEqual(MIN_START_CONTRAST);
    }
  });
});

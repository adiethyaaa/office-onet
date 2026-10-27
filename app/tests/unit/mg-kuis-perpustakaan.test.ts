import { describe, expect, it } from 'vitest';
import { mulberry, run, type Run } from './mg-harness';
import type { Btn, InputState } from '../../src/minigames/types';
import { BTNS } from '../../src/minigames/types';
import kuis, { WORLD, buildBank } from '../../src/minigames/games/kuis-perpustakaan';

const t = (s: string, vars?: Record<string, string | number>) => (vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s);
type Snap = { picked: number | null; idx: number; sel: number; phase: string; correct: number; score: number; results: boolean[]; qs: { id: string; answer: number; opts: string[] }[] };
const S = (r: Run) => r.snap() as unknown as Snap;

describe('mini game: kuis-perpustakaan', () => {
  it('bank has 30+ questions, each with 4 unique options and exactly one answer', () => {
    for (const seed of [1, 2, 3, 99]) {
      const bank = buildBank(t, mulberry(seed));
      expect(bank.length).toBeGreaterThanOrEqual(30);
      expect(new Set(bank.map((q) => q.id)).size).toBe(bank.length);
      for (const q of bank) {
        expect(q.opts.length).toBe(4);
        expect(new Set(q.opts).size).toBe(4);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        expect(q.answer).toBeLessThan(4);
        expect(q.why.length).toBeGreaterThan(5);
      }
    }
  });

  it('office answers match world.json', () => {
    const bank = buildBank(t, mulberry(5));
    const ans = (id: string) => { const q = bank.find((k) => k.id === id)!; return q.opts[q.answer]; };
    const level = (re: RegExp) => WORLD.floors.find((f) => f.id === WORLD.rooms.find((r) => re.test(r.id))!.floor)!.level;
    expect(ans('office-floors')).toBe(`${WORLD.floors.length} lantai`);
    expect(ans('office-billiard')).toBe(`Lantai ${level(/BILLIARD/)}`);
    expect(ans('office-server')).toBe(`Lantai ${level(/SERVER/)}`);
    expect(ans('office-read')).toBe(`Lantai ${level(/-READ$/)}`);
    expect(ans('office-rooms-l1')).toBe(`${WORLD.rooms.filter((r) => r.floor === WORLD.floors[0].id).length} ruang`);
    const citra = WORLD.actors.find((a) => a.displayName === 'Citra')!;
    expect(ans('office-citra-home')).toBe(WORLD.rooms.find((r) => r.id === citra.homeRoom)!.name);
    const kaksuary = WORLD.actors.find((a) => a.displayName === 'Kak Suary')!;
    expect(ans('office-kaksuary-home')).toBe(WORLD.rooms.find((r) => r.id === kaksuary.homeRoom)!.name);
    const onL2 = bank.find((k) => k.id === 'office-on-l2')!;
    onL2.opts.forEach((o, i) => {
      const room = WORLD.rooms.find((r) => r.name === o)!;
      expect(room.floor === 'L2').toBe(i === onL2.answer);
    });
    expect(ans('ict-wifi6')).toBe('802.11ax');
    expect(ans('ict-poe')).toBe('Power over Ethernet');
  });

  it('a perfect player gets 5/5 with time bonus; the game ends after 5 questions', () => {
    const r = run(kuis, 4);
    for (let k = 0; k < 5; k++) {
      const s = S(r);
      expect(s.idx).toBe(k);
      const a = s.qs[k].answer;
      if (a & 1) r.step(1, [], ['right']);
      if (a & 2) r.step(1, [], ['down']);
      expect(S(r).sel).toBe(a);
      r.step(1, [], ['a']);
      expect(S(r).phase).toBe('reveal');
      r.step(30);
      r.step(1, [], ['a']);
    }
    expect(r.result).not.toBeNull();
    expect(S(r).correct).toBe(5);
    expect(r.result!.score).toBeGreaterThan(500);
    expect(r.result!.won).toBe(true);
  });

  it('wrong answers and timeouts score nothing; still ends', () => {
    const r = run(kuis, 8);
    const s = S(r);
    if (s.qs[0].answer === 0) r.step(1, [], ['right']);
    r.step(1, [], ['a']);
    expect(S(r).results).toEqual([false]);
    r.step(60 * 200);
    expect(r.result).not.toBeNull();
    expect(r.result!.score).toBe(0);
    expect(S(r).results.length).toBe(5);
  });

  it('same seed gives the same questions', () => {
    const a = run(kuis, 31), b = run(kuis, 31);
    expect(a.snap()).toEqual(b.snap());
    a.step(60 * 120); b.step(60 * 120);
    expect(a.result).toEqual(b.result);
    expect(S(run(kuis, 1)).qs).not.toEqual(S(run(kuis, 2)).qs);
    expect(new Set(S(a).qs.map((q) => q.id)).size).toBe(5);
  });

  it('tapping an answer box locks that answer; the same tap cannot skip the explanation', () => {
    const r = run(kuis, 4);
    const a = S(r).qs[0].answer;
    const at = (i: number) => ({ x: 20 + (i % 2) * 304 + 100, y: 168 + Math.floor(i / 2) * 82 + 30 });
    r.step(1, [], [], undefined, at(a));
    expect(S(r).phase).toBe('reveal');
    expect(S(r).picked).toBe(a);
    expect(S(r).results).toEqual([true]);
    r.step(1, [], [], undefined, at(a));
    expect(S(r).idx).toBe(0);
    r.step(30);
    r.step(1, [], [], undefined, { x: 300, y: 100 });
    expect(S(r).idx).toBe(1);
    expect(S(r).phase).toBe('ask');
  });

  it('a tap outside the answers does nothing while asking', () => {
    const r = run(kuis, 4);
    r.step(1, [], [], undefined, { x: 300, y: 100 });
    expect(S(r).phase).toBe('ask');
    expect(S(r).results).toEqual([]);
  });

  it('mouse hover moves the highlight so A locks the hovered answer', () => {
    const ctx = { ...run(kuis, 4).ctx, rand: mulberry(4) };
    const inst = kuis.create(ctx);
    const none = Object.fromEntries(BTNS.map((b) => [b, false])) as Record<Btn, boolean>;
    const feed = (ptr: InputState['ptr'], a = false) => inst.update(1 / 60, { down: { ...none, a }, hit: { ...none, a }, ax: 0, ay: 0, tap: null, ptr });
    feed({ x: 20 + 304 + 100, y: 168 + 82 + 30, down: false });
    expect((inst.snapshot!() as unknown as Snap).sel).toBe(3);
    feed({ x: 20 + 304 + 100, y: 168 + 82 + 30, down: false }, true);
    expect((inst.snapshot!() as unknown as Snap).picked).toBe(3);
  });
});

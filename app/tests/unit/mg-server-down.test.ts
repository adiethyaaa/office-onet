import { describe, expect, it } from 'vitest';
import { run, type Run } from './mg-harness';
import serverDown, { PORTMAP } from '../../src/minigames/games/server-down';

type Snap = {
  time: number; closed: number; violations: number; wrong: number; score: number; held: number | null;
  cursor: { row: number; col: number }; swPorts: number[]; plug: (number | null)[];
  pp: { outlet: string; pp: string; sw: string; port: number }[];
  tickets: { idx: number; want: number; outlet: string; sw: string }[];
};
const S = (r: Run) => r.snap() as unknown as Snap;

/** Move the cursor to (row, col) one press per frame. */
function goTo(r: Run, row: number, col: number) {
  for (let guard = 0; guard < 80; guard++) {
    const c = S(r).cursor;
    if (c.row !== row) { r.step(1, [], [row === 0 ? 'up' : 'down']); continue; }
    if (c.col === col) return;
    r.step(1, [], [c.col < col ? 'right' : 'left']);
  }
  throw new Error('cursor did not arrive');
}

function waitTicket(r: Run) {
  for (let i = 0; i < 60 * 20 && !S(r).tickets.length && !r.result; i++) r.step(1);
}

describe('mini game: server-down', () => {
  it('rack labels come from the ICT port map', () => {
    const s = S(run(serverDown, 3));
    for (const p of s.pp) {
      const c = PORTMAP.cables.find((k) => k.outletPort === p.outlet)!;
      expect(c).toBeTruthy();
      expect(`${c.patchPanel}-${c.ppPort}`).toBe(p.pp);
      expect(c.switch).toBe(p.sw);
      expect(c.switchPort).toBe(p.port);
      expect(s.swPorts).toContain(p.port);
    }
  });

  it('the right port closes the ticket; a wrong port warns and keeps it open', () => {
    const r = run(serverDown, 11);
    waitTicket(r);
    const t = S(r).tickets[0];
    goTo(r, 0, t.idx);
    r.step(1, [], ['a']);
    expect(S(r).held).toBe(t.idx);
    const s = S(r);
    const wrongCol = s.swPorts.findIndex((p) => p !== t.want && !s.plug.includes(p));
    goTo(r, 1, wrongCol);
    r.step(1, [], ['a']);
    expect(S(r).wrong).toBe(1);
    expect(S(r).closed).toBe(0);
    expect(S(r).tickets.some((k) => k.idx === t.idx)).toBe(true);
    expect(r.sfx).toContain('wrong');
    goTo(r, 1, s.swPorts.indexOf(t.want));
    r.step(1, [], ['a']);
    expect(S(r).closed).toBe(1);
    expect(S(r).tickets.some((k) => k.idx === t.idx)).toBe(false);
    expect(S(r).plug[t.idx]).toBe(t.want);
  });

  it('idle player breaches SLA and the session ends after 90 s', () => {
    const r = run(serverDown, 5);
    r.step(60 * 89);
    expect(r.result).toBeNull();
    expect(S(r).violations).toBeGreaterThan(0);
    r.step(60 * 2);
    expect(r.result).not.toBeNull();
    expect(r.result!.score).toBe(0);
  });

  function perfect(seed: number) {
    const r = run(serverDown, seed);
    for (let guard = 0; guard < 400 && !r.result; guard++) {
      waitTicket(r);
      if (r.result) break;
      const t = S(r).tickets[0];
      goTo(r, 0, t.idx);
      r.step(1, [], ['a']);
      goTo(r, 1, S(r).swPorts.indexOf(t.want));
      r.step(1, [], ['a']);
    }
    return r;
  }

  it('a perfect player closes every ticket and scores 100 per ticket plus speed bonus', () => {
    const r = perfect(42);
    const s = S(r);
    expect(r.result).not.toBeNull();
    expect(s.violations).toBe(0);
    expect(s.closed).toBeGreaterThanOrEqual(5);
    expect(r.result!.score).toBeGreaterThan(s.closed * 100);
    expect(r.result!.won).toBe(true);
  });

  it('same seed gives the same run', () => {
    const a = perfect(9), b = perfect(9);
    expect(a.result).toEqual(b.result);
    expect(a.snap()).toEqual(b.snap());
    expect(run(serverDown, 1).snap()).not.toEqual(run(serverDown, 2).snap());
  });

  it('tapping a ticket grabs its cord, tapping the right switch port closes it', () => {
    const r = run(serverDown, 11);
    waitTicket(r);
    const t = S(r).tickets[0];
    r.step(1, [], [], undefined, { x: 100, y: 70 });
    expect(S(r).held).toBe(t.idx);
    const col = S(r).swPorts.indexOf(t.want);
    const step = (392 - 68) / S(r).swPorts.length;
    r.step(1, [], [], undefined, { x: 236 + 34 + (col + 0.5) * step, y: 252 });
    expect(S(r).closed).toBe(1);
    expect(S(r).held).toBeNull();
  });

  it('a switch port tap between port boxes still hits the nearest column', () => {
    const r = run(serverDown, 11);
    waitTicket(r);
    const t = S(r).tickets[0];
    const ppStep = (392 - 68) / 8;
    r.step(1, [], [], undefined, { x: 236 + 34 + t.idx * ppStep + 2, y: 60 });
    expect(S(r).held).toBe(t.idx);
  });

  it('a "wrong port" ticket never points the cord at another cord\'s home port', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const r = run(serverDown, seed);
      for (let k = 0; k < 60 * 80 && !r.result; k += 30) {
        r.step(30);
        const s = S(r);
        const homes = s.pp.map((p) => p.port);
        s.plug.forEach((p, i) => { if (p !== null && p !== s.pp[i].port) expect(homes).not.toContain(p); });
      }
    }
  });
});

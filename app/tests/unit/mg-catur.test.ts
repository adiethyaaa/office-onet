import { describe, expect, it } from 'vitest';
import { run } from './mg-harness';
import catur, {
  START_FEN, fromFEN, toFEN, legalMoves, perft, makeMove, inCheck, outcome, posKey, aiMove, insufficient, sqIndex, sqXY, uci, menuBoxes, winScore,
  type Move, type Pos, type Level,
} from '../../src/minigames/games/catur';
import { mulberry } from './mg-harness';

const find = (p: Pos, u: string): Move => {
  const m = legalMoves(p).find((x) => uci(x) === u);
  if (!m) throw new Error(`illegal ${u} in ${toFEN(p)}`);
  return m;
};
const play = (p: Pos, ...ms: string[]) => { for (const u of ms) makeMove(p, find(p, u)); return p; };
const has = (p: Pos, u: string) => legalMoves(p).some((m) => uci(m) === u);

describe('catur: move generation', () => {
  it('start position has 20 moves, perft(2)=400, perft(3)=8902', () => {
    const p = fromFEN(START_FEN);
    expect(legalMoves(p).length).toBe(20);
    expect(perft(p, 2)).toBe(400);
    expect(perft(p, 3)).toBe(8902);
    expect(toFEN(p)).toBe(START_FEN);
  });

  it('matches known perft counts on a tricky position (castling, en passant, promotion)', () => {
    // "Kiwipete": depth 1 = 48, depth 2 = 2039, depth 3 = 97862
    const p = fromFEN('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
    expect(perft(p, 1)).toBe(48);
    expect(perft(p, 2)).toBe(2039);
    expect(perft(p, 3)).toBe(97862);
    // position 3 (en passant pins on the rank): 14, 191, 2812
    const q = fromFEN('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
    expect([perft(q, 1), perft(q, 2), perft(q, 3)]).toEqual([14, 191, 2812]);
  });

  it('castling both ways, and not through check', () => {
    const p = fromFEN('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
    expect(has(p, 'e1g1')).toBe(true);
    expect(has(p, 'e1c1')).toBe(true);
    play(p, 'e1g1');
    expect(toFEN(p).split(' ')[0]).toBe('r3k2r/8/8/8/8/8/8/R4RK1');
    expect(toFEN(p).split(' ')[2]).toBe('kq');
    play(p, 'e8c8');
    expect(toFEN(p).split(' ')[0]).toBe('2kr3r/8/8/8/8/8/8/R4RK1');
    // a black rook on f8 attacks f1: white may not castle short through it
    const q = fromFEN('5r2/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(has(q, 'e1g1')).toBe(false);
    expect(has(q, 'e1c1')).toBe(true);
    // in check: no castling at all
    const c = fromFEN('4r3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(has(c, 'e1g1') || has(c, 'e1c1')).toBe(false);
  });

  it('en passant is available only right after the double step', () => {
    const p = fromFEN(START_FEN);
    play(p, 'e2e4', 'a7a6', 'e4e5', 'd7d5');
    expect(has(p, 'e5d6')).toBe(true);
    play(p, 'e5d6');
    expect(p.b[sqIndex('d5')]).toBe(0);
    expect(p.b[sqIndex('d6')]).toBe(1);
    const q = fromFEN(START_FEN);
    play(q, 'e2e4', 'a7a6', 'e4e5', 'd7d5', 'a2a3', 'a6a5');
    expect(has(q, 'e5d6')).toBe(false);
  });

  it('promotion offers four pieces and places the chosen one', () => {
    const p = fromFEN('8/P6k/8/8/8/8/8/K7 w - - 0 1');
    const promos = legalMoves(p).filter((m) => m.f === sqIndex('a7')).map(uci).sort();
    expect(promos).toEqual(['a7a8b', 'a7a8n', 'a7a8q', 'a7a8r']);
    play(p, 'a7a8n');
    expect(p.b[sqIndex('a8')]).toBe(2);
  });

  it("detects Fool's mate and a stalemate", () => {
    const p = fromFEN(START_FEN);
    play(p, 'f2f3', 'e7e5', 'g2g4', 'd8h4');
    expect(inCheck(p)).toBe(true);
    expect(legalMoves(p).length).toBe(0);
    expect(outcome(p, new Map())).toEqual({ kind: 'mate', winner: -1 });
    const s = fromFEN('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(inCheck(s)).toBe(false);
    expect(outcome(s, new Map())).toEqual({ kind: 'stalemate', winner: 0 });
  });

  it('draws by fifty moves, insufficient material and threefold repetition', () => {
    expect(outcome(fromFEN('4k3/8/8/8/8/8/4P3/4K3 w - - 100 80'), new Map())?.kind).toBe('fifty');
    expect(insufficient(fromFEN('4k3/8/8/8/8/8/8/4KB2 w - - 0 1'))).toBe(true);
    expect(insufficient(fromFEN('4k3/8/8/8/8/8/8/3NKN2 w - - 0 1'))).toBe(false);
    expect(outcome(fromFEN('4kb2/8/8/8/8/8/8/2B1K3 w - - 0 1'), new Map())?.kind).toBe('material');
    const p = fromFEN(START_FEN);
    const h = new Map<string, number>();
    const bump = () => h.set(posKey(p), (h.get(posKey(p)) ?? 0) + 1);
    bump();
    for (let i = 0; i < 2; i++) for (const u of ['g1f3', 'g8f6', 'f3g1', 'f6g8']) { makeMove(p, find(p, u)); bump(); }
    expect(outcome(p, h)?.kind).toBe('repeat');
  });
});

describe('catur: AI', () => {
  it('never plays an illegal move and finds mate in one', () => {
    for (const lvl of [0, 1, 2] as Level[]) {
      const rand = mulberry(11 + lvl);
      const p = fromFEN(START_FEN);
      for (let i = 0; i < 24; i++) {
        const legal = legalMoves(p).map(uci);
        if (!legal.length) break;
        const m = aiMove(p, lvl, rand)!;
        expect(legal).toContain(uci(m));
        makeMove(p, m);
      }
    }
    // black to move, Qh4 is mate; medium and hard always see it
    const p = fromFEN(START_FEN);
    play(p, 'f2f3', 'e7e5', 'g2g4');
    expect(uci(aiMove(p, 1, mulberry(1))!)).toBe('d8h4');
    expect(uci(aiMove(p, 2, mulberry(2))!)).toBe('d8h4');
  });

  it('hard level grabs a free queen', () => {
    const p = fromFEN('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1');
    expect(uci(aiMove(p, 2, mulberry(5))!)).toBe('d1d5');
  });

  it('is deterministic for the same seed and fast enough per move', () => {
    const p = fromFEN('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4');
    expect(uci(aiMove(p, 2, mulberry(3))!)).toBe(uci(aiMove(p, 2, mulberry(3))!));
    let worst = 0;
    for (const fen of [START_FEN, toFEN(p), 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R b KQkq - 0 1']) {
      const t0 = performance.now();
      aiMove(fromFEN(fen), 2, mulberry(9));
      worst = Math.max(worst, performance.now() - t0);
    }
    // generous bound for slow CI; in the browser hard moves take well under this
    expect(worst).toBeLessThan(600);
  });

  it('score formula: win scales with level, shorter wins score more', () => {
    expect(winScore(20, 0)).toBe(900);
    expect(winScore(20, 2)).toBe(1800);
    expect(winScore(10, 1)).toBeGreaterThan(winScore(30, 1));
  });
});

type Snap = { phase: string; turn: number; legal: string[]; fen: string; result: { score: number; won: boolean; draw: boolean } | null; promo: string[] | null; sel: number; cursor: number; resignArm: boolean };
const center = (sq: string) => sqXY(sqIndex(sq));

/** Plays white by tapping squares: capture the most valuable piece, otherwise a seeded pick. */
function tapper(level: number, seed = 1) {
  const rand = mulberry(seed);
  let pending: string | null = null;
  let wait = 0;
  return (_f: number, raw: Record<string, unknown>) => {
    const s = raw as unknown as Snap;
    if (wait-- > 0) return {};
    if (s.phase === 'menu') { const b = menuBoxes()[level]; wait = 3; return { tap: { x: b.x + 20, y: b.y + 20 } }; }
    if (s.phase === 'over') return { press: ['a' as const] };
    if (s.phase === 'promo') { wait = 3; return { press: ['a' as const] }; }
    if (s.turn < 0 || !s.legal.length) return {};
    if (pending) { const to = center(pending.slice(2, 4)); pending = null; wait = 3; return { tap: to }; }
    const pos = fromFEN(s.fen);
    let best = s.legal[Math.floor(rand() * s.legal.length)], bv = -1;
    for (const u of s.legal) { const v = Math.abs(pos.b[sqIndex(u.slice(2, 4))]); if (v > bv) { bv = v; if (v > 0) best = u; } }
    pending = best;
    wait = 2;
    return { tap: center(best.slice(0, 2)) };
  };
}

describe('catur: full game in the harness', () => {
  it('menu, tap controls and the cursor work', () => {
    const r = run(catur, 4);
    expect((r.snap() as unknown as Snap).phase).toBe('menu');
    r.step(1, [], ['down']);
    r.step(1, [], ['a']);
    expect(r.snap().phase).toBe('play');
    expect(r.snap().level).toBe(2);
    // cursor starts on e2: A picks it, up twice, A places e2e4
    r.step(1, [], ['a']);
    expect((r.snap() as unknown as Snap).sel).toBe(sqIndex('e2'));
    r.step(2, [], ['up']);
    r.step(2, [], ['up']);
    r.step(1, [], ['a']);
    expect(r.snap().last).toBe('e2e4');
    expect(r.snap().turn).toBe(-1);
    // the teammate answers within a few seconds
    r.step(240);
    expect(r.snap().turn).toBe(1);
    // B cancels a selection; an illegal target keeps the turn
    r.step(1, [], [], undefined, center('g1'));
    expect((r.snap() as unknown as Snap).sel).toBe(sqIndex('g1'));
    r.step(1, [], ['b']);
    expect((r.snap() as unknown as Snap).sel).toBe(-1);
  });

  it('resign with Y pressed twice ends the run with score 0', () => {
    const r = run(catur, 9);
    r.step(1, [], ['a']);
    r.step(1, [], ['y']);
    expect((r.snap() as unknown as Snap).resignArm).toBe(true);
    r.step(5);
    r.step(1, [], ['y']);
    expect(r.snap().phase).toBe('over');
    r.step(40);
    r.step(1, [], ['a']);
    expect(r.result?.score).toBe(0);
    expect(r.result?.won).toBe(false);
  });

  it('holding Y for one second also resigns', () => {
    const r = run(catur, 9);
    r.step(1, [], ['a']);
    r.step(62, ['y']);
    expect(r.snap().phase).toBe('over');
  });

  it('a whole game always ends and is deterministic', () => {
    const go = (seed: number, level: number) => {
      const r = run(catur, seed);
      const res = r.play(tapper(level, seed), 60 * 60);
      return { res, fen: r.snap().fen as string };
    };
    const a = go(21, 0);
    expect(a.res).not.toBeNull();
    expect(a.res!.score).toBeGreaterThanOrEqual(0);
    const b = go(21, 0);
    expect(b).toEqual(a);
    const c = go(5, 1);
    expect(c.res).not.toBeNull();
  }, 120000);
});

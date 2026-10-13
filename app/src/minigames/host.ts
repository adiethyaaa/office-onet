// Mini game host (PRD v2.0 REQ-MG). Full-screen layer over the 3D office:
// intro card, letterboxed canvas, pause, result card with a local top-10, and
// one input layer for keyboard, touch and gamepad. Lazy chunk: the office
// imports it only when a facility or the Game Station is used.
import './minigames.css';
import { t } from '../i18n';
import { sound } from '../audio';
import { buildCast } from './cast';
import { GAMES } from './registry';
import { BTNS, type Btn, type GameInstance, type GameMeta, type GameModule, type GameResult, type InputState } from './types';
import { PAD_PROFILES, faceButtons, stickAxes } from '../input/pad-profiles';
import type { PadProfileId } from '../ui/settings';

export interface HostOpts {
  reducedMotion: boolean;
  padProfile: () => PadProfileId;
  playerName: string;
  /** Called after the layer closes (the office resumes). */
  onClose: (r: GameResult | null) => void;
  seed?: number;
}

// ---- local leaderboard -------------------------------------------------------
const SCORE_KEY = 'kantor-rpg.scores.v1';
export interface ScoreRow { name: string; score: number; at: string }
export function loadScores(): Record<string, ScoreRow[]> {
  try { return JSON.parse(localStorage.getItem(SCORE_KEY) ?? '{}') as Record<string, ScoreRow[]>; } catch { return {}; }
}
export function addScore(meta: GameMeta, row: ScoreRow): { rank: number; list: ScoreRow[] } {
  const all = loadScores();
  const list = [...(all[meta.id] ?? []), row];
  list.sort((a, b) => (meta.score.higherIsBetter ? b.score - a.score : a.score - b.score));
  const top = list.slice(0, 10);
  all[meta.id] = top;
  try { localStorage.setItem(SCORE_KEY, JSON.stringify(all)); } catch { /* storage blocked: board lasts this visit */ }
  return { rank: top.indexOf(row) + 1, list: top };
}
export function formatScore(meta: GameMeta, v: number): string {
  if (meta.score.time) { const s = Math.max(0, v); return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; }
  return `${Math.round(v)} ${t(meta.score.unit)}`;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text !== undefined) e.textContent = text;
  return e;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let x = a;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const KEYMAP: Record<string, Btn> = {
  arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
  ' ': 'a', enter: 'a', e: 'a', j: 'a', k: 'b', shift: 'b', backspace: 'b', l: 'x', x: 'x', i: 'y', c: 'y',
};
const BTN_LABEL: Record<Btn, string> = { left: '◀', right: '▶', up: '▲', down: '▼', a: 'A', b: 'B', x: 'X', y: 'Y' };

type Phase = 'loading' | 'intro' | 'play' | 'pause' | 'result' | 'error';

export class MiniGameHost {
  readonly root: HTMLElement;
  private canvas = el('canvas', { class: 'mg-canvas', 'aria-label': '' });
  private g: CanvasRenderingContext2D;
  private bar = el('div', { class: 'mg-bar' });
  private hudEl = el('span', { class: 'mg-hud', 'aria-live': 'off' });
  private titleEl = el('h2', { class: 'mg-title', id: 'mg-title' });
  private card = el('div', { class: 'mg-card', role: 'dialog', 'aria-modal': 'false', 'aria-labelledby': 'mg-card-title' });
  private touch = el('div', { class: 'mg-touch' });
  private muteBtn = el('button', { type: 'button', class: 'btn mg-mute', 'aria-pressed': 'false' });
  private mod: GameModule | null = null;
  private inst: GameInstance | null = null;
  private phase: Phase = 'loading';
  private keys = new Set<Btn>();
  private touchDown = new Set<Btn>();
  // Keys pressed since the last frame. A tap shorter than one frame still counts as a hit.
  private latched = new Set<Btn>();
  private prevDown: Record<Btn, boolean> = Object.fromEntries(BTNS.map((b) => [b, false])) as Record<Btn, boolean>;
  private padPrev: boolean[] = [];
  private tap: { x: number; y: number } | null = null;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private result: GameResult | null = null;
  private seed: number;
  private runs = 0;
  private hudText = '';
  private escHeld = false;
  /** Last frame state for tests (window.__kantor.minigame()). */
  frames = 0;

  constructor(readonly gameId: string, private opts: HostOpts) {
    this.seed = opts.seed ?? (Date.now() >>> 0);
    this.root = el('section', { class: 'mg-host', id: 'mg-host', 'aria-labelledby': 'mg-title', 'data-game': gameId });
    this.g = this.canvas.getContext('2d')!;
    const close = el('button', { type: 'button', class: 'btn mg-close' }, t('Keluar'));
    close.addEventListener('click', () => this.close());
    const pause = el('button', { type: 'button', class: 'btn mg-pause' }, t('Jeda'));
    pause.addEventListener('click', () => this.togglePause());
    this.muteBtn.addEventListener('click', () => sound.with((e) => { e.toggleMute(); this.syncMute(); }));
    this.bar.append(this.titleEl, this.hudEl, this.muteBtn, pause, close);
    const stage = el('div', { class: 'mg-stage' });
    stage.append(this.canvas, this.card);
    this.root.append(this.bar, stage, this.touch);
    this.canvas.addEventListener('pointerdown', (e) => this.onTap(e));
    this.syncMute();
  }

  async open(): Promise<void> {
    document.body.append(this.root);
    document.documentElement.setAttribute('data-minigame', this.gameId);
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    window.addEventListener('resize', this.fit);
    window.addEventListener('blur', this.onBlur);
    this.showCard(t('Memuat permainan...'), [], []);
    const loader = GAMES[this.gameId];
    try {
      if (!loader) throw new Error(this.gameId);
      this.mod = (await loader()).default;
    } catch {
      this.phase = 'error';
      this.showCard(t('Permainan gagal dimuat.'), [t('Periksa koneksi, lalu coba lagi.')], [[t('Keluar'), () => this.close()]]);
      return;
    }
    const m = this.mod.meta;
    this.titleEl.textContent = t(m.title);
    this.canvas.setAttribute('aria-label', t(m.title));
    this.canvas.width = m.view.w;
    this.canvas.height = m.view.h;
    this.buildTouch(m);
    this.fit();
    sound.music(m.music);
    this.intro();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  private intro() {
    const m = this.mod!.meta;
    this.phase = 'intro';
    const best = loadScores()[m.id]?.[0];
    const lines = [t(m.blurb), ...m.controls.map((c) => t(c))];
    if (best) lines.push(t('Skor terbaik: {score} ({name})', { score: formatScore(m, best.score), name: best.name }));
    this.showCard(t(m.title), lines, [[t('Mulai'), () => this.start()], [t('Keluar'), () => this.close()]]);
  }

  private start() {
    const m = this.mod!;
    const seed = (this.seed + this.runs * 7919) >>> 0;
    this.runs++;
    this.result = null;
    this.inst?.dispose?.();
    const rand = mulberry32(seed);
    this.inst = m.create({
      canvas: this.canvas, g: this.g, w: m.meta.view.w, h: m.meta.view.h, rand, seed,
      t: (s, v) => t(s, v), sfx: (n, o) => sound.sfx(n, o), reducedMotion: this.opts.reducedMotion,
      cast: buildCast(), playerId: 'CH-CEO',
      end: (r) => { if (!this.result) { this.result = r; this.finish(r); } },
      setHud: (s) => { if (s !== this.hudText) { this.hudText = s; this.hudEl.textContent = s; } },
    });
    this.hideCard();
    this.phase = 'play';
    sound.sfx('start');
    this.canvas.focus?.();
  }

  private finish(r: GameResult) {
    const m = this.mod!.meta;
    this.phase = 'result';
    sound.sfx(r.won === false ? 'lose' : 'win');
    const lines: string[] = [];
    if (r.summary) lines.push(r.summary);
    let rank = 0;
    let list = loadScores()[m.id] ?? [];
    if (r.score > 0) ({ rank, list } = addScore(m, { name: this.opts.playerName, score: r.score, at: new Date().toISOString() }));
    lines.push(t('Skor: {score}', { score: formatScore(m, r.score) }));
    if (rank) lines.push(t('Peringkat {n} di papan skor perangkat ini.', { n: rank }));
    const board = el('ol', { class: 'mg-board', 'aria-label': t('Papan skor') });
    list.slice(0, 10).forEach((row, i) => {
      const li = el('li', i + 1 === rank ? { class: 'me' } : {});
      li.append(el('span', {}, row.name), el('span', {}, formatScore(m, row.score)));
      board.append(li);
    });
    this.showCard(r.won === false ? t('Belum berhasil') : t('Selesai!'), lines, [[t('Main lagi'), () => this.start()], [t('Keluar'), () => this.close(r)]], list.length ? board : null);
  }

  private togglePause() {
    if (this.phase === 'play') {
      this.phase = 'pause';
      this.showCard(t('Jeda'), [], [[t('Lanjut'), () => { this.hideCard(); this.phase = 'play'; this.last = performance.now(); }], [t('Ulang'), () => this.start()], [t('Keluar'), () => this.close()]]);
    } else if (this.phase === 'pause') {
      this.hideCard();
      this.phase = 'play';
      this.last = performance.now();
    }
  }

  close(r: GameResult | null = this.result) {
    cancelAnimationFrame(this.raf);
    this.inst?.dispose?.();
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    window.removeEventListener('resize', this.fit);
    window.removeEventListener('blur', this.onBlur);
    document.documentElement.removeAttribute('data-minigame');
    this.root.remove();
    sound.sfx('back');
    this.opts.onClose(r);
  }

  // ---- cards ------------------------------------------------------------------
  private showCard(title: string, lines: string[], actions: [string, () => void][], extra: HTMLElement | null = null) {
    const h = el('h3', { id: 'mg-card-title' }, title);
    const body = lines.map((l) => el('p', {}, l));
    const row = el('div', { class: 'row' });
    actions.forEach(([label, fn], i) => {
      const b = el('button', { type: 'button', class: i === 0 ? 'btn primary' : 'btn' }, label);
      b.addEventListener('click', () => { sound.sfx('confirm'); fn(); });
      row.append(b);
    });
    this.card.replaceChildren(h, ...body, ...(extra ? [extra] : []), row);
    this.card.hidden = false;
    (row.querySelector('button') as HTMLButtonElement | null)?.focus();
  }

  private hideCard() { this.card.hidden = true; }

  private syncMute() {
    const muted = sound.engine?.prefs.muted ?? false;
    this.muteBtn.textContent = muted ? t('Suara mati') : t('Suara nyala');
    this.muteBtn.setAttribute('aria-pressed', String(muted));
  }

  // ---- layout -----------------------------------------------------------------
  private fit = () => {
    if (!this.mod) return;
    const { w, h } = this.mod.meta.view;
    const stage = this.canvas.parentElement!;
    const r = stage.getBoundingClientRect();
    // 12 px = the stage padding on both sides; keeps the canvas inside narrow phones.
    const k = Math.min((r.width - 12) / w, (r.height - 12) / h);
    this.canvas.style.width = `${Math.floor(w * k)}px`;
    this.canvas.style.height = `${Math.floor(h * k)}px`;
  };

  private buildTouch(m: GameMeta) {
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.touch.hidden = !coarse;
    this.touch.replaceChildren();
    const pad = el('div', { class: 'mg-dpad' });
    const btns = el('div', { class: 'mg-btns' });
    for (const b of m.touch) {
      const k = el('button', { type: 'button', class: `mg-tb mg-tb-${b}`, 'aria-label': b }, BTN_LABEL[b]);
      const on = (e: PointerEvent) => { e.preventDefault(); this.touchDown.add(b); k.setPointerCapture(e.pointerId); };
      const off = () => this.touchDown.delete(b);
      k.addEventListener('pointerdown', on);
      k.addEventListener('pointerup', off);
      k.addEventListener('pointercancel', off);
      k.addEventListener('lostpointercapture', off);
      (['left', 'right', 'up', 'down'].includes(b) ? pad : btns).append(k);
    }
    this.touch.append(pad, btns);
  }

  // ---- input ------------------------------------------------------------------
  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    const target = e.target as HTMLElement | null;
    const onButton = target instanceof HTMLButtonElement && !this.card.hidden;
    if (k === 'escape' || k === 'p') {
      e.preventDefault(); e.stopPropagation();
      if (!this.escHeld) { this.escHeld = true; if (this.phase === 'play' || this.phase === 'pause') this.togglePause(); else if (this.phase === 'intro' || this.phase === 'error') this.close(); }
      return;
    }
    if (k === 'm') { e.stopPropagation(); sound.with((en) => { en.toggleMute(); this.syncMute(); }); return; }
    const b = KEYMAP[k];
    // Enter/Space on a focused card button must press that button.
    if (onButton && (k === 'enter' || k === ' ')) { e.stopPropagation(); return; }
    e.stopPropagation();
    if (b) { e.preventDefault(); if (!e.repeat) this.latched.add(b); this.keys.add(b); }
  };

  private onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') this.escHeld = false;
    const b = KEYMAP[k];
    if (b) this.keys.delete(b);
    e.stopPropagation();
  };

  private onBlur = () => { this.keys.clear(); this.touchDown.clear(); if (this.phase === 'play') this.togglePause(); };

  private onTap(e: PointerEvent) {
    if (this.phase !== 'play' || !this.mod) return;
    const r = this.canvas.getBoundingClientRect();
    this.tap = { x: ((e.clientX - r.left) / r.width) * this.mod.meta.view.w, y: ((e.clientY - r.top) / r.height) * this.mod.meta.view.h };
  }

  private readPad(): { down: Partial<Record<Btn, boolean>>; ax: number; ay: number; start: boolean; select: boolean } {
    const none = { down: {}, ax: 0, ay: 0, start: false, select: false };
    let p: Gamepad | null = null;
    for (const q of navigator.getGamepads?.() ?? []) if (q && q.connected) { p = q; break; }
    if (!p) return none;
    const prof = PAD_PROFILES[this.opts.padProfile()] ?? PAD_PROFILES.standar;
    const f = faceButtons(prof);
    const ax = stickAxes(prof);
    const raw = p.buttons.map((b) => b.pressed || b.value > 0.5);
    const sx = p.axes[ax.move[0]] ?? 0;
    const sy = p.axes[ax.move[1]] ?? 0;
    const dz = prof.dead;
    const lx = Math.abs(sx) > dz ? sx : 0;
    const ly = Math.abs(sy) > dz ? sy : 0;
    const start = !!raw[9] && !this.padPrev[9];
    const select = !!raw[8] && !this.padPrev[8];
    this.padPrev = raw;
    return {
      down: {
        a: raw[f.A], b: raw[f.B], x: raw[f.X], y: raw[f.Y],
        left: raw[14] || lx < -0.5, right: raw[15] || lx > 0.5, up: raw[12] || ly < -0.5, down: raw[13] || ly > 0.5,
      },
      ax: raw[14] ? -1 : raw[15] ? 1 : lx, ay: raw[12] ? -1 : raw[13] ? 1 : ly, start, select,
    };
  }

  private input(): InputState {
    const pad = this.readPad();
    if (pad.start) this.togglePause();
    if (pad.select && this.phase !== 'play') this.close();
    // Card open: the pad's A presses the focused card button, B the last one.
    if (this.phase !== 'play' && !this.card.hidden) {
      if (pad.down.a && !this.prevDown.a) (document.activeElement as HTMLElement | null)?.click?.();
      if (pad.down.left && !this.prevDown.left) this.moveCardFocus(-1);
      if (pad.down.right && !this.prevDown.right) this.moveCardFocus(1);
    }
    const down = {} as Record<Btn, boolean>;
    const hit = {} as Record<Btn, boolean>;
    for (const b of BTNS) {
      const held = this.keys.has(b) || this.touchDown.has(b) || !!pad.down[b];
      down[b] = held || this.latched.has(b);
      hit[b] = (down[b] && !this.prevDown[b]) || this.latched.has(b);
    }
    this.latched.clear();
    this.prevDown = down;
    let ax = pad.ax + (down.right && !pad.down.right ? 1 : 0) - (down.left && !pad.down.left ? 1 : 0);
    let ay = pad.ay + (down.down && !pad.down.down ? 1 : 0) - (down.up && !pad.down.up ? 1 : 0);
    ax = Math.max(-1, Math.min(1, ax));
    ay = Math.max(-1, Math.min(1, ay));
    const tap = this.tap;
    this.tap = null;
    return { down, hit, ax, ay, tap };
  }

  private moveCardFocus(d: number) {
    const bs = [...this.card.querySelectorAll('button')];
    const i = bs.indexOf(document.activeElement as HTMLButtonElement);
    bs[(i + d + bs.length) % bs.length]?.focus();
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    const input = this.input();
    if (this.phase === 'play' && this.inst) {
      // Fixed 60 Hz step: game logic is frame-rate independent and replayable.
      this.acc += dt;
      let n = 0;
      let first = true;
      while (this.acc >= 1 / 60 && n < 6) {
        this.inst.update(1 / 60, first ? input : { ...input, hit: Object.fromEntries(BTNS.map((b) => [b, false])) as Record<Btn, boolean>, tap: null });
        first = false;
        this.acc -= 1 / 60;
        n++;
        this.frames++;
        if (this.phase !== 'play') break;
      }
      if (n === 6) this.acc = 0;
    }
    this.inst?.render();
  };

  /** Test hook: game snapshot plus host phase. */
  state() { return { phase: this.phase, game: this.gameId, frames: this.frames, hud: this.hudText, result: this.result, snap: this.inst?.snapshot?.() ?? null }; }
}

let current: MiniGameHost | null = null;
export function openMiniGame(id: string, opts: HostOpts): MiniGameHost {
  current?.close(null);
  current = new MiniGameHost(id, { ...opts, onClose: (r) => { current = null; opts.onClose(r); } });
  void current.open();
  return current;
}
export function currentMiniGame(): MiniGameHost | null { return current; }

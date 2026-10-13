// Contract between the mini game host (host.ts) and each game module.
// A module is loaded only when the player opens it, so nothing here may pull
// in three.js or world code: games draw on a plain 2D canvas.

export type Btn = 'left' | 'right' | 'up' | 'down' | 'a' | 'b' | 'x' | 'y';
export const BTNS: Btn[] = ['left', 'right', 'up', 'down', 'a', 'b', 'x', 'y'];

/** Input snapshot for one frame. `down` is held, `hit` is pressed this frame. */
export interface InputState {
  down: Record<Btn, boolean>;
  hit: Record<Btn, boolean>;
  /** Analog direction, -1..1 each axis, y up = -1 (screen space). Digital keys give unit steps. */
  ax: number;
  ay: number;
  /** Last pointer tap in game units, consumed by the game (games that support tap). */
  tap: { x: number; y: number } | null;
  /**
   * Live pointer (mouse or finger) in game units while it is over the canvas,
   * `down` true while pressed. Lets games offer drag controls (aim, pull back).
   * Optional so the headless harness and older games can ignore it.
   */
  ptr?: { x: number; y: number; down: boolean } | null;
}

export interface GameResult {
  /** Number saved to the leaderboard; 0 means "no score" (quit early). */
  score: number;
  /** Short line shown on the result card, already translated. */
  summary?: string;
  won?: boolean;
}

export interface GameMeta {
  id: string;
  /** Indonesian source title; t() translates. */
  title: string;
  /** One line under the title in the launcher and the help card. */
  blurb: string;
  /** Lines for the controls card (Indonesian source). */
  controls: string[];
  /** Logical canvas size in game units; the host letterboxes it. */
  view: { w: number; h: number };
  score: { unit: string; higherIsBetter: boolean; time?: boolean };
  /** Music track name for audio/music.ts. */
  music: string;
  /** Where the game lives: a facility kind from world.json, or 'arcade'. */
  place: string;
  /** Which on-screen buttons a touch player needs. */
  touch: Btn[];
  /**
   * What each button does in this game (Indonesian source, host translates).
   * The tutorial turns these into per-device rows: keyboard keys, gamepad
   * buttons and on-screen buttons. 'arah' covers the four directions.
   */
  actions?: Partial<Record<Btn | 'arah', string>>;
  /** Extra tutorial line for touch/mouse players (drag or tap controls). */
  pointerHint?: string;
}

/** Everything the host gives a running game. */
export interface GameCtx {
  readonly canvas: HTMLCanvasElement;
  readonly g: CanvasRenderingContext2D;
  readonly w: number;
  readonly h: number;
  /** Deterministic RNG for this run (seeded by the host). */
  rand(): number;
  readonly seed: number;
  /** Translate an Indonesian UI string. */
  t(s: string, vars?: Record<string, string | number>): string;
  sfx(name: string, opts?: { pan?: number; rate?: number; gain?: number }): void;
  readonly reducedMotion: boolean;
  /** Player avatar colours and the cast, for drawing characters. */
  readonly cast: CastMember[];
  readonly playerId: string;
  /** Finish the run; the host shows the result card. */
  end(r: GameResult): void;
  /** Live score shown in the host bar. */
  setHud(text: string): void;
}

export interface CastMember {
  id: string;
  name: string;
  role: string;
  skin: string;
  hair: string;
  hairStyle: string;
  main: string;
  inner: string;
  bottom: string;
  accent: string;
  shoes: string;
}

export interface GameInstance {
  update(dt: number, input: InputState): void;
  render(): void;
  /** Optional: host is about to remove the game. */
  dispose?(): void;
  /** Optional state for tests (plain JSON). */
  snapshot?(): Record<string, unknown>;
}

export interface GameModule {
  meta: GameMeta;
  create(ctx: GameCtx): GameInstance;
}

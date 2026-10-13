// Tiny facade so the entry chunk never carries the synthesiser: the real engine
// (audio.ts) is a lazy chunk fetched on the first key or pointer press, which is
// also the moment browsers allow audio to start. Calls made before that are
// dropped (effects) or remembered (music track, mute).
//
// The AudioContext itself is created here, synchronously inside the gesture
// handler: Safari and iOS only start a context made during the gesture, and
// the dynamic import resolves after the gesture has ended.
type Engine = typeof import('./audio')['audio'];

let engine: Engine | null = null;
let loading = false;
let wantMusic: string | null = null;
let early: AudioContext | null = null;
const ready: ((e: Engine) => void)[] = [];
const EVENTS = ['pointerdown', 'keydown', 'touchend', 'click'] as const;

function makeContext() {
  if (early || typeof window === 'undefined') return;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return;
  try { early = new AC({ latencyHint: 'playback' }); } catch { try { early = new AC(); } catch { early = null; } }
  if (early?.state === 'suspended') void early.resume();
}

function load() {
  if (engine || loading || typeof window === 'undefined') return;
  loading = true;
  makeContext();
  void import('./audio').then((m) => {
    engine = m.audio;
    engine.unlock(early);
    if (wantMusic) engine.music(wantMusic);
    for (const ev of EVENTS) window.removeEventListener(ev, load, { capture: true });
    for (const f of ready.splice(0)) f(engine);
  }).catch(() => { loading = false; });
}

if (typeof window !== 'undefined') {
  // Not `once`: if the chunk fails to load, the next gesture tries again.
  for (const ev of EVENTS) window.addEventListener(ev, load, { capture: true });
}

export const sound = {
  sfx(name: string, opts?: { pan?: number; gain?: number; rate?: number }) { engine?.sfx(name, opts); },
  music(name: string | null) { wantMusic = name; engine?.music(name); },
  /** Run fn with the engine now, or once it has loaded. */
  with(fn: (e: Engine) => void) { if (engine) fn(engine); else { ready.push(fn); load(); } },
  get loaded() { return !!engine; },
  get engine() { return engine; },
  load,
};

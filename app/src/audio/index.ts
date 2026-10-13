// Tiny facade so the entry chunk never carries the synthesiser: the real engine
// (audio.ts) is a lazy chunk fetched on the first key or pointer press, which is
// also the moment browsers allow audio to start. Calls made before that are
// dropped (effects) or remembered (music track, mute).
type Engine = typeof import('./audio')['audio'];

let engine: Engine | null = null;
let loading = false;
let wantMusic: string | null = null;
const ready: ((e: Engine) => void)[] = [];

function load() {
  if (engine || loading || typeof window === 'undefined') return;
  loading = true;
  void import('./audio').then((m) => {
    engine = m.audio;
    engine.unlock();
    if (wantMusic) engine.music(wantMusic);
    for (const f of ready.splice(0)) f(engine);
  }).catch(() => { loading = false; });
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', load, { capture: true, once: true });
  window.addEventListener('keydown', load, { capture: true, once: true });
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

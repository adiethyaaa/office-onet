// Sound for the 3D office and the mini games, synthesised with the Web Audio
// API at runtime. No audio files ship: every effect is a short recipe and every
// music track is generated from a fixed pattern, so the download stays at a few
// kB and there is no third-party licence to track (PRD v2.0 REQ-AUDIO-06).
//
// Browsers block audio until the user interacts, so the context is created on
// the first key or pointer press. Before that, sfx() and music() calls are
// remembered (music) or dropped (effects).

import { loadAudioPrefs, saveAudioPrefs, type AudioPrefs } from './prefs';
export type { AudioPrefs };

// ---- music ----------------------------------------------------------------
// A track is a loop of 16th-note steps. Notes are scale degrees (0 = root),
// null is a rest. Patterns are short on purpose: each area gets a recognisable
// motif without shipping a sequencer file per song.
interface Track {
  bpm: number;
  root: number; // MIDI note of the root
  scale: number[];
  lead: (number | null)[];
  bass: (number | null)[];
  drums: string; // k = kick, s = snare, h = hat, . = rest (one char per step)
  wave: OscillatorType;
  leadGain: number;
}

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const PENTA = [0, 2, 4, 7, 9];
const _ = null;

export const TRACKS: Record<string, Track> = {
  // Floor 1: work. Slow, soft, mostly rests so it stays in the background.
  office: { bpm: 84, root: 60, scale: PENTA, wave: 'sine', leadGain: 0.05,
    lead: [0, _, _, _, 2, _, _, _, 3, _, 2, _, _, _, _, _, 4, _, _, _, 3, _, _, _, 2, _, 1, _, _, _, _, _],
    bass: [0, _, _, _, _, _, _, _, -2, _, _, _, _, _, _, _, -3, _, _, _, _, _, _, _, -1, _, _, _, _, _, _, _],
    drums: 'h...h...h...h...h...h...h...h...' },
  lobby: { bpm: 92, root: 62, scale: MAJOR, wave: 'triangle', leadGain: 0.05,
    lead: [4, _, 2, _, 0, _, _, _, 1, _, 2, _, 4, _, _, _, 5, _, 4, _, 2, _, _, _, 1, _, _, _, 0, _, _, _],
    bass: [0, _, _, _, 0, _, _, _, 3, _, _, _, 3, _, _, _, 4, _, _, _, 4, _, _, _, 1, _, _, _, 1, _, _, _],
    drums: 'k...h...s...h...k...h...s...h...' },
  // Floor 2: leisure. Warmer and a bit faster.
  lounge: { bpm: 100, root: 57, scale: MAJOR, wave: 'triangle', leadGain: 0.06,
    lead: [0, _, 2, 4, _, 4, 5, _, 4, _, 2, _, 0, _, _, _, 2, _, 4, 5, _, 7, 5, _, 4, _, 2, _, 1, _, _, _],
    bass: [0, _, _, 0, _, _, 0, _, 5, _, _, 5, _, _, 5, _, 3, _, _, 3, _, _, 3, _, 4, _, _, 4, _, _, 4, _],
    drums: 'k.h.s.h.k.hks.h.k.h.s.h.k.hks.hh' },
  arcade: { bpm: 132, root: 64, scale: MINOR, wave: 'square', leadGain: 0.045,
    lead: [0, 0, 7, _, 5, _, 3, _, 2, _, 3, 5, _, _, _, _, 0, 0, 7, _, 8, _, 7, _, 5, _, 3, 2, _, _, _, _],
    bass: [0, _, 0, _, 0, _, 0, _, -2, _, -2, _, -2, _, -2, _, -4, _, -4, _, -4, _, -4, _, -3, _, -3, _, -3, _, -3, _],
    drums: 'k.h.s.h.k.k.s.h.k.h.s.h.k.k.s.hs' },
  race: { bpm: 150, root: 62, scale: MINOR, wave: 'sawtooth', leadGain: 0.03,
    lead: [0, _, 0, 2, 3, _, 2, _, 0, _, 0, 2, 3, _, 5, _, 7, _, 5, _, 3, _, 2, _, 3, _, 2, _, 0, _, _, _],
    bass: [0, 0, _, 0, 0, _, 0, 0, -2, -2, _, -2, -2, _, -2, -2, -4, -4, _, -4, -4, _, -4, -4, -3, -3, _, -3, -3, _, -3, -3],
    drums: 'k.hhs.hhk.hhs.hhk.hhs.hhk.hksshs' },
  fight: { bpm: 140, root: 57, scale: MINOR, wave: 'square', leadGain: 0.04,
    lead: [0, _, 3, _, 0, _, 5, _, 3, _, 7, _, 5, 3, 2, _, 0, _, 3, _, 0, _, 7, _, 8, _, 7, _, 5, _, 3, _],
    bass: [0, _, 0, 0, _, 0, _, 0, -2, _, -2, -2, _, -2, _, -2, -4, _, -4, -4, _, -4, _, -4, -5, _, -5, -5, _, -3, _, -3],
    drums: 'k..hs..hk.k.s..hk..hs..hk.k.s.ss' },
  platform: { bpm: 126, root: 60, scale: MAJOR, wave: 'square', leadGain: 0.04,
    lead: [4, 4, _, 4, _, 2, 4, _, 7, _, _, _, 0, _, _, _, 2, _, _, 0, _, _, -1, _, _, 1, _, 2, _, 1, 0, _],
    bass: [0, _, 0, _, 0, _, 0, _, 4, _, 4, _, 4, _, 4, _, 3, _, 3, _, 3, _, 3, _, 4, _, 4, _, 4, _, 4, _],
    drums: 'k.h.s.h.k.h.s.h.k.h.s.h.k.h.shss' },
  puzzle: { bpm: 108, root: 65, scale: PENTA, wave: 'triangle', leadGain: 0.05,
    lead: [0, _, 2, _, 4, _, 2, _, 3, _, 2, _, 1, _, _, _, 0, _, 2, _, 4, _, 5, _, 4, _, 3, _, 2, _, _, _],
    bass: [0, _, _, _, 0, _, _, _, 2, _, _, _, 2, _, _, _, 3, _, _, _, 3, _, _, _, 1, _, _, _, 1, _, _, _],
    drums: 'k...h.h.s...h.h.k...h.h.s...h.hh' },
  bomb: { bpm: 138, root: 62, scale: MAJOR, wave: 'square', leadGain: 0.04,
    lead: [0, 2, 4, _, 4, _, 2, 4, 5, _, 4, _, 2, _, _, _, 0, 2, 4, _, 7, _, 5, 4, 2, _, 1, _, 0, _, _, _],
    bass: [0, _, 4, _, 0, _, 4, _, 3, _, 5, _, 3, _, 5, _, 1, _, 4, _, 1, _, 4, _, 4, _, 6, _, 4, _, 6, _],
    drums: 'k.hsk.hsk.hsk.hsk.hsk.hsk.hskshs' },
  gym: { bpm: 128, root: 57, scale: MINOR, wave: 'sawtooth', leadGain: 0.025,
    lead: [0, _, _, 0, _, _, 3, _, _, 3, _, _, 5, _, 3, _, 0, _, _, 0, _, _, 7, _, _, 5, _, _, 3, _, 2, _],
    bass: [0, _, 0, _, 0, _, 0, _, 0, _, 0, _, 0, _, 0, _, -2, _, -2, _, -2, _, -2, _, -4, _, -4, _, -3, _, -3, _],
    drums: 'k.h.k.h.k.h.k.h.k.h.k.h.k.h.kshs' },
  cafe: { bpm: 88, root: 62, scale: MAJOR, wave: 'sine', leadGain: 0.06,
    lead: [2, _, 4, _, 5, _, 4, 2, 0, _, _, _, 1, _, 2, _, 4, _, 5, _, 7, _, 5, 4, 2, _, _, _, 1, _, _, _],
    bass: [0, _, _, _, 4, _, _, _, 5, _, _, _, 3, _, _, _, 0, _, _, _, 4, _, _, _, 1, _, _, _, 4, _, _, _],
    drums: 'h.h.s.h.h.h.s.h.h.h.s.h.h.h.s.hh' },
  calm: { bpm: 96, root: 60, scale: PENTA, wave: 'sine', leadGain: 0.05,
    lead: [0, _, _, 2, _, _, 4, _, _, 2, _, _, 1, _, _, _, 0, _, _, 2, _, _, 4, _, _, 5, _, _, 4, _, _, _],
    bass: [0, _, _, _, _, _, _, _, 3, _, _, _, _, _, _, _, 1, _, _, _, _, _, _, _, 4, _, _, _, _, _, _, _],
    drums: 'h.......h.......h.......h.......' },
};

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
function degree(t: Track, d: number, octave = 0): number {
  const len = t.scale.length;
  const o = Math.floor(d / len);
  const i = ((d % len) + len) % len;
  return t.root + t.scale[i] + 12 * (o + octave);
}

// ---- engine -----------------------------------------------------------------
class AudioEngine {
  prefs: AudioPrefs = loadAudioPrefs();
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private noise!: AudioBuffer;
  private want: string | null = null;
  private playing: { name: string; gain: GainNode; step: number; next: number } | null = null;
  private fading: { gain: GainNode; until: number }[] = [];
  /** Count of effects played (tests read it; there is no audible output in CI). */
  played: Record<string, number> = {};
  listeners = new Set<() => void>();

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = () => { this.unlock(); };
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
  }

  get started(): boolean { return !!this.ctx; }
  get currentTrack(): string | null { return this.playing?.name ?? this.want; }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try { this.ctx = new AC(); } catch { return; }
    const c = this.ctx;
    this.master = c.createGain();
    this.musicBus = c.createGain();
    this.sfxBus = c.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(c.destination);
    const n = c.sampleRate;
    this.noise = c.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < n; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = (s / 2147483648) - 1; }
    this.applyPrefs();
    window.setInterval(() => this.schedule(), 25);
    if (this.want) { const w = this.want; this.want = null; this.music(w); }
  }

  setPrefs(p: Partial<AudioPrefs>) {
    this.prefs = { ...this.prefs, ...p };
    saveAudioPrefs(this.prefs);
    this.applyPrefs();
    for (const l of this.listeners) l();
  }

  toggleMute(): boolean { this.setPrefs({ muted: !this.prefs.muted }); return this.prefs.muted; }

  private applyPrefs() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.prefs.muted ? 0 : this.prefs.master, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.prefs.music, t, 0.03);
    this.sfxBus.gain.setTargetAtTime(this.prefs.sfx, t, 0.03);
  }

  /** Switch background music with a 1.5 s crossfade. null stops it. */
  music(name: string | null) {
    if (!this.ctx) { this.want = name; return; }
    if (this.playing?.name === name) return;
    const c = this.ctx;
    const now = c.currentTime;
    if (this.playing) {
      const g = this.playing.gain;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + 1.5);
      this.fading.push({ gain: g, until: now + 1.6 });
      this.playing = null;
    }
    if (!name || !TRACKS[name]) return;
    const gain = c.createGain();
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + 1.5);
    gain.connect(this.musicBus);
    this.playing = { name, gain, step: 0, next: now + 0.05 };
  }

  private schedule() {
    const c = this.ctx;
    if (!c) return;
    for (const f of this.fading) if (c.currentTime > f.until) f.gain.disconnect();
    this.fading = this.fading.filter((f) => c.currentTime <= f.until);
    const p = this.playing;
    if (!p) return;
    const tr = TRACKS[p.name];
    const stepDur = 60 / tr.bpm / 4;
    // Keep ~120 ms scheduled ahead so timer jitter never causes gaps.
    while (p.next < c.currentTime + 0.12) {
      this.playStep(tr, p.step, p.next, stepDur, p.gain);
      p.step++;
      p.next += stepDur;
    }
  }

  private playStep(tr: Track, step: number, at: number, dur: number, out: GainNode) {
    const lead = tr.lead[step % tr.lead.length];
    const bass = tr.bass[step % tr.bass.length];
    const drum = tr.drums[step % tr.drums.length];
    if (lead !== null && lead !== undefined) this.tone(midi(degree(tr, lead, 1)), at, dur * 1.8, tr.wave, tr.leadGain, out);
    if (bass !== null && bass !== undefined) this.tone(midi(degree(tr, bass, -1)), at, dur * 1.6, 'triangle', 0.09, out);
    if (drum === 'k') this.kick(at, out);
    else if (drum === 's') this.hit(at, 0.12, 1800, 0.06, out);
    else if (drum === 'h') this.hit(at, 0.03, 7000, 0.02, out);
  }

  private tone(freq: number, at: number, dur: number, wave: OscillatorType, gain: number, out: AudioNode, slideTo?: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = wave;
    o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), at + dur);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(gain, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(out);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  private hit(at: number, dur: number, freq: number, gain: number, out: AudioNode, type: BiquadFilterType = 'highpass') {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    s.connect(f).connect(g).connect(out);
    s.start(at, Math.random() * 0.5);
    s.stop(at + dur + 0.02);
  }

  private kick(at: number, out: AudioNode) { this.tone(140, at, 0.16, 'sine', 0.22, out, 45); }

  /**
   * One-shot effect. pan -1..1 (left..right), gain 0..1 scales loudness (the
   * caller passes distance falloff for positional sounds), rate shifts pitch.
   */
  sfx(name: string, opts: { pan?: number; gain?: number; rate?: number } = {}) {
    this.played[name] = (this.played[name] ?? 0) + 1;
    const c = this.ctx;
    if (!c || this.prefs.muted) return;
    const vol = opts.gain ?? 1;
    if (vol < 0.02) return;
    const r = opts.rate ?? 1;
    const at = c.currentTime + 0.005;
    const g = c.createGain();
    g.gain.value = vol;
    let out: AudioNode = g;
    if (opts.pan && typeof c.createStereoPanner === 'function') {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, opts.pan));
      g.connect(p);
      out = p;
    }
    out.connect(this.sfxBus);
    const recipe = SFX[name] ?? SFX.ui;
    recipe(this, at, g, r);
    window.setTimeout(() => { try { out.disconnect(); g.disconnect(); } catch { /* gone */ } }, 3000);
  }

  // Recipes call these; kept public on the instance for the table below.
  _tone = (f: number, at: number, d: number, w: OscillatorType, gain: number, out: AudioNode, slide?: number) => this.tone(f, at, d, w, gain, out, slide);
  _noise = (at: number, d: number, f: number, gain: number, out: AudioNode, type: BiquadFilterType = 'highpass') => this.hit(at, d, f, gain, out, type);
}

type Recipe = (a: AudioEngine, at: number, out: AudioNode, rate: number) => void;
const SFX: Record<string, Recipe> = {
  ui: (a, at, o, r) => a._tone(880 * r, at, 0.06, 'square', 0.08, o),
  confirm: (a, at, o, r) => { a._tone(660 * r, at, 0.07, 'square', 0.08, o); a._tone(990 * r, at + 0.07, 0.1, 'square', 0.08, o); },
  back: (a, at, o, r) => a._tone(520 * r, at, 0.08, 'square', 0.07, o, 330 * r),
  step: (a, at, o, r) => a._noise(at, 0.05, 900 * r, 0.12, o, 'lowpass'),
  door: (a, at, o) => { a._noise(at, 0.35, 600, 0.12, o, 'bandpass'); a._tone(90, at, 0.15, 'sine', 0.1, o, 60); },
  lift: (a, at, o) => { a._tone(1046, at, 0.5, 'sine', 0.12, o); a._tone(784, at + 0.25, 0.7, 'sine', 0.12, o); },
  coffee: (a, at, o) => { a._noise(at, 1.2, 3000, 0.08, o, 'bandpass'); a._tone(120, at, 0.6, 'sawtooth', 0.03, o, 90); },
  pour: (a, at, o, r) => a._noise(at, 0.25, 1200 * r, 0.08, o, 'bandpass'),
  ball: (a, at, o, r) => a._tone(1800 * r, at, 0.04, 'sine', 0.2, o, 1200 * r),
  clack: (a, at, o, r) => { a._noise(at, 0.03, 4000 * r, 0.25, o); a._tone(2400 * r, at, 0.03, 'triangle', 0.1, o); },
  pocket: (a, at, o) => { a._tone(300, at, 0.18, 'sine', 0.16, o, 120); a._noise(at, 0.1, 500, 0.08, o, 'lowpass'); },
  thud: (a, at, o, r) => a._tone(110 * r, at, 0.18, 'sine', 0.3, o, 50),
  whoosh: (a, at, o, r) => a._noise(at, 0.22, 1500 * r, 0.12, o, 'bandpass'),
  hit: (a, at, o, r) => { a._noise(at, 0.08, 1200 * r, 0.3, o, 'lowpass'); a._tone(180 * r, at, 0.1, 'square', 0.12, o, 70); },
  block: (a, at, o) => { a._tone(400, at, 0.06, 'square', 0.1, o); a._noise(at, 0.05, 3000, 0.08, o); },
  swat: (a, at, o) => { a._noise(at, 0.12, 2200, 0.35, o, 'bandpass'); a._tone(260, at, 0.12, 'triangle', 0.1, o, 140); },
  boing: (a, at, o) => a._tone(220, at, 0.4, 'sine', 0.2, o, 660),
  jump: (a, at, o, r) => a._tone(300 * r, at, 0.16, 'square', 0.08, o, 700 * r),
  coin: (a, at, o, r) => { a._tone(988 * r, at, 0.06, 'square', 0.08, o); a._tone(1319 * r, at + 0.06, 0.16, 'square', 0.08, o); },
  power: (a, at, o) => { for (let i = 0; i < 4; i++) a._tone(440 * Math.pow(1.26, i), at + i * 0.06, 0.08, 'square', 0.07, o); },
  hurt: (a, at, o) => a._tone(400, at, 0.25, 'sawtooth', 0.1, o, 90),
  explode: (a, at, o) => { a._noise(at, 0.6, 400, 0.4, o, 'lowpass'); a._tone(80, at, 0.4, 'sine', 0.25, o, 30); },
  fuse: (a, at, o) => a._noise(at, 0.08, 6000, 0.05, o),
  engine: (a, at, o, r) => a._tone(70 * r, at, 0.12, 'sawtooth', 0.05, o, 75 * r),
  turbo: (a, at, o) => { a._noise(at, 0.5, 2500, 0.12, o, 'bandpass'); a._tone(200, at, 0.5, 'sawtooth', 0.06, o, 600); },
  crash: (a, at, o) => { a._noise(at, 0.3, 900, 0.3, o, 'lowpass'); a._noise(at, 0.2, 5000, 0.08, o); },
  click: (a, at, o, r) => a._noise(at, 0.02, 5000 * r, 0.2, o),
  rotate: (a, at, o, r) => a._tone(600 * r, at, 0.05, 'triangle', 0.08, o, 800 * r),
  connect: (a, at, o) => { a._tone(523, at, 0.08, 'square', 0.07, o); a._tone(784, at + 0.08, 0.14, 'square', 0.07, o); },
  beep: (a, at, o, r) => a._tone(1200 * r, at, 0.08, 'square', 0.06, o),
  alarm: (a, at, o) => { a._tone(880, at, 0.18, 'square', 0.07, o); a._tone(660, at + 0.2, 0.18, 'square', 0.07, o); },
  page: (a, at, o) => a._noise(at, 0.2, 2500, 0.08, o, 'bandpass'),
  right: (a, at, o) => { a._tone(784, at, 0.1, 'triangle', 0.12, o); a._tone(1175, at + 0.1, 0.22, 'triangle', 0.12, o); },
  wrong: (a, at, o) => a._tone(220, at, 0.3, 'square', 0.08, o, 150),
  breath: (a, at, o, r) => a._noise(at, 0.3, 700 * r, 0.06, o, 'bandpass'),
  clank: (a, at, o, r) => { a._tone(320 * r, at, 0.25, 'triangle', 0.12, o, 300 * r); a._noise(at, 0.06, 3000, 0.1, o); },
  tick: (a, at, o) => a._tone(2000, at, 0.02, 'square', 0.05, o),
  win: (a, at, o) => { [523, 659, 784, 1047].forEach((f, i) => a._tone(f, at + i * 0.1, 0.25, 'square', 0.07, o)); },
  lose: (a, at, o) => { [392, 330, 262].forEach((f, i) => a._tone(f, at + i * 0.15, 0.3, 'triangle', 0.1, o)); },
  start: (a, at, o) => { a._tone(440, at, 0.12, 'square', 0.07, o); a._tone(440, at + 0.3, 0.12, 'square', 0.07, o); a._tone(880, at + 0.6, 0.3, 'square', 0.08, o); },
  pop: (a, at, o, r) => a._tone(500 * r, at, 0.06, 'sine', 0.15, o, 1000 * r),
  stamp: (a, at, o) => { a._tone(150, at, 0.08, 'square', 0.12, o, 90); a._noise(at, 0.05, 800, 0.1, o, 'lowpass'); },
};

export const SFX_NAMES = Object.keys(SFX);

export const audio = new AudioEngine();

// Sound for the 3D office and the mini games, synthesised with the Web Audio
// API at runtime. No audio files ship: every effect is a short recipe and every
// music track is a sectioned song (songs.ts) played by small synth instruments,
// so the download stays at a few kB and there is no third-party licence to
// track (PRD v2.0 REQ-AUDIO-06).
//
// Browsers block audio until the user interacts, so the context is created on
// the first key or pointer press (index.ts builds it inside the gesture and
// hands it over). Before that, sfx() calls are dropped and music() is
// remembered.
//
// Music graph:
//   instrument bus (level, pan) -> track dry gain ----------------> mix
//                               \-> send -> track wet gain -> reverb -> mix
//   mix -> compressor -> music volume -> master -> speakers
// Plucked, mallet, bass and drum sounds are rendered once into small
// AudioBuffers (Karplus-Strong guitar, modal marimba and kalimba, drum
// recipes) and replayed with one buffer source per note, which keeps the node
// count per step low. Flute, ocarina, chip lead and the string pad are live
// oscillators. Every voice disconnects itself when it ends.

import { loadAudioPrefs, saveAudioPrefs, type AudioPrefs } from './prefs';
import { SONGS, compileSong, wrapStep, type CompiledSong, type Inst, type NoteEvent } from './songs';
export type { AudioPrefs };
export { SONGS };

/** Track names, kept for callers that list them. */
export const TRACKS = SONGS;

const midiHz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

// ---- per instrument mix ----------------------------------------------------
type Bus = 'lead' | 'guitar' | 'keys' | 'pad' | 'bass' | 'drums' | 'shaker';
const BUS_OF: Record<Inst, Bus> = {
  flute: 'lead', ocarina: 'lead', chip: 'lead', bell: 'lead', marimba: 'keys', kalimba: 'keys', guitar: 'guitar',
  pad: 'pad', bass: 'bass', kick: 'drums', snare: 'drums', rim: 'drums', conga: 'drums', clap: 'drums', hat: 'shaker', shaker: 'shaker',
};
// level, pan, reverb send
const BUS_MIX: Record<Bus, [number, number, number]> = {
  lead: [0.9, 0.08, 0.32],
  guitar: [0.75, -0.22, 0.22],
  keys: [0.8, 0.28, 0.28],
  pad: [0.5, 0, 0.45],
  bass: [0.95, 0, 0.05],
  drums: [0.7, -0.08, 0.12],
  shaker: [0.45, 0.32, 0.15],
};
/** Per instrument loudness inside its bus. */
const INST_GAIN: Partial<Record<Inst, number>> = {
  flute: 0.2, ocarina: 0.2, chip: 0.075, bell: 0.22, marimba: 0.32, kalimba: 0.3, guitar: 0.3,
  pad: 0.045, bass: 0.36, kick: 0.5, snare: 0.28, rim: 0.22, conga: 0.3, clap: 0.26, hat: 0.18, shaker: 0.22,
};
/** How long a plucked or struck sample may ring past its written length (s). */
const RING: Partial<Record<Inst, number>> = { guitar: 1.1, marimba: 0.7, kalimba: 1.2, bell: 1.4, bass: 0.15 };

// ---- sample rendering (plain JS, once per context) ---------------------------
interface Sample { buf: AudioBuffer; hz: number }

function rbjBandpass(x: Float32Array, sr: number, f: number, q: number) {
  const w = (2 * Math.PI * f) / sr, a = Math.sin(w) / (2 * q), c = Math.cos(w);
  const b0 = a, b2 = -a, a0 = 1 + a, a1 = -2 * c, a2 = 1 - a;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const y = (b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x[i]; y2 = y1; y1 = y; x[i] = y;
  }
}

function makeRand(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2147483648 - 1; };
}

/** Pitched one-shots: rendered at a nearby base pitch, replayed with playbackRate. */
function renderPitched(kind: Inst, base: number, sr: number): { data: Float32Array; hz: number } {
  const f = midiHz(base);
  const rnd = makeRand(base * 97 + kind.length);
  if (kind === 'guitar') {
    // Karplus-Strong with a softened (thumb-ish) excitation for a nylon tone.
    const len = Math.floor(sr * 1.5);
    const out = new Float32Array(len);
    const N = Math.max(2, Math.round(sr / f - 0.5));
    const line = new Float32Array(N);
    let prev = 0;
    for (let i = 0; i < N; i++) { prev = prev * 0.55 + rnd() * 0.45; line[i] = prev; }
    // Loss per sample tuned so high strings do not ring much longer than low ones.
    const decay = Math.pow(0.001, 1 / (sr * (f < 200 ? 1.6 : f < 400 ? 1.2 : 0.85)));
    const g = Math.pow(decay, N);
    let idx = 0;
    for (let n = 0; n < len; n++) {
      const a = line[idx], b = line[(idx + 1) % N];
      out[n] = a;
      line[idx] = 0.5 * (a + b) * Math.min(0.9995, g * 1.0);
      idx = (idx + 1) % N;
    }
    // Remove DC, short fade-in so the pluck does not click.
    let m = 0; for (let i = 0; i < len; i++) m += out[i]; m /= len;
    for (let i = 0; i < len; i++) out[i] = (out[i] - m) * Math.min(1, i / 40);
    return { data: out, hz: sr / (N + 0.5) };
  }
  const dur = kind === 'bass' ? 1.6 : kind === 'marimba' ? 1.1 : kind === 'bell' ? 2 : 1.6;
  const len = Math.floor(sr * dur);
  const out = new Float32Array(len);
  // [ratio, amplitude, decay seconds]
  const partials: [number, number, number][] =
    kind === 'marimba' ? [[1, 1, 0.55], [3.93, 0.22, 0.12], [9.2, 0.06, 0.035]]
    : kind === 'kalimba' ? [[1, 1, 0.9], [2.01, 0.08, 0.35], [5.4, 0.2, 0.12], [8.9, 0.06, 0.05]]
    : kind === 'bell' ? [[1, 1, 1.1], [2.76, 0.35, 0.5], [5.4, 0.18, 0.25], [8.93, 0.08, 0.12]]
    : [[1, 1, 0.9], [2, 0.32, 0.35], [3, 0.12, 0.18], [4, 0.04, 0.1]]; // bass
  for (const [r, a, d] of partials) {
    const w = (2 * Math.PI * f * r) / sr;
    if (f * r > sr / 2.2) continue;
    const k = Math.exp(-1 / (d * sr));
    let env = a;
    for (let i = 0; i < len; i++) { out[i] += Math.sin(w * i) * env; env *= k; }
  }
  const atk = Math.floor(sr * (kind === 'bass' ? 0.006 : 0.002));
  for (let i = 0; i < atk; i++) out[i] *= i / atk;
  if (kind === 'marimba' || kind === 'kalimba') {
    // A tiny mallet / tine tick.
    const tick = Math.floor(sr * 0.006);
    for (let i = 0; i < tick; i++) out[i] += rnd() * 0.12 * (1 - i / tick);
  }
  let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < len; i++) out[i] /= peak || 1;
  return { data: out, hz: f };
}

function renderDrum(kind: Inst, sr: number): Float32Array {
  const rnd = makeRand(kind.length * 31 + 7);
  const sec = kind === 'kick' ? 0.35 : kind === 'snare' ? 0.25 : kind === 'conga' ? 0.3 : kind === 'clap' ? 0.25 : kind === 'shaker' ? 0.12 : kind === 'hat' ? 0.06 : 0.08;
  const len = Math.floor(sr * sec);
  const out = new Float32Array(len);
  const env = (i: number, d: number) => Math.exp(-i / (d * sr));
  if (kind === 'kick') {
    let ph = 0;
    for (let i = 0; i < len; i++) { const t = i / sr; const f = 48 + 70 * Math.exp(-t / 0.04); ph += (2 * Math.PI * f) / sr; out[i] = Math.sin(ph) * env(i, 0.12) * Math.min(1, i / 30); }
  } else if (kind === 'conga') {
    let ph = 0;
    for (let i = 0; i < len; i++) { const t = i / sr; const f = 190 + 40 * Math.exp(-t / 0.02); ph += (2 * Math.PI * f) / sr; out[i] = Math.sin(ph) * env(i, 0.09) + rnd() * 0.15 * env(i, 0.006); }
  } else if (kind === 'rim') {
    const n = new Float32Array(len); for (let i = 0; i < len; i++) n[i] = rnd() * env(i, 0.006);
    rbjBandpass(n, sr, 1900, 3);
    for (let i = 0; i < len; i++) out[i] = n[i] * 3 + Math.sin((2 * Math.PI * 1650 * i) / sr) * env(i, 0.012) * 0.5;
  } else if (kind === 'snare') {
    const n = new Float32Array(len); for (let i = 0; i < len; i++) n[i] = rnd() * env(i, 0.06);
    rbjBandpass(n, sr, 3000, 0.7);
    for (let i = 0; i < len; i++) out[i] = n[i] * 1.6 + Math.sin((2 * Math.PI * 185 * i) / sr) * env(i, 0.04) * 0.6;
  } else if (kind === 'clap') {
    const n = new Float32Array(len);
    for (let i = 0; i < len; i++) { const t = i / sr; const burst = [0, 0.011, 0.022].reduce((s, o) => s + (t >= o ? Math.exp(-(t - o) / (o === 0.022 ? 0.06 : 0.006)) : 0), 0); n[i] = rnd() * burst; }
    rbjBandpass(n, sr, 1400, 0.9);
    for (let i = 0; i < len; i++) out[i] = n[i] * 1.8;
  } else {
    // shaker / hat: high noise; the shaker has a short swell.
    const atk = kind === 'shaker' ? 0.018 : 0.001;
    const d = kind === 'shaker' ? 0.035 : 0.014;
    let p = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr; const x = rnd(); const hp = x - p; p = x;
      out[i] = hp * Math.min(1, t / atk) * (t < atk ? 1 : Math.exp(-(t - atk) / d));
    }
    rbjBandpass(out, sr, kind === 'shaker' ? 6500 : 8500, 0.8);
    for (let i = 0; i < len; i++) out[i] *= 2;
  }
  let peak = 0; for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  for (let i = 0; i < len; i++) out[i] /= peak || 1;
  return out;
}

function reverbImpulse(c: BaseAudioContext, seconds = 2.2): AudioBuffer {
  const sr = c.sampleRate;
  const len = Math.floor(sr * seconds);
  const ir = c.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    const rnd = makeRand(17 + ch * 101);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / sr;
      // The tail darkens over time: the one-pole coefficient closes as t grows.
      const a = 0.25 + 0.7 * Math.min(1, t / seconds);
      lp = lp * a + rnd() * (1 - a);
      d[i] = lp * Math.exp(-t / 0.55) * (t < 0.008 ? t / 0.008 : 1);
    }
  }
  return ir;
}

// ---- synth: instruments bound to one context ---------------------------------
class Synth {
  private samples = new Map<string, Sample>();
  private drums = new Map<string, AudioBuffer>();
  private waves = new Map<string, PeriodicWave>();
  noise: AudioBuffer;
  /** Voices alive right now (tests and the leak probe read it). */
  live = 0;

  constructor(readonly c: BaseAudioContext) {
    const n = c.sampleRate;
    this.noise = c.createBuffer(1, n, n);
    const d = this.noise.getChannelData(0);
    const r = makeRand(12345);
    for (let i = 0; i < n; i++) d[i] = r();
  }

  private sample(kind: Inst, midi: number): Sample {
    const base = Math.round(midi / 4) * 4; // one rendered sample covers +-2 semitones
    const key = `${kind}:${base}`;
    let s = this.samples.get(key);
    if (!s) {
      const { data, hz } = renderPitched(kind, base, this.c.sampleRate);
      const buf = this.c.createBuffer(1, data.length, this.c.sampleRate);
      buf.getChannelData(0).set(data);
      s = { buf, hz };
      this.samples.set(key, s);
    }
    return s;
  }

  private drum(kind: Inst): AudioBuffer {
    let b = this.drums.get(kind);
    if (!b) {
      const data = renderDrum(kind, this.c.sampleRate);
      b = this.c.createBuffer(1, data.length, this.c.sampleRate);
      b.getChannelData(0).set(data);
      this.drums.set(kind, b);
    }
    return b;
  }

  private wave(kind: 'flute' | 'ocarina'): PeriodicWave {
    let w = this.waves.get(kind);
    if (!w) {
      const h = kind === 'flute' ? [0, 1, 0.32, 0.12, 0.05, 0.02] : [0, 1, 0.08, 0.03];
      w = this.c.createPeriodicWave(new Float32Array(h), new Float32Array(h.length));
      this.waves.set(kind, w);
    }
    return w;
  }

  /** Disconnect every node once the last source ends. */
  private track(src: AudioScheduledSourceNode, nodes: AudioNode[]) {
    this.live++;
    src.onended = () => { this.live--; for (const n of nodes) { try { n.disconnect(); } catch { /* gone */ } } };
  }

  /** Warm up the sample cache so the first bar does not render on the audio clock. */
  prepare(song: CompiledSong) {
    const seen = new Set<string>();
    for (const step of song.steps) for (const e of step) {
      const k = `${e.inst}:${Math.round(e.midi / 4)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      if (BUS_OF[e.inst] === 'drums' || BUS_OF[e.inst] === 'shaker') this.drum(e.inst);
      else if (e.inst === 'guitar' || e.inst === 'marimba' || e.inst === 'kalimba' || e.inst === 'bell' || e.inst === 'bass') this.sample(e.inst, e.midi);
    }
  }

  play(e: NoteEvent, at: number, stepDur: number, out: AudioNode) {
    const vel = e.vel * (INST_GAIN[e.inst] ?? 0.2);
    const len = e.dur * stepDur;
    switch (e.inst) {
      case 'flute': case 'ocarina': return this.wind(e.inst, e.midi, at, len, vel, out);
      case 'chip': return this.chip(e.midi, at, len, vel, out);
      case 'pad': return this.pad(e.notes ?? [e.midi], at, len, vel, out);
      case 'guitar': case 'marimba': case 'kalimba': case 'bell': case 'bass': {
        const s = this.sample(e.inst, e.midi);
        const rate = midiHz(e.midi) / s.hz;
        const ring = Math.max(len, RING[e.inst] ?? 0.5);
        return this.buffer(s.buf, rate, at, Math.min(ring, s.buf.duration / rate), vel, out, e.inst === 'bass' ? len : ring);
      }
      default: {
        const b = this.drum(e.inst);
        return this.buffer(b, 1, at, b.duration, vel, out, b.duration);
      }
    }
  }

  private buffer(buf: AudioBuffer, rate: number, at: number, stopAfter: number, vel: number, out: AudioNode, releaseAt: number) {
    const c = this.c;
    const src = c.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate;
    const g = c.createGain();
    g.gain.setValueAtTime(vel, at);
    const rel = at + Math.min(stopAfter, releaseAt);
    g.gain.setTargetAtTime(0, rel, 0.06);
    src.connect(g).connect(out);
    src.start(at);
    src.stop(Math.min(at + stopAfter, rel + 0.3) + 0.01);
    this.track(src, [src, g]);
  }

  /** Flute / ocarina: harmonic wave, delayed vibrato, breathy onset. */
  private wind(kind: 'flute' | 'ocarina', midi: number, at: number, len: number, vel: number, out: AudioNode) {
    const c = this.c;
    const f = midiHz(midi);
    const hold = Math.max(0.12, len * 0.94);
    const osc = c.createOscillator();
    osc.setPeriodicWave(this.wave(kind));
    // Tiny scoop up into the note, like a player's breath settling.
    osc.frequency.setValueAtTime(f * 0.985, at);
    osc.frequency.exponentialRampToValueAtTime(f, at + 0.05);
    const lfo = c.createOscillator();
    lfo.frequency.value = kind === 'flute' ? 5.3 : 4.8;
    const depth = c.createGain();
    depth.gain.setValueAtTime(0, at);
    depth.gain.setValueAtTime(0, at + Math.min(0.25, hold * 0.4));
    depth.gain.linearRampToValueAtTime(f * (kind === 'flute' ? 0.006 : 0.004), at + Math.min(0.6, hold));
    lfo.connect(depth).connect(osc.frequency);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vel, at + 0.035);
    g.gain.setTargetAtTime(vel * 0.82, at + 0.04, 0.15);
    g.gain.setValueAtTime(vel * 0.82, at + hold);
    g.gain.setTargetAtTime(0, at + hold, 0.05);
    osc.connect(g).connect(out);
    // Breath: band-passed noise, a puff at the start and a little under the tone.
    const nz = c.createBufferSource();
    nz.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = Math.min(9000, f * 2.2);
    bp.Q.value = 1.2;
    const ng = c.createGain();
    const breath = kind === 'flute' ? 0.22 : 0.12;
    ng.gain.setValueAtTime(0, at);
    ng.gain.linearRampToValueAtTime(vel * breath, at + 0.02);
    ng.gain.setTargetAtTime(vel * breath * 0.25, at + 0.03, 0.06);
    ng.gain.setTargetAtTime(0, at + hold, 0.05);
    nz.connect(bp).connect(ng).connect(out);
    const end = at + hold + 0.3;
    osc.start(at); lfo.start(at); nz.start(at, (midi * 0.037) % 0.5);
    osc.stop(end); lfo.stop(end); nz.stop(end);
    this.track(osc, [osc, lfo, depth, g, nz, bp, ng]);
  }

  /** Soft square lead for the mini games, low-passed so it is not harsh. */
  private chip(midi: number, at: number, len: number, vel: number, out: AudioNode) {
    const c = this.c;
    const f = midiHz(midi);
    const hold = Math.max(0.06, len * 0.85);
    const osc = c.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(f, at);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(Math.min(8000, f * 6), at);
    lp.frequency.setTargetAtTime(Math.min(5000, f * 3), at + 0.01, 0.08);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vel, at + 0.006);
    g.gain.setTargetAtTime(vel * 0.7, at + 0.01, 0.1);
    g.gain.setTargetAtTime(0, at + hold, 0.03);
    osc.connect(lp).connect(g).connect(out);
    osc.start(at);
    osc.stop(at + hold + 0.2);
    this.track(osc, [osc, lp, g]);
  }

  /** String pad: two detuned saws per note into one gentle low-pass. */
  private pad(notes: number[], at: number, len: number, vel: number, out: AudioNode) {
    const c = this.c;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(700, at);
    lp.frequency.linearRampToValueAtTime(1300, at + Math.min(1.2, len * 0.5));
    lp.frequency.linearRampToValueAtTime(900, at + len);
    const g = c.createGain();
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vel, at + Math.min(0.5, len * 0.3));
    g.gain.setValueAtTime(vel, at + len);
    g.gain.setTargetAtTime(0, at + len, 0.25);
    lp.connect(g).connect(out);
    const end = at + len + 1.2;
    const nodes: AudioNode[] = [lp, g];
    let last: OscillatorNode | null = null;
    for (const n of notes) for (const det of [-8, 8]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = midiHz(n);
      o.detune.value = det;
      o.connect(lp);
      o.start(at);
      o.stop(end);
      nodes.push(o);
      last = o;
    }
    if (last) this.track(last, nodes);
  }
}

// ---- one playing song ------------------------------------------------------------
class TrackPlayer {
  readonly dry: GainNode;
  readonly wet: GainNode;
  private buses = new Map<Bus, GainNode>();
  private extra: AudioNode[] = [];
  step = 0;
  next: number;
  readonly stepDur: number;

  constructor(readonly name: string, readonly song: CompiledSong, private synth: Synth, mix: AudioNode, reverb: AudioNode, startAt: number, fadeIn: number) {
    const c = synth.c;
    this.stepDur = 60 / song.song.bpm / 4;
    this.dry = c.createGain();
    this.wet = c.createGain();
    for (const g of [this.dry, this.wet]) {
      g.gain.setValueAtTime(0, startAt);
      g.gain.linearRampToValueAtTime(1, startAt + fadeIn);
    }
    this.dry.connect(mix);
    this.wet.connect(reverb);
    for (const [bus, [level, pan, send]] of Object.entries(BUS_MIX) as [Bus, [number, number, number]][]) {
      const g = c.createGain();
      g.gain.value = level;
      let tail: AudioNode = g;
      if (typeof c.createStereoPanner === 'function') {
        const p = c.createStereoPanner();
        p.pan.value = pan;
        g.connect(p);
        tail = p;
        this.extra.push(p);
      }
      tail.connect(this.dry);
      const s = c.createGain();
      s.gain.value = send;
      tail.connect(s).connect(this.wet);
      this.extra.push(s);
      this.buses.set(bus, g);
    }
    this.next = startAt;
    synth.prepare(song);
  }

  /** Schedule every step that starts before `until`. Skips ahead after a stall. */
  scheduleUntil(now: number, until: number) {
    if (this.next < now - 0.1) {
      // The tab was throttled: do not dump the missed notes all at once.
      const miss = Math.ceil((now - this.next) / this.stepDur);
      this.step += miss;
      this.next += miss * this.stepDur;
    }
    const swing = this.song.song.swing * this.stepDur;
    const pastoral = this.song.song.swing > 0;
    while (this.next < until) {
      const s = wrapStep(this.song, this.step);
      const base = this.next + (s % 4 === 2 ? swing : 0);
      for (const e of this.song.steps[s]) {
        // A few milliseconds of human looseness on the acoustic songs.
        const human = pastoral && e.inst !== 'pad' ? ((e.step * 7919 + e.midi * 31) % 9 - 4) * 0.0015 : 0;
        this.synth.play(e, Math.max(base + (e.off ?? 0) + human, this.next), this.stepDur, this.buses.get(BUS_OF[e.inst])!);
      }
      this.step++;
      this.next += this.stepDur;
    }
  }

  fadeOut(now: number, dur: number) {
    for (const g of [this.dry, this.wet]) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0, now + dur);
    }
  }

  dispose() {
    for (const n of [this.dry, this.wet, ...this.buses.values(), ...this.extra]) { try { n.disconnect(); } catch { /* gone */ } }
  }
}

const compiled = new Map<string, CompiledSong>();
export function compiledSong(name: string): CompiledSong | null {
  if (!SONGS[name]) return null;
  let c = compiled.get(name);
  if (!c) { c = compileSong(SONGS[name]); compiled.set(name, c); }
  return c;
}

/** Shared music chain: mix bus, reverb, compressor. Used live and offline. */
function musicChain(c: BaseAudioContext, out: AudioNode) {
  const mix = c.createGain();
  const verb = c.createConvolver();
  verb.buffer = reverbImpulse(c);
  const verbIn = c.createGain();
  verbIn.gain.value = 1;
  verbIn.connect(verb).connect(mix);
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -20;
  comp.knee.value = 12;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.3;
  const makeup = c.createGain();
  makeup.gain.value = 1.1;
  mix.connect(comp).connect(makeup).connect(out);
  return { mix, verbIn };
}

const FADE = 1.5;
const LOOKAHEAD = 0.2;

// ---- engine -----------------------------------------------------------------
class AudioEngine {
  prefs: AudioPrefs = loadAudioPrefs();
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private mix!: GainNode;
  private verbIn!: GainNode;
  private synth!: Synth;
  private noise!: AudioBuffer;
  private want: string | null = null;
  private playing: TrackPlayer | null = null;
  private fading: { p: TrackPlayer; until: number }[] = [];
  /** Count of effects played (tests read it; there is no audible output in CI). */
  played: Record<string, number> = {};
  listeners = new Set<() => void>();

  constructor() {
    if (typeof window === 'undefined') return;
    const unlock = () => { this.unlock(); };
    for (const ev of ['pointerdown', 'keydown', 'touchend', 'click']) window.addEventListener(ev, unlock, { capture: true });
    // Coming back to the tab: make sure a suspended context runs again.
    document.addEventListener('visibilitychange', () => { if (!document.hidden && this.ctx?.state === 'suspended') void this.ctx.resume(); });
  }

  get started(): boolean { return !!this.ctx; }
  get currentTrack(): string | null { return this.playing?.name ?? this.want; }
  /** Diagnostics for tests and the browser probe. */
  get stats() { return { state: this.ctx?.state ?? 'none', voices: this.synth?.live ?? 0, fading: this.fading.length }; }

  /** Create (or adopt) the AudioContext. index.ts passes one built inside the user gesture. */
  unlock(given?: AudioContext | null) {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    let c = given ?? null;
    if (!c) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      try { c = new AC(); } catch { return; }
    }
    this.ctx = c;
    if (c.state === 'suspended') void c.resume();
    this.master = c.createGain();
    this.musicBus = c.createGain();
    this.sfxBus = c.createGain();
    this.musicBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.master.connect(c.destination);
    const chain = musicChain(c, this.musicBus);
    this.mix = chain.mix;
    this.verbIn = chain.verbIn;
    this.synth = new Synth(c);
    this.noise = this.synth.noise;
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
      this.playing.fadeOut(now, FADE);
      this.fading.push({ p: this.playing, until: now + FADE + 2.5 });
      this.playing = null;
    }
    const song = name ? compiledSong(name) : null;
    if (!name || !song) return;
    this.playing = new TrackPlayer(name, song, this.synth, this.mix, this.verbIn, now + 0.05, FADE);
    this.schedule();
  }

  private schedule() {
    const c = this.ctx;
    if (!c) return;
    const now = c.currentTime;
    for (const f of this.fading) {
      if (now > f.until) f.p.dispose();
      else if (now < f.until - 2.5) f.p.scheduleUntil(now, now + LOOKAHEAD); // keep playing while it fades
    }
    this.fading = this.fading.filter((f) => now <= f.until);
    this.playing?.scheduleUntil(now, now + LOOKAHEAD);
  }

  /**
   * Render a song offline (no speakers) for previews and loudness checks.
   * Uses the same instruments, mix, reverb, compressor and default volumes.
   */
  async renderOffline(name: string, seconds: number, sampleRate = 44100): Promise<AudioBuffer> {
    const song = compiledSong(name);
    if (!song) throw new Error(`unknown track ${name}`);
    const c = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
    const master = c.createGain();
    master.gain.value = this.prefs.master;
    const musicBus = c.createGain();
    musicBus.gain.value = this.prefs.music;
    musicBus.connect(master).connect(c.destination);
    const chain = musicChain(c, musicBus);
    const synth = new Synth(c);
    const p = new TrackPlayer(name, song, synth, chain.mix, chain.verbIn, 0.05, 0.3);
    p.scheduleUntil(0, seconds);
    return c.startRendering();
  }

  // ---- effects ----
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
    o.onended = () => { o.disconnect(); g.disconnect(); };
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
    s.onended = () => { s.disconnect(); f.disconnect(); g.disconnect(); };
    s.start(at, Math.random() * 0.5);
    s.stop(at + dur + 0.02);
  }

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

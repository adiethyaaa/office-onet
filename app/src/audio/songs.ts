// Background music as data: every song is written in C (major or A minor),
// then transposed by `key`. A song has named sections (intro, A, B, A2...) of
// whole 4/4 bars on a 16th-note grid. Each bar carries a chord symbol and an
// optional melody bar; accompaniment (guitar picking, marimba, kalimba, pad,
// bass, hand percussion) is generated from the chords by short patterns, so a
// 90 second song stays a few lines of text. All melodies here are original.
//
// This file is pure (no Web Audio) so the unit tests can check every song.

export type LeadKind = 'flute' | 'ocarina' | 'chip' | 'marimba' | 'kalimba' | 'guitar' | 'bell';
export type PercKind = 'shaker' | 'rim' | 'kick' | 'conga' | 'snare' | 'hat' | 'clap';
export type Inst = LeadKind | 'pad' | 'bass' | PercKind;

export interface SectionDef {
  /** Bars separated by '|'. Two chords in one bar split it in halves: 'F G'. */
  chords: string;
  /** Bars separated by '|', 8 or 16 tokens per bar: note (E5, F#4, Bb3), '-' hold, '.' rest. */
  mel?: string;
  /**
   * Which parts play: m melody, g guitar, r marimba comp, k kalimba sparkle,
   * p pad, b bass, d full percussion, s light percussion.
   */
  parts: string;
  lead?: LeadKind;
}

export interface Song {
  bpm: number;
  /** Semitones added to every note (song text is written in C). */
  key: number;
  /** 0..0.5: how late the off-beat 8th lands, as a fraction of a 16th. */
  swing: number;
  lead: LeadKind;
  /**
   * Comp patterns, 16 chars per bar. Guitar/marimba/kalimba: B bass string,
   * F fifth below, 0-3 chord tone, S full strum, u light up-strum, '.' rest.
   * Bass: R root, F fifth, O octave, A approach to the next chord, '-' hold.
   */
  guitar: string;
  marimba: string;
  kalimba: string;
  bass: string;
  /** Percussion: per instrument 16 chars, x strong, o soft, '.' rest. */
  perc: Partial<Record<PercKind, string>>;
  light: Partial<Record<PercKind, string>>;
  sections: Record<string, SectionDef>;
  order: string[];
  /** Index into order where the loop restarts (skips the intro). */
  loop: number;
}

export interface NoteEvent {
  step: number;
  inst: Inst;
  midi: number;
  /** Length in 16th steps. */
  dur: number;
  vel: number;
  /** Extra delay in seconds (strums). */
  off?: number;
  /** Pad chords carry all their notes in one event. */
  notes?: number[];
}

export interface CompiledSong {
  song: Song;
  steps: NoteEvent[][];
  loopStart: number;
  total: number;
  sections: { name: string; start: number; bars: number }[];
}

// ---- parsing ---------------------------------------------------------------
const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C5' -> 72, 'F#4' -> 66, 'Bb3' -> 58. */
export function noteToMidi(s: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(s);
  if (!m) throw new Error(`bad note ${s}`);
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0;
  return (Number(m[3]) + 1) * 12 + PC[m[1]] + acc;
}

const QUALITY: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
  sus4: [0, 5, 7], sus2: [0, 2, 7], add9: [0, 4, 7, 14], '6': [0, 4, 7, 9], dim: [0, 3, 6], m6: [0, 3, 7, 9],
};

export interface Chord { root: number; bass: number; tones: number[] }

/** 'Am7' -> root 9, intervals; 'G/B' -> bass 11. Pitch classes 0..11. */
export function parseChord(s: string): Chord {
  const m = /^([A-G])([#b]?)([a-z0-9]*)(?:\/([A-G])([#b]?))?$/.exec(s);
  if (!m || !(m[3] in QUALITY)) throw new Error(`bad chord ${s}`);
  const acc = (a: string) => (a === '#' ? 1 : a === 'b' ? -1 : 0);
  const root = (PC[m[1]] + acc(m[2]) + 12) % 12;
  const bass = m[4] ? (PC[m[4]] + acc(m[5]) + 12) % 12 : root;
  return { root, bass, tones: QUALITY[m[3]] };
}

/** Pitch class placed in [lo, lo + 12). */
const place = (pc: number, lo: number) => lo + ((((pc - lo) % 12) + 12) % 12);

/** Close voicing between G3 and F#4 (C-notation), low to high. */
export function voicing(c: Chord): number[] {
  return [...new Set(c.tones.map((i) => place(c.root + i, 55)))].sort((a, b) => a - b);
}

const WHITE = [0, 2, 4, 5, 7, 9, 11];
/** Diatonic note just below the next root (bass walk-ups). */
function approach(nextRoot: number): number {
  for (let d = 1; d <= 2; d++) if (WHITE.includes((nextRoot - d + 12) % 12)) return (nextRoot - d + 12) % 12;
  return (nextRoot + 11) % 12;
}

// ---- compiler --------------------------------------------------------------
const STEPS_PER_BAR = 16;

function expand16(p: string): string {
  if (p.length === 16) return p;
  if (p.length === 8) return [...p].map((c) => c + (c === '-' ? '-' : '.')).join('');
  throw new Error(`pattern must be 8 or 16 chars: ${p}`);
}

export function compileSong(song: Song): CompiledSong {
  const out: NoteEvent[] = [];
  const sections: CompiledSong['sections'] = [];
  let bar0 = 0;
  let loopStart = 0;
  const T = song.key;
  const push = (e: NoteEvent) => out.push({ ...e, midi: e.midi + T, notes: e.notes?.map((n) => n + T) });

  song.order.forEach((name, oi) => {
    const sec = song.sections[name];
    if (!sec) throw new Error(`missing section ${name}`);
    if (oi === song.loop) loopStart = bar0 * STEPS_PER_BAR;
    const bars = sec.chords.split('|').map((b) => b.trim().split(/\s+/).map(parseChord));
    const has = (p: string) => sec.parts.includes(p);
    // Chord sounding at a step within a bar, and the one after the bar.
    const chordAt = (bi: number, s: number) => { const b = bars[bi]; return b[Math.min(b.length - 1, Math.floor(s / (16 / b.length)))]; };
    const nextChord = (bi: number, s: number) => {
      const b = bars[bi];
      const idx = Math.floor(s / (16 / b.length));
      if (idx + 1 < b.length) return b[idx + 1];
      return bars[(bi + 1) % bars.length][0];
    };

    // Melody.
    if (sec.mel && has('m')) {
      const mbars = sec.mel.split('|').map((b) => b.trim().split(/\s+/));
      if (mbars.length !== bars.length) throw new Error(`${name}: ${mbars.length} melody bars vs ${bars.length} chord bars`);
      const lead = sec.lead ?? song.lead;
      const flat: { step: number; tok: string }[] = [];
      mbars.forEach((toks, bi) => {
        if (toks.length !== 8 && toks.length !== 16) throw new Error(`${name} bar ${bi + 1}: ${toks.length} tokens`);
        const per = 16 / toks.length;
        toks.forEach((tok, ti) => flat.push({ step: (bar0 + bi) * 16 + ti * per, tok }));
      });
      flat.forEach((f, i) => {
        if (f.tok === '-' || f.tok === '.') return;
        let j = i + 1;
        while (j < flat.length && flat[j].tok === '-') j++;
        const end = j < flat.length ? flat[j].step : (bar0 + bars.length) * 16;
        push({ step: f.step, inst: lead, midi: noteToMidi(f.tok), dur: end - f.step, vel: f.step % 8 === 0 ? 1 : 0.85 });
      });
    }

    bars.forEach((_, bi) => {
      const base = (bar0 + bi) * 16;
      const comp = (pat: string, inst: Inst, shift: number, vel: number) => {
        const p = expand16(pat);
        for (let s = 0; s < 16; s++) {
          const ch = p[s];
          if (ch === '.' || ch === '-') continue;
          const c = chordAt(bi, s);
          const v = voicing(c).map((n) => n + shift);
          const low = place(c.bass, 40) + shift;
          const step = base + s;
          let len = 1;
          while (s + len < 16 && p[s + len] === '.') len++;
          const dur = Math.max(2, len);
          const vv = vel * (s % 4 === 0 ? 1 : 0.8);
          if (ch === 'B') push({ step, inst, midi: low, dur, vel: vv });
          else if (ch === 'F') push({ step, inst, midi: place(c.root + 7, 43) + shift, dur, vel: vv * 0.9 });
          else if (ch === 'S' || ch === 'u') {
            const notes = ch === 'S' ? [low, ...v] : v.slice(-3);
            const order = ch === 'S' ? notes : [...notes].reverse();
            order.forEach((n, k) => push({ step, inst, midi: n, dur, vel: vv * (ch === 'S' ? 0.75 : 0.5), off: k * 0.014 }));
          } else if (/[0-3]/.test(ch)) {
            const k = Number(ch);
            const n = k < v.length ? v[k] : v[k % v.length] + 12;
            push({ step, inst, midi: n, dur, vel: vv });
          }
        }
      };
      if (has('g')) comp(song.guitar, 'guitar', 0, 0.9);
      if (has('r')) comp(song.marimba, 'marimba', 12, 0.8);
      if (has('k')) comp(song.kalimba, 'kalimba', 12, 0.7);

      if (has('p')) {
        const b = bars[bi];
        b.forEach((c, k) => {
          const len = 16 / b.length;
          push({ step: base + k * len, inst: 'pad', midi: voicing(c)[0], dur: len, vel: 1, notes: voicing(c) });
        });
      }

      if (has('b')) {
        const p = expand16(song.bass);
        for (let s = 0; s < 16; s++) {
          const ch = p[s];
          if (!'RFOA'.includes(ch)) continue;
          const c = chordAt(bi, s);
          const root = place(c.bass, 40);
          let midi = root;
          if (ch === 'F') midi = place(c.root + 7, 40);
          else if (ch === 'O') midi = root + 12;
          else if (ch === 'A') midi = place(approach(nextChord(bi, s).bass), 40);
          let len = 1;
          while (s + len < 16 && p[s + len] === '-') len++;
          push({ step: base + s, inst: 'bass', midi, dur: Math.max(1, len), vel: s % 8 === 0 ? 1 : 0.85 });
        }
      }

      const percSet = has('d') ? song.perc : has('s') ? song.light : null;
      if (percSet) {
        for (const [inst, pat] of Object.entries(percSet) as [PercKind, string][]) {
          const p = expand16(pat);
          for (let s = 0; s < 16; s++) {
            if (p[s] === 'x' || p[s] === 'o') push({ step: base + s, inst, midi: 60, dur: 1, vel: p[s] === 'x' ? 1 : 0.55 });
          }
        }
      }
    });

    sections.push({ name, start: bar0 * 16, bars: bars.length });
    bar0 += bars.length;
  });

  const total = bar0 * STEPS_PER_BAR;
  const steps: NoteEvent[][] = Array.from({ length: total }, () => []);
  for (const e of out) steps[e.step].push(e);
  return { song, steps, loopStart, total, sections };
}

/** Step index after looping: plays the intro once, then cycles from loopStart. */
export function wrapStep(c: CompiledSong, step: number): number {
  if (step < c.total) return step;
  const span = c.total - c.loopStart;
  return c.loopStart + ((step - c.loopStart) % span);
}

// ---- the songs -------------------------------------------------------------
// Pastoral family (office, lobby, lounge, cafe, calm, gym): nylon guitar
// picking, flute or ocarina lead, marimba and kalimba answers, soft string pad,
// warm bass and hand percussion. Mini game songs keep their energy but use the
// same instrument set plus a soft chip lead and a light drum kit.

const PASTORAL_PERC = { shaker: 'o.x.o.x.o.x.o.x.', rim: '....x.......x...', kick: 'x.......o.......', conga: '......o.....o.o.' };
const PASTORAL_LIGHT = { shaker: 'o...o.x.o...o.x.' };
const KIT = { kick: 'x.......x.......', snare: '....x.......x...', hat: 'o.x.o.x.o.x.o.x.' };

export const SONGS: Record<string, Song> = {
  // Main theme: a sunny morning at the office. D major, light swing.
  office: {
    bpm: 95, key: 2, swing: 0.3, lead: 'flute',
    guitar: 'B.2.1.2.F.2.1.2.', marimba: '....1.2.....0.2.', kalimba: '..........2.1.0.', bass: 'R...F...R...F.A.',
    perc: PASTORAL_PERC, light: PASTORAL_LIGHT,
    sections: {
      intro: { chords: 'C|Am|F|G', mel: '. . . . . . . .|. . . . . . . .|. . . . . . . .|. . . . G4 - C5 D5', parts: 'gksm' },
      A: { chords: 'C|Am|F|G|C|Am|Dm7|G7', parts: 'mgbs',
        mel: 'E5 - G5 E5 D5 - C5 .|A4 - C5 - E5 - . .|F5 - A5 F5 E5 - C5 .|D5 - - . G4 A4 B4 .|C5 - E5 G5 C6 - B5 A5|G5 - E5 - C5 - . A4|F5 - E5 - D5 - C5 D5|B4 - - - G4 - . .' },
      B: { chords: 'F|G|Em|Am|F|G|Dm7|G7', parts: 'mgrpbd',
        mel: 'A5 - - G5 F5 - C5 -|D5 - G5 - B5 - A5 G5|G5 - - E5 B4 - E5 -|C5 - E5 - A5 - - .|F5 - A5 - C6 - A5 -|B5 - - A5 G5 - D5 -|F5 - E5 - D5 - C5 -|D5 - - - . G4 A4 B4' },
      A2: { chords: 'C|Am|F|G|F|G|C|C', parts: 'mgkpbd',
        mel: 'E5 - G5 E5 D5 - C5 .|A4 - C5 - E5 - . .|F5 - A5 F5 E5 - C5 .|D5 - - . G4 A4 B4 .|A5 - G5 F5 E5 - D5 -|G5 - F5 E5 D5 - B4 -|C5 - - - E5 - G5 -|C6 - - - - - . .' },
      Abr: { chords: 'C|Am|F|G|C|Am|Dm7|G7', parts: 'mgbs', lead: 'marimba',
        mel: 'E5 - G5 E5 D5 - C5 .|A4 - C5 - E5 - . .|F5 - A5 F5 E5 - C5 .|D5 - - . G4 A4 B4 .|C5 - E5 G5 C6 - B5 A5|G5 - E5 - C5 - . A4|F5 - E5 - D5 - C5 D5|B4 - - - G4 - . .' },
    },
    order: ['intro', 'A', 'B', 'A2', 'Abr'], loop: 1,
  },
  // Lobby: the welcome tune, ocarina over strummed guitar. G major.
  lobby: {
    bpm: 92, key: -5, swing: 0.25, lead: 'ocarina',
    guitar: 'B.S.u.S.F.S.u.S.', marimba: '..1...2...1...0.', kalimba: '0...........2...', bass: 'R.....F.R.....A.',
    perc: PASTORAL_PERC, light: PASTORAL_LIGHT,
    sections: {
      intro: { chords: 'C|F', parts: 'gks' },
      A: { chords: 'C|Em|F|C|Am|Dm7|G|G7', parts: 'mgbs',
        mel: 'G5 - E5 - C5 - D5 E5|B4 - - G4 - . . .|A4 - C5 - F5 - E5 D5|E5 - - - . . . .|C5 - A4 - C5 - E5 -|F5 - E5 D5 C5 - A4 -|B4 - D5 - G5 - F5 -|D5 - - - . . . .' },
      B: { chords: 'F|G|Em|Am|Dm7|G|C|C', parts: 'mgrpbd',
        mel: 'A4 - C5 - F5 - - E5|D5 - B4 - G4 - - .|E5 - G5 - B5 - A5 G5|A5 - - - E5 - C5 -|D5 - F5 - A5 - G5 F5|E5 - D5 - B4 - G4 -|C5 - - - - - . .|. . . . . . . .' },
    },
    order: ['intro', 'A', 'B'], loop: 1,
  },
  // Floor 2 default: relaxed jazz-folk, marimba then flute. A major.
  lounge: {
    bpm: 100, key: -3, swing: 0.35, lead: 'marimba',
    guitar: 'S..u..S.u.S..u..', marimba: '..0.1...2...1...', kalimba: '..............2.', bass: 'R...F...R...A...',
    perc: PASTORAL_PERC, light: PASTORAL_LIGHT,
    sections: {
      intro: { chords: 'Fmaj7|Em7|Dm7|G7', parts: 'gpb' },
      A: { chords: 'Fmaj7|Em7|Dm7|G7|Fmaj7|Em7|Am7|D7', parts: 'mgbs',
        mel: 'E5 - . C5 D5 - E5 -|G5 - - D5 B4 - . .|C5 - D5 - F5 - A5 -|G5 - F5 - D5 - B4 -|A5 - - G5 E5 - C5 -|D5 - E5 - G5 - - .|C5 - E5 - G5 A5 - G5|F#5 - - - D5 - . .' },
      B: { chords: 'Dm7|G7|Cmaj7|Am7|Dm7|G7|C|C', parts: 'mgkpbd', lead: 'flute',
        mel: 'F5 - A5 - C6 - A5 F5|D5 - F5 - B5 - A5 -|G5 - - - E5 - B4 -|C5 - E5 - A5 - G5 -|F5 - E5 F5 A5 - F5 -|G5 - F5 - D5 - B4 G4|C5 - - - . . . .|. . E5 - D5 - C5 .' },
    },
    order: ['intro', 'A', 'B'], loop: 1,
  },
  // Pantry and dining: cozy kalimba with a borrowed minor chord. D major.
  cafe: {
    bpm: 88, key: 2, swing: 0.35, lead: 'kalimba',
    guitar: 'B.2.1.2.F.2.1.2.', marimba: '....0.1.....2...', kalimba: '..2...1...2...0.', bass: 'R.....F.R.....A.',
    perc: { shaker: 'o.x.o.x.o.x.o.x.', rim: '........x.......', conga: '....o.o.....o...' }, light: PASTORAL_LIGHT,
    sections: {
      intro: { chords: 'C|Fm', parts: 'gps' },
      A: { chords: 'C|Cmaj7|F|Fm|C|A7|Dm7|G7', parts: 'mgbs',
        mel: 'G5 - E5 - . C5 E5 G5|B5 - - A5 G5 - . .|A5 - F5 - . C5 F5 A5|Ab5 - - G5 F5 - . .|E5 - G5 - C6 - B5 -|A5 - G5 - E5 - C#5 -|D5 - F5 - A5 - G5 F5|D5 - - - . . . .' },
      B: { chords: 'Am|Em|F|C|Dm7|G|C|G7', parts: 'mgrpbd', lead: 'flute',
        mel: 'C5 - E5 A5 - G5 E5 -|G5 - - - B4 - . .|A4 - C5 F5 - E5 C5 -|E5 - - - G4 - . .|F5 - - E5 D5 - A4 -|B4 - D5 - G5 - F5 -|E5 - - - C5 - - -|. . . . . . . .' },
    },
    order: ['intro', 'A', 'B'], loop: 1,
  },
  // Reading room, garden, balcony: slow, airy, almost no percussion. Bb major.
  calm: {
    bpm: 72, key: -2, swing: 0, lead: 'flute',
    guitar: 'B...2.1.F...2.1.', marimba: '................', kalimba: '........2...1...', bass: 'R-------F-------',
    perc: PASTORAL_LIGHT, light: { shaker: '........o.......' },
    sections: {
      intro: { chords: 'C|G/B', parts: 'gp' },
      A: { chords: 'C|G/B|Am|Em/G|F|C/E|Dm7|Gsus4 G', parts: 'mgpbs',
        mel: 'E5 - - - D5 - C5 -|D5 - - - - - . .|C5 - - - E5 - A5 -|G5 - - - - - . .|A5 - - - G5 - F5 -|E5 - - - C5 - . .|F5 - - - E5 - D5 -|D5 - - - - - . .' },
      B: { chords: 'F|G|Em|Am|F|G|C|C', parts: 'mgkpb',
        mel: 'C6 - - - A5 - - -|B5 - - - G5 - - -|G5 - - - E5 - - -|A5 - - - - - . .|F5 - - - A5 - - -|G5 - - - D5 - - -|E5 - - - - - - -|. . . . . . . .' },
    },
    order: ['intro', 'A', 'B'], loop: 1,
  },
  // Gym: bright folk stomp, still acoustic. E major.
  gym: {
    bpm: 118, key: 4, swing: 0.1, lead: 'ocarina',
    guitar: 'S.uS.uS.S.uS.uS.', marimba: '0.1.2.1.0.1.2.1.', kalimba: '................', bass: 'R...F...R...F...',
    perc: { kick: 'x...x...x...x...', clap: '....x.......x...', shaker: 'x.o.x.o.x.o.x.o.' }, light: { shaker: 'x.o.x.o.x.o.x.o.', kick: 'x.......x.......' },
    sections: {
      A: { chords: 'C|F|C|G|C|F|G|C', parts: 'mgbs',
        mel: 'C5 C5 E5 G5 - E5 G5 -|A5 - G5 - F5 - E5 -|G5 - E5 - C5 - E5 G5|D5 - - - G4 - B4 D5|C5 C5 E5 G5 - E5 G5 -|A5 - C6 - A5 - F5 -|G5 - F5 - D5 - B4 -|C5 - - - . . . .' },
      B: { chords: 'Am|F|C|G|Am|F|G|G7', parts: 'mgrpbd',
        mel: 'E5 - A5 - - G5 E5 -|F5 - A5 - C6 - A5 -|G5 - E5 - C5 - E5 -|D5 - - - B4 - - .|E5 - A5 - - G5 E5 -|F5 - A5 - C6 - A5 -|B5 - - A5 G5 - - -|D5 - E5 - F5 - G5 -' },
    },
    order: ['A', 'B'], loop: 0,
  },

  // ---- mini games ----
  arcade: {
    bpm: 132, key: 0, swing: 0, lead: 'chip',
    guitar: 'S.u.S.u.S.u.S.u.', marimba: '0.1.2.1.0.1.2.1.', kalimba: '................', bass: 'R.R.R.R.R.R.F.O.',
    perc: { ...KIT, kick: 'x.....x.x.......', hat: 'x.x.x.x.x.x.x.xx' }, light: KIT,
    sections: {
      A: { chords: 'Am|F|G|E7', parts: 'mrbd',
        mel: 'A4 C5 E5 A5 - G5 E5 C5|F5 - E5 - C5 - A4 -|D5 - G5 - B5 - G5 D5|E5 - G#5 - B5 - G#5 E5' },
      B: { chords: 'Dm|Am|F|E', parts: 'mgbd',
        mel: 'F5 - E5 D5 - C5 D5 -|E5 - C5 - A4 - - .|A5 - G5 F5 - E5 C5 -|B4 - - - G#4 - B4 -' },
    },
    order: ['A', 'B'], loop: 0,
  },
  race: {
    bpm: 150, key: 5, swing: 0, lead: 'chip',
    guitar: 'S.uS.uS.S.uS.uS.', marimba: '0.1.2.1.0.1.2.1.', kalimba: '................', bass: 'R.O.R.O.R.O.R.O.',
    perc: { kick: 'x...x...x...x...', snare: '....x.......x...', hat: '..x...x...x...x.' }, light: KIT,
    sections: {
      A: { chords: 'Am|G|F|E', parts: 'mgbd',
        mel: 'A4 - A4 C5 E5 - C5 -|G4 - G4 B4 D5 - B4 -|F4 - A4 C5 F5 - E5 -|E5 - D5 - C5 - B4 -' },
      B: { chords: 'F|G|Am|Am', parts: 'mrbd',
        mel: 'C5 - F5 - A5 - G5 F5|D5 - G5 - B5 - A5 G5|A5 - E5 - C5 - E5 -|A5 - - - . . A4 B4' },
    },
    order: ['A', 'B'], loop: 0,
  },
  fight: {
    bpm: 140, key: 0, swing: 0, lead: 'chip',
    guitar: 'S..S..S.S..S....', marimba: '0.1.2.1.0.1.2.1.', kalimba: '................', bass: 'R.RR.R.RR.R.F.O.',
    perc: { kick: 'x..x..x.x..x....', snare: '....x.......x..x', hat: 'x.x.x.x.x.x.x.x.' }, light: KIT,
    sections: {
      A: { chords: 'Am|Am|F|G', parts: 'mgbd',
        mel: 'A4 - . A4 C5 - D5 -|E5 - D5 C5 D5 - . .|F5 - E5 D5 C5 - A4 -|B4 - C5 - D5 - B4 -' },
      B: { chords: 'Am|G|F|E7', parts: 'mrbd',
        mel: 'E5 - - A5 G5 - E5 -|D5 - - G5 F5 - D5 -|C5 - F5 - A5 - C6 -|B5 - G#5 - E5 - . .' },
    },
    order: ['A', 'B'], loop: 0,
  },
  platform: {
    bpm: 126, key: 0, swing: 0.15, lead: 'chip',
    guitar: 'B.u.F.u.B.u.F.u.', marimba: '0.1.2.1.0.1.2.1.', kalimba: '..........2.1.0.', bass: 'R...O...F...O...',
    perc: { kick: 'x.......x.......', snare: '....x.......x...', hat: '..x...x...x...x.' }, light: KIT,
    sections: {
      A: { chords: 'C|F|G|C', parts: 'mgbd',
        mel: 'E5 G5 - E5 C5 - G4 -|A4 - C5 - F5 - A5 -|G5 - F5 E5 D5 - B4 -|C5 - E5 - C5 - . .' },
      B: { chords: 'Am|Dm|G|G7', parts: 'mrkbd',
        mel: 'A5 - E5 - C5 - E5 A5|F5 - D5 - A4 - D5 F5|G5 - D5 - B4 - G5 -|F5 - E5 - D5 - . .' },
    },
    order: ['A', 'B'], loop: 0,
  },
  puzzle: {
    bpm: 108, key: 5, swing: 0.2, lead: 'marimba',
    guitar: 'B.2.1.2.F.2.1.2.', marimba: '................', kalimba: '..2...1...2...0.', bass: 'R.......F.......',
    perc: PASTORAL_LIGHT, light: PASTORAL_LIGHT,
    sections: {
      A: { chords: 'C|Am|Dm7|G', parts: 'mgpbs',
        mel: 'C5 - G5 - E5 - D5 C5|A4 - E5 - C5 - B4 A4|D5 - A5 - F5 - E5 D5|B4 - G5 - D5 - . .' },
      B: { chords: 'F|Em|Dm7|G7', parts: 'mgkbs',
        mel: 'A5 - G5 F5 E5 - C5 -|G5 - F5 E5 B4 - G4 -|F5 - E5 D5 A4 - C5 -|D5 - - - G4 - . .' },
    },
    order: ['A', 'B'], loop: 0,
  },
  bomb: {
    bpm: 138, key: 2, swing: 0, lead: 'chip',
    guitar: 'S.uS.uS.S.uS.uS.', marimba: '0.1.2.1.0.1.2.1.', kalimba: '................', bass: 'R.O.F.O.R.O.F.O.',
    perc: { kick: 'x...x...x...x...', clap: '....x.......x...', hat: '..x...x...x...x.' }, light: KIT,
    sections: {
      A: { chords: 'C|G|Am|F', parts: 'mrbd',
        mel: 'C5 E5 G5 - E5 - C5 -|B4 D5 G5 - D5 - B4 -|C5 E5 A5 - E5 - C5 -|A4 C5 F5 - A5 - F5 -' },
      B: { chords: 'C|G|F|G', parts: 'mgbd',
        mel: 'G5 - E5 - G5 - C6 -|B5 - G5 - D5 - G5 -|A5 - F5 - C5 - A4 -|B4 - D5 - G5 - - .' },
    },
    order: ['A', 'B'], loop: 0,
  },
};

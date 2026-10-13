import { describe, expect, it } from 'vitest';
import { SONGS, compileSong, noteToMidi, parseChord, voicing, wrapStep } from '../../src/audio/songs';
import { trackForRoom } from '../../src/audio/rooms';
import { loadAudioPrefs } from '../../src/audio/prefs';

const SRC = import.meta.glob('../../src/audio/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
const readSrc = (f: string) => SRC[`../../src/audio/${f}`];

const PASTORAL = ['office', 'lobby', 'lounge', 'cafe', 'calm', 'gym'];
const GAMES = ['arcade', 'race', 'fight', 'platform', 'puzzle', 'bomb'];

describe('audio: song data', () => {
  it('parses notes and chords', () => {
    expect(noteToMidi('C4')).toBe(60);
    expect(noteToMidi('F#4')).toBe(66);
    expect(noteToMidi('Bb3')).toBe(58);
    expect(parseChord('Am7')).toEqual({ root: 9, bass: 9, tones: [0, 3, 7, 10] });
    expect(parseChord('G/B').bass).toBe(11);
    expect(voicing(parseChord('C'))).toEqual([55, 60, 64]);
    expect(() => parseChord('Hx')).toThrow();
  });

  it('every track the game asks for exists and compiles', () => {
    for (const n of [...PASTORAL, ...GAMES]) expect(SONGS[n], n).toBeTruthy();
    for (const n of ['office', 'lounge']) expect(SONGS[trackForRoom(null, n === 'office' ? 'L1' : 'L2')]).toBeTruthy();
    for (const [name, s] of Object.entries(SONGS)) {
      const c = compileSong(s);
      expect(c.total % 16, name).toBe(0);
      expect(c.loopStart, name).toBeLessThan(c.total);
      expect(c.steps.flat().length, name).toBeGreaterThan(0);
    }
  });

  it('pastoral songs are real songs: sections, 64+ step loop, chord changes, acoustic band', () => {
    for (const n of PASTORAL) {
      const s = SONGS[n];
      const c = compileSong(s);
      expect(c.sections.length, n).toBeGreaterThanOrEqual(2);
      expect(c.total - c.loopStart, n).toBeGreaterThanOrEqual(128);
      const chords = new Set(Object.values(s.sections).flatMap((x) => x.chords.split(/[|\s]+/)));
      expect(chords.size, n).toBeGreaterThanOrEqual(5);
      const insts = new Set(c.steps.flat().map((e) => e.inst));
      for (const i of ['guitar', 'bass', 'pad']) expect(insts.has(i as never), `${n} ${i}`).toBe(true);
      expect(['flute', 'ocarina', 'marimba', 'kalimba'].some((i) => insts.has(i as never)), n).toBe(true);
      expect(s.bpm, n).toBeGreaterThanOrEqual(70);
      expect(s.bpm, n).toBeLessThanOrEqual(120);
    }
    expect(SONGS.office.bpm).toBe(95);
    expect(SONGS.office.order).toEqual(['intro', 'A', 'B', 'A2', 'Abr']);
  });

  it('melodies sit on the harmony: most downbeat notes are chord tones', () => {
    for (const [name, s] of Object.entries(SONGS)) {
      const c = compileSong(s);
      let on = 0, all = 0;
      for (const sec of c.sections) {
        const def = s.sections[sec.name];
        const bars = def.chords.split('|').map((b) => b.trim().split(/\s+/).map(parseChord));
        for (let i = sec.start; i < sec.start + sec.bars * 16; i += 8) {
          const lead = c.steps[i].find((e) => ['flute', 'ocarina', 'chip', 'marimba', 'kalimba'].includes(e.inst) && e.dur >= 2 && (e.vel === 1));
          if (!lead) continue;
          const b = bars[Math.floor((i - sec.start) / 16)];
          const ch = b[Math.min(b.length - 1, Math.floor(((i - sec.start) % 16) / (16 / b.length)))];
          const pc = (((lead.midi - s.key) % 12) + 12) % 12;
          all++;
          if (ch.tones.some((t) => (ch.root + t) % 12 === pc)) on++;
        }
      }
      if (all) expect(on / all, name).toBeGreaterThanOrEqual(0.6);
    }
  });

  it('notes stay in a comfortable range and polyphony per step is bounded', () => {
    for (const [name, s] of Object.entries(SONGS)) {
      const c = compileSong(s);
      for (const step of c.steps) {
        expect(step.length, name).toBeLessThanOrEqual(14);
        for (const e of step) {
          expect(e.midi, `${name} ${e.inst}`).toBeGreaterThanOrEqual(28);
          expect(e.midi, `${name} ${e.inst}`).toBeLessThanOrEqual(100);
          expect(e.dur, name).toBeGreaterThan(0);
        }
      }
    }
  });

  it('loops skip the intro', () => {
    const c = compileSong(SONGS.office);
    expect(c.loopStart).toBe(4 * 16);
    expect(wrapStep(c, c.total)).toBe(c.loopStart);
    expect(wrapStep(c, c.total + 5)).toBe(c.loopStart + 5);
    expect(wrapStep(c, 10)).toBe(10);
  });

  it('rejects melody bars that do not match the chords', () => {
    const bad = { ...SONGS.calm, sections: { A: { chords: 'C|F', mel: 'C5 - - - - - - -', parts: 'm' } }, order: ['A'], loop: 0 };
    expect(() => compileSong(bad)).toThrow(/melody bars/);
  });
});

describe('audio: defaults and source hygiene', () => {
  it('default music volume is audible but sits under the effects', () => {
    const p = loadAudioPrefs();
    expect(p.music).toBeGreaterThanOrEqual(0.5);
    expect(p.music).toBeLessThan(p.sfx);
  });

  it('audio sources use plain hyphens, no em or en dashes', () => {
    for (const f of ['audio.ts', 'songs.ts', 'index.ts', 'prefs.ts', 'rooms.ts']) {
      const src = readSrc(f);
      expect(src, f).toBeTruthy();
      expect(/[\u2013\u2014]/.test(src), f).toBe(false);
    }
  });

  it('engine voices clean up after themselves', () => {
    const src = readSrc('audio.ts');
    expect(src).toMatch(/onended = \(\) => \{ this\.live--/);
    expect(src).toMatch(/dispose\(\)/);
    expect(src).not.toMatch(/https?:\/\/[^\s'"]+\.(mp3|ogg|wav)/);
  });
});

// Volume and mute, stored apart from the engine so Settings can show them
// without loading the synthesiser.
export interface AudioPrefs { master: number; music: number; sfx: number; muted: boolean }
const KEY = 'kantor-rpg.audio.v1';
const DEFAULTS: AudioPrefs = { master: 0.8, music: 0.5, sfx: 0.8, muted: false };

export function loadAudioPrefs(): AudioPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AudioPrefs> | null;
    if (!v) return { ...DEFAULTS };
    const n = (x: unknown, d: number) => (typeof x === 'number' && x >= 0 && x <= 1 ? x : d);
    return { master: n(v.master, DEFAULTS.master), music: n(v.music, DEFAULTS.music), sfx: n(v.sfx, DEFAULTS.sfx), muted: v.muted === true };
  } catch { return { ...DEFAULTS }; }
}

export function saveAudioPrefs(p: AudioPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage blocked */ }
}

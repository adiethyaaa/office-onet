// UI language. Indonesian is the source language: every UI string in the code
// is written in Indonesian and passed through t(). For English, the dictionary
// in ./en/ maps that Indonesian text to English. It is loaded as its own chunk
// before boot, so Indonesian visitors download nothing extra.
//
// Picking the language: ?lang=en|id in the URL, then the saved choice, then the
// browser language (any "id" locale gives Indonesian, everything else English).
// Switching reloads the page so every label, 3D sign and dialog is rebuilt.

export type Lang = 'id' | 'en';
export type WorldText = { floors: { name: string }[]; rooms: { name: string; function?: string }[]; actors?: { role?: string }[]; verticalLinks?: { prompt?: string }[]; catalog?: Record<string, { label?: string }> };

const KEY = 'kantor-rpg.lang';

export function detectLang(search = location.search, nav: readonly string[] = navigator.languages ?? [navigator.language]): Lang {
  const q = new URLSearchParams(search).get('lang');
  if (q === 'id' || q === 'en') return q;
  let s: string | null = null;
  try { s = localStorage.getItem(KEY); } catch { /* storage blocked */ }
  if (s === 'id' || s === 'en') return s;
  const l = (nav.find(Boolean) ?? 'id').toLowerCase();
  return l.startsWith('id') || l.startsWith('ms') ? 'id' : 'en';
}

export let lang: Lang = 'id';
let dict: Record<string, string> = {};

/** Locale for dates and numbers. */
export const locale = () => (lang === 'en' ? 'en-GB' : 'id-ID');

/** Translate an Indonesian UI string. {name} placeholders are filled from vars. */
export function t(id: string, vars?: Record<string, string | number>): string {
  const s = dict[id] ?? id;
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Load the dictionary for the detected language. Call once before boot. */
export async function initLang(forced?: Lang, world?: WorldText): Promise<Lang> {
  lang = forced ?? detectLang();
  document.documentElement.lang = lang;
  if (lang === 'en') {
    try {
      const m = await import('./en');
      dict = m.EN;
      m.translateDom(document.body, dict);
      document.title = t(document.title);
      if (world) m.translateWorld(world, t);
    } catch {
      // Dictionary chunk failed to load: run in Indonesian rather than not at all.
      lang = 'id';
      dict = {};
      document.documentElement.lang = lang;
    }
  }
  return lang;
}

export function setLang(l: Lang) {
  const u = new URL(location.href);
  u.searchParams.delete('lang');
  // Storage blocked: carry the choice in the URL instead.
  try { localStorage.setItem(KEY, l); } catch { u.searchParams.set('lang', l); }
  location.replace(u.toString());
}

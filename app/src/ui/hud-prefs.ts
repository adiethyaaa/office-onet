import { t } from '../i18n';

/** HUD layout choices that survive a reload: phone menu folded, minimap folded. */
export type HudPrefs = { menu: 'open' | 'closed'; map: 'open' | 'closed' };

const KEY = 'kantor-rpg.hud';
const DEFAULTS: HudPrefs = { menu: 'open', map: 'open' };

export function loadHudPrefs(): HudPrefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<HudPrefs>;
    return {
      menu: raw.menu === 'closed' ? 'closed' : 'open',
      map: raw.map === 'closed' ? 'closed' : 'open',
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveHudPrefs(patch: Partial<HudPrefs>) {
  const next = { ...loadHudPrefs(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* storage blocked: the choice lasts for this page only */ }
}

/** Wire the phone menu toggle. The toggle is only visible below 600 px. */
export function initHudMenu() {
  const hud = document.querySelector<HTMLElement>('.hud-top');
  const btn = document.getElementById('btn-hud-toggle');
  const label = document.getElementById('hud-toggle-label');
  if (!hud || !btn || !label) return;
  const apply = (state: HudPrefs['menu']) => {
    hud.dataset.menu = state;
    btn.setAttribute('aria-expanded', String(state === 'open'));
    label.textContent = state === 'open' ? t('Sembunyikan menu') : t('Tampilkan menu');
  };
  apply(loadHudPrefs().menu);
  // Icon-only layouts (phones, 600-959 px) hide the label visually: a title
  // keeps it discoverable on hover.
  for (const b of document.querySelectorAll<HTMLElement>('#hud-menu .btn')) {
    const l = b.querySelector('.lbl')?.textContent?.trim();
    if (l && !b.title) b.title = l;
  }
  btn.addEventListener('click', () => {
    const next = hud.dataset.menu === 'closed' ? 'open' : 'closed';
    apply(next);
    saveHudPrefs({ menu: next });
  });
}

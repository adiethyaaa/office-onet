// Every mini game, by id. Each entry is a dynamic import, so a game's code is
// downloaded only when someone opens it (PRD v2.0 REQ-ARC-03, REQ-MG-01).
import type { GameModule } from './types';

type Loader = () => Promise<{ default: GameModule }>;

export const GAMES: Record<string, Loader> = {
  // Game Station (L2-GAME), slots 1 to 5
  'balap-drone': () => import('./games/balap-drone'),
  'tarung-kantor': () => import('./games/tarung-kantor'),
  'lompat-lantai': () => import('./games/lompat-lantai'),
  'sambung-kabel': () => import('./games/sambung-kabel'),
  'arena-bom': () => import('./games/arena-bom'),
  // Facilities
  'lari-pagi': () => import('./games/lari-pagi'),
  'angkat-beban': () => import('./games/angkat-beban'),
  'peregangan': () => import('./games/peregangan'),
  'biliar': () => import('./games/biliar'),
  'barista': () => import('./games/barista'),
  'server-down': () => import('./games/server-down'),
  'susun-denah': () => import('./games/susun-denah'),
  'desain-poster': () => import('./games/desain-poster'),
  'kuis-perpustakaan': () => import('./games/kuis-perpustakaan'),
};

/** Game Station cabinet order. null = empty slot ("segera hadir"). */
export const ARCADE_SLOTS: (string | null)[] = ['balap-drone', 'tarung-kantor', 'lompat-lantai', 'sambung-kabel', 'arena-bom', null, null, null, null, null];

/** Launcher card text for the Game Station, kept here so the launcher does not load every game. */
export const ARCADE_INFO: Record<string, { title: string; blurb: string }> = {
  'balap-drone': { title: 'Balap Drone', blurb: 'Balap tampak atas di sirkuit sekitar kantor. 3 putaran.' },
  'tarung-kantor': { title: 'Tarung Kantor', blurb: 'Satu lawan satu dengan karakter tim. Mode arcade.' },
  'lompat-lantai': { title: 'Lompat Lantai', blurb: 'Platformer 2D: kumpulkan dokumen, hindari kabel kusut.' },
  'sambung-kabel': { title: 'Sambung Kabel', blurb: 'Putar ubin, sambungkan OLT ke setiap rumah.' },
  'arena-bom': { title: 'Arena Bom', blurb: 'Pasang bom, buka jalan, kalahkan 3 lawan.' },
};

export { FACILITY_GAMES, FACILITY_TITLE, facilityGame } from './facility';

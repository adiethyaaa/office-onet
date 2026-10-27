// Stand-alone page for one mini game: mg.html?game=<id>&seed=<n>&lang=en.
// Used for development, for E2E tests of each game, and as a direct link.
import '@fontsource/alegreya-sans/400.css';
import '@fontsource/alegreya-sans/700.css';
import './styles.css';
import './minigames/minigames.css';
import { initLang } from './i18n';
import { loadSettings, applyTheme } from './ui/settings';
import { GAMES } from './minigames/registry';

const q = new URLSearchParams(location.search);
const id = q.get('game') ?? 'peregangan';
const seed = Number(q.get('seed') ?? '20261013');
const settings = loadSettings();
applyTheme(settings);

void initLang().then(async () => {
  if (!GAMES[id]) { document.body.textContent = `unknown game ${id}`; return; }
  const { openMiniGame, currentMiniGame } = await import('./minigames/host');
  const open = () => openMiniGame(id, {
    reducedMotion: settings.reducedMotion, padProfile: () => settings.padProfile, playerName: 'Adiethya', seed,
    onClose: () => { document.body.dataset.closed = '1'; },
  });
  open();
  (window as unknown as { __mg: unknown }).__mg = { state: () => currentMiniGame()?.state() ?? null, reopen: open };
});

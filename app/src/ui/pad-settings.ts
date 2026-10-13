// Settings > Controller: picture of a DualSense-style pad with the actions of the
// selected profile, plus what each profile is for. Loaded on demand when Settings
// opens. Body, grips and touchpad outlines come from Leo's controller drawing
// (mockup39, Workstation 3D, 2026-10-11), drawn from code, no brand marks.
// While a pad is connected the pressed buttons and stick positions light up.
import { el } from './dom';
import { t } from '../i18n';
import { PAD_PROFILES, type PadProfileId } from '../input/pad-profiles';

const BODY = 'M110.0 16.7 C139.0 17.6 159.9 12.9 175.0 13.9 C191.2 14.8 199.3 25.2 200.5 36.4 C206.3 62.8 214.4 91.0 206.3 110.7 C198.2 124.8 173.8 125.7 165.7 112.6 C158.7 97.5 155.2 81.6 142.5 76.9 C130.9 73.1 120.4 73.1 110.0 73.1 C99.6 73.1 89.1 73.1 77.5 76.9 C64.8 81.6 61.3 97.5 54.3 112.6 C46.2 125.7 21.8 124.8 13.7 110.7 C5.6 91.0 13.7 62.8 19.5 36.4 C20.7 25.2 28.8 14.8 45.0 13.9 C60.1 12.9 81.0 17.6 110.0 16.7Z';
const WING_R = 'M156.5 14.5 L160.6 14.2 L164.4 13.9 L168.1 13.8 L171.6 13.8 L175.0 13.9 L178.3 14.2 L181.4 14.8 L184.3 15.7 L186.9 16.8 L189.3 18.1 L191.5 19.6 L193.4 21.3 L195.1 23.1 L196.5 25.1 L197.8 27.2 L198.8 29.4 L199.6 31.7 L200.1 34.0 L200.5 36.4 L201.8 42.1 L203.1 47.8 L204.3 53.5 L205.6 59.2 L206.7 64.9 L207.8 70.5 L208.6 76.0 L209.2 81.5 L209.6 86.8 L209.7 91.9 L209.4 96.9 L208.8 101.8 L207.8 106.3 L206.3 110.7 L204.3 113.5 L201.9 115.9 L199.1 117.9 L196.1 119.5 L192.8 120.7 L189.4 121.5 L186.0 121.9 L182.5 121.8 L179.1 121.3 L175.9 120.4 L172.8 119.1 L170.1 117.4 L167.7 115.2 L165.7 112.6 L164.2 109.3 L162.9 106.1 L161.6 102.9 L160.3 99.7 L159.0 96.7 L157.6 93.7 L158.3 86.9 L158.3 79.7 L157.8 71.9 L157.0 63.9 L156.1 55.7 L155.3 47.3 L154.8 38.9 L154.7 30.5 L155.2 22.4Z';
const WING_L = 'M63.5 14.5 L59.4 14.2 L55.6 13.9 L51.9 13.8 L48.4 13.8 L45.0 13.9 L41.7 14.2 L38.6 14.8 L35.7 15.7 L33.1 16.8 L30.7 18.1 L28.5 19.6 L26.6 21.3 L24.9 23.1 L23.5 25.1 L22.2 27.2 L21.2 29.4 L20.4 31.7 L19.9 34.0 L19.5 36.4 L18.2 42.1 L16.9 47.8 L15.7 53.5 L14.4 59.2 L13.3 64.9 L12.2 70.5 L11.4 76.0 L10.8 81.5 L10.4 86.8 L10.3 91.9 L10.6 96.9 L11.2 101.8 L12.2 106.3 L13.7 110.7 L15.7 113.5 L18.1 115.9 L20.9 117.9 L23.9 119.5 L27.2 120.7 L30.6 121.5 L34.0 121.9 L37.5 121.8 L40.9 121.3 L44.1 120.4 L47.2 119.1 L49.9 117.4 L52.3 115.2 L54.3 112.6 L55.8 109.3 L57.1 106.1 L58.4 102.9 L59.7 99.7 L61.0 96.7 L62.4 93.7 L61.7 86.9 L61.7 79.7 L62.2 71.9 L63.0 63.9 L63.9 55.7 L64.7 47.3 L65.2 38.9 L65.3 30.5 L64.8 22.4Z';
const TOUCH = 'M77.5 45.5 Q110 49.5 142.5 45.5 L144.8 21.6 Q145 18.6 141.3 18.6 L78.7 18.6 Q75 18.6 75.2 21.6Z';

type Part = 'ls' | 'rs' | 'dpad' | 'cross' | 'circle' | 'square' | 'triangle' | 'l1' | 'r1' | 'create' | 'options';

// Standard-mapping button index for each part that can light up.
const BUTTONS: [Part | `dpad-${'u' | 'd' | 'l' | 'r'}` | 'l2' | 'r2' | 'ps', number][] = [
  ['cross', 0], ['circle', 1], ['square', 2], ['triangle', 3], ['l1', 4], ['r1', 5], ['l2', 6], ['r2', 7],
  ['create', 8], ['options', 9], ['ls', 10], ['rs', 11], ['dpad-u', 12], ['dpad-d', 13], ['dpad-l', 14], ['dpad-r', 15], ['ps', 16],
];

const LS = [82.7, 61.4];
const RS = [137.3, 61.4];

function svg(): string {
  const stickAt = (id: string, [x, y]: number[]) =>
    `<g data-part="${id}"><circle cx="${x}" cy="${y}" r="10.5" fill="#0E0F11"/><g class="pad-knob"><circle cx="${x}" cy="${y}" r="7.4" class="pad-hit" fill="#2B2D32"/><circle cx="${x}" cy="${y}" r="4.4" fill="#232529"/></g></g>`;
  const face = (id: string, x: number, y: number, mark: string) =>
    `<g data-part="${id}"><circle cx="${x}" cy="${y}" r="5.8" class="pad-hit" fill="#2A2D32"/>${mark}</g>`;
  const dp = (id: string, x: number, y: number, w: number, h: number) =>
    `<rect data-part="dpad-${id}" class="pad-hit" x="${x}" y="${y}" width="${w}" height="${h}" rx="1.6" fill="#2A2D32"/>`;
  return `<svg class="pad-svg" viewBox="0 0 220 132" role="img" aria-labelledby="pad-svg-title">
<title id="pad-svg-title">${t('Gambar kontroler gaya DualSense dengan tombol yang dipakai')}</title>
<g data-part="l2"><rect x="30" y="2" width="30" height="12" rx="5" class="pad-hit" fill="#3A3D43"/></g>
<g data-part="r2"><rect x="160" y="2" width="30" height="12" rx="5" class="pad-hit" fill="#3A3D43"/></g>
<g data-part="l1"><rect x="26" y="9" width="38" height="8" rx="4" class="pad-hit" fill="#C9C7C1"/></g>
<g data-part="r1"><rect x="156" y="9" width="38" height="8" rx="4" class="pad-hit" fill="#C9C7C1"/></g>
<path d="${BODY}" fill="#1B1C20" stroke="#34373D" stroke-width="1.5"/>
<path d="${WING_R}" fill="#E9E8E4"/><path d="${WING_L}" fill="#E9E8E4"/>
<path d="${TOUCH}" fill="#F4F3EF" stroke="#C9C7C1" stroke-width="1"/>
<path d="M74 21.5 72.5 44M146 21.5 147.5 44" stroke="#E8925A" stroke-width="2.4" stroke-linecap="round"/>
<g data-part="dpad">
${dp('u', 44.9, 30.2, 6, 7.6)}${dp('d', 44.9, 43.6, 6, 7.6)}${dp('l', 37.4, 37.7, 7.6, 6)}${dp('r', 50.8, 37.7, 7.6, 6)}
</g>
${face('triangle', 172.1, 29.4, '<path d="M172.1 26.4l2.9 4.9h-5.8z" fill="none" stroke="#E9E8E4" stroke-width="1.1"/>')}
${face('square', 158.2, 40.7, '<rect x="155.6" y="38.1" width="5.2" height="5.2" fill="none" stroke="#E9E8E4" stroke-width="1.1"/>')}
${face('circle', 186, 40.7, '<circle cx="186" cy="40.7" r="2.8" fill="none" stroke="#E9E8E4" stroke-width="1.1"/>')}
${face('cross', 172.1, 51.9, '<path d="M170 49.8l4.2 4.2m0-4.2-4.2 4.2" stroke="#E9E8E4" stroke-width="1.1"/>')}
${stickAt('ls', LS)}${stickAt('rs', RS)}
<g data-part="create"><rect x="66.5" y="14.5" width="3.6" height="7" rx="1.8" class="pad-hit" fill="#3A3D43"/></g>
<g data-part="options"><rect x="149.9" y="14.5" width="3.6" height="7" rx="1.8" class="pad-hit" fill="#3A3D43"/></g>
<g data-part="ps"><circle cx="110" cy="64" r="4.5" class="pad-hit" fill="#2A2D32"/></g>
</svg>`;
}

interface Row { part: Part; label: string; action: string }

function rows(id: PadProfileId): Row[] {
  const p = PAD_PROFILES[id];
  const walk = p.autoRun ? t('Berjalan (dorong penuh untuk lari)') : t('Berjalan (dorong penuh tidak lari)');
  const look = t('Memutar dan memiringkan kamera');
  return [
    { part: 'ls', label: t('Stik kiri'), action: `${p.swapSticks ? look : walk}. ${t('Tekan: lari nyala/mati')}` },
    { part: 'rs', label: t('Stik kanan'), action: `${p.swapSticks ? walk : look}. ${t('Tekan: luruskan kamera')}` },
    { part: 'cross', label: t('Silang (A)'), action: t('Interaksi, di menu: pilih') },
    { part: 'circle', label: t('Lingkaran (B)'), action: t('Kembali, di menu: tutup') },
    { part: 'square', label: t('Kotak (X)'), action: t('Lari nyala/mati') },
    { part: 'triangle', label: t('Segitiga (Y)'), action: t('Luruskan kamera') },
    { part: 'l1', label: 'L1', action: t('Kamera menjauh') },
    { part: 'r1', label: 'R1', action: t('Kamera mendekat') },
    { part: 'dpad', label: t('D-pad'), action: t('Pindah tombol di menu dan HUD') },
    { part: 'create', label: t('Create (Select)'), action: t('Peta lantai') },
    { part: 'options', label: t('Options (Start)'), action: t('Pengaturan') },
  ];
}

// Literal t() calls so the i18n test checks every line has an English entry.
function info(id: PadProfileId): { who: string; note: string } {
  if (id === 'kidal') return {
    who: t('Stik ditukar: stik kanan berjalan, stik kiri kamera. Untuk pemain kidal atau yang lebih nyaman mengarahkan kamera dengan tangan kiri.'),
    note: t('Tombol lain tetap. Di dalam dialog, stik kanan yang ikut memindah fokus.'),
  };
  if (id === 'santai') return {
    who: t('Kamera lebih pelan dan zona mati lebih lebar. Untuk yang mudah pusing dengan kamera cepat, atau stik lama yang sedikit miring sendiri.'),
    note: t('Dorong penuh tidak otomatis lari. Lari dengan Kotak (X) atau tekan stik kiri.'),
  };
  return {
    who: t('Tata letak bawaan untuk kebanyakan pemain: stik kiri berjalan, stik kanan kamera.'),
    note: t('Sama dengan daftar tombol di dialog Kontrol.'),
  };
}

const pct = (n: number) => `${Math.round(n * 100)}%`;

export class PadSettings {
  private root: HTMLElement;
  private raf = 0;
  private profile: PadProfileId;

  constructor(host: HTMLElement, profile: PadProfileId) {
    this.profile = profile;
    host.replaceChildren();
    this.root = el('div', { class: 'pad-settings' });
    host.append(this.root);
    this.render();
  }

  setProfile(id: PadProfileId) {
    if (id === this.profile) return;
    this.profile = id;
    this.render();
  }

  private render() {
    const id = this.profile;
    const p = PAD_PROFILES[id];
    const base = PAD_PROFILES.standar;
    const about0 = info(id);
    this.root.innerHTML = '';
    const fig = el('div', { class: 'pad-figure' });
    fig.innerHTML = svg();
    const status = el('p', { class: 'muted small pad-status', role: 'status', 'aria-live': 'polite' });
    const about = el('div', { class: 'pad-about' });
    about.append(el('p', {}, about0.who));
    const facts = el('dl', { class: 'pad-facts' });
    const fact = (k: string, v: string) => { facts.append(el('dt', {}, k), el('dd', {}, v)); };
    fact(t('Berjalan'), p.swapSticks ? t('Stik kanan') : t('Stik kiri'));
    fact(t('Zona mati'), t('{n} dari dorongan penuh', { n: pct(p.dead) }));
    fact(t('Kecepatan kamera'), p.lookYaw === base.lookYaw ? t('Normal') : t('{n} dari normal', { n: pct(p.lookYaw / base.lookYaw) }));
    fact(t('Lari'), p.autoRun ? t('Otomatis saat stik didorong penuh, atau tombol Kotak') : t('Hanya tombol Kotak atau tekan stik kiri'));
    about.append(facts, el('p', { class: 'muted small' }, about0.note));
    const list = el('ul', { class: 'pad-map', 'aria-label': t('Fungsi tombol untuk profil ini') });
    for (const r of rows(id)) {
      const li = el('li', { 'data-part': r.part, tabindex: '0' });
      li.append(el('strong', {}, r.label), el('span', {}, r.action));
      const on = () => this.mark(r.part, true);
      const off = () => this.mark(r.part, false);
      li.addEventListener('pointerenter', on); li.addEventListener('pointerleave', off);
      li.addEventListener('focus', on); li.addEventListener('blur', off);
      list.append(li);
    }
    this.root.append(about, fig, status, list);
    this.status();
  }

  private mark(part: string, on: boolean) {
    this.root.querySelectorAll(`.pad-svg [data-part="${part}"]`).forEach((e) => e.classList.toggle('pad-focus', on));
  }

  private status() {
    const pad = [...(navigator.getGamepads?.() ?? [])].find((g) => g && g.connected) ?? null;
    const s = this.root.querySelector('.pad-status');
    if (s) s.textContent = pad ? t('Stik terhubung: {name}. Tombol yang ditekan menyala di gambar.', { name: pad.id.replace(/\s*\(.*$/, '') || 'gamepad' }) : t('Belum ada stik terhubung. Sambungkan stik lalu tekan satu tombol, tombolnya akan menyala di gambar.');
    return pad;
  }

  /** Light up pressed buttons and move the sticks while the dialog is open. */
  start() {
    if (this.raf) return;
    let last = '';
    const tick = () => {
      this.raf = requestAnimationFrame(tick);
      const pad = [...(navigator.getGamepads?.() ?? [])].find((g) => g && g.connected) ?? null;
      const key = pad ? pad.id : '';
      if (key !== last) { last = key; this.status(); }
      const svgEl = this.root.querySelector('.pad-svg');
      if (!svgEl) return;
      for (const [part, i] of BUTTONS) {
        const b = pad?.buttons[i];
        svgEl.querySelector(`[data-part="${part}"]`)?.classList.toggle('pad-on', !!b && (b.pressed || b.value > 0.5));
      }
      const knob = (part: string, x: number, y: number) => {
        const g = svgEl.querySelector<SVGGElement>(`[data-part="${part}"] .pad-knob`);
        if (g) g.setAttribute('transform', `translate(${(x * 3.5).toFixed(2)} ${(y * 3.5).toFixed(2)})`);
      };
      knob('ls', pad?.axes[0] ?? 0, pad?.axes[1] ?? 0);
      knob('rs', pad?.axes[2] ?? 0, pad?.axes[3] ?? 0);
    };
    this.raf = requestAnimationFrame(tick);
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }
}

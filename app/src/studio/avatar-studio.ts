// Avatar Studio dialog (REQ-AVATAR-01). Fetched on first open so the first
// download carries only the world (R2 bundle budget); the choice helpers it
// shares with boot live in avatar-choice.ts.
import * as THREE from 'three';
import { Avatar } from '../game/avatar';
import { $, el, openDialog, toast } from '../ui/dom';
import { t } from '../i18n';
import { DEFAULT_CHOICE, HAIR_LABEL, PREVIEW_CLIPS, SPEC, availableHair, clearChoice, loadChoice, paletteColors, saveChoice, type AvatarChoice } from './avatar-choice';

export { availableHair, loadChoice, paletteColors } from './avatar-choice';

export class AvatarStudio {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  private preview = new Avatar('preview');
  private raf = 0;
  private timer = new THREE.Timer();
  private choice: AvatarChoice = { ...DEFAULT_CHOICE };
  private clip = 'idle';
  private hairs: string[] = [];

  constructor(private apply: (c: AvatarChoice) => void, private playerModel: () => THREE.Object3D | null) {
    this.scene.background = new THREE.Color(0xefe3cc);
    this.scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6d6450, 2.2));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(2, 4, 3);
    this.scene.add(sun, this.preview.root);
    this.camera.position.set(0, 1.0, 4.2);
    this.camera.lookAt(0, 0.8, 0);
  }

  async open(opener?: HTMLElement) {
    const dlg = $('dlg-avatar') as HTMLDialogElement;
    this.hairs = availableHair(this.playerModel());
    this.choice = loadChoice(this.hairs.length ? this.hairs : SPEC.hairStyles);
    this.renderForm();
    openDialog(dlg, opener);
    dlg.addEventListener('close', () => this.stopPreview(), { once: true });
    const host = $('avatar-preview');
    try {
      if (!this.renderer) {
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.domElement.setAttribute('aria-hidden', 'true');
      }
      host.replaceChildren(this.renderer.domElement);
      const size = Math.min(260, host.clientWidth || 260);
      this.renderer.setSize(size, Math.round(size * 1.2));
      this.camera.aspect = 1 / 1.2;
      this.camera.updateProjectionMatrix();
      $('avatar-preview-state').textContent = t('Memuat model...');
      const ok = this.preview.isPlaceholder ? await this.preview.load('assets/characters/ch-ceo.glb') : true;
      $('avatar-preview-state').textContent = ok ? '' : t('Model karakter tidak tersedia; pratinjau memakai placeholder.');
      this.update();
      this.startPreview();
    } catch {
      host.replaceChildren(el('p', { class: 'muted small' }, t('Pratinjau 3D tidak tersedia di browser ini; pilihan tetap bisa disimpan.')));
    }
  }

  private renderForm() {
    const form = $('avatar-form');
    form.replaceChildren();
    const hairs = this.hairs.length ? this.hairs : [];
    const fsHair = el('fieldset', {});
    fsHair.append(el('legend', {}, t('Rambut')));
    if (!hairs.length) fsHair.append(el('p', { class: 'muted small' }, t('Varian rambut tidak ditemukan di model; memakai default.')));
    for (const h of hairs) {
      const id = `hair-${h}`;
      const input = el('input', { type: 'radio', name: 'hair', value: h, id });
      input.checked = h === this.choice.hair;
      input.addEventListener('change', () => { this.choice.hair = h; this.update(); });
      const label = el('label', { for: id });
      label.append(input, document.createTextNode(` ${HAIR_LABEL[h] ? t(HAIR_LABEL[h]) : h}`));
      fsHair.append(label);
    }
    const fsPal = el('fieldset', {});
    fsPal.append(el('legend', {}, t('Pakaian')));
    for (const [name, p] of Object.entries(SPEC.palettes)) {
      const id = `pal-${name}`;
      const input = el('input', { type: 'radio', name: 'palette', value: name, id });
      input.checked = name === this.choice.palette;
      input.addEventListener('change', () => { this.choice.palette = name; this.update(); });
      const swatch = el('span', { class: 'swatch', 'aria-hidden': 'true' });
      swatch.style.background = `linear-gradient(90deg, ${p.outfit_main} 0 50%, ${p.outfit_bottom} 50% 100%)`;
      const label = el('label', { for: id });
      label.append(input, swatch, document.createTextNode(` ${t(p.label)}`));
      fsPal.append(label);
    }
    const fsAnim = el('fieldset', {});
    fsAnim.append(el('legend', {}, t('Pratinjau animasi')));
    const sel = el('select', { 'aria-label': t('Animasi pratinjau'), id: 'avatar-clip' });
    for (const c of PREVIEW_CLIPS) sel.append(el('option', { value: c }, c));
    sel.value = this.clip;
    sel.addEventListener('change', () => { this.clip = sel.value; this.preview.play(this.clip); });
    fsAnim.append(sel);
    form.append(fsHair, fsPal, fsAnim);
  }

  private update() {
    this.preview.applyVariant(this.choice.hair, paletteColors(this.choice.palette));
    this.preview.play(this.clip);
  }

  private startPreview() {
    cancelAnimationFrame(this.raf);
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.timer.update();
      const dt = Math.min(0.1, this.timer.getDelta());
      const reduced = document.documentElement.getAttribute('data-reduced-motion') === 'true';
      if (!reduced) this.preview.root.rotation.y += dt * 0.5;
      this.preview.update(dt, 0, reduced);
      this.renderer?.render(this.scene, this.camera);
    };
    loop();
  }

  private stopPreview() { cancelAnimationFrame(this.raf); }

  save() {
    const ok = saveChoice(this.choice);
    this.apply(this.choice);
    toast(ok ? t('Avatar disimpan di browser ini.') : t('Avatar dipakai sekarang, tetapi penyimpanan browser tidak tersedia.'));
    ($('dlg-avatar') as HTMLDialogElement).close();
  }

  reset() {
    clearChoice();
    this.choice = { ...DEFAULT_CHOICE };
    this.apply(this.choice);
    this.renderForm();
    this.update();
    toast(t('Avatar kembali ke default.'));
  }
}

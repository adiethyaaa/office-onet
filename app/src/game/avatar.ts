// Character wrapper: GLB from the Blender pipeline when present, otherwise an
// honest labelled placeholder (REQ-CHAR-01 failure path). Facing uses plan
// degrees (0 = east, 90 = north); glTF characters face +Z.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';

const cache = new Map<string, Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] } | null>>();

export function loadCharacter(url: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] } | null> {
  let p = cache.get(url);
  if (!p) {
    p = new GLTFLoader().loadAsync(url).then((g) => ({ scene: g.scene, animations: g.animations })).catch((err) => {
      console.warn(`character asset missing or invalid: ${url}`, err);
      return null;
    });
    cache.set(url, p);
  }
  return p;
}

const LOCO = '<loco>';
const LOCO_CLIPS = ['idle', 'walk', 'run'];

/**
 * Crossfade seconds per clip pair (REQ-ANIM-06). Quick for reactions and
 * standing up into a walk, slower for settling into a seat.
 */
export function crossfade(from: string, to: string): number {
  const f = from === LOCO ? 'walk' : from;
  if (to === 'surprised' || to === 'flee') return 0.08;
  if (to === 'sit' || to === 'type' || to === 'type_fast') return 0.35;
  if (f === 'sit' || f === 'type' || f === 'type_fast') return 0.3;
  if (to === 'talk' || to === 'wave') return 0.25;
  if ((f === 'walk' || f === 'run') && (to === 'idle' || to === 'walk' || to === 'run')) return 0.15;
  return 0.2;
}

interface AtlasSpec { size: number; cell: number; zones: Record<string, [number, number]> }

export class Avatar {
  readonly root = new THREE.Group();
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current = '';
  private body: THREE.Object3D | null = null;
  private t = 0;
  isPlaceholder = true;
  clipNames: string[] = [];
  /** Native locomotion speeds baked by the Blender pipeline (rig extras). */
  walkNative = 0.85;
  runNative = 2.4;
  defaultHair: string | null = null;
  /** Palette atlas contract from the GLB extras (kantor_atlas): zone -> [col, row] cell. */
  private atlas: AtlasSpec | null = null;
  private hair: string | null = null;
  private lod: 0 | 1 = 0;
  private lod1: THREE.Object3D | null = null;
  private face: THREE.Mesh | null = null;
  private nextBlink = 2 + Math.random() * 3;
  talking = false;

  constructor(readonly label: string, color = 0x1f4d3a) {
    this.root.name = `avatar-${label}`;
    this.body = placeholder(color);
    this.root.add(this.body);
  }

  async load(url: string): Promise<boolean> {
    const asset = await loadCharacter(url);
    if (!asset) return false;
    const model = cloneSkinned(asset.scene) as THREE.Group;
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) { m.castShadow = true; m.frustumCulled = false; }
    });
    if (this.body) this.root.remove(this.body);
    this.body = model;
    model.traverse((o) => {
      const x = o.userData as Record<string, unknown>;
      if (typeof x.kantor_walk_native_speed_mps === 'number') this.walkNative = x.kantor_walk_native_speed_mps;
      if (typeof x.kantor_run_native_speed_mps === 'number') this.runNative = x.kantor_run_native_speed_mps;
      if (typeof x.kantor_default_hair === 'string') this.defaultHair = x.kantor_default_hair.replace(/^hair_/, '');
      if (x.kantor_atlas && typeof x.kantor_atlas === 'object') this.atlas = x.kantor_atlas as AtlasSpec;
      if (o.name === 'lod1') this.lod1 = o;
      if (o.name === 'head' && (o as THREE.Bone).isBone) this.head = o;
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && mesh.morphTargetDictionary && 'blink' in mesh.morphTargetDictionary) this.face = mesh;
    });
    if (!this.atlas) {
      const sx = asset.scene.userData as Record<string, unknown>;
      if (sx.kantor_atlas && typeof sx.kantor_atlas === 'object') this.atlas = sx.kantor_atlas as AtlasSpec;
    }
    this.root.add(model);
    this.mixer = new THREE.AnimationMixer(model);
    this.actions.clear();
    for (const clip of asset.animations) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.clipNames = [...this.actions.keys()];
    this.isPlaceholder = false;
    // Variant GLBs ship every hair style; exactly one may be visible.
    if (this.defaultHair) this.applyVariant(this.defaultHair, null);
    const prev = this.current;
    this.current = '';
    this.play(prev || 'idle');
    return true;
  }

  get model(): THREE.Object3D | null { return this.body; }

  has(name: string): boolean { return this.actions.has(name); }

  play(name: string, fade?: number): void {
    if (name === this.current) return;
    const next = this.actions.get(name) ?? this.actions.get('idle');
    const from = this.current;
    const f = fade ?? crossfade(from, name);
    if (from === LOCO) {
      // Leaving the locomotion blend: fade each of its clips from the weight it has now.
      for (const n of LOCO_CLIPS) { const a = this.actions.get(n); if (a && a !== next) a.fadeOut(f); }
      this.endOneShot(f);
    }
    const prev = this.actions.get(from);
    this.current = name;
    if (!next) return;
    next.reset().setEffectiveWeight(1).fadeIn(f).play();
    if (prev && prev !== next) prev.fadeOut(f);
  }

  // ---- locomotion (PRD v2.0 REQ-ANIM-01..06) ---------------------------------
  private locoW: Record<string, number> = { idle: 0, walk: 0, run: 0 };
  private oneShot: { name: string; action: THREE.AnimationAction; t: number; dur: number } | null = null;
  private lastSpeed = 0;
  private lean = 0;
  private pitch = 0;
  /** Last one-shot started (tests read it). */
  lastOneShot = '';

  /**
   * Idle, walk and run as one blend driven by ground speed, instead of
   * swapping clips at a threshold: half stick gives a brisk walk, and walk
   * and run share one cycle phase so feet never jump when the blend moves.
   * turnRate is degrees per second (positive = turning left).
   */
  locomotion(speed: number, dt: number, turnRate: number, reducedMotion: boolean): void {
    const idle = this.actions.get('idle');
    const walk = this.actions.get('walk');
    const run = this.actions.get('run');
    if (!this.mixer || !idle || !walk || !run) {
      this.play(speed > 2.4 ? 'run' : speed > 0.2 ? 'walk' : 'idle');
      this.lastSpeed = speed;
      return;
    }
    if (this.current !== LOCO) {
      const prev = this.actions.get(this.current);
      const f = crossfade(this.current, speed > 0.2 ? 'walk' : 'idle');
      if (prev && !LOCO_CLIPS.includes(this.current)) prev.fadeOut(f);
      for (const n of LOCO_CLIPS) {
        const a = this.actions.get(n)!;
        // Start from whatever weight the clip has (it may be mid fade-out).
        this.locoW[n] = n === this.current ? 1 : this.locoW[n] * (a.isRunning() ? 1 : 0);
        if (!a.isRunning()) a.reset().play();
      }
      this.current = LOCO;
    }
    // One-shots: start from rest, stop from a run, quick turn.
    if (this.lastSpeed < 0.25 && speed >= 0.25) this.startOneShot('start');
    else if (this.lastSpeed > 1.4 && speed < 0.35) this.startOneShot('stop');
    if (Math.abs(turnRate) > 600 && speed > 0.4 && this.oneShot?.name !== 'turn') this.startOneShot('turn');
    this.lastSpeed = speed;

    const moving = THREE.MathUtils.clamp((speed - 0.12) / 0.5, 0, 1);
    const r = THREE.MathUtils.smoothstep(speed, 1.9, 3.0);
    const target = { idle: 1 - moving, walk: moving * (1 - r), run: moving * r };
    const k = Math.min(1, dt * 9);
    let shotW = 0;
    if (this.oneShot) {
      const o = this.oneShot;
      o.t += dt;
      const fadeIn = Math.min(1, o.t / 0.06);
      const fadeOut = Math.min(1, (o.dur - o.t) / 0.1);
      shotW = Math.max(0, Math.min(fadeIn, fadeOut)) * 0.85;
      o.action.setEffectiveWeight(shotW);
      if (o.t >= o.dur) this.endOneShot(0);
    }
    for (const n of LOCO_CLIPS) {
      this.locoW[n] += (target[n as keyof typeof target] - this.locoW[n]) * k;
      this.actions.get(n)!.setEffectiveWeight(this.locoW[n] * (1 - shotW));
    }
    // Shared phase: cycles per second blended from both clips' native speeds.
    const wd = walk.getClip().duration || 1;
    const rd = run.getClip().duration || 1;
    const wsum = this.locoW.walk + this.locoW.run || 1;
    const s = Math.max(speed, 0.4);
    const rate = ((this.locoW.walk * s) / this.walkNative / wd + (this.locoW.run * s) / this.runNative / rd) / wsum;
    walk.timeScale = THREE.MathUtils.clamp(rate * wd, 0.4, 2.8);
    run.timeScale = THREE.MathUtils.clamp(rate * rd, 0.5, 2.2);
    if (this.locoW.run > 0.02 && this.locoW.walk > 0.02) run.time = (walk.time / wd) * rd;

    // Lean: forward with speed, sideways into the turn. Off under reduced motion.
    const wantPitch = reducedMotion ? 0 : THREE.MathUtils.degToRad(6) * r;
    const wantLean = reducedMotion ? 0 : THREE.MathUtils.clamp(-turnRate * 0.0009 * Math.min(1, speed / 2.5), -0.21, 0.21);
    this.pitch += (wantPitch - this.pitch) * Math.min(1, dt * 6);
    this.lean += (wantLean - this.lean) * Math.min(1, dt * 6);
    if (this.body) { this.body.rotation.x = this.pitch; this.body.rotation.z = this.lean; }
  }

  private startOneShot(name: string) {
    const a = this.actions.get(name);
    if (!a) return;
    this.endOneShot(0);
    a.reset();
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    a.setEffectiveWeight(0).play();
    this.oneShot = { name, action: a, t: 0, dur: a.getClip().duration };
    this.lastOneShot = name;
  }

  private endOneShot(fade: number) {
    if (!this.oneShot) return;
    if (fade > 0) this.oneShot.action.fadeOut(fade); else this.oneShot.action.stop();
    this.oneShot = null;
  }

  /** Clear body lean (sitting, activities). */
  settle(): void {
    this.lean = 0;
    this.pitch = 0;
    if (this.body) { this.body.rotation.x = 0; this.body.rotation.z = 0; }
  }

  /**
   * Play a non-looping reaction clip once (surprised, rub_head...) and return to
   * `then` afterwards. Falls back to `then` when the GLB predates the clip.
   */
  react(name: string, then: string): number {
    const a = this.actions.get(name);
    if (!a) { this.play(then); return 0; }
    this.play(name, 0.08);
    a.setLoop(THREE.LoopOnce, 1);
    a.clampWhenFinished = true;
    return a.getClip().duration;
  }

  // ---- head look (REQ-ANIM-05) ----------------------------------------------
  private head: THREE.Object3D | null = null;
  private lookYaw = 0;
  private static readonly qa = new THREE.Quaternion();
  private static readonly qb = new THREE.Quaternion();
  private static readonly up = new THREE.Vector3(0, 1, 0);

  /**
   * Turn the head toward a point after the clip has posed the skeleton.
   * Applied in world space (rotation about world up) so it does not depend on
   * the bone's local axes; clamped to +-60 degrees from the body.
   */
  lookAt(target: THREE.Vector3 | null, dt: number, reducedMotion: boolean): void {
    if (!this.head) return;
    let want = 0;
    if (target && !reducedMotion) {
      const p = this.root.position;
      const ang = Math.atan2(target.x - p.x, target.z - p.z);
      const body = this.root.rotation.y;
      want = THREE.MathUtils.clamp(((ang - body + Math.PI * 3) % (Math.PI * 2)) - Math.PI, -1.05, 1.05);
    }
    this.lookYaw += (want - this.lookYaw) * Math.min(1, dt * 5);
    if (Math.abs(this.lookYaw) < 1e-3) return;
    const h = this.head;
    const parent = h.parent;
    if (!parent) return;
    parent.updateWorldMatrix(true, false);
    const pw = Avatar.qa;
    parent.getWorldQuaternion(pw);
    const hw = Avatar.qb.copy(pw).multiply(h.quaternion);
    hw.premultiply(new THREE.Quaternion().setFromAxisAngle(Avatar.up, this.lookYaw));
    h.quaternion.copy(pw.invert().multiply(hw));
  }

  setFacing(deg: number): void { this.root.rotation.y = THREE.MathUtils.degToRad(deg) + Math.PI / 2; }

  /** Match stride to ground speed so feet do not slide (m/s). */
  setGroundSpeed(speed: number): void {
    const walk = this.actions.get('walk');
    const run = this.actions.get('run');
    if (walk) walk.timeScale = THREE.MathUtils.clamp(speed / this.walkNative, 0.5, 2.6);
    if (run) run.timeScale = THREE.MathUtils.clamp(speed / this.runNative, 0.6, 2.0);
  }

  /** Distance LOD: LOD1 (one skinned mesh, <=5k tris, default hair baked in) replaces body + hair. */
  setLod(level: 0 | 1): void {
    if (!this.lod1 || level === this.lod) return;
    this.lod = level;
    this.refreshVisibility();
  }

  get lodLevel(): 0 | 1 { return this.lod; }

  private refreshVisibility(): void {
    if (!this.body) return;
    const far = this.lod === 1 && !!this.lod1;
    for (const o of this.body.children.length ? collect(this.body) : []) {
      if (o === this.lod1) o.visible = far;
      // LOD1 bakes body, default hair and the held prop into one mesh.
      else if (o.name === 'body' || o.name.startsWith('prop_')) o.visible = !far;
      else if (o.name.startsWith('hair_')) o.visible = !far && !!this.hair && (o.name === `hair_${this.hair}` || o.name.startsWith(`hair_${this.hair}.`) || o.name.startsWith(`hair_${this.hair}_`));
    }
  }

  /** Expression weight 0..1 on the face morph targets (blink, smile, talk, surprised, frown). */
  setExpression(name: string, weight: number): void {
    const f = this.face;
    const k = f?.morphTargetDictionary?.[name];
    if (f && k !== undefined && f.morphTargetInfluences) f.morphTargetInfluences[k] = weight;
  }

  /** Current morph weights (tests, debug). Empty for placeholders and pre-atlas GLBs. */
  expressions(): Record<string, number> {
    const f = this.face;
    if (!f?.morphTargetDictionary || !f.morphTargetInfluences) return {};
    return Object.fromEntries(Object.entries(f.morphTargetDictionary).map(([k, i]) => [k, f.morphTargetInfluences![i]]));
  }

  update(dt: number, moving: number, reducedMotion: boolean): void {
    this.t += dt;
    if (this.face) {
      // Blink every few seconds; talking flaps the mouth with a smile. Both
      // stop under reduced motion (a held neutral face is the calm default).
      if (!reducedMotion && this.t >= this.nextBlink) {
        const k = (this.t - this.nextBlink) / 0.14;
        this.setExpression('blink', k < 1 ? Math.sin(k * Math.PI) : 0);
        if (k >= 1) this.nextBlink = this.t + 2.5 + Math.random() * 3.5;
      }
      this.setExpression('talk', this.talking && !reducedMotion ? 0.35 + 0.35 * Math.sin(this.t * 14) : 0);
      this.setExpression('smile', this.talking ? 0.5 : 0);
    }
    if (this.mixer) {
      this.mixer.update(dt);
    } else if (this.body) {
      // Placeholder bob so locomotion still reads; disabled under reduced motion.
      this.body.position.y = reducedMotion ? 0 : Math.abs(Math.sin(this.t * 9)) * 0.05 * moving;
    }
  }

  /** Show only the named hair node and recolour palette zones (Avatar Studio).
   * Atlas characters (one material, kantor_atlas extras) get a per-avatar copy
   * of the palette texture with the outfit cells repainted, so recolouring
   * keeps one material and one draw call per mesh. Older multi-material GLBs
   * fall back to recolouring materials by name. */
  applyVariant(hair: string | null, palette: Record<string, string> | null): void {
    if (!this.body) return;
    if (hair) this.hair = hair;
    this.refreshVisibility();
    if (!palette) return;
    if (this.atlas && this.recolourAtlas(palette)) return;
    this.body.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const swap = (m: THREE.Material): THREE.Material => {
        const key = m.userData.paletteKey ?? m.name.replace(/\.\d+$/, '');
        const std = m as THREE.MeshStandardMaterial;
        if (!palette[key] || !std.color) return m;
        const c = std.clone();
        c.userData.paletteKey = key;
        c.color.set(palette[key]);
        return c;
      };
      mesh.material = Array.isArray(mesh.material) ? mesh.material.map(swap) : swap(mesh.material);
    });
  }

  private atlasSource: THREE.MeshStandardMaterial | null = null;
  private atlasMaterial: THREE.MeshStandardMaterial | null = null;

  private recolourAtlas(palette: Record<string, string>): boolean {
    const atlas = this.atlas!;
    if (!this.atlasSource) {
      this.body!.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
        if (!this.atlasSource && m && !Array.isArray(m) && m.map && m.name.startsWith('kantor_atlas')) this.atlasSource = m;
      });
    }
    const src = this.atlasSource;
    const image = src?.map?.image as CanvasImageSource & { width: number; height: number } | undefined;
    if (!src || !image || typeof document === 'undefined') return false;
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.drawImage(image, 0, 0);
    const px = image.width / atlas.size; // cells are in atlas pixels; the image may be scaled
    for (const [zone, colour] of Object.entries(palette)) {
      const cell = atlas.zones[zone];
      if (!cell || !/^#[0-9a-f]{6}$/i.test(colour)) continue;
      ctx.fillStyle = colour;
      ctx.fillRect(cell[0] * atlas.cell * px, cell[1] * atlas.cell * px, atlas.cell * px, atlas.cell * px);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.flipY = false; // glTF texture convention, same as the source map
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    this.atlasMaterial?.map?.dispose();
    this.atlasMaterial?.dispose();
    const mat = src.clone();
    mat.map = tex;
    this.atlasMaterial = mat;
    this.body!.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh && !Array.isArray(mesh.material) && (mesh.material === src || (mesh.material as THREE.Material).name.startsWith('kantor_atlas'))) mesh.material = mat;
    });
    return true;
  }
}

function collect(root: THREE.Object3D): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  root.traverse((o) => { if (o !== root) out.push(o); });
  return out;
}

function placeholder(color: number): THREE.Object3D {
  const g = new THREE.Group();
  g.name = 'placeholder';
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xe9c9a5, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 6, 12), mat);
  body.position.y = 0.48;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.24, 18, 14), skin);
  head.position.y = 1.08;
  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat);
  nose.position.set(0, 1.08, 0.24); // marks facing (+Z)
  g.add(body, head, nose);
  g.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  return g;
}

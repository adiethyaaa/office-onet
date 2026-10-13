// Renders IdleSim NPCs with their Blender GLBs and maps activity -> clip.
// The sim runs on a fixed 0.1 s step; rendering interpolates positions.
import { t } from '../i18n';
import * as THREE from 'three';
import { labelClear, type LabelBlocker } from './label-visibility';
import { IdleSim, type NpcState } from '../sim/idle';
import type { NavGrid } from '../world/navgrid';
import { toThree } from '../world/build';
import type { FloorId, World } from '../world/types';
import { Avatar } from './avatar';

export const ACTIVITY_LABEL: Record<string, string> = {
  desk: 'di meja kerja', coffee: 'bikin kopi', chat: 'ngobrol', read: 'membaca', stretch: 'peregangan', game: 'main game',
  billiards: 'main biliar', exercise: 'olahraga', rest: 'istirahat', walk: 'berjalan', idle: 'santai', talk: 'bicara dengan CEO',
};

export const WORK_LABEL: Record<string, string> = { working: 'bekerja', waiting: 'menunggu keputusanmu' };

const STEP = 0.1;
// Personas further than this from the CEO (plan metres) render their LOD1
// mesh: at the default 3/4 camera they cover a few dozen pixels there.
export const LOD1_DISTANCE = 8;
export const LOD_HYSTERESIS = 1;

interface View { avatar: Avatar; prev: THREE.Vector3; next: THREE.Vector3; label: HTMLElement; floor: FloorId }

export class NpcLayer {
  readonly sim: IdleSim;
  readonly group = new THREE.Group();
  private views = new Map<string, View>();
  private acc = 0;

  constructor(private world: World, nav: Record<FloorId, NavGrid>, seed: number, labelHost: HTMLElement) {
    this.sim = new IdleSim(world, nav, { seed, startHour: 8.75, minutesPerSecond: 1 });
    this.group.name = 'npcs';
    // Own layer: room labels are rebuilt on floor change and must not wipe these.
    const host = document.createElement('div');
    host.className = 'labels npc-labels';
    host.setAttribute('aria-hidden', 'true');
    labelHost.after(host);
    for (const npc of this.sim.npcs) {
      const actor = world.actors.find((a) => a.id === npc.id)!;
      const avatar = new Avatar(npc.name, 0x6f8fa6);
      void avatar.load(`assets/characters/${actor.avatarAsset.toLowerCase()}.glb`);
      const p = this.worldPos(npc);
      avatar.root.position.copy(p);
      const label = document.createElement('div');
      label.className = 'npc-label';
      label.setAttribute('aria-hidden', 'true');
      host.append(label);
      this.views.set(npc.id, { avatar, prev: p.clone(), next: p.clone(), label, floor: npc.floor });
      this.group.add(avatar.root);
    }
  }

  private worldPos(npc: NpcState): THREE.Vector3 {
    const elev = this.world.floors.find((f) => f.id === npc.floor)!.elevation;
    let [x, y] = npc.pos;
    if (npc.phase === 'perform' && npc.slot) {
      // Seated activities sit on the chair itself, not on the approach cell.
      const slot = this.world.activitySlots.find((s) => s.id === npc.slot)!;
      if (slot.pose === 'sit') [x, y] = slot.pos;
    }
    return toThree(x, y, elev);
  }

  /** Reaction overlays after a reprimand: clip name until sim time. */
  private reactions = new Map<string, { clip: string; until: number }[]>();
  private stars = new Map<string, THREE.Group>();

  /**
   * Cartoon reaction (REQ-TEGUR-02): surprised hop, spinning stars over the
   * head, a rub of the head, then the hurried walk back to the desk. Clips
   * missing from older GLBs fall back to talk/walk, so the sequence still reads.
   */
  react(id: string, reducedMotion: boolean): void {
    const now = this.sim.time;
    const v = this.views.get(id);
    if (!v) return;
    const has = (c: string) => v.avatar.has(c);
    this.reactions.set(id, [
      { clip: has('surprised') ? 'surprised' : 'wave', until: now + 0.7 },
      { clip: has('rub_head') ? 'rub_head' : 'talk', until: now + 2.0 },
    ]);
    if (reducedMotion) return;
    let g = this.stars.get(id);
    if (!g) {
      g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0xf2c14e });
      const geo = new THREE.OctahedronGeometry(0.07, 0);
      for (let i = 0; i < 4; i++) { const m = new THREE.Mesh(geo, mat); m.position.set(Math.cos((i / 4) * Math.PI * 2) * 0.32, 0, Math.sin((i / 4) * Math.PI * 2) * 0.32); g.add(m); }
      g.position.y = 1.95;
      v.avatar.root.add(g);
      this.stars.set(id, g);
    }
    g.visible = true;
    g.userData.until = now + 2.2;
  }

  /** Reaction clip right now, if any (tests read it through clipFor). */
  private reactionClip(npc: NpcState): string | null {
    const list = this.reactions.get(npc.id);
    if (!list) return null;
    while (list.length && list[0].until <= this.sim.time) list.shift();
    if (!list.length) { this.reactions.delete(npc.id); return null; }
    return list[0].clip;
  }

  clipFor(npc: NpcState): string {
    const r = this.reactionClip(npc);
    if (r) return r;
    if ((npc.phase === 'travel' || npc.phase === 'recover') && (npc.scoldedUntil ?? 0) > this.sim.time) {
      return this.views.get(npc.id)?.avatar.has('flee') ? 'flee' : 'run';
    }
    if (npc.phase === 'travel' || npc.phase === 'recover') return 'walk';
    if (npc.phase === 'paused') return 'talk';
    if (npc.phase !== 'perform') return 'idle';
    if (npc.workStatus === 'working' && npc.activity === 'idle') return 'type';
    const slot = npc.slot ? this.world.activitySlots.find((s) => s.id === npc.slot) : undefined;
    const sit = slot?.pose === 'sit';
    switch (npc.activity) {
      case 'desk': return 'type';
      case 'coffee': return 'coffee';
      case 'chat': return sit ? 'sit' : 'talk';
      case 'read': return sit ? 'sit' : 'read';
      case 'rest': return 'sit';
      case 'game': return sit ? 'game' : 'talk';
      default: return npc.activity;
    }
  }

  update(dt: number, playerFloor: FloorId, camera: THREE.Camera, w: number, h: number, reducedMotion: boolean, playerPos?: [number, number], labelBlockers: LabelBlocker[] = []): void {
    this.acc += dt;
    let steps = 0;
    while (this.acc >= STEP && steps < 5) {
      for (const v of this.views.values()) v.prev.copy(v.next);
      this.sim.step(STEP);
      for (const npc of this.sim.npcs) {
        const v = this.views.get(npc.id)!;
        const p = this.worldPos(npc);
        // Floor change or sit snap: no interpolation across the jump.
        if (v.floor !== npc.floor || p.distanceTo(v.next) > 1.5) v.prev.copy(p);
        v.next.copy(p);
        v.floor = npc.floor;
      }
      this.acc -= STEP;
      steps++;
    }
    if (steps === 5) this.acc = 0; // drop backlog after a long stall instead of fast-forwarding
    const alpha = this.acc / STEP;
    for (const npc of this.sim.npcs) {
      const v = this.views.get(npc.id)!;
      const visible = npc.floor === playerFloor;
      v.avatar.root.visible = visible;
      v.avatar.root.position.lerpVectors(v.prev, v.next, alpha);
      v.avatar.setFacing(npc.facing);
      if (playerPos) {
        // Hysteresis band: an NPC walking along the LOD radius used to swap
        // meshes every frame, which read as the model flashing.
        const d = Math.hypot(npc.pos[0] - playerPos[0], npc.pos[1] - playerPos[1]);
        const lod = v.avatar.lodLevel;
        if (lod === 0 && d > LOD1_DISTANCE + LOD_HYSTERESIS) v.avatar.setLod(1);
        else if (lod === 1 && d < LOD1_DISTANCE - LOD_HYSTERESIS) v.avatar.setLod(0);
      }
      v.avatar.talking = npc.phase === 'paused';
      v.avatar.play(this.clipFor(npc));
      const st = this.stars.get(npc.id);
      if (st?.visible) {
        if (this.sim.time > (st.userData.until as number)) st.visible = false;
        else st.rotation.y += dt * 6;
      }
      v.avatar.update(dt, npc.phase === 'travel' ? 1 : 0, reducedMotion);
      // Personas glance at the CEO walking past (REQ-ANIM-05); seated workers keep their eyes on the screen.
      if (visible && playerPos && !(npc.phase === 'perform' && npc.workStatus === 'working')) {
        const d = Math.hypot(npc.pos[0] - playerPos[0], npc.pos[1] - playerPos[1]);
        v.avatar.lookAt(d < 2.5 ? new THREE.Vector3(playerPos[0], v.next.y + 1.4, -playerPos[1]) : null, dt, reducedMotion);
      } else v.avatar.lookAt(null, dt, reducedMotion);
      if (!visible) { v.label.style.opacity = '0'; continue; }
      const s = v.avatar.root.position.clone().add(new THREE.Vector3(0, 1.9, 0)).project(camera);
      const screenY = ((1 - s.y) / 2) * h;
      const screenX = ((s.x + 1) / 2) * w;
      const busy = npc.workStatus === 'working' || npc.workStatus === 'waiting';
      const activityText = `${npc.name} · ${busy ? t(WORK_LABEL[npc.workStatus]) : (ACTIVITY_LABEL[npc.activity] ? t(ACTIVITY_LABEL[npc.activity]) : npc.activity)}`;
      v.label.classList.toggle('busy', busy);
      if (v.label.textContent !== activityText) v.label.textContent = activityText;
      const on = s.z < 1 && Math.abs(s.x) < 1.05 && Math.abs(s.y) < 1.05
        && labelClear(screenX - v.label.offsetWidth / 2, screenY - v.label.offsetHeight,
          v.label.offsetWidth, v.label.offsetHeight, labelBlockers);
      v.label.style.opacity = on ? '1' : '0';
      if (on) {
        v.label.style.transform = `translate(-50%, -100%) translate(${((s.x + 1) / 2) * w}px, ${((1 - s.y) / 2) * h}px)`;
      }
    }
  }

  face(id: string): { expressions: Record<string, number>; lod: number } | null {
    const v = this.views.get(id);
    return v ? { expressions: v.avatar.expressions(), lod: v.avatar.lodLevel } : null;
  }

  /** Count of visible personas per LOD level (perf harness / tests). */
  lodCounts(): { lod0: number; lod1: number } {
    let lod0 = 0;
    let lod1 = 0;
    for (const v of this.views.values()) if (v.avatar.root.visible) { if (v.avatar.lodLevel === 1) lod1++; else lod0++; }
    return { lod0, lod1 };
  }

  nearest(floor: FloorId, pos: [number, number], radius: number): NpcState | null {
    let best: NpcState | null = null;
    let bd = radius;
    for (const npc of this.sim.npcs) {
      if (npc.floor !== floor) continue;
      const d = Math.hypot(npc.pos[0] - pos[0], npc.pos[1] - pos[1]);
      if (d <= bd) { bd = d; best = npc; }
    }
    return best;
  }

  faceTowards(id: string, pos: [number, number]): void {
    const npc = this.sim.npcs.find((n) => n.id === id);
    if (npc) npc.facing = (Math.atan2(pos[1] - npc.pos[1], pos[0] - npc.pos[0]) * 180) / Math.PI;
  }
}

// Minimap (always on screen) and the full floor map dialog (P / "Peta").
// Both draw plan coordinates from world.json on a 2D canvas: rooms, the
// CEO with a facing arrow, and every persona. People on the other floor are
// listed and counted so the CEO knows which floor to go to.
// Loaded as its own chunk after the world starts (entry chunk budget, R2).
import type { FloorId, Room, Vec2, World } from '../world/types';
import { el, openDialog, toast } from './dom';
import { t } from '../i18n';

export interface MapPerson {
  id: string; name: string; role: string; floor: FloorId; pos: Vec2;
  doing: string; busy: boolean;
  /** Set while the persona walks to the stairs/lift to change floor. */
  movingTo: FloorId | null;
}
export interface MapSnapshot { floor: FloorId; pos: Vec2; facing: number; visitor: boolean; people: MapPerson[] }
export interface MapHost { snapshot(): MapSnapshot; meet(id: string): void }

export const FLOOR_NAME: Record<FloorId, string> = { L1: 'Lantai 1', L2: 'Lantai 2' };

/** Display name of a floor in the UI language. */
export function floorName(id: FloorId): string {
  return t(FLOOR_NAME[id]);
}

export function pointInPoly(p: Vec2, poly: Vec2[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function roomAt(world: World, floor: FloorId, p: Vec2): Room | null {
  return world.rooms.find((r) => r.floor === floor && pointInPoly(p, r.polygon)) ?? null;
}

/** People on the viewer's floor first, then the others; each group by name. */
export function groupByFloor(snap: MapSnapshot): { here: MapPerson[]; away: MapPerson[] } {
  const byName = (a: MapPerson, b: MapPerson) => a.name.localeCompare(b.name, 'id');
  return {
    here: snap.people.filter((p) => p.floor === snap.floor).sort(byName),
    away: snap.people.filter((p) => p.floor !== snap.floor).sort(byName),
  };
}

/** Short minimap badge for people on other floors, e.g. "Lantai 2: 3 orang". */
export function awayBadge(world: World, snap: MapSnapshot): { text: string; label: string } | null {
  const here = world.floors.find((f) => f.id === snap.floor)!;
  const parts: { text: string; label: string }[] = [];
  for (const f of world.floors) {
    if (f.id === snap.floor) continue;
    const n = snap.people.filter((p) => p.floor === f.id).length;
    if (!n) continue;
    const arrow = f.level > here.level ? '↑' : '↓';
    const dir = f.level > here.level ? t('di atas') : t('di bawah');
    parts.push({ text: `${arrow} ${f.id}: ${n}`, label: t('{n} orang di {floor} ({dir})', { n, floor: floorName(f.id), dir }) });
  }
  if (!parts.length) return null;
  return { text: parts.map((p) => p.text).join(' · '), label: parts.map((p) => p.label).join(', ') };
}

/** Where a persona is, in words: room name, or a note that they are changing floor. */
export function placeText(world: World, p: MapPerson): string {
  const room = roomAt(world, p.floor, p.pos);
  const where = room ? room.name : t('koridor');
  return p.movingTo ? t('{where}, menuju {floor}', { where, floor: floorName(p.movingTo) }) : where;
}

interface Tokens { bg: string; surface: string; ink: string; muted: string; green: string; accent: string; focus: string; wall: string; room: string; work: string; rec: string; restricted: string; circ: string }

function tokens(): Tokens {
  const cs = getComputedStyle(document.documentElement);
  const v = (n: string, d: string) => cs.getPropertyValue(n).trim() || d;
  return {
    bg: v('--map-bg', '#e9dfcb'), surface: v('--surface', '#fffaf0'), ink: v('--ink', '#1d2a23'), muted: v('--map-muted', '#5b5446'),
    green: v('--map-npc', '#1f4d3a'), accent: v('--map-you', '#a34a27'), focus: v('--focus', '#b8571f'),
    wall: v('--map-wall', '#6f6252'), room: v('--map-room', '#f7f0e2'), work: v('--map-work', '#e6efe4'), rec: v('--map-rec', '#f6e5d6'),
    restricted: v('--map-restricted', '#d9d0c0'), circ: v('--map-circ', '#efe7d6'),
  };
}

interface View { scale: number; pad: number; h: number }

class PlanCanvas {
  readonly canvas = el('canvas');
  private view: View = { scale: 1, pad: 6, h: 24 };
  private tagBoxes: [number, number][] = [];

  constructor(private world: World, private label: boolean) {}

  resize(cssW: number) {
    const env = this.world.floors[0].envelope;
    const w = Math.max(...env.map((p) => p[0]));
    const h = Math.max(...env.map((p) => p[1]));
    const pad = this.label ? 10 : 6;
    const scale = (cssW - 2 * pad) / w;
    const cssH = Math.round(h * scale + 2 * pad);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.view = { scale, pad, h };
    this.canvas.getContext('2d')!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  toPx(p: Vec2): [number, number] {
    const { scale, pad, h } = this.view;
    return [pad + p[0] * scale, pad + (h - p[1]) * scale];
  }

  draw(floor: FloorId, snap: MapSnapshot, selected: string | null) {
    const ctx = this.canvas.getContext('2d')!;
    const k = tokens();
    ctx.fillStyle = k.bg;
    ctx.fillRect(0, 0, this.canvas.clientWidth || this.canvas.width, this.canvas.clientHeight || this.canvas.height);
    const fill = (r: Room) => (r.access === 'restricted' ? k.restricted
      : r.category === 'work' ? k.work : r.category === 'recreation' || r.category === 'outdoor' ? k.rec
        : r.category === 'circulation' ? k.circ : k.room);
    for (const r of this.world.rooms) {
      if (r.floor !== floor) continue;
      ctx.beginPath();
      r.polygon.forEach((p, i) => { const [x, y] = this.toPx(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.closePath();
      ctx.fillStyle = fill(r);
      ctx.fill();
      ctx.lineWidth = this.label ? 1.5 : 1;
      ctx.strokeStyle = k.wall;
      ctx.stroke();
      if (snap.visitor && r.access === 'restricted') this.hatch(ctx, r, k.wall);
    }
    // Stairs and lift: the way to the other floor.
    for (const link of this.world.verticalLinks) {
      if (link.playable === false) continue;
      for (const end of link.ends) {
        if (end.floor !== floor) continue;
        const [x, y] = this.toPx(end.point);
        const s = this.label ? 7 : 4;
        ctx.fillStyle = k.ink;
        ctx.fillRect(x - s, y - s, 2 * s, 2 * s);
        if (this.label) {
          ctx.fillStyle = k.surface;
          ctx.font = `700 ${s + 3}px ${getComputedStyle(document.body).fontFamily}`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(link.type === 'lift' ? 'L' : '⇅', x, y + 0.5);
        }
      }
    }
    this.tagBoxes = snap.people.filter((p) => p.floor === floor).map((p) => { const [x, y] = this.toPx(p.pos); return [x, y - 11] as [number, number]; });
    if (this.label) this.roomNames(ctx, floor, k);
    const r = this.label ? 6 : 3.2;
    for (const p of snap.people) {
      if (p.floor !== floor) continue;
      const [x, y] = this.toPx(p.pos);
      if (p.busy) { ctx.beginPath(); ctx.arc(x, y, r + 3, 0, Math.PI * 2); ctx.strokeStyle = k.accent; ctx.lineWidth = 2; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = k.green; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = k.surface; ctx.stroke();
      if (p.id === selected) { ctx.beginPath(); ctx.setLineDash([4, 3]); ctx.arc(x, y, r + 9, 0, Math.PI * 2); ctx.strokeStyle = k.focus; ctx.lineWidth = 2.5; ctx.stroke(); ctx.setLineDash([]); }
      if (this.label) this.tag(ctx, p.name, x, y - r - 5, k, p.id === selected);
    }
    if (snap.floor === floor) {
      const [x, y] = this.toPx(snap.pos);
      const a = (snap.facing * Math.PI) / 180;
      const s = this.label ? 11 : 8;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(-a);
      ctx.beginPath();
      ctx.moveTo(s, 0); ctx.lineTo(-s * 0.7, s * 0.65); ctx.lineTo(-s * 0.35, 0); ctx.lineTo(-s * 0.7, -s * 0.65);
      ctx.closePath();
      ctx.fillStyle = k.accent; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = k.surface; ctx.stroke();
      ctx.restore();
      if (this.label) this.tag(ctx, t('Kamu'), x, y + s + 13, k, true);
    }
  }

  /** Persona under a canvas point (CSS px), for clicks on the full map. */
  hit(floor: FloorId, snap: MapSnapshot, cx: number, cy: number): string | null {
    let best: string | null = null;
    let bd = 16;
    for (const p of snap.people) {
      if (p.floor !== floor) continue;
      const [x, y] = this.toPx(p.pos);
      const d = Math.hypot(x - cx, y - cy);
      if (d < bd) { bd = d; best = p.id; }
    }
    return best;
  }

  private hatch(ctx: CanvasRenderingContext2D, r: Room, color: string) {
    const xs = r.polygon.map((p) => this.toPx(p));
    const minX = Math.min(...xs.map((p) => p[0])); const maxX = Math.max(...xs.map((p) => p[0]));
    const minY = Math.min(...xs.map((p) => p[1])); const maxY = Math.max(...xs.map((p) => p[1]));
    ctx.save();
    ctx.beginPath();
    xs.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath();
    ctx.clip();
    ctx.strokeStyle = color; ctx.globalAlpha = 0.35; ctx.lineWidth = 1;
    for (let k = minX - (maxY - minY); k < maxX; k += 6) { ctx.beginPath(); ctx.moveTo(k, maxY); ctx.lineTo(k + (maxY - minY), minY); ctx.stroke(); }
    ctx.restore();
  }

  private roomNames(ctx: CanvasRenderingContext2D, floor: FloorId, k: Tokens) {
    ctx.font = `600 11px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = k.muted;
    for (const r of this.world.rooms) {
      if (r.floor !== floor || r.category === 'shaft') continue;
      const xs = r.polygon.map((p) => this.toPx(p));
      const minX = Math.min(...xs.map((p) => p[0])); const maxX = Math.max(...xs.map((p) => p[0]));
      const minY = Math.min(...xs.map((p) => p[1])); const maxY = Math.max(...xs.map((p) => p[1]));
      if (maxY - minY < 16) continue;
      if (ctx.measureText(r.name).width + 6 > maxX - minX) continue;
      const cx = (minX + maxX) / 2;
      const busy = this.tagBoxes.some(([x, y]) => Math.abs(x - cx) < ctx.measureText(r.name).width / 2 + 24 && Math.abs(y - (minY + 10)) < 14);
      if (!busy) ctx.fillText(r.name, cx, minY + 10);
    }
  }

  private tag(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, k: Tokens, strong: boolean) {
    ctx.font = `${strong ? 800 : 700} 11px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = k.surface;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(x - w / 2, y - 7, w, 14);
    ctx.globalAlpha = 1;
    ctx.fillStyle = k.ink;
    ctx.fillText(text, x, y);
  }
}

export class MapUI {
  private mini: PlanCanvas;
  private big: PlanCanvas;
  private miniBtn: HTMLButtonElement;
  private miniFloor: HTMLElement;
  private miniAway: HTMLElement;
  private dlg: HTMLDialogElement;
  private tabs: Record<FloorId, HTMLButtonElement>;
  private lists: HTMLElement;
  private stage!: HTMLElement;
  private shown: FloorId = 'L1';
  private selected: string | null = null;
  private listSig = '';
  private timer = 0;

  constructor(private world: World, private host: MapHost) {
    this.mini = new PlanCanvas(world, false);
    this.big = new PlanCanvas(world, true);
    this.mini.canvas.setAttribute('aria-hidden', 'true');
    this.miniFloor = el('span', { class: 'minimap-floor' });
    this.miniAway = el('span', { class: 'minimap-away' });
    this.miniBtn = el('button', { type: 'button', class: 'minimap', id: 'minimap', 'aria-haspopup': 'dialog' });
    const meta = el('span', { class: 'minimap-meta' });
    meta.append(this.miniFloor, this.miniAway);
    this.miniBtn.append(this.mini.canvas, meta);
    this.miniBtn.addEventListener('click', () => this.open());
    document.getElementById('app')!.append(this.miniBtn);

    this.dlg = el('dialog', { class: 'dialog wide map-dialog', id: 'dlg-map', 'aria-labelledby': 'dlg-map-title' });
    const head = el('div', { class: 'map-head' });
    head.append(el('h2', { id: 'dlg-map-title' }, t('Peta kantor')));
    const tabRow = el('div', { class: 'map-tabs', role: 'group', 'aria-label': t('Pilih lantai') });
    this.tabs = {} as Record<FloorId, HTMLButtonElement>;
    for (const f of world.floors) {
      const b = el('button', { type: 'button', class: 'btn', 'aria-pressed': 'false', 'data-floor': f.id });
      b.addEventListener('click', () => { this.shown = f.id; this.render(true); });
      this.tabs[f.id] = b;
      tabRow.append(b);
    }
    head.append(tabRow);
    const stage = el('div', { class: 'map-stage' });
    this.big.canvas.setAttribute('role', 'img');
    this.big.canvas.addEventListener('click', (e) => {
      const rect = this.big.canvas.getBoundingClientRect();
      const id = this.big.hit(this.shown, this.host.snapshot(), e.clientX - rect.left, e.clientY - rect.top);
      if (id) this.select(id, true);
    });
    stage.append(this.big.canvas);
    const legend = el('p', { class: 'map-legend muted small' });
    legend.innerHTML = `<span class="lg you"></span>${t('Kamu')} <span class="lg npc"></span>${t('Persona')} <span class="lg busy"></span>${t('Sedang bekerja')} <span class="lg link"></span>${t('Tangga atau lift')}`;
    this.lists = el('div', { class: 'map-lists' });
    const close = el('form', { method: 'dialog' });
    close.append(el('button', { class: 'btn primary', value: 'close' }, t('Tutup')));
    const left = el('div', { class: 'map-left' });
    left.append(stage, legend);
    this.stage = stage;
    const body = el('div', { class: 'map-body' });
    body.append(left, this.lists);
    this.dlg.append(head, body, close);
    this.dlg.addEventListener('close', () => { this.selected = null; });
    document.body.append(this.dlg);

    const hud = document.querySelector('.hud-top');
    if (hud && 'ResizeObserver' in window) {
      new ResizeObserver(() => document.documentElement.style.setProperty('--hud-h', `${Math.round(hud.getBoundingClientRect().bottom)}px`)).observe(hud);
    }
    window.addEventListener('resize', () => this.layout());
    this.layout();
    this.timer = window.setInterval(() => this.render(false), 250);
  }

  get isOpen() { return this.dlg.open; }

  open(focusId?: string) {
    const snap = this.host.snapshot();
    this.shown = snap.floor;
    this.selected = null;
    if (focusId) {
      const p = snap.people.find((x) => x.id === focusId);
      if (p) { this.shown = p.floor; this.selected = p.id; }
    }
    this.listSig = '';
    openDialog(this.dlg, this.miniBtn);
    this.layout();
    this.render(true);
  }

  close() { if (this.dlg.open) this.dlg.close(); }

  dispose() { window.clearInterval(this.timer); this.miniBtn.remove(); this.dlg.remove(); }

  private layout() {
    const phone = matchMedia('(pointer: coarse), (max-width: 599px)').matches;
    this.mini.resize(phone ? 132 : 216);
    const avail = this.stage.clientWidth || Math.min(window.innerWidth - 48, 560);
    this.big.resize(Math.max(260, Math.min(620, avail)));
  }

  private select(id: string, scroll: boolean) {
    const snap = this.host.snapshot();
    const p = snap.people.find((x) => x.id === id);
    if (!p) return;
    this.selected = id;
    this.shown = p.floor;
    this.render(true);
    if (scroll) this.lists.querySelector<HTMLElement>(`[data-person="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  }

  private render(force: boolean) {
    const snap = this.host.snapshot();
    const hidden = document.getElementById('app')?.dataset.mode !== 'world';
    this.miniBtn.hidden = hidden;
    if (!hidden) {
      this.mini.draw(snap.floor, snap, null);
      this.miniFloor.textContent = floorName(snap.floor);
      const away = awayBadge(this.world, snap);
      this.miniAway.textContent = away?.text ?? '';
      this.miniAway.hidden = !away;
      const here = snap.people.filter((p) => p.floor === snap.floor).length;
      this.miniBtn.setAttribute('aria-label', t('Buka peta. Kamu di {floor}, {n} orang di lantai ini{away}.', { floor: floorName(snap.floor), n: here, away: away ? `, ${away.label}` : '' }));
    }
    if (!this.dlg.open) return;
    for (const [f, b] of Object.entries(this.tabs) as [FloorId, HTMLButtonElement][]) {
      const n = snap.people.filter((p) => p.floor === f).length;
      b.textContent = `${floorName(f)} (${n})${f === snap.floor ? ` · ${t('kamu')}` : ''}`;
      b.setAttribute('aria-pressed', String(f === this.shown));
      b.classList.toggle('primary', f === this.shown);
    }
    this.big.draw(this.shown, snap, this.selected);
    const onShown = snap.people.filter((p) => p.floor === this.shown).map((p) => p.name).join(', ');
    this.big.canvas.setAttribute('aria-label', `${t('Denah {floor}.', { floor: floorName(this.shown) })} ${snap.floor === this.shown ? `${t('Kamu ada di lantai ini.')} ` : ''}${onShown ? t('Persona: {names}.', { names: onShown }) : t('Tidak ada persona di lantai ini.')}`);
    this.renderLists(snap, force);
  }

  private renderLists(snap: MapSnapshot, force: boolean) {
    const sig = JSON.stringify([snap.floor, this.selected, snap.people.map((p) => [p.id, p.floor, placeText(this.world, p), p.doing, p.busy])]);
    if (!force && sig === this.listSig) return;
    this.listSig = sig;
    const active = document.activeElement as HTMLElement | null;
    const keep = active && this.lists.contains(active) ? { id: active.dataset.id, act: active.dataset.act } : null;
    const { here, away } = groupByFloor(snap);
    this.lists.replaceChildren();
    const section = (title: string, people: MapPerson[], note: string) => {
      const s = el('section', { class: 'map-group' });
      s.append(el('h3', {}, title));
      if (note) s.append(el('p', { class: 'muted small' }, note));
      if (!people.length) { s.append(el('p', { class: 'muted small' }, t('Tidak ada persona di sini.'))); return s; }
      const ul = el('ul', { class: 'map-people' });
      for (const p of people) ul.append(this.row(snap, p));
      s.append(ul);
      return s;
    };
    this.lists.append(section(t('{floor}, lantai kamu ({n})', { floor: floorName(snap.floor), n: here.length }), here, ''));
    const others = this.world.floors.filter((f) => f.id !== snap.floor);
    for (const f of others) {
      const list = away.filter((p) => p.floor === f.id);
      const up = f.level > this.world.floors.find((x) => x.id === snap.floor)!.level;
      this.lists.append(section(`${floorName(f.id)} (${list.length})`, list,
        list.length ? t('Beda lantai: {dir} lewat tangga atau lift, atau tekan Temui.', { dir: up ? t('naik') : t('turun') }) : ''));
    }
    if (keep?.id) this.lists.querySelector<HTMLElement>(`[data-id="${keep.id}"][data-act="${keep.act}"]`)?.focus();
  }

  private row(snap: MapSnapshot, p: MapPerson) {
    const li = el('li', { class: `map-person${p.id === this.selected ? ' selected' : ''}`, 'data-person': p.id });
    const dot = el('span', { class: `lg ${p.busy ? 'busy' : 'npc'}`, 'aria-hidden': 'true' });
    const text = el('div', { class: 'map-person-text' });
    const name = el('strong', {}, p.name);
    const role = el('span', { class: 'muted small' }, ` ${p.role}`);
    const line = el('div', { class: 'small' }, `${placeText(this.world, p)} · ${t(p.doing)}`);
    text.append(name, role, line);
    if (p.floor !== snap.floor) text.append(el('span', { class: 'tag floor-tag' }, t('{floor}, beda lantai', { floor: p.floor })));
    const actions = el('div', { class: 'map-person-actions' });
    const show = el('button', { type: 'button', class: 'btn', 'data-id': p.id, 'data-act': 'show' }, t('Lihat'));
    show.setAttribute('aria-label', t('Tandai {name} di peta {floor}', { name: p.name, floor: floorName(p.floor) }));
    show.addEventListener('click', () => this.select(p.id, false));
    const meet = el('button', { type: 'button', class: 'btn primary', 'data-id': p.id, 'data-act': 'meet' }, t('Temui'));
    meet.setAttribute('aria-label', `${t('Temui {name}', { name: p.name })}${p.floor !== snap.floor ? ` ${t('di {floor}', { floor: floorName(p.floor) })}` : ''}`);
    meet.addEventListener('click', () => {
      const now = this.host.snapshot();
      const cur = now.people.find((x) => x.id === p.id);
      this.close();
      if (cur && cur.floor !== now.floor) toast(t('{name} ada di {floor}. Pindah lantai untuk menemuinya.', { name: p.name, floor: floorName(cur.floor) }), 3200);
      this.host.meet(p.id);
    });
    actions.append(show, meet);
    li.append(dot, text, actions);
    return li;
  }
}

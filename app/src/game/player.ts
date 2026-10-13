// CEO controller: camera-relative movement, grid collision with axis sliding
// (same navgrid the validator proves reachable), stuck recovery to the
// floor's safe waypoint.
import * as THREE from 'three';
import type { NavGrid } from '../world/navgrid';
import type { FloorId, Vec2 } from '../world/types';
import { Avatar } from './avatar';
import { AGENT_GAP, stepBlocked } from '../sim/agents';

// Chibi legs: native walk ~0.85 m/s; 1.6 m/s walk plays the clip at ~1.9x,
// which reads as brisk steps without visible sliding (timeScale follows speed).
export const WALK_SPEED = 1.6;
export const RUN_SPEED = 3.4;
/** Pushing into a persona this long (s) lets the CEO walk through them. */
export const PUSH_THROUGH_S = 2;

export class Player {
  pos: Vec2;
  floor: FloorId;
  facing: number; // plan degrees
  speed = 0;
  /** Facing change rate (deg/s, + = left), smoothed; drives body lean. */
  turnRate = 0;
  readonly avatar: Avatar;
  stuckRecoveries = 0;
  /** Seconds spent pressing against a persona without getting past. */
  pushTime = 0;
  /** Walking through personas: set by Run or by a 2 s push, cleared once clear of everyone. */
  ghost = false;
  /** How the CEO last got through a persona, for the HUD hint. */
  ghostBy: 'run' | 'push' | null = null;

  constructor(pos: Vec2, floor: FloorId, facing: number) {
    this.pos = [pos[0], pos[1]];
    this.floor = floor;
    this.facing = facing;
    this.avatar = new Avatar('CEO', 0x1f4d3a);
    this.avatar.setFacing(facing);
  }

  /** Move by intent (plan direction, 0..1). Returns metres actually moved. */
  /** `others`: NPC discs on this floor; the CEO stops at them and slides around them.
   *  Running, or pushing into one for PUSH_THROUGH_S, walks straight through instead
   *  (personas never trap the CEO). Walls and furniture always block. */
  step(dt: number, dir: Vec2, run: boolean, nav: NavGrid, others: Vec2[] = []): number {
    const mag = Math.hypot(dir[0], dir[1]);
    const touching = others.some((o) => Math.hypot(o[0] - this.pos[0], o[1] - this.pos[1]) < AGENT_GAP + 0.05);
    if (run && mag > 0.05 && touching && !this.ghost) { this.ghost = true; this.ghostBy = 'run'; }
    // Ghosting ends as soon as no persona overlaps the CEO any more.
    if (this.ghost && !touching) { this.ghost = false; this.pushTime = 0; }
    const moved = this.move(dt, dir, mag, run, nav, this.ghost ? [] : others);
    if (!this.ghost) {
      const want = this.speed * dt;
      const pushing = mag > 0.05 && touching && want > 1e-4 && moved < want * 0.35;
      this.pushTime = pushing ? this.pushTime + dt : Math.max(0, this.pushTime - dt * 2);
      if (this.pushTime >= PUSH_THROUGH_S) { this.ghost = true; this.ghostBy = 'push'; this.pushTime = 0; }
    }
    return moved;
  }

  private move(dt: number, dir: Vec2, mag: number, run: boolean, nav: NavGrid, others: Vec2[]): number {
    const target = mag > 0.05 ? (run ? RUN_SPEED : WALK_SPEED) * Math.min(1, mag) : 0;
    // Speeding up takes ~0.3 s, slowing down ~0.2 s (REQ-ANIM-02): visible
    // start and stop without making the controls feel heavy.
    this.speed += (target - this.speed) * Math.min(1, dt * (target > this.speed ? 7 : 11));
    let turned = 0;
    if (mag > 0.05) {
      const want = THREE.MathUtils.radToDeg(Math.atan2(dir[1], dir[0]));
      const diff = ((want - this.facing + 540) % 360) - 180;
      turned = diff * Math.min(1, dt * 14);
      this.facing += turned;
    }
    this.turnRate += (turned / Math.max(dt, 1e-4) - this.turnRate) * Math.min(1, dt * 12);
    if (this.speed < 0.01 || mag < 0.05) {
      this.avatar.setFacing(this.facing);
      return 0;
    }
    const ux = dir[0] / mag;
    const uy = dir[1] / mag;
    const dist = this.speed * dt;
    // Sub-step so a fast frame cannot tunnel through a 0.15 m wall.
    const steps = Math.max(1, Math.ceil(dist / 0.05));
    let moved = 0;
    const free = (p: Vec2) => nav.walkableAt(p) && !others.some((o) => stepBlocked(this.pos, p, o));
    for (let s = 0; s < steps; s++) {
      const d = dist / steps;
      const nx = this.pos[0] + ux * d;
      const ny = this.pos[1] + uy * d;
      if (free([nx, ny])) { this.pos = [nx, ny]; moved += d; continue; }
      // Bumped into a persona: keep only the tangential part of the move so
      // the CEO slides around them instead of stopping dead or passing through.
      const o = others.find((q) => Math.hypot(q[0] - nx, q[1] - ny) < AGENT_GAP);
      if (o) {
        const rx = o[0] - this.pos[0];
        const ry = o[1] - this.pos[1];
        const rl = Math.hypot(rx, ry) || 1;
        const dot = (ux * rx + uy * ry) / rl;
        const tx = ux - (dot * rx) / rl;
        const ty = uy - (dot * ry) / rl;
        const t: Vec2 = [this.pos[0] + tx * d, this.pos[1] + ty * d];
        if (Math.hypot(tx, ty) > 0.2 && free(t)) { this.pos = t; moved += Math.hypot(tx, ty) * d; continue; }
        break;
      }
      if (free([nx, this.pos[1]])) { this.pos = [nx, this.pos[1]]; moved += Math.abs(ux * d); continue; }
      if (free([this.pos[0], ny])) { this.pos = [this.pos[0], ny]; moved += Math.abs(uy * d); continue; }
      break;
    }
    this.avatar.setFacing(this.facing);
    return moved;
  }

  /** If the current cell became blocked (layout change, floor switch), recover. */
  ensureWalkable(nav: NavGrid, safe: Vec2): boolean {
    if (nav.walkableAt(this.pos)) return false;
    const near = nav.nearestWalkable(this.pos, 1.5);
    this.pos = near ?? [safe[0], safe[1]];
    this.stuckRecoveries++;
    return true;
  }
}

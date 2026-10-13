// Gamepad profiles chosen in Settings. Pure data, imported only by the lazy
// gamepad loop and the lazy Settings visual, so the entry chunk stays the same.
import type { PadProfileId } from '../ui/settings';
export type { PadProfileId };
export const PAD_PROFILE_IDS: readonly PadProfileId[] = ['standar', 'kidal', 'santai', 'terbalik'];

export interface PadProfile {
  /** Right stick walks and left stick turns the camera. */
  swapSticks: boolean;
  /** Radial dead zone; larger tolerates a pad whose sticks drift. */
  dead: number;
  /** Camera speed in rad/s at full tilt. */
  lookYaw: number;
  lookPitch: number;
  /** Full tilt switches to running; off means running only via the run button. */
  autoRun: boolean;
  /** Face buttons reversed, Japanese/Nintendo style: Cross <-> Circle, Square <-> Triangle. */
  swapFace: boolean;
}

export const PAD_PROFILES: Record<PadProfileId, PadProfile> = {
  standar: { swapSticks: false, dead: 0.22, lookYaw: 2.4, lookPitch: 1.2, autoRun: true, swapFace: false },
  kidal: { swapSticks: true, dead: 0.22, lookYaw: 2.4, lookPitch: 1.2, autoRun: true, swapFace: false },
  santai: { swapSticks: false, dead: 0.32, lookYaw: 1.4, lookPitch: 0.7, autoRun: false, swapFace: false },
  terbalik: { swapSticks: false, dead: 0.22, lookYaw: 2.4, lookPitch: 1.2, autoRun: true, swapFace: true },
};

export function isPadProfile(v: unknown): v is PadProfileId {
  return typeof v === 'string' && (PAD_PROFILE_IDS as readonly string[]).includes(v);
}

/** Axis indices [x, y] of the walking stick and the camera stick for a profile. */
export function stickAxes(p: PadProfile): { move: [number, number]; look: [number, number] } {
  return p.swapSticks ? { move: [2, 3], look: [0, 1] } : { move: [0, 1], look: [2, 3] };
}

/** Physical standard-mapping index that triggers each logical face action (A, B, X, Y). */
export function faceButtons(p: PadProfile): { A: number; B: number; X: number; Y: number } {
  return p.swapFace ? { A: 1, B: 0, X: 3, Y: 2 } : { A: 0, B: 1, X: 2, Y: 3 };
}

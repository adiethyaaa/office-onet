// Avatar choice helpers (REQ-AVATAR-01), loaded with the world. The dialog
// itself lives in avatar-studio.ts and is fetched on first open.
// Avatar Studio (REQ-AVATAR-01). Options come from design/characters.json
// avatarVariants and are filtered by what the loaded GLB actually contains,
// so no choice is offered without an asset. Preferences persist per browser;
// anything stored that no longer exists falls back to the default.
import type * as THREE from 'three';
import charactersJson from '@design/characters.json';

export interface Palette { label: string; [material: string]: string }
interface VariantSpec { defaultHair: string; hairStyles: string[]; defaultPalette: string; palettes: Record<string, Palette> }
export interface AvatarChoice { hair: string; palette: string }

export const SPEC = (charactersJson as unknown as { avatarVariants: Record<string, VariantSpec>; hairStyles?: Record<string, { label?: string }> }).avatarVariants['CH-CEO'];
export const HAIR_LABEL: Record<string, string> = { short_tuft: 'Pendek berjambul', swept: 'Disisir ke samping', spiky_soft: 'Jabrik lembut' };
const KEY = 'kantor-rpg.avatar.v1';
export const PREVIEW_CLIPS = ['idle', 'walk', 'wave', 'talk', 'sit', 'type'];

export const DEFAULT_CHOICE: AvatarChoice = { hair: SPEC.defaultHair, palette: SPEC.defaultPalette };

export function paletteColors(name: string): Record<string, string> {
  const p = SPEC.palettes[name] ?? SPEC.palettes[SPEC.defaultPalette];
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(p)) if (k !== 'label') out[k] = v;
  return out;
}

/** Stored choice, validated against the spec and the hair nodes actually present. */
export function loadChoice(available: string[] = SPEC.hairStyles): AvatarChoice {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<AvatarChoice> | null;
    if (raw && typeof raw.hair === 'string' && typeof raw.palette === 'string' && available.includes(raw.hair) && SPEC.palettes[raw.palette]) {
      return { hair: raw.hair, palette: raw.palette };
    }
  } catch { /* storage blocked or corrupt: default below */ }
  return { ...DEFAULT_CHOICE };
}

export function saveChoice(c: AvatarChoice): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(c)); return true; } catch { return false; }
}

export function clearChoice(): void {
  try { localStorage.removeItem(KEY); } catch { /* nothing to clear */ }
}

/** Hair styles present as nodes in a loaded model. */
export function availableHair(model: THREE.Object3D | null): string[] {
  if (!model) return [];
  const found = new Set<string>();
  model.traverse((o) => { const m = /^hair_([a-z_]+?)(?:[._]\d+)?$/.exec(o.name); if (m) found.add(m[1]); });
  return SPEC.hairStyles.filter((h) => found.has(h));
}


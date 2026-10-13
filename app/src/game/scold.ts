// Reprimand (PRD v2.0 REQ-TEGUR): slapstick props and per-persona lines.
// Visual only: nothing here talks to an agent, the backend or Telegram.
import * as THREE from 'three';

export type ScoldProp = 'gulungan' | 'palu' | 'bola';

export const SCOLD_PROPS: { id: ScoldProp; label: string; sfx: string }[] = [
  { id: 'gulungan', label: 'Tepuk gulungan kertas', sfx: 'swat' },
  { id: 'palu', label: 'Ketuk palu mainan', sfx: 'boing' },
  { id: 'bola', label: 'Lempar bola kertas', sfx: 'pop' },
];

/** One line per persona, in character. Indonesian source; t() translates. */
export const SCOLD_LINES: Record<string, string[]> = {
  'ACT-MAX': ['Siap, Pak! Saya rapikan antreannya sekarang.', 'Aduh. Oke, kembali koordinasi.'],
  'ACT-HUGO': ['Aduh, penggaris saya! Balik ke denah.', 'Iya, iya, gambarnya saya lanjutkan.'],
  'ACT-NOVA': ['Sinyal diterima, Pak. Balik ke desain jaringan.', 'Oke, spesifikasinya saya selesaikan.'],
  'ACT-BRUNO': ['Waduh! Kabelnya saya tarik lagi sekarang.', 'Siap, cek server dulu.'],
  'ACT-KEVIN': ['Aw! Posternya hampir jadi kok.', 'Oke, kembali ke kanvas.'],
  'ACT-REX': ['Teguran diterima. Status: kembali kerja.', 'Bug ditemukan: saya. Diperbaiki.'],
  'ACT-ECHO': ['Eh, iya! Catatannya saya lanjutkan.', 'Maaf, Pak. Langsung kerja.'],
  'ACT-LEO': ['Aduh, ide saya buyar! Balik ke meja.', 'Oke, desainnya saya kejar.'],
};
export const SCOLD_FALLBACK = 'Aduh! Iya, kembali kerja.';

const PAPER = 0xf4ecdc;
const RED = 0xc0533a;
const WOOD = 0x9a6b43;

/** Small procedural prop mesh (no asset download). */
export function propMesh(kind: ScoldProp): THREE.Object3D {
  const g = new THREE.Group();
  if (kind === 'gulungan') {
    const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 12), new THREE.MeshStandardMaterial({ color: PAPER, roughness: 0.9 }));
    roll.rotation.z = Math.PI / 2;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.05, 12), new THREE.MeshStandardMaterial({ color: RED }));
    band.rotation.z = Math.PI / 2;
    g.add(roll, band);
  } else if (kind === 'palu') {
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.22, 14), new THREE.MeshStandardMaterial({ color: RED, roughness: 0.5 }));
    head.rotation.z = Math.PI / 2;
    head.position.y = 0.25;
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.45, 8), new THREE.MeshStandardMaterial({ color: WOOD }));
    g.add(head, stick);
  } else {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 1), new THREE.MeshStandardMaterial({ color: PAPER, roughness: 1, flatShading: true }));
    g.add(ball);
  }
  return g;
}

/**
 * Animate a prop from the CEO to the persona's head over `dur` seconds.
 * Swings (roll, hammer) arc over the target; the ball flies in a parabola.
 * Returns the hit moment (s) so the caller can time the reaction.
 */
export function animateProp(scene: THREE.Object3D, kind: ScoldProp, from: THREE.Vector3, to: THREE.Vector3, reducedMotion: boolean, onHit: () => void): void {
  const prop = propMesh(kind);
  scene.add(prop);
  const dur = reducedMotion ? 0.05 : kind === 'bola' ? 0.45 : 0.35;
  const hold = reducedMotion ? 0.3 : 0.5;
  const t0 = performance.now();
  let hit = false;
  const head = to.clone();
  const tick = () => {
    const t = (performance.now() - t0) / 1000;
    const k = Math.min(1, t / dur);
    if (kind === 'bola') {
      prop.position.lerpVectors(from, head, k);
      prop.position.y += Math.sin(k * Math.PI) * 0.6;
      prop.rotation.x += 0.4;
    } else {
      // Swing down onto the head from above-behind.
      prop.position.copy(head).add(new THREE.Vector3(0, 0.35 * (1 - k) + 0.12, 0));
      prop.rotation.x = -1.4 * (1 - k);
      if (k >= 1 && !reducedMotion) prop.scale.setScalar(1 + 0.15 * Math.sin((t - dur) * 30) * Math.max(0, 1 - (t - dur) * 3));
    }
    if (k >= 1 && !hit) { hit = true; onHit(); }
    if (t < dur + hold) requestAnimationFrame(tick);
    else scene.remove(prop);
  };
  requestAnimationFrame(tick);
}

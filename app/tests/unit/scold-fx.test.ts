import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { arcPoint, BALL_RELEASE, IMPACT_WORD, propMesh, ScoldFx, SWING_END, swingAngle, TIMING, type ScoldProp } from '../../src/game/scold';
import { EN } from '../../src/i18n/en';

// Effect-level checks for REQ-TEGUR: anticipation, fast swing, a single
// impact, hit-stop, ball bounce, reduced motion and no leaked GPU objects.
function rig(kind: ScoldProp, reducedMotion = false, dist = 1.1) {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const head = new THREE.Vector3(0, 1.75, -dist);
  let impacts = 0;
  let swings = 0;
  const fx = new ScoldFx({ scene, kind, reducedMotion, ceo: { root, model: null }, head: () => head.clone(), floorY: 0, onImpact: () => impacts++, onSwing: () => swings++ });
  return { scene, fx, head, get impacts() { return impacts; }, get swings() { return swings; } };
}

function run(fx: ScoldFx, secs: number, dt = 1 / 60) {
  let left = secs;
  while (left > 0 && fx.update(dt)) left -= dt;
}

describe('reprimand effect (REQ-TEGUR)', () => {
  it('winds up behind the shoulder before swinging forward fast', () => {
    const aHit = 1.1;
    const start = swingAngle('gulungan', 0, aHit);
    const back = Math.min(...Array.from({ length: 60 }, (_, i) => swingAngle('gulungan', (i / 60) * SWING_END, aHit)));
    expect(back).toBeLessThan(-0.7); // anticipation: arm goes behind vertical
    expect(start).toBeGreaterThan(aHit);
    expect(swingAngle('gulungan', SWING_END, aHit)).toBeCloseTo(aHit, 5);
    // The forward swing covers far more angle per second than the wind-up.
    const windRate = Math.abs(start - back) / TIMING.windup;
    const swingRate = Math.abs(aHit - back) / TIMING.swing;
    expect(swingRate).toBeGreaterThan(windRate * 1.5);
    // Ease-in: the first half of the swing is slower than the second.
    const mid = SWING_END - TIMING.swing / 2;
    expect(swingAngle('gulungan', mid, aHit) - back).toBeLessThan(aHit - swingAngle('gulungan', mid, aHit));
  });

  it('the ball flies a parabola: above the straight line, ends on the target', () => {
    const a = new THREE.Vector3(0, 1.4, 0);
    const b = new THREE.Vector3(0, 1.7, -3);
    expect(arcPoint(a, b, 0.5, 0.5).y).toBeCloseTo((a.y + b.y) / 2 + 0.5, 5);
    expect(arcPoint(a, b, 1, 0.5).distanceTo(b)).toBeLessThan(1e-9);
    expect(BALL_RELEASE).toBeLessThan(SWING_END);
  });

  for (const kind of ['gulungan', 'palu'] as const) {
    it(`${kind}: one impact at the end of the swing, prop held in hand, then everything is disposed`, () => {
      const r = rig(kind);
      const disposed: string[] = [];
      r.fx.group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.addEventListener('dispose', () => disposed.push('g'));
      });
      expect(r.fx.resources).toBeGreaterThan(2);
      run(r.fx, SWING_END - 0.05);
      expect(r.impacts).toBe(0);
      expect(r.swings).toBe(1);
      // Grip sits at the shoulder-relative hand, not over the persona's head.
      const prop = r.fx.group.getObjectByName(`scold-${kind}`)!;
      expect(prop.position.distanceTo(r.head)).toBeGreaterThan(0.5);
      expect(r.fx.group.children.filter((c) => c.visible && c !== prop).length).toBeGreaterThan(0); // motion trail
      run(r.fx, 0.1);
      expect(r.impacts).toBe(1);
      run(r.fx, 3);
      expect(r.impacts).toBe(1);
      expect(r.fx.finished).toBe(true);
      expect(r.scene.getObjectByName('scold-fx')).toBeUndefined();
      expect(r.fx.resources).toBe(0);
      expect(disposed.length).toBeGreaterThan(0);
    });
  }

  it('impact frame: a hit-stop of about 80 ms freezes the effect clock', () => {
    const r = rig('palu');
    run(r.fx, SWING_END + 0.005, 0.005);
    expect(r.impacts).toBe(1);
    expect(r.fx.frozen).toBe(true);
    let held = 0;
    while (r.fx.frozen) { r.fx.update(0.01); held += 0.01; }
    expect(held).toBeGreaterThanOrEqual(0.07);
    expect(held).toBeLessThanOrEqual(0.1);
  });

  it('paper ball: thrown from the hand, hits the head, bounces to the floor and vanishes', () => {
    const r = rig('bola', false, 3);
    const prop = r.fx.group.getObjectByName('scold-bola')!;
    let maxY = 0;
    let minY = Infinity;
    let dt = 0;
    while (r.fx.update(1 / 60) && dt < 6) {
      dt += 1 / 60;
      if (r.impacts) { minY = Math.min(minY, prop.position.y); } else if (dt > BALL_RELEASE) maxY = Math.max(maxY, prop.position.y);
    }
    expect(r.impacts).toBe(1);
    expect(maxY).toBeGreaterThan(1.75); // arcs above the head height
    expect(minY).toBeLessThan(0.2); // reached the floor after the hit
    expect(r.fx.finished).toBe(true);
    expect(r.fx.resources).toBe(0);
  });

  it('reduced motion: no trail, no hit-stop, still one impact and full cleanup', () => {
    const r = rig('gulungan', true);
    let trail = 0;
    let frozen = false;
    while (r.fx.update(1 / 60)) {
      trail = Math.max(trail, r.fx.group.children.length - 1);
      frozen ||= r.fx.frozen;
    }
    expect(trail).toBe(0);
    expect(frozen).toBe(false);
    expect(r.impacts).toBe(1);
    expect(r.fx.resources).toBe(0);
  });

  it('dispose before contact still reports the hit once (the persona always reacts)', () => {
    const r = rig('palu');
    r.fx.update(0.1);
    r.fx.dispose();
    r.fx.dispose();
    expect(r.impacts).toBe(1);
    expect(r.fx.resources).toBe(0);
  });

  it('props are procedural and the impact words have English entries', () => {
    for (const k of ['gulungan', 'palu', 'bola'] as const) expect(propMesh(k).children.length).toBeGreaterThan(0);
    for (const w of Object.values(IMPACT_WORD)) expect(EN[w], w).toBeTruthy();
  });
});

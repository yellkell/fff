/**
 * IMPACTS: the light a hit makes. A bloom of light at the point (a glow
 * that swells and fades, with a white-hot heart) and a shockwave ring
 * racing out from it, turned to face you. Pooled, so a busy fight never
 * allocates.
 *
 * Everything fades by ALPHA, never by colour: over passthrough a light
 * faded to black but still drawn is a black hole in your room (see
 * Sparks in neon.ts).
 */

import {
  AdditiveBlending,
  Color,
  type ColorRepresentation,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  type Scene,
  type Sprite,
  type SpriteMaterial,
  type Vector3,
} from 'three';
import { glowSprite } from './neon.js';

interface Slot<T extends Sprite | Mesh> {
  obj: T;
  mat: SpriteMaterial | MeshBasicMaterial;
  /** Seconds since it started (negative: still waiting to go). */
  t: number;
  life: number;
  from: number;
  to: number;
  peak: number;
  live: boolean;
}

const FLASHES = 24;
const RINGS = 20;
const WHITE = new Color(0xffffff);
const ease = (u: number): number => 1 - (1 - u) ** 3;

export class Impacts {
  private readonly flashes: Slot<Sprite>[] = [];
  private readonly rings: Slot<Mesh>[] = [];
  private nf = 0;
  private nr = 0;
  private readonly _c = new Color();

  constructor(scene: Scene) {
    for (let i = 0; i < FLASHES; i++) {
      const obj = glowSprite(0xffffff, 1, 0);
      // Drawn over everything: a hit lands ON the titan's glass, and its
      // own plates would otherwise hide the bloom behind them.
      obj.material.depthTest = false;
      obj.visible = false;
      obj.renderOrder = 20;
      scene.add(obj);
      this.flashes.push({ obj, mat: obj.material, t: 0, life: 1, from: 0, to: 0, peak: 0, live: false });
    }
    // A thin unit ring, scaled up as it races out.
    const ringGeo = new RingGeometry(0.86, 1, 48);
    for (let i = 0; i < RINGS; i++) {
      const mat = new MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        depthTest: false,
        side: DoubleSide,
        toneMapped: false,
      });
      const obj = new Mesh(ringGeo, mat);
      obj.visible = false;
      obj.renderOrder = 20;
      scene.add(obj);
      this.rings.push({ obj, mat, t: 0, life: 1, from: 0, to: 0, peak: 0, live: false });
    }
  }

  /**
   * A hit at `at`. `size` is the bloom's peak size in metres; `rings` how
   * many shockwaves race out (0–2); the heart of the bloom is white-hot.
   */
  hit(at: Vector3, color: ColorRepresentation, size: number, rings = 1): void {
    this._c.set(color);
    this.flash(at, this._c, size, 0.28, 0.9);
    this.flash(at, this._c.clone().lerp(WHITE, 0.75), size * 0.45, 0.16, 1);
    if (rings > 0) this.ring(at, this._c, size * 0.15, size * 1.3, 0.34, 0.85, 0);
    if (rings > 1) this.ring(at, this._c.clone().lerp(WHITE, 0.5), size * 0.1, size * 0.85, 0.28, 0.7, 0.07);
  }

  private flash(at: Vector3, c: Color, size: number, life: number, peak: number): void {
    const s = this.flashes[this.nf];
    this.nf = (this.nf + 1) % FLASHES;
    s.obj.position.copy(at);
    s.mat.color.copy(c);
    Object.assign(s, { t: 0, life, from: size * 0.35, to: size, peak, live: true });
  }

  private ring(at: Vector3, c: Color, from: number, to: number, life: number, peak: number, delay: number): void {
    const s = this.rings[this.nr];
    this.nr = (this.nr + 1) % RINGS;
    s.obj.position.copy(at);
    s.mat.color.copy(c);
    Object.assign(s, { t: -delay, life, from, to, peak, live: true });
  }

  /** Grow and fade them all; rings turn to face `head`. */
  update(delta: number, head: Vector3): void {
    for (const s of this.flashes) this.step(s, delta, 2);
    for (const s of this.rings) {
      if (this.step(s, delta, 1.5)) s.obj.lookAt(head);
    }
  }

  /** True while it's showing. */
  private step(s: Slot<Sprite | Mesh>, delta: number, fade: number): boolean {
    if (!s.live) return false;
    s.t += delta;
    if (s.t < 0) {
      s.obj.visible = false;
      return false;
    }
    const u = s.t / s.life;
    if (u >= 1) {
      s.live = false;
      s.obj.visible = false;
      s.mat.opacity = 0;
      return false;
    }
    s.obj.visible = true;
    s.obj.scale.setScalar(s.from + (s.to - s.from) * ease(u));
    s.mat.opacity = s.peak * (1 - u) ** fade;
    return true;
  }
}

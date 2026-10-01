/**
 * The neon kit: additive glow sprites, lit tubes and a small spark pool.
 * Everything is unlit and additive: it reads as light hanging in your room,
 * over passthrough, whatever the room's own lighting.
 */

import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  type ColorRepresentation,
  Points,
  PointsMaterial,
  type Scene,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { Impacts } from './impact.js';

let glowTex: CanvasTexture | null = null;

/** A soft radial falloff, made once and shared. */
export function glowTexture(): CanvasTexture {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  grad.addColorStop(0.45, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  glowTex = new CanvasTexture(c);
  return glowTex;
}

export function glowSprite(color: ColorRepresentation, size: number, opacity = 1): Sprite {
  const s = new Sprite(
    new SpriteMaterial({
      map: glowTexture(),
      color: new Color(color),
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  s.scale.setScalar(size);
  return s;
}

/* ── sparks: one pooled Points cloud for every burst in the scene ─────── */

/*
 * Over passthrough, ALPHA is what hides the room: additive blending still
 * adds each fragment's alpha to the frame, so a spark faded to black but
 * still drawn is a black disc in your room. Every spark fades its alpha
 * with its colour, and a spent one is drawn fully clear.
 */

const MAX_SPARKS = 600;

export class Sparks {
  private readonly pos = new Float32Array(MAX_SPARKS * 3);
  private readonly col = new Float32Array(MAX_SPARKS * 4);
  private readonly vel = new Float32Array(MAX_SPARKS * 3);
  private readonly life = new Float32Array(MAX_SPARKS);
  private readonly base = new Float32Array(MAX_SPARKS * 3);
  private next = 0;
  private readonly geo = new BufferGeometry();
  readonly points: Points;
  private readonly _c = new Color();

  constructor(scene: Scene) {
    this.geo.setAttribute('position', new BufferAttribute(this.pos, 3));
    this.geo.setAttribute('color', new BufferAttribute(this.col, 4));
    this.points = new Points(
      this.geo,
      new PointsMaterial({
        size: 0.025,
        map: glowTexture(),
        vertexColors: true,
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  burst(at: Vector3, count: number, color: ColorRepresentation, speed = 1.6): void {
    this._c.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % MAX_SPARKS;
      // A random direction, biased a touch upward.
      const u = Math.random() * 2 - 1;
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const v = speed * (0.4 + Math.random() * 0.8);
      this.vel[i * 3] = r * Math.cos(a) * v;
      this.vel[i * 3 + 1] = u * v + 0.4;
      this.vel[i * 3 + 2] = r * Math.sin(a) * v;
      this.pos[i * 3] = at.x;
      this.pos[i * 3 + 1] = at.y;
      this.pos[i * 3 + 2] = at.z;
      this.base[i * 3] = this._c.r;
      this.base[i * 3 + 1] = this._c.g;
      this.base[i * 3 + 2] = this._c.b;
      this.life[i] = 0.5 + Math.random() * 0.4;
    }
  }

  update(delta: number): void {
    for (let i = 0; i < MAX_SPARKS; i++) {
      if (this.life[i] <= 0) {
        this.col[i * 4] = this.col[i * 4 + 1] = this.col[i * 4 + 2] = this.col[i * 4 + 3] = 0;
        continue;
      }
      this.life[i] -= delta;
      this.vel[i * 3 + 1] -= 2.2 * delta;
      for (let k = 0; k < 3; k++) {
        this.vel[i * 3 + k] *= 1 - 1.8 * delta;
        this.pos[i * 3 + k] += this.vel[i * 3 + k] * delta;
      }
      const f = Math.max(0, Math.min(1, this.life[i] * 2));
      // Additive light is scaled by alpha, so fading alpha alone fades the
      // light, and the frame's alpha with it.
      for (let k = 0; k < 3; k++) this.col[i * 4 + k] = this.base[i * 3 + k];
      this.col[i * 4 + 3] = f;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
  }
}

/** The scene's one spark pool and impact pool (created by main). */
export const fx: { sparks: Sparks | null; impacts: Impacts | null } = { sparks: null, impacts: null };

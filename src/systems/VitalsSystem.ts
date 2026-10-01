/**
 * YOUR HEALTH, against a titan (FF2's arcade HUD, in neon): one small
 * segmented bar low in front of your pad, tilted up at your eyes, so a
 * glance down reads it and it never sits in the fight's line. The titan's
 * bar floats over its head; yours is here.
 *
 *   - eighteen skewed segments, cyan like your platform's rim;
 *   - a hit leaves a white trail of what you just lost, which holds a
 *     moment and then drains, and the frame flashes red;
 *   - under 30% it all goes red and pulses with your heartbeat.
 *
 * It rises with the titan and sinks when the fight's over. Every light
 * here fades by opacity (alpha), never to black: over passthrough a dark
 * light is a hole in your room.
 */

import { createSystem } from '@iwsdk/core';
import { AdditiveBlending, Color, DoubleSide, Group, Mesh, MeshBasicMaterial, Shape, ShapeGeometry, Vector3 } from 'three';
import { NEON } from '../config.js';
import { game } from '../game/state.js';
import { FONT, frame, glass, glowText, LAYER, textPlane } from '../ui/kit.js';
import { titanStats } from './TitanSystem.js';

const SEGMENTS = 18;
const W = 0.46;
const H = 0.072;
/** The bar's segments, in the panel's local metres. */
const BAR = { x0: -0.15, x1: 0.208, h: 0.028, gap: 0.0045, y: -0.004 };
/** In front of your standing spot, at the pad's front edge, ~40° below
 *  your eyes: low enough that it sits over your floor and never in front
 *  of a titan's low weak point. Clamped so it works sitting or standing. */
const PLACE = { z: -0.85, belowEyes: 0.72, minY: 0.65, maxY: 1.1 };

const _head = new Vector3();
const CYAN = new Color(NEON.cyan);
const DANGER = new Color(NEON.danger);
const WHITE = new Color(NEON.hot);
const DIM = new Color(0x8a90b0);

/** What the bar shows, for the probes. */
export const vitalsStats = { visible: false, hp: 1, trail: 1 };

export class VitalsSystem extends createSystem({}) {
  private readonly root = new Group();
  private readonly segs: MeshBasicMaterial[] = [];
  private frameMat!: MeshBasicMaterial;
  private rise = 0;
  private shown = 1;
  private trail = 1;
  private hold = 0;
  private hitFlash = 0;
  private placedFor = -1;
  private t = 0;

  init(): void {
    this.root.name = 'vitals';
    this.root.add(glass(W, H, 0.012));
    const f = frame(W, H, 0.003, NEON.cyan, 0.012);
    this.frameMat = f.material as MeshBasicMaterial;
    this.root.add(f);

    // YOU, on the left.
    const label = textPlane(0.075, H * 0.7);
    label.mesh.position.x = -W / 2 + 0.048;
    label.draw((g, w, h) => {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${h * 0.5}px ${FONT}`;
      glowText(g, 'YOU', w / 2, h / 2, NEON.cyan);
    });
    this.root.add(label.mesh);

    // The segments: skewed plates, each its own light.
    const segW = (BAR.x1 - BAR.x0 - BAR.gap * (SEGMENTS - 1)) / SEGMENTS;
    const skew = BAR.h * 0.35;
    const shape = new Shape();
    shape.moveTo(skew / 2, BAR.h / 2);
    shape.lineTo(segW + skew / 2, BAR.h / 2);
    shape.lineTo(segW - skew / 2, -BAR.h / 2);
    shape.lineTo(-skew / 2, -BAR.h / 2);
    shape.closePath();
    const geo = new ShapeGeometry(shape);
    for (let i = 0; i < SEGMENTS; i++) {
      const mat = new MeshBasicMaterial({
        color: NEON.cyan,
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
        toneMapped: false,
      });
      const m = new Mesh(geo, mat);
      m.position.set(BAR.x0 + i * (segW + BAR.gap), BAR.y, 0.0012);
      m.renderOrder = LAYER.text;
      this.root.add(m);
      this.segs.push(mat);
    }

    this.root.visible = false;
    this.scene.add(this.root);
  }

  update(delta: number): void {
    this.t += delta;
    const up = game.mode === 'titans' && (titanStats.phase === 'rising' || titanStats.phase === 'fight');
    if (up && (this.rise === 0 || this.placedFor !== game.recentred)) this.place();
    this.rise = Math.min(1, Math.max(0, this.rise + (up ? delta : -delta) / 0.35));
    this.root.visible = this.rise > 0;
    vitalsStats.visible = this.root.visible;
    if (!this.root.visible) {
      this.shown = this.trail = 1;
      return;
    }
    const e = this.rise * this.rise * (3 - 2 * this.rise);
    this.root.scale.set(0.7 + 0.3 * e, Math.max(0.001, e), 1);

    // Your health, and the trail of what you just lost.
    const hp = up ? game.playerHp : this.shown;
    if (hp < this.shown - 1e-4) {
      this.hold = 0.5;
      this.hitFlash = 1;
    }
    this.shown = hp;
    if (this.hold > 0) this.hold -= delta;
    else this.trail = Math.max(this.shown, this.trail - delta * 0.45);
    this.trail = Math.max(this.trail, this.shown);
    this.hitFlash = Math.max(0, this.hitFlash - delta * 3);
    vitalsStats.hp = this.shown;
    vitalsStats.trail = this.trail;

    // Nearly done: everything red, pulsing with your heartbeat.
    const low = this.shown < 0.3;
    const pulse = low ? 0.65 + 0.35 * Math.sin(this.t * (6 + (0.3 - this.shown) * 20)) ** 2 : 1;
    const lit = low ? DANGER : CYAN;
    for (let i = 0; i < SEGMENTS; i++) {
      const mat = this.segs[i];
      const fill = Math.min(1, Math.max(0, this.shown * SEGMENTS - i));
      const lost = Math.min(1, Math.max(0, this.trail * SEGMENTS - i)) - fill;
      if (fill > 0) {
        mat.color.copy(lit);
        mat.opacity = (0.3 + 0.65 * fill) * pulse;
      } else if (lost > 0.01) {
        mat.color.copy(WHITE);
        mat.opacity = 0.8 * Math.min(1, lost * 2);
      } else {
        mat.color.copy(DIM);
        mat.opacity = 0.09;
      }
    }
    this.frameMat.color.copy(low ? DANGER : CYAN).lerp(DANGER, this.hitFlash).multiplyScalar(0.7 + 0.3 * pulse);
  }

  /** In front of your pad, below your eyes, tilted up at you. */
  private place(): void {
    this.camera.getWorldPosition(_head);
    const y = Math.min(PLACE.maxY, Math.max(PLACE.minY, _head.y - PLACE.belowEyes));
    this.root.position.set(0, y, PLACE.z);
    this.root.lookAt(0, _head.y, 0);
    this.placedFor = game.recentred;
  }
}

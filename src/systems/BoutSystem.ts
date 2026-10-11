/**
 * FIGHT NIGHT: as a titan prints into your room, the bout it's for hangs
 * in the air between you: its title, what's at stake, who you're facing,
 * and the belt on the line, turning (game/career.ts). It clears a moment
 * after the fight starts.
 */

import { createSystem } from '@iwsdk/core';
import { Group, type MeshBasicMaterial, Vector3 } from 'three';
import { BELTS, beltOf, BOUTS, career, stakes } from '../game/career.js';
import { game } from '../game/state.js';
import { TITANS } from '../titans/roster.js';
import { BeltModel } from '../ui/belt.js';
import { fitFont, FONT, glowText, textPlane, type TextPlane } from '../ui/kit.js';
import { titanStats } from './TitanSystem.js';

const _head = new Vector3();
const ease = (t: number): number => t * t * (3 - 2 * t);

/** Where it hangs: between your pad and the titan, a little over your eyes
 *  (under the titan's health bar, from where you stand). */
const AT = new Vector3(0, 1.78, -1.25);
/** How long it stays once the fight is on, and its fades (seconds). */
const LINGER = 1.6;
const FADE = 0.45;

/** What the banner is showing, for the probes. */
export const boutStats = { shown: false, title: '', stakes: '', belt: '' };

export class BoutSystem extends createSystem({}) {
  private readonly root = new Group();
  private text!: TextPlane;
  private readonly belts = new Map<string, BeltModel>();
  private belt: BeltModel | null = null;
  private wasPhase = 'off';
  private fightT = 0;
  private alpha = 0;
  private t = 0;

  init(): void {
    this.text = textPlane(0.8, 0.22);
    this.text.mesh.position.y = -0.06;
    this.root.add(this.text.mesh);
    for (const b of BELTS) {
      const m = new BeltModel(b);
      m.root.visible = false;
      m.root.position.y = 0.11;
      m.root.scale.setScalar(0.75);
      this.root.add(m.root);
      this.belts.set(b.id, m);
    }
    this.root.visible = false;
    this.scene.add(this.root);
  }

  update(delta: number): void {
    this.t += delta;
    const phase = game.mode === 'titans' ? titanStats.phase : 'off';
    if (phase === 'rising' && this.wasPhase !== 'rising') this.show(game.bout);
    this.wasPhase = phase;
    if (phase === 'fight') this.fightT += delta;
    else this.fightT = 0;

    const want = phase === 'rising' || (phase === 'fight' && this.fightT < LINGER);
    this.alpha = Math.min(1, Math.max(0, this.alpha + (want ? delta : -delta) / FADE));
    const e = ease(this.alpha);
    this.root.visible = e > 0.001;
    boutStats.shown = this.root.visible;
    if (!this.root.visible) return;

    this.camera.getWorldPosition(_head);
    this.root.position.copy(AT);
    this.root.position.y = Math.min(AT.y, _head.y + 0.16);
    this.root.lookAt(_head);
    (this.text.mesh.material as MeshBasicMaterial).opacity = e;
    if (this.belt) {
      this.belt.root.scale.setScalar(0.75 * e);
      this.belt.root.rotation.y = 0.5 * Math.sin(this.t * 1.2);
      this.belt.flare(0.3 + 0.3 * Math.sin(this.t * 3) ** 2);
    }
  }

  private show(i: number): void {
    const bout = BOUTS[i];
    if (!bout) return;
    const titan = TITANS[bout.titan];
    const id = bout.wins ?? bout.defends;
    const belt = id ? beltOf(id) : null;
    const line = stakes(career, i);
    for (const m of this.belts.values()) m.root.visible = false;
    this.belt = id ? this.belts.get(id)! : null;
    if (this.belt) {
      this.belt.root.visible = true;
      this.belt.setLevel(1);
    }
    Object.assign(boutStats, { title: bout.title, stakes: line, belt: id ?? '' });
    this.text.draw((g, w, h) => {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${h * 0.24}px ${FONT}`;
      fitFont(g, bout.title, 900, h * 0.24, w * 0.96);
      glowText(g, bout.title, w / 2, h * 0.24, belt?.strap ?? titan.accent);
      fitFont(g, line, 700, h * 0.12, w * 0.9);
      g.fillStyle = 'rgba(233,236,255,0.85)';
      g.fillText(line, w / 2, h * 0.5);
      fitFont(g, `VS ${titan.name}`, 900, h * 0.2, w * 0.9);
      glowText(g, `VS ${titan.name}`, w / 2, h * 0.76, titan.line);
    });
  }
}

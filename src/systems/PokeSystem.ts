/**
 * Presses every live poke button (ui/poke.ts) with your index fingertips,
 * and draws a bright dot on each fingertip while it's near one.
 *
 * The dot matters in passthrough: your real hand is part of the camera
 * image behind the scene, so a panel draws OVER your finger and hides it.
 * The dot is drawn on top of everything, so you can always see where your
 * fingertip is against the button.
 */

import { createSystem } from '@iwsdk/core';
import { Matrix4, type Sprite, Vector3 } from 'three';
import { MENU, NEON } from '../config.js';
import { sfx } from '../audio/sfx.js';
import { glowSprite } from '../fx/neon.js';
import { hands, SIDES, type Side } from '../input/hands.js';
import { buttons, type PokeButton, shown } from '../ui/poke.js';

/** Per button, per hand: did this finger arrive from the front, and has
 *  it already fired this push? */
interface Contact {
  front: boolean;
  fired: boolean;
}

const _inv = new Matrix4();
const _p = new Vector3();
const _c = new Vector3();

export class PokeSystem extends createSystem({}) {
  private contacts = new Map<PokeButton, Record<Side, Contact>>();
  private dots = {} as Record<Side, Sprite>;
  private cooldown = 0;
  /** Last frame's hover per button, for the tick as a finger arrives. */
  private lastHover = new Map<PokeButton, number>();

  init(): void {
    for (const side of SIDES) {
      const s = glowSprite(NEON.hot, 0.028);
      s.material.depthTest = false;
      s.renderOrder = 1000;
      s.visible = false;
      this.scene.add(s);
      this.dots[side] = s;
    }
  }

  update(delta: number): void {
    this.cooldown = Math.max(0, this.cooldown - delta);
    const near: Record<Side, number> = { left: 0, right: 0 };

    for (const b of buttons) {
      b.hover = 0;
      b.travel = 0;
      const c = this.contact(b);
      if (!b.active || !shown(b.root)) {
        c.left.front = c.left.fired = c.right.front = c.right.fired = false;
        b.animate(delta);
        continue;
      }
      b.root.updateWorldMatrix(true, false);
      _inv.copy(b.root.matrixWorld).invert();
      const hw = b.width / 2 + MENU.edgeSlack;
      const hh = b.height / 2 + MENU.edgeSlack;

      for (const side of b.hands) {
        const h = hands[side];
        const k = c[side];
        if (!h.shape.tracked) {
          k.front = k.fired = false;
          continue;
        }
        _p.copy(h.indexTip).applyMatrix4(_inv);
        near[side] = Math.max(near[side], 1 - _c.setFromMatrixPosition(b.root.matrixWorld).distanceTo(h.indexTip) / 0.2);
        const over = Math.abs(_p.x) <= hw && Math.abs(_p.y) <= hh;
        if (!over || _p.z > MENU.hoverDepth * 2) {
          k.front = k.fired = false;
          continue;
        }
        // In front of the face: this finger may press, and may press again.
        if (_p.z > MENU.rearmDepth) {
          k.front = true;
          k.fired = false;
        }
        if (_p.z > 0) b.hover = Math.max(b.hover, 1 - _p.z / MENU.hoverDepth);
        if (!k.front) continue;
        if (_p.z < 0) {
          b.hover = 1;
          b.travel = Math.max(b.travel, Math.min(-_p.z, MENU.travel));
        }
        if (!k.fired && _p.z < -MENU.pressDepth && this.cooldown <= 0) {
          k.fired = true;
          this.cooldown = MENU.cooldown;
          sfx(b.locked ? 'uiDenied' : 'uiClick', _c.setFromMatrixPosition(b.root.matrixWorld));
          b.fire();
        }
      }
      // A soft tick as a fingertip arrives over it.
      if ((this.lastHover.get(b) ?? 0) < 0.4 && b.hover >= 0.4) sfx('uiHover', _c.setFromMatrixPosition(b.root.matrixWorld));
      this.lastHover.set(b, b.hover);
      b.animate(delta);
    }

    for (const side of SIDES) {
      const d = this.dots[side];
      d.visible = near[side] > 0 && hands[side].shape.tracked;
      if (d.visible) {
        d.position.copy(hands[side].indexTip);
        d.material.opacity = Math.min(1, near[side] * 2);
      }
    }
  }

  private contact(b: PokeButton): Record<Side, Contact> {
    let c = this.contacts.get(b);
    if (!c) {
      c = { left: { front: false, fired: false }, right: { front: false, fired: false } };
      this.contacts.set(b, c);
    }
    return c;
  }
}

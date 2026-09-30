/**
 * Practice targets: neon rings hanging in the air in front of your
 * platform, facing you. A fireball through one bursts it and another lights
 * up somewhere else. This is the hands' proving ground until the first
 * titan arrives.
 */

import { createSystem } from '@iwsdk/core';
import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';
import { NEON, TARGETS } from '../config.js';
import { fx, glowSprite } from '../fx/neon.js';
import { addHittable } from '../game/hittables.js';
import { game } from '../game/state.js';

export interface Target {
  group: Group;
  pos: Vector3;
  live: boolean;
  respawnIn: number;
  age: number;
}

/** Live targets, read by FireballSystem for hits and aim assist. */
export const targets: Target[] = [];

const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

export function hitTarget(t: Target): void {
  if (!t.live) return;
  t.live = false;
  t.group.visible = false;
  t.respawnIn = TARGETS.respawn;
  fx.sparks?.burst(t.pos, 70, NEON.lime, 2.4);
}

export class TargetSystem extends createSystem({}) {
  private readonly _head = new Vector3();

  init(): void {
    for (let i = 0; i < TARGETS.count; i++) {
      const group = new Group();
      const mat = new MeshBasicMaterial({
        color: NEON.lime,
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      });
      group.add(new Mesh(new RingGeometry(TARGETS.radius * 0.78, TARGETS.radius, 40), mat));
      group.add(new Mesh(new RingGeometry(TARGETS.radius * 0.3, TARGETS.radius * 0.4, 32), mat));
      group.add(glowSprite(NEON.lime, TARGETS.radius * 3, 0.35));
      this.scene.add(group);
      const t: Target = { group, pos: group.position, live: false, respawnIn: 0.2 * i, age: 0 };
      group.visible = false;
      targets.push(t);
      addHittable({
        pos: t.pos,
        radius: TARGETS.radius,
        live: () => t.live,
        assist: true,
        onReturn: true,
        hit: () => {
          hitTarget(t);
          return 'through';
        },
      });
    }
  }

  update(delta: number): void {
    // Targets are PRACTICE's: gone at the console, back in a fresh spread after.
    if (game.mode !== 'practice') {
      targets.forEach((t, i) => {
        t.live = false;
        t.group.visible = false;
        t.respawnIn = 0.3 + 0.2 * i;
      });
      return;
    }
    this.camera.getWorldPosition(this._head);
    for (const t of targets) {
      if (!t.live) {
        t.respawnIn -= delta;
        if (t.respawnIn <= 0) this.place(t);
        continue;
      }
      t.age += delta;
      // A slow drift and a breath, so they read as alive, not stuck on.
      t.group.position.y += Math.sin(t.age * 1.3) * 0.0015;
      t.group.lookAt(this._head);
      t.group.scale.setScalar(1 + Math.sin(t.age * 3) * 0.04);
    }
  }

  private place(t: Target): void {
    // Keep clear of the other live targets.
    for (let tries = 0; tries < 12; tries++) {
      t.pos.set(rand(-TARGETS.spreadX, TARGETS.spreadX), rand(TARGETS.minY, TARGETS.maxY), rand(TARGETS.maxZ, TARGETS.minZ));
      if (targets.every((o) => o === t || !o.live || o.pos.distanceTo(t.pos) > TARGETS.radius * 3)) break;
    }
    t.live = true;
    t.age = 0;
    t.group.visible = true;
  }
}

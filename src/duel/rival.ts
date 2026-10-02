/**
 * THE RIVAL: the boxer across the gap, in neon. FF2's opponent was a steel
 * mannequin in an opaque arena; here it's the titans' finish on a body
 * your own size: dark glass that blocks the room like a solid thing, every
 * crease a lit tube with a soft halo, an ember visor where its eyes are.
 *
 *   HEAD     a glass dome with a lit band round it and a visor across the
 *            front: you can always tell which way it's looking.
 *   TORSO    an eight-sided glass prism from its neck to its hips, lit on
 *            every edge, solved from the head alone (duel/body.ts), so it
 *            ducks and leans the way your body does.
 *   ARMS     lit tubes from the shoulders through a bent elbow to the
 *            gloves: a two-bone solve, elbows down and out.
 *   GLOVES   glass with a lit ring and an ember glow. A raised GUARD
 *            burns white-hot: that glove is the shield.
 *
 * It's a puppet: whoever drives it (the bot now, a remote player later)
 * hands it a head, two hands and a few flags each frame. Its fade is how it
 * arrives and leaves; every light fades its alpha, never to black (over
 * passthrough a dark light is a hole in your room).
 */

import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type Quaternion,
  SphereGeometry,
  type Sprite,
  type SpriteMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { BOT, NEON, TITAN_NEON } from '../config.js';
import { glowSprite } from '../fx/neon.js';
import { tubes } from '../titans/neon.js';
import { makeBody, solveBody } from './body.js';

/** Upper arm and forearm, metres. */
const BONE = 0.3;
const SHOULDER_HALF = 0.19;
const HEAD_R = 0.11;
const UP = new Vector3(0, 1, 0);

const _a = new Vector3();
const _b = new Vector3();
const _d = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _neck = new Vector3();
const _elbow = new Vector3();
const _basis = new Matrix4();

interface Lit {
  mat: MeshBasicMaterial | SpriteMaterial;
  base: number;
}

export interface RivalPose {
  head: Vector3;
  headQuat: Quaternion;
  hands: [Vector3, Vector3];
  /** A raised guard per hand: the glove burns white. */
  blocking: [boolean, boolean];
  /** A ball winding up in this hand: the glove swells with its light. */
  winding: [boolean, boolean];
}

export class Rival {
  readonly root = new Group();
  /** Where the body is now, for the judge (head, chest, pelvis). */
  readonly body = makeBody();
  private readonly head = new Group();
  private readonly torso = new Group();
  private readonly bones: { core: Mesh; halo: Mesh }[] = [];
  private readonly gloves: { root: Group; glow: Sprite }[] = [];
  private readonly lit: Lit[] = [];
  private fade = 1;
  private hitFlash = 0;
  private readonly line: Color;

  constructor(line = NEON.ember, accent = NEON.hot) {
    this.line = new Color(line);
    this.root.name = 'rival';
    const edge = this.line.clone().lerp(new Color(NEON.hot), TITAN_NEON.edgeWhite);
    const glassMat = (): MeshBasicMaterial =>
      this.track(
        new MeshBasicMaterial({
          color: this.line.clone().multiplyScalar(TITAN_NEON.bodyTint),
          transparent: true,
          opacity: TITAN_NEON.bodyOpacity,
        }),
      );
    const tubeMat = (): MeshBasicMaterial =>
      this.track(new MeshBasicMaterial({ color: edge, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    const haloMat = (): MeshBasicMaterial =>
      this.track(
        new MeshBasicMaterial({
          color: this.line,
          transparent: true,
          opacity: TITAN_NEON.haloOpacity,
          blending: AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );

    // The head: a glass dome, a lit band round it, a visor across the front.
    this.head.add(new Mesh(new SphereGeometry(HEAD_R, 20, 14), glassMat()));
    for (const [r, mat] of [
      [TITAN_NEON.edgeRadius, tubeMat()],
      [TITAN_NEON.haloRadius, haloMat()],
    ] as const) {
      const band = new Mesh(new TorusGeometry(HEAD_R * 1.01, r, 6, 40), mat);
      band.rotation.x = Math.PI / 2;
      band.position.y = -0.015;
      this.head.add(band);
    }
    const visor = new Mesh(
      new TorusGeometry(HEAD_R * 1.03, 0.012, 6, 24, Math.PI * 0.55),
      this.track(new MeshBasicMaterial({ color: accent, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false })),
    );
    // An arc across the face, level, centred on −z (the face).
    visor.rotation.set(Math.PI / 2, 0, Math.PI * 1.225);
    visor.position.y = 0.02;
    this.head.add(visor);
    const eye = this.trackSprite(glowSprite(line, 0.16, 0.7));
    eye.position.set(0, 0.02, -HEAD_R);
    this.head.add(eye);
    this.root.add(this.head);

    // The torso, modelled one metre tall along +y and stretched to the spine.
    const prism = new CylinderGeometry(0.16, 0.11, 1, 8, 1).translate(0, 0.5, 0);
    prism.rotateY(Math.PI / 8);
    this.torso.add(new Mesh(prism, glassMat()));
    const segs = new EdgesGeometry(prism, TITAN_NEON.creaseAngle).getAttribute('position').array;
    this.torso.add(new Mesh(tubes(segs, TITAN_NEON.edgeRadius), tubeMat()));
    this.torso.add(new Mesh(tubes(segs, TITAN_NEON.haloRadius), haloMat()));
    // The shoulder bar.
    const bar = [-SHOULDER_HALF, 0.98, 0, SHOULDER_HALF, 0.98, 0];
    this.torso.add(new Mesh(tubes(bar, 0.012), tubeMat()));
    this.root.add(this.torso);

    // Four bones (upper arm, forearm, each side): a lit core and its halo,
    // unit cylinders stretched between joints every frame.
    const unit = (r: number): CylinderGeometry => new CylinderGeometry(r, r, 1, 8, 1, true).translate(0, 0.5, 0);
    for (let i = 0; i < 4; i++) {
      const core = new Mesh(unit(0.009), tubeMat());
      const halo = new Mesh(unit(0.024), haloMat());
      (halo.material as MeshBasicMaterial).side = DoubleSide;
      this.root.add(core, halo);
      this.bones.push({ core, halo });
    }

    // The gloves.
    for (let i = 0; i < 2; i++) {
      const g = new Group();
      g.add(new Mesh(new SphereGeometry(BOT.gloveRadius, 14, 10), glassMat()));
      const ring = new Mesh(new TorusGeometry(BOT.gloveRadius * 1.02, TITAN_NEON.edgeRadius * 1.4, 6, 28), tubeMat());
      g.add(ring);
      const glow = this.trackSprite(glowSprite(line, BOT.gloveRadius * 4, 0.55));
      g.add(glow);
      this.root.add(g);
      this.gloves.push({ root: g, glow });
    }
  }

  /** Pose the whole body from a head and two hands. */
  pose(p: RivalPose, delta: number): void {
    this.hitFlash = Math.max(0, this.hitFlash - delta * 4);
    this.head.position.copy(p.head);
    this.head.quaternion.copy(p.headQuat);

    // Facing, along the floor, from the head's quaternion.
    _fwd.set(0, 0, -1).applyQuaternion(p.headQuat).setY(0);
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, -1);
    _fwd.normalize();
    _right.crossVectors(_fwd, UP).normalize();
    const yaw = Math.atan2(-_fwd.x, -_fwd.z);
    solveBody(this.body, p.head, yaw);

    // The torso: from the pelvis up to the neck, behind the face.
    const pelvis = this.body[2].pos;
    _neck.copy(p.head).addScaledVector(_fwd, -0.06);
    _neck.y -= HEAD_R + 0.04;
    _d.copy(_neck).sub(pelvis);
    const len = Math.max(0.12, _d.length());
    this.torso.position.copy(pelvis);
    // Up the spine, its front square to the way the head faces.
    const up = _d.normalize();
    const back = _b.copy(_fwd).negate().addScaledVector(up, _fwd.dot(up)).normalize();
    _basis.makeBasis(_a.crossVectors(up, back), up, back);
    this.torso.quaternion.setFromRotationMatrix(_basis);
    this.torso.scale.set(1, len, 1);

    for (let i = 0; i < 2; i++) {
      const side = i === 0 ? -1 : 1;
      const shoulder = _a.copy(_neck).addScaledVector(_right, side * SHOULDER_HALF);
      shoulder.y -= 0.03;
      const hand = p.hands[i];
      this.elbow(shoulder, hand, side, _elbow);
      this.stretch(this.bones[i * 2], shoulder, _elbow);
      this.stretch(this.bones[i * 2 + 1], _elbow, hand);
      const g = this.gloves[i];
      g.root.position.copy(hand);
      g.root.quaternion.copy(p.headQuat);
      const hot = p.blocking[i];
      const mat = g.glow.material;
      mat.color.set(hot ? NEON.hot : this.line);
      g.glow.scale.setScalar(BOT.gloveRadius * (hot ? 7 : p.winding[i] ? 5.5 : 4));
    }
    this.applyFade();
  }

  /** It took a ball: every light flares white for a beat. */
  flash(): void {
    this.hitFlash = 1;
  }

  /** 0 = gone, 1 = solid. */
  setFade(k: number): void {
    this.fade = Math.min(1, Math.max(0, k));
    this.root.visible = this.fade > 0.001;
    this.applyFade();
  }

  dispose(): void {
    this.root.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
    });
    for (const l of this.lit) l.mat.dispose();
  }

  /** Everything fades together; a hit flares only the lights, not the glass. */
  private applyFade(): void {
    const glow = this.fade * (1 + this.hitFlash * 0.8);
    for (const l of this.lit) l.mat.opacity = Math.min(1, l.base * (l.mat.blending === AdditiveBlending ? glow : this.fade));
  }

  /** A two-bone elbow: on the shoulder→hand line, pushed down and out. */
  private elbow(shoulder: Vector3, hand: Vector3, side: number, out: Vector3): Vector3 {
    _d.copy(hand).sub(shoulder);
    const dist = Math.min(_d.length(), BONE * 2 - 1e-3);
    const mid = out.copy(shoulder).addScaledVector(_d.normalize(), dist / 2);
    const bend = Math.sqrt(Math.max(0, BONE * BONE - (dist / 2) ** 2));
    // Down and out, kept square to the arm.
    _b.set(0, -1, 0).addScaledVector(_right, side * 0.8);
    _b.addScaledVector(_d, -_b.dot(_d)).normalize();
    return mid.addScaledVector(_b, bend);
  }

  private stretch(bone: { core: Mesh; halo: Mesh }, from: Vector3, to: Vector3): void {
    _b.copy(to).sub(from);
    const len = _b.length();
    for (const m of [bone.core, bone.halo]) {
      m.visible = len > 1e-4;
      if (!m.visible) continue;
      m.position.copy(from);
      m.quaternion.setFromUnitVectors(UP, _b.clone().normalize());
      m.scale.set(1, len, 1);
    }
  }

  private track(mat: MeshBasicMaterial): MeshBasicMaterial {
    this.lit.push({ mat, base: mat.opacity });
    return mat;
  }

  private trackSprite(s: Sprite): Sprite {
    this.lit.push({ mat: s.material, base: s.material.opacity });
    return s;
  }
}

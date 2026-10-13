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
 * THE RUST BUCKET is the same body in EMBER's tutorial, done up as an old
 * sparring machine nobody's oiled in years (`skin: 'rust'`): rust-orange
 * lines that run dimmer, verdigris patch plates riveted over its chest, a
 * pressure dial whose needle can't sit still, a stovepipe up behind its
 * shoulder puffing smoke, two odd eye lamps (one with a bad bulb) where the visor
 * was, a bent antenna blinking on its crown, and a ring of rivets round
 * its head. It stands slumped and dark until EMBER names it.
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
  Object3D,
  MeshBasicMaterial,
  type Quaternion,
  SphereGeometry,
  type Sprite,
  type SpriteMaterial,
  TorusGeometry,
  Vector3,
} from 'three';
import { BOT, NEON, TITAN_NEON } from '../config.js';
import { fx, glowSprite } from '../fx/neon.js';
import { tubes } from '../titans/neon.js';
import { makeBody, solveBody } from './body.js';

/** Upper arm and forearm, metres. */
const BONE = 0.3;
const SHOULDER_HALF = 0.19;
const HEAD_R = 0.11;
const UP = new Vector3(0, 1, 0);

/** The rust bucket's colours: old iron, its verdigris, its tired bulbs. */
export const RUST = { line: 0xc4521c, patina: 0x2fe0a8, bulb: 0xffb43a, smoke: 0x6e6660 };

export type RivalSkin = 'neon' | 'rust';

/** Something stuck to the torso, placed along it each frame (the torso is
 *  stretched to the spine, and a rivet stretched with it would smear). */
interface Decor {
  obj: Object3D;
  /** How far up the torso, 0 hips … 1 neck. */
  along: number;
}

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
  readonly skin: RivalSkin;
  // The rust bucket's moving parts.
  private readonly decor = new Group();
  private readonly decors: Decor[] = [];
  private needle: Object3D | null = null;
  private readonly lamps: Sprite[] = [];
  private bulb: Sprite | null = null;
  private stack = new Vector3();
  private t = 0;
  private awake = 1;
  private flicker = 0;
  private nextFlicker = 3;
  private puff = 0;

  constructor(line: number = NEON.ember, accent: number = NEON.hot, skin: RivalSkin = 'neon') {
    this.skin = skin;
    const rust = skin === 'rust';
    if (rust) {
      line = RUST.line;
      accent = RUST.bulb;
    }
    this.line = new Color(line);
    this.root.name = rust ? 'rust-bucket' : 'rival';
    // Old iron doesn't burn as white as new neon.
    const edge = this.line.clone().lerp(new Color(NEON.hot), rust ? 0.12 : TITAN_NEON.edgeWhite);
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
    if (!rust) {
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
    }
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
    this.root.add(this.decor);

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
    if (rust) this.rustBucket();
  }

  /** The makeover: everything that makes the rust bucket a rust bucket. */
  private rustBucket(): void {
    const lit = (color: number, opacity = 1): MeshBasicMaterial =>
      this.track(new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    const dot = (color: number, size: number, opacity = 0.9): Sprite => this.trackSprite(glowSprite(color, size, opacity));
    const lines = (segs: number[], color: number, r = TITAN_NEON.edgeRadius): Group => {
      const g = new Group();
      g.add(new Mesh(tubes(segs, r), lit(color)), new Mesh(tubes(segs, r * 3), lit(color, TITAN_NEON.haloOpacity)));
      return g;
    };
    const ring = (r: number, n = 16): number[] => {
      const out: number[] = [];
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2;
        const a1 = ((k + 1) / n) * Math.PI * 2;
        out.push(Math.cos(a0) * r, Math.sin(a0) * r, 0, Math.cos(a1) * r, Math.sin(a1) * r, 0);
      }
      return out;
    };
    const onHead = (x: number, y: number, out = 0.004): Vector3 =>
      new Vector3(x, y, -Math.sqrt(Math.max(0, HEAD_R * HEAD_R - x * x - y * y)) - out);

    // Two odd eye lamps where the visor was: a big one and a squinting one.
    for (const [x, y, r] of [
      [-0.042, 0.026, 0.03],
      [0.046, 0.032, 0.019],
    ] as const) {
      const at = onHead(x, y);
      const rim = lines(ring(r), RUST.bulb, 0.0035);
      rim.position.copy(at);
      rim.lookAt(at.clone().multiplyScalar(2));
      const lamp = dot(RUST.bulb, r * 4.2, 0.85);
      lamp.position.copy(at);
      this.head.add(rim, lamp);
      this.lamps.push(lamp);
    }
    // A grille for a mouth, and a ring of rivets round the band.
    const grille: number[] = [];
    for (const y of [-0.038, -0.052, -0.066]) {
      const a = onHead(-0.034, y, 0.002);
      const b = onHead(0.034, y, 0.002);
      grille.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    this.head.add(lines(grille, this.line.getHex()));
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const r = dot(RUST.bulb, 0.014, 0.7);
      r.position.set(Math.sin(a) * HEAD_R * 1.04, -0.015, Math.cos(a) * HEAD_R * 1.04);
      this.head.add(r);
    }
    // A bent antenna off its crown, a bulb blinking on the end.
    const ant = [0.02, HEAD_R * 0.92, 0.03, 0.035, 0.17, 0.04, 0.035, 0.17, 0.04, 0.075, 0.22, 0.02];
    this.head.add(lines(ant, this.line.getHex(), 0.003));
    this.bulb = dot(NEON.danger, 0.045, 0.95);
    this.bulb.position.set(0.075, 0.225, 0.02);
    this.head.add(this.bulb);

    // On the torso (its front is −z; it tapers from 0.16 at the neck to 0.11
    // at the hips, an octagon whose front face is flat).
    const front = (along: number): number => -(0.11 + 0.05 * along) * Math.cos(Math.PI / 8) - 0.006;
    const stick = (obj: Object3D, along: number, x: number, z?: number): void => {
      obj.position.set(x, 0, z ?? front(along));
      this.decor.add(obj);
      this.decors.push({ obj, along });
    };
    // A verdigris patch riveted on skew over the chest, and a smaller one low.
    for (const [along, x, w, h, tilt] of [
      [0.66, 0.045, 0.085, 0.065, 0.16],
      [0.22, -0.035, 0.06, 0.045, -0.22],
    ] as const) {
      const patch = new Group();
      const hw = w / 2;
      const hh = h / 2;
      patch.add(lines([-hw, -hh, 0, hw, -hh, 0, hw, -hh, 0, hw, hh, 0, hw, hh, 0, -hw, hh, 0, -hw, hh, 0, -hw, -hh, 0], RUST.patina, 0.004));
      for (const [cx, cy] of [
        [-hw, -hh],
        [hw, -hh],
        [hw, hh],
        [-hw, hh],
      ]) {
        const rivet = dot(RUST.patina, 0.018, 0.9);
        rivet.position.set(cx * 0.82, cy * 0.72, 0.002);
        patch.add(rivet);
      }
      patch.rotation.z = tilt;
      stick(patch, along, x);
    }
    // The pressure dial, its needle never quite settling.
    const dial = new Group();
    dial.add(lines(ring(0.028, 18), RUST.bulb, 0.0035));
    const needle = lines([0, 0, 0.001, 0, 0.022, 0.001], NEON.danger, 0.003);
    dial.add(needle);
    this.needle = needle;
    stick(dial, 0.44, -0.05);
    // Bolts through the shoulders.
    for (const x of [-SHOULDER_HALF, SHOULDER_HALF]) stick(dot(RUST.bulb, 0.03, 0.8), 0.98, x, 0);
    // A stovepipe off the back of its right shoulder, up past its ear (it
    // always faces you, so anything lower on its back is never seen): two
    // rings, four staves.
    const pipe = new Group();
    const pr = 0.03;
    const ph = 0.18;
    const staves: number[] = [];
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
      staves.push(Math.cos(a) * pr, 0, Math.sin(a) * pr, Math.cos(a) * pr, ph, Math.sin(a) * pr);
    }
    pipe.add(lines(staves, this.line.getHex(), 0.003));
    for (const y of [0, ph]) {
      const r = lines(ring(pr, 12), this.line.getHex(), 0.003);
      r.rotation.x = Math.PI / 2;
      r.position.y = y;
      pipe.add(r);
    }
    stick(pipe, 0.92, 0.16, 0.06);
    this.stack.set(0.16, ph, 0.06);

    // Gloves: a verdigris cuff round each wrist.
    for (const g of this.gloves) {
      const cuff = new Mesh(new TorusGeometry(BOT.gloveRadius * 0.85, TITAN_NEON.edgeRadius * 1.3, 6, 20), lit(RUST.patina));
      cuff.position.z = BOT.gloveRadius * 0.8;
      g.root.add(cuff);
    }
  }

  /** The rust bucket slumped and dark (0) or awake (1): its lamps, its
   *  antenna and its smoke. */
  setAwake(k: number): void {
    this.awake = Math.min(1, Math.max(0, k));
  }

  /** The makeover's moving parts: the needle, the bulbs, the smoke. */
  private animate(delta: number): void {
    this.t += delta;
    const len = this.torso.scale.y;
    this.decor.position.copy(this.torso.position);
    this.decor.quaternion.copy(this.torso.quaternion);
    for (const d of this.decors) d.obj.position.y = d.along * len;
    if (this.needle) this.needle.rotation.z = -0.6 + 0.35 * Math.sin(this.t * 1.3) + 0.12 * Math.sin(this.t * 17);
    // A bad bulb: now and then the big lamp stutters out for a moment.
    this.nextFlicker -= delta;
    if (this.nextFlicker <= 0) {
      this.flicker = 0.35;
      this.nextFlicker = 3 + Math.random() * 5;
    }
    this.flicker = Math.max(0, this.flicker - delta);
    const stutter = this.flicker > 0 && Math.sin(this.t * 70) > -0.2;
    const wake = this.awake;
    this.lamps.forEach((l, i) => {
      l.visible = wake > 0.05 && !(i === 0 && stutter);
      l.scale.setScalar((i === 0 ? 0.126 : 0.08) * (0.3 + 0.7 * wake));
    });
    if (this.bulb) this.bulb.visible = wake > 0.5 && Math.sin(this.t * Math.PI * 1.6) > 0;
    // Smoke from the stovepipe while it's awake.
    this.puff -= delta;
    if (wake > 0.5 && this.puff <= 0 && this.root.visible) {
      this.puff = 0.35 + Math.random() * 0.4;
      const at = this.decor.localToWorld(_a.copy(this.stack).setY(0.92 * len + this.stack.y));
      fx.sparks?.burst(at, 3, RUST.smoke, 0.25);
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
    if (this.skin === 'rust') this.animate(delta);
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

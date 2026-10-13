/**
 * THE RUST BUCKET: the tutorial's sparring machine (DESIGN §4.2). The duel's
 * rival puppet with this rig in place of the neon boxer's body: the same
 * head, hands and hit spheres drive it, so the judge is the same; only what
 * you see differs. An old boiler on legs that nobody's oiled in years:
 *
 *   HEAD     a tin can with a riveted lid, two odd eye lamps (the big one's
 *            bulb is going), a mouth grille, a bent antenna blinking on top.
 *   BODY     a squat boiler barrel, bellied and lidded, two riveted hoops
 *            round it, rust running down from the top one; a furnace door
 *            in its belly whose fire flares as it winds up a throw; a
 *            pressure dial whose needle never settles; a verdigris patch
 *            riveted on skew; two smokestacks behind its shoulders, puffing.
 *   ARMS     ball shoulders under riveted pauldrons, a plated upper arm, an
 *            elbow ball, and a forearm that's a bare piston rod into a heavy
 *            sleeve; hands closed into fists, four jointed fingers curled
 *            under riveted knuckles, the thumb wrapped across them.
 *   LEGS     the barrel runs on below its hips onto stocky legs: a hip block, ball hips, plated thighs and shins on knee balls
 *            that bend toward you, and square boots. The boots stay planted
 *            and take a step, one at a time, when it strafes too far off
 *            them; it squats when it ducks.
 *
 * Everything is the titans' neon: dark glass, lit edge tubes and halos, in
 * rust orange that burns less white than new neon, with verdigris and
 * tired amber bulbs.
 */

import {
  BufferGeometry,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  LatheGeometry,
  Matrix4,
  Mesh,
  type MeshBasicMaterial,
  type Object3D,
  Quaternion,
  SphereGeometry,
  type Sprite,
  TorusGeometry,
  Vector2,
  Vector3,
  BoxGeometry,
} from 'three';
import { NEON, TITAN_NEON } from '../config.js';
import { fx } from '../fx/neon.js';
import { tubes } from '../titans/neon.js';

/** The rust bucket's colours: old iron, its verdigris, its tired bulbs. */
export const RUST = { line: 0xc4521c, patina: 0x2fe0a8, bulb: 0xffb43a, smoke: 0x6e6660, streak: 0x7a2e0c, fire: 0xff6a12 };

/** What the rig builds with: the rival's own materials, so they all fade
 *  and flare with it. */
export interface RigKit {
  glass(): MeshBasicMaterial;
  edge(color?: number): MeshBasicMaterial;
  halo(color?: number): MeshBasicMaterial;
  dot(color: number, size: number, opacity?: number): Sprite;
}

/** Where the rival puppet's joints are this frame. */
export interface RigJoints {
  /** The head's centre, and the neck's base behind and below it. */
  head: Vector3;
  neck: Vector3;
  pelvis: Vector3;
  /** The spine's frame (its front is −z) and its length, pelvis to neck. */
  spine: Quaternion;
  len: number;
  shoulders: [Vector3, Vector3];
  elbows: [Vector3, Vector3];
  hands: [Vector3, Vector3];
  /** Facing along the floor, and its right. */
  fwd: Vector3;
  right: Vector3;
  winding: [boolean, boolean];
}

const UP = new Vector3(0, 1, 0);
/** Thigh and shin, metres: hips ~0.66 m up, a little bend standing. */
const LEG = 0.33;
const HIP_HALF = 0.1;
/** The boiler's profile, bottom to lid (radius, height on a 1 m barrel). */
const PROFILE: [number, number][] = [
  [0.1, 0],
  [0.145, 0.12],
  [0.168, 0.4],
  [0.165, 0.7],
  [0.15, 0.9],
  [0.13, 0.97],
  [0.07, 1],
];
const SIDES = 10;
/** The barrel's radius at height t (0–1). */
function barrelR(t: number): number {
  for (let i = 1; i < PROFILE.length; i++) {
    const [r1, y1] = PROFILE[i];
    const [r0, y0] = PROFILE[i - 1];
    if (t <= y1) return r0 + ((r1 - r0) * (t - y0)) / (y1 - y0);
  }
  return PROFILE[PROFILE.length - 1][0];
}
/** Its flat front face, at height t (a face is centred on −z). */
const frontZ = (t: number, out = 0.004): number => -barrelR(t) * Math.cos(Math.PI / SIDES) - out;

const HEAD = { r: 0.1, top: 0.07, bottom: -0.09 };
const canR = (y: number): number => HEAD.r - ((y - HEAD.bottom) / (HEAD.top - HEAD.bottom)) * 0.006;
const canFront = (y: number, out = 0.004): number => -canR(y) * Math.cos(Math.PI / SIDES) - out;

const _a = new Vector3();
const _b = new Vector3();
const _c = new Vector3();
const _mid = new Vector3();
const _bend = new Vector3();
const _across = new Vector3();
const _m = new Matrix4();
const _top = new Vector3();
const _rot = new Quaternion();
/** The middle of a fist, for which way is "outside" on a finger. */
const CENTRE = new Vector3(0, 0.004, -0.03);

/** A unit part along +y, stretched between two joints each frame. */
interface Segment {
  obj: Group;
}

interface Foot {
  planted: Vector3;
  from: Vector3;
  to: Vector3;
  /** 0–1 through a step, or −1 standing. */
  step: number;
  boot: Group;
  hip: Vector3;
  knee: Vector3;
  ankle: Vector3;
  thigh: Segment;
  shin: Segment;
  kneeBall: Group;
  hipBall: Group;
}

export class RustRig {
  private readonly kit: RigKit;
  private readonly root: Group;
  /** On the spine, unstretched: everything placed by height on the barrel. */
  private readonly decor = new Group();
  private readonly decors: { obj: Object3D; along: number }[] = [];
  private readonly hip = new Group();
  private neck!: Segment;
  private readonly arms: { upper: Segment; rod: Segment; sleeve: Segment; shoulder: Group; elbow: Group }[] = [];
  private readonly feet: Foot[] = [];
  private needle: Object3D | null = null;
  private readonly lamps: Sprite[] = [];
  private bulb: Sprite | null = null;
  private fire: Sprite | null = null;
  private readonly stacks: Vector3[] = [];
  private t = 0;
  private puff = 0;
  private puffSide = 0;
  private flicker = 0;
  private nextFlicker = 3;
  private fresh = true;

  constructor(kit: RigKit, root: Group, head: Group, torso: Group, fists: Group[]) {
    this.kit = kit;
    this.root = root;
    this.buildHead(head);
    this.buildBarrel(torso);
    root.add(this.decor, this.hip);
    // A ribbed collar from the boiler's lid up into the can.
    this.neck = this.segment(0.045, 0.06, SIDES);
    for (const y of [0.33, 0.66]) this.neck.obj.add(this.lines(this.ring(0.056 - y * 0.012, SIDES * 2, y), undefined, 0.004));
    this.buildArms();
    this.buildLegs();
    // (Index 0 is its left hand: the thumb on the inside, toward its right.)
    fists.forEach((f, i) => this.buildFist(f, i === 0 ? 1 : -1));
  }

  /* ── building ──────────────────────────────────────────────────────── */

  /** Dark glass with every crease a lit tube and a soft halo. */
  private solid(g: BufferGeometry, color?: number, crease: number = TITAN_NEON.creaseAngle): Group {
    const out = new Group();
    out.add(new Mesh(g, this.kit.glass()));
    const segs = new EdgesGeometry(g, crease).getAttribute('position').array;
    out.add(new Mesh(tubes(segs, TITAN_NEON.edgeRadius), this.kit.edge(color)));
    out.add(new Mesh(tubes(segs, TITAN_NEON.haloRadius), this.kit.halo(color)));
    return out;
  }

  /** Lit lines only. */
  private lines(segs: number[], color?: number, r: number = TITAN_NEON.edgeRadius): Group {
    const g = new Group();
    g.add(new Mesh(tubes(segs, r), this.kit.edge(color)), new Mesh(tubes(segs, r * 3), this.kit.halo(color)));
    return g;
  }

  private ring(r: number, n = 16, y = 0): number[] {
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * Math.PI * 2;
      const a1 = ((k + 1) / n) * Math.PI * 2;
      out.push(Math.cos(a0) * r, y, Math.sin(a0) * r, Math.cos(a1) * r, y, Math.sin(a1) * r);
    }
    return out;
  }

  /** A ball joint: glass, with a lit ring round it. */
  private ball(r: number, color?: number): Group {
    const g = new Group();
    g.add(new Mesh(new SphereGeometry(r, 12, 8), this.kit.glass()));
    const ring = new Mesh(new TorusGeometry(r * 1.02, TITAN_NEON.edgeRadius, 5, 20), this.kit.edge(color));
    g.add(ring);
    return g;
  }

  private place(obj: Object3D, along: number, x: number, z?: number): void {
    obj.position.set(x, 0, z ?? frontZ(along));
    this.decor.add(obj);
    this.decors.push({ obj, along });
  }

  /** Flat on face `face` of the barrel (0 the front, +1 the next to its
   *  right as you look at it), at height t, its front facing out. */
  private onFace(obj: Object3D, t: number, face: number): void {
    const a = (face * 2 * Math.PI) / SIDES;
    const r = -frontZ(t);
    this.place(obj, t, Math.sin(a) * r, -Math.cos(a) * r);
    obj.rotation.y = -a;
  }

  private buildHead(head: Group): void {
    const k = this.kit;
    const can = new CylinderGeometry(canR(HEAD.top), HEAD.r, HEAD.top - HEAD.bottom, SIDES, 1).translate(0, (HEAD.top + HEAD.bottom) / 2, 0);
    can.rotateY(Math.PI / SIDES);
    head.add(this.solid(can));
    // The lid: a shallow cone, a knob on top, a rim of rivets.
    const lid = new CylinderGeometry(0.025, canR(HEAD.top) + 0.006, 0.035, SIDES, 1).translate(0, HEAD.top + 0.0175, 0);
    lid.rotateY(Math.PI / SIDES);
    head.add(this.solid(lid));
    for (let i = 0; i < SIDES; i++) {
      const a = ((i + 0.5) / SIDES) * Math.PI * 2;
      for (const y of [HEAD.top - 0.012, HEAD.bottom + 0.012]) {
        const r = k.dot(RUST.bulb, 0.012, 0.65);
        r.position.set(Math.sin(a) * (canR(y) + 0.003), y, Math.cos(a) * (canR(y) + 0.003));
        head.add(r);
      }
    }
    // Two odd eye lamps: a big one and a squinting one.
    for (const [x, y, r] of [
      [-0.035, 0.022, 0.027],
      [0.04, 0.026, 0.017],
    ] as const) {
      const rim = this.lines(this.ring(r, 16), RUST.bulb, 0.0035);
      rim.rotation.x = Math.PI / 2;
      rim.position.set(x, y, canFront(y));
      const lamp = k.dot(RUST.bulb, r * 4.2, 0.85);
      lamp.position.set(x, y, canFront(y, 0.006));
      head.add(rim, lamp);
      this.lamps.push(lamp);
    }
    // A grille for a mouth.
    const grille: number[] = [];
    for (const y of [-0.03, -0.045, -0.06]) grille.push(-0.035, y, canFront(y, 0.002), 0.035, y, canFront(y, 0.002));
    for (const x of [-0.035, 0.035]) grille.push(x, -0.025, canFront(-0.025, 0.002), x, -0.065, canFront(-0.065, 0.002));
    head.add(this.lines(grille));
    // A bent antenna off the lid, its bulb blinking.
    const top = HEAD.top + 0.035;
    head.add(this.lines([0.012, top, 0.01, 0.02, top + 0.08, 0.02, 0.02, top + 0.08, 0.02, 0.06, top + 0.12, 0.005], undefined, 0.003));
    this.bulb = k.dot(NEON.danger, 0.045, 0.95);
    this.bulb.position.set(0.06, top + 0.125, 0.005);
    head.add(this.bulb);
  }

  private buildBarrel(torso: Group): void {
    // The boiler, modelled 1 m tall: the spine stretches it pelvis to neck.
    const pts = PROFILE.map(([r, y]) => new Vector2(r, y));
    const barrel = new LatheGeometry(pts, SIDES, Math.PI / SIDES);
    torso.add(this.solid(barrel));
    // Two hoops, standing a little proud.
    for (const t of [0.14, 0.86]) torso.add(this.lines(this.ring(barrelR(t) * 1.03, SIDES * 2, t), undefined, 0.006));
    // Rust run down from the top hoop: short wavering streaks.
    const streaks: number[] = [];
    for (const [a, len] of [
      [Math.PI + 0.35, 0.22],
      [Math.PI - 0.5, 0.14],
      [Math.PI + 1.1, 0.3],
    ]) {
      let prev: [number, number, number] | null = null;
      for (let i = 0; i <= 4; i++) {
        const t = 0.84 - (len * i) / 4;
        const w = a + Math.sin(i * 1.7) * 0.03;
        const r = barrelR(t) + 0.002;
        const p: [number, number, number] = [Math.sin(w) * r, t, Math.cos(w) * r];
        if (prev) streaks.push(...prev, ...p);
        prev = p;
      }
    }
    torso.add(this.lines(streaks, RUST.streak, 0.003));

    const k = this.kit;
    // Rivets round both hoops (placed unstretched, by height).
    for (const t of [0.14, 0.86]) {
      for (let i = 0; i < SIDES; i++) {
        const a = Math.PI + ((i - (SIDES - 1) / 2) / SIDES) * Math.PI * 2;
        if (Math.cos(a) > 0.3) continue; // the back's never seen
        const r = barrelR(t) * 1.03 + 0.004;
        const rivet = k.dot(RUST.bulb, 0.016, 0.75);
        this.place(rivet, t, Math.sin(a) * r, Math.cos(a) * r);
      }
    }
    // The furnace door in its belly: a porthole, a grate, the fire inside.
    const door = new Group();
    // (Decorations face −z, out of the barrel, and sit just proud of it:
    // anything behind its glass would be hidden by it.)
    const porthole = this.lines(this.ring(0.05, 18), RUST.bulb, 0.005);
    porthole.rotation.x = Math.PI / 2;
    door.add(porthole);
    const grate: number[] = [];
    for (const x of [-0.025, 0, 0.025]) {
      const h = Math.sqrt(0.05 * 0.05 - x * x) * 0.92;
      grate.push(x, -h, -0.004, x, h, -0.004);
    }
    door.add(this.lines(grate, undefined, 0.004));
    for (const a of [0.4, 2.1, 3.7, 5.3]) {
      const r = k.dot(RUST.bulb, 0.014, 0.8);
      r.position.set(Math.cos(a) * 0.062, Math.sin(a) * 0.062, -0.003);
      door.add(r);
    }
    this.fire = k.dot(RUST.fire, 0.16, 0.8);
    this.fire.position.z = -0.001;
    door.add(this.fire);
    this.onFace(door, 0.38, 0);
    // The pressure dial, its needle never settling.
    const dial = new Group();
    const face = this.lines(this.ring(0.026, 18), RUST.bulb, 0.0035);
    face.rotation.x = Math.PI / 2;
    dial.add(face);
    const ticks: number[] = [];
    for (let i = 0; i < 5; i++) {
      const a = -0.6 * Math.PI + (i / 4) * 1.2 * Math.PI;
      ticks.push(Math.sin(a) * 0.019, Math.cos(a) * 0.019, -0.001, Math.sin(a) * 0.024, Math.cos(a) * 0.024, -0.001);
    }
    dial.add(this.lines(ticks, RUST.bulb, 0.002));
    this.needle = this.lines([0, 0, -0.002, 0, 0.02, -0.002], NEON.danger, 0.0028);
    dial.add(this.needle);
    this.onFace(dial, 0.68, -1);
    // A verdigris patch riveted on skew, over a rust hole.
    const patch = new Group();
    const [hw, hh] = [0.04, 0.03];
    patch.add(this.lines([-hw, -hh, 0, hw, -hh, 0, hw, -hh, 0, hw, hh, 0, hw, hh, 0, -hw, hh, 0, -hw, hh, 0, -hw, -hh, 0], RUST.patina, 0.004));
    for (const [x, y] of [
      [-hw, -hh],
      [hw, -hh],
      [hw, hh],
      [-hw, hh],
    ]) {
      const r = k.dot(RUST.patina, 0.016, 0.9);
      r.position.set(x * 0.8, y * 0.7, -0.002);
      patch.add(r);
    }
    const skew = new Group();
    skew.add(patch);
    patch.rotation.z = 0.2;
    this.onFace(skew, 0.66, 1);
    // Two smokestacks behind the shoulders, up past its ears.
    for (const side of [-1, 1]) {
      const stack = new Group();
      const h = side < 0 ? 0.16 : 0.21;
      const pipe = new CylinderGeometry(0.024, 0.028, h, 8, 1).translate(0, h / 2, 0);
      stack.add(this.solid(pipe));
      stack.add(this.lines(this.ring(0.031, 12, h), undefined, 0.004));
      this.place(stack, 0.9, side * 0.14, 0.07);
      this.stacks.push(new Vector3(side * 0.14, h, 0.07));
    }

    // The hip block under it, square to the spine's yaw.
    this.hip.add(this.solid(new BoxGeometry(0.26, 0.08, 0.16).translate(0, -0.03, 0)));
    for (const x of [-0.1, -0.035, 0.035, 0.1]) {
      const r = k.dot(RUST.bulb, 0.014, 0.7);
      r.position.set(x, -0.03, -0.085);
      this.hip.add(r);
    }
  }

  private segment(rTop: number, rBottom: number, sides = 6, color?: number): Segment {
    const g = new CylinderGeometry(rTop, rBottom, 1, sides, 1).translate(0, 0.5, 0);
    const obj = this.solid(g, color);
    this.root.add(obj);
    return { obj };
  }

  private buildArms(): void {
    for (let i = 0; i < 2; i++) {
      const shoulder = this.ball(0.05);
      // A riveted pauldron over it: a shallow cap.
      const cap = new SphereGeometry(0.07, 10, 5, 0, Math.PI * 2, 0, Math.PI * 0.42);
      const pauldron = this.solid(cap, undefined, 50);
      shoulder.add(pauldron);
      for (const a of [0, 2.1, 4.2]) {
        const r = this.kit.dot(RUST.bulb, 0.013, 0.75);
        r.position.set(Math.cos(a) * 0.05, 0.045, Math.sin(a) * 0.05);
        shoulder.add(r);
      }
      const elbow = this.ball(0.038);
      this.root.add(shoulder, elbow);
      this.arms.push({
        upper: this.segment(0.03, 0.036),
        rod: this.segment(0.012, 0.012, 6, RUST.patina),
        sleeve: this.segment(0.045, 0.034),
        shoulder,
        elbow,
      });
    }
  }

  private buildLegs(): void {
    for (let i = 0; i < 2; i++) {
      const boot = new Group();
      boot.add(this.solid(new BoxGeometry(0.1, 0.07, 0.19).translate(0, 0.035, -0.035)));
      // A toe cap and a rivet either side of the ankle.
      boot.add(this.lines([-0.05, 0.07, -0.08, 0.05, 0.07, -0.08], RUST.patina, 0.004));
      for (const x of [-0.052, 0.052]) {
        const r = this.kit.dot(RUST.bulb, 0.013, 0.7);
        r.position.set(x, 0.045, 0);
        boot.add(r);
      }
      const kneeBall = this.ball(0.045);
      const hipBall = this.ball(0.05);
      this.root.add(boot, kneeBall, hipBall);
      this.feet.push({
        planted: new Vector3(),
        from: new Vector3(),
        to: new Vector3(),
        step: -1,
        boot,
        hip: new Vector3(),
        knee: new Vector3(),
        ankle: new Vector3(),
        thigh: this.segment(0.058, 0.048),
        shin: this.segment(0.046, 0.038),
        kneeBall,
        hipBall,
      });
    }
  }

  /**
   * A hand, closed into a fist: a rounded back of the hand, four fingers
   * curled under it in two jointed segments from a row of knuckle balls,
   * the thumb wrapped across them, a gauntlet cuff at the wrist. Local −z
   * is the way it punches; `thumb` is the side its thumb is on (+x is the
   * rival's right).
   */
  private buildFist(g: Group, thumb: number): void {
    // The back of the hand: a rounded shell, its outline lit.
    const back = new SphereGeometry(1, 10, 6);
    back.scale(0.05, 0.038, 0.046).translate(0, 0.006, 0.006);
    g.add(new Mesh(back, this.kit.glass()));
    const rim: number[] = [];
    for (let k = 0; k < 16; k++) {
      const a0 = (k / 16) * Math.PI * 2;
      const a1 = ((k + 1) / 16) * Math.PI * 2;
      rim.push(Math.cos(a0) * 0.05, 0.006 + Math.sin(a0) * 0.038, -0.004, Math.cos(a1) * 0.05, 0.006 + Math.sin(a1) * 0.038, -0.004);
    }
    g.add(this.lines(rim, undefined, 0.0035));
    // Fingers, curled: knuckle → middle joint → tip, tucked back under.
    // Too small for a lit edge on every crease (they'd blow out into one
    // white blob, as on a titan's smallest parts): dark glass, with one lit
    // line along the outside of each finger's curl.
    const bones: BufferGeometry[] = [];
    const curl: number[] = [];
    const along = (pts: Vector3[], lift: number): void => {
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = _a.copy(pts[k]).add(_c.copy(pts[k]).sub(CENTRE).normalize().multiplyScalar(lift));
        const b = _top.copy(pts[k + 1]).add(_c.copy(pts[k + 1]).sub(CENTRE).normalize().multiplyScalar(lift));
        curl.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    };
    const bone = (a: Vector3, b: Vector3, r: number): void => {
      const len = a.distanceTo(b);
      const geo = new CylinderGeometry(r, r * 0.9, len, 6, 1).translate(0, len / 2, 0);
      _b.copy(b).sub(a).divideScalar(len);
      geo.applyMatrix4(_m.makeRotationFromQuaternion(_rot.setFromUnitVectors(UP, _b)).setPosition(a));
      bones.push(geo);
    };
    for (let i = 0; i < 4; i++) {
      const x = (i - 1.5) * 0.025;
      const reach = i === 1 || i === 2 ? 0.005 : 0;
      const knuckle = new Vector3(x, 0.022, -0.042 - reach);
      const mid = new Vector3(x, -0.002, -0.066 - reach);
      const tip = new Vector3(x * 0.95, -0.028, -0.048);
      bone(knuckle, mid, 0.0115);
      bone(mid, tip, 0.0105);
      along([knuckle, mid, tip], 0.0135);
      const ball = new Mesh(new SphereGeometry(0.0135, 8, 6), this.kit.glass());
      ball.position.copy(knuckle);
      const rivet = this.kit.dot(RUST.bulb, 0.016, 0.8);
      rivet.position.copy(knuckle).add(_c.set(0, 0.006, -0.012));
      g.add(ball, rivet);
    }
    // The thumb, wrapped across the front of the curled fingers.
    const t0 = new Vector3(thumb * 0.046, -0.004, -0.004);
    const t1 = new Vector3(thumb * 0.036, -0.03, -0.042);
    const t2 = new Vector3(thumb * 0.004, -0.036, -0.06);
    bone(t0, t1, 0.0135);
    bone(t1, t2, 0.0125);
    along([t0, t1, t2], 0.015);
    for (const geo of bones) g.add(new Mesh(geo, this.kit.glass()));
    // Drawn after the fingers' glass, so none of it can bury them.
    const fingers = this.lines(curl, undefined, 0.0025);
    fingers.traverse((o) => (o.renderOrder = 1));
    g.add(fingers);
    // The gauntlet cuff at the wrist.
    const cuff = new CylinderGeometry(0.042, 0.038, 0.04, 8, 1).rotateX(Math.PI / 2).translate(0, 0, 0.055);
    g.add(this.solid(cuff));
    const band = new Mesh(new TorusGeometry(0.043, TITAN_NEON.edgeRadius * 1.4, 6, 18), this.kit.edge(RUST.patina));
    band.position.z = 0.045;
    g.add(band);
  }

  /* ── every frame ───────────────────────────────────────────────────── */

  pose(j: RigJoints, delta: number, awake: number): void {
    this.t += delta;
    this.decor.position.copy(j.pelvis);
    this.decor.quaternion.copy(j.spine);
    for (const d of this.decors) d.obj.position.y = d.along * j.len;
    // The hip block: at the pelvis, square to the way it faces.
    // The collar: from the top of the boiler up into the can.
    _top.set(0, 1, 0).applyQuaternion(j.spine).multiplyScalar(j.len * 0.96).add(j.pelvis);
    _a.copy(j.head);
    _a.y += HEAD.bottom + 0.02;
    stretch(this.neck, _top, _a);
    this.hip.position.copy(j.pelvis);
    this.hip.quaternion.setFromRotationMatrix(_m.makeBasis(j.right, UP, _a.copy(j.fwd).negate()));

    for (let i = 0; i < 2; i++) {
      const a = this.arms[i];
      a.shoulder.position.copy(j.shoulders[i]);
      a.shoulder.quaternion.copy(this.hip.quaternion);
      a.elbow.position.copy(j.elbows[i]);
      stretch(a.upper, j.shoulders[i], j.elbows[i]);
      // The forearm: a bare piston rod out of the elbow into a heavy sleeve.
      _mid.lerpVectors(j.elbows[i], j.hands[i], 0.38);
      stretch(a.rod, j.elbows[i], _mid);
      stretch(a.sleeve, _mid, j.hands[i]);
    }
    this.legs(j, delta);
    this.lights(j, delta, awake);
  }

  /** Two-bone legs to planted boots; a boot steps when the hips leave it. */
  private legs(j: RigJoints, delta: number): void {
    const busy = this.feet.some((f) => f.step >= 0);
    this.feet.forEach((f, i) => {
      const side = i === 0 ? -1 : 1;
      f.hip.copy(j.pelvis).addScaledVector(j.right, side * HIP_HALF);
      f.hip.y -= 0.06;
      // Where this boot wants to be: under its hip, on the floor.
      const home = _a.copy(j.pelvis).addScaledVector(j.right, side * 0.15).setY(0);
      if (this.fresh || f.planted.distanceTo(home) > 0.7) {
        f.planted.copy(home);
        f.step = -1;
      } else if (f.step < 0 && !busy && f.planted.distanceTo(home) > 0.11) {
        f.from.copy(f.planted);
        // A little past home, the way it's going: fewer steps.
        f.to.copy(home).addScaledVector(_b.copy(home).sub(f.planted).normalize(), 0.03);
        f.step = 0;
      }
      if (f.step >= 0) {
        f.step = Math.min(1, f.step + delta / 0.24);
        const e = f.step * f.step * (3 - 2 * f.step);
        f.planted.lerpVectors(f.from, f.to, e);
        f.planted.y = Math.sin(Math.PI * f.step) * 0.06;
        if (f.step >= 1) {
          f.planted.y = 0;
          f.step = -1;
        }
      }
      f.ankle.copy(f.planted);
      f.ankle.y += 0.07;
      // The knee: bent toward you, a touch out.
      _bend.copy(j.fwd).addScaledVector(j.right, side * 0.25);
      twoBone(f.hip, f.ankle, LEG, _bend, f.knee);
      stretch(f.thigh, f.hip, f.knee);
      stretch(f.shin, f.knee, f.ankle);
      f.kneeBall.position.copy(f.knee);
      f.hipBall.position.copy(f.hip);
      f.boot.position.copy(f.planted);
      f.boot.quaternion.copy(this.hip.quaternion);
    });
    this.fresh = false;
  }

  /** The bulbs, the needle, the furnace, the smoke. */
  private lights(j: RigJoints, delta: number, awake: number): void {
    if (this.needle) this.needle.rotation.z = -0.6 + 0.35 * Math.sin(this.t * 1.3) + 0.12 * Math.sin(this.t * 17);
    this.nextFlicker -= delta;
    if (this.nextFlicker <= 0) {
      this.flicker = 0.35;
      this.nextFlicker = 3 + Math.random() * 5;
    }
    this.flicker = Math.max(0, this.flicker - delta);
    const stutter = this.flicker > 0 && Math.sin(this.t * 70) > -0.2;
    this.lamps.forEach((l, i) => {
      l.visible = awake > 0.05 && !(i === 0 && stutter);
      l.scale.setScalar((i === 0 ? 0.113 : 0.071) * (0.3 + 0.7 * awake));
    });
    if (this.bulb) this.bulb.visible = awake > 0.5 && Math.sin(this.t * Math.PI * 1.6) > 0;
    // The furnace: banked low when it's slumped, roaring as it winds up.
    if (this.fire) {
      const roar = j.winding[0] || j.winding[1] ? 1.6 : 1;
      const lick = 0.85 + 0.15 * Math.sin(this.t * 23) * Math.sin(this.t * 7.3);
      this.fire.scale.setScalar(0.16 * (0.35 + 0.65 * awake) * roar * lick);
    }
    this.puff -= delta;
    if (awake > 0.5 && this.puff <= 0 && this.root.visible) {
      this.puff = 0.25 + Math.random() * 0.3;
      this.puffSide = 1 - this.puffSide;
      const s = this.stacks[this.puffSide];
      const at = this.decor.localToWorld(_a.copy(s).setY(0.9 * j.len + s.y));
      fx.sparks?.burst(at, 3, RUST.smoke, 0.25);
    }
  }
}

/** A unit part stretched from one joint to the next. */
function stretch(s: Segment, from: Vector3, to: Vector3): void {
  _b.copy(to).sub(from);
  const len = _b.length();
  s.obj.visible = len > 1e-4;
  if (!s.obj.visible) return;
  s.obj.position.copy(from);
  s.obj.quaternion.setFromUnitVectors(UP, _b.divideScalar(len));
  s.obj.scale.set(1, len, 1);
}

/** Two equal bones from `root` to `tip`, the joint pushed toward `bend`. */
function twoBone(root: Vector3, tip: Vector3, bone: number, bend: Vector3, out: Vector3): Vector3 {
  const d = _c.copy(tip).sub(root);
  const dist = Math.min(d.length(), bone * 2 - 1e-3);
  d.normalize();
  const reach = Math.sqrt(Math.max(0, bone * bone - (dist / 2) ** 2));
  _across.copy(bend).addScaledVector(d, -bend.dot(d)).normalize();
  return out.copy(root).addScaledVector(d, dist / 2).addScaledVector(_across, reach);
}

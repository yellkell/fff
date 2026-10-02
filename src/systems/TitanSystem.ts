/**
 * THE TITAN FIGHT. A neon titan prints into your room 2.2 m off your pad,
 * and swings at YOU (DESIGN §3.2): every blow starts at its body and
 * travels to where your head was when the windup ended.
 *
 *   RISING   it prints from the floor up, a scan line climbing it.
 *   FIGHT    it faces you, drifts, breathes, and strikes (titans/strike.ts)
 *            with arms that really reach (titans/ik.ts): the elbow bends,
 *            the forearm telescopes on a lit piston, the whole machine
 *            lunges in behind the blow.
 *   FALLING  it un-prints, top down, whoever won.
 *
 * Which titan you fight is `game.titan` (the console sets it); how it
 * fights is its entry in titans/fights.ts. What it can do:
 *
 *   FISTS    one arm, or both at once (a CLAP, meeting on your head), or a
 *            chain from alternating arms on a beat (a PISTON).
 *   BEAMS    from its eye: locked on your head, or locked at your head's
 *            HEIGHT and swept across the pad (duck under it).
 *   BOLTS    things it throws: a VOLLEY from wingtips or launcher pods, a
 *            MORTAR lobbed from the pods to fall on where you stood, and
 *            GOLIATH's DECREE, a row of bolts with one gap (decree.ts).
 *
 * Judging is in 3D against your real head and hands, swept frame to frame:
 *   - a fist's, bolt's or beam's path through your head is a HIT (your
 *     platform rim reddens);
 *   - an open palm facing into it, or a ball orbiting your hand, in its
 *     path BLOCKS it. A blocked fist or beam staggers the titan.
 *
 * Your fireballs hurt it on its lit weak points, which open in the order
 * its pattern says (titans/weak.ts); anywhere else they spark off the
 * armour. Some titans ENRAGE at half health: shorter gaps, never shorter
 * tells.
 *
 * Hits land with weight: a flash and a shockwave where they hit
 * (fx/impact.ts), a weak-point hit freezes the titan for a beat and flares
 * every edge on it, and its health bar leaves a white trail of what you
 * just took off.
 */

import { createSystem } from '@iwsdk/core';
import {
  AdditiveBlending,
  BackSide,
  Box3,
  Color,
  CylinderGeometry,
  DoubleSide,
  Group,
  type Material,
  Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  type Object3D,
  Plane,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  type Sprite,
  Vector3,
} from 'three';
import { setPlatformDanger } from '../arena/platform.js';
import { hum, sfx } from '../audio/sfx.js';
import { FIGHT, NEON, STAGE } from '../config.js';
import { fx, glowSprite } from '../fx/neon.js';
import { guardStop } from '../game/guard.js';
import { addHittable } from '../game/hittables.js';
import { game, setMode } from '../game/state.js';
import { hands, SIDES } from '../input/hands.js';
import { type DecreePlan, planDecree } from '../titans/decree.js';
import { FIGHTS, playable, type TitanFight } from '../titans/fights.js';
import { type ArmChain, reach } from '../titans/ik.js';
import { buildTitan, type TitanRig } from '../titans/rigs.js';
import { TITANS, type TitanLook } from '../titans/roster.js';
import { stageScale } from '../titans/stage.js';
import {
  armsOf,
  isFist,
  lob,
  pickStrike,
  segmentDistance,
  segmentParam,
  type StrikeDef,
  type StrikePath,
  strikePoint,
  windupOffset,
} from '../titans/strike.js';
import { type WeakPart, WeakCycle } from '../titans/weak.js';
import { FONT, frame, glass, glowText, textPlane, type TextPlane } from '../ui/kit.js';
import { orbitingBall } from './FireballSystem.js';

type Phase = 'off' | 'rising' | 'fight' | 'falling';
type Stage = 'windup' | 'strike' | 'recover';

interface Arm extends ArmChain {
  side: -1 | 1;
  fist: Group;
  /** The lit piston the forearm telescopes on. */
  rod: Group;
  /** The windup's swelling light on the fist. */
  glow: Sprite;
  /** Fist radius, world metres, for the judging. */
  radius: number;
  /** Where its fist is, world, now and last frame. */
  at: Vector3;
  was: Vector3;
}

/** One arm's part in a blow (a clap has two). */
interface Swing {
  i: 0 | 1;
  /** World: the windup point the fist leaves from. */
  from: Vector3;
  /** Its side, as a world direction. */
  outward: Vector3;
  /** Where the fist was when the blow ended, for the way home. */
  home: Vector3;
}

interface Act {
  def: StrikeDef;
  stage: Stage;
  t: number;
  /** World: your head, snapped (a fist's target, a beam's lock). */
  to: Vector3;
  swings: Swing[];
  lunge: number;
  locked: boolean;
  landed: boolean;
  /** Blows still to come in this chain (a PISTON), and whether you broke it. */
  left: number;
  blocked: boolean;
  /** Bolts thrown so far (a volley, a mortar). */
  fired: number;
  /** A sweeping beam: where its aim starts and ends, world. */
  sweepFrom: Vector3;
  sweepTo: Vector3;
  /** A decree: its lanes and gap, and the bolts held over the crown. */
  plan: DecreePlan | null;
  held: Bolt[];
  /** Every bolt it throws shares this, so a decree can only hit you once. */
  group: number;
}

/** Something thrown, in flight (or held, waiting to go). */
interface Bolt {
  obj: Group;
  halo: Sprite;
  pos: Vector3;
  vel: Vector3;
  /** Gravity on it (m/s²): 0 for a bolt, more for a lobbed shell. */
  g: number;
  radius: number;
  age: number;
  damage: number;
  group: number;
  live: boolean;
  /** Held in place (a decree's row) until its act fires it. */
  held: boolean;
}

/** Where bolts leave from: a point on a wingtip or a launcher pod. */
interface Emitter {
  on: Object3D;
  local: Vector3;
  glow: Sprite;
}

/** A weak point: where it is, how big, and the lamp that shows it. */
interface Spot {
  part: WeakPart;
  pos: Vector3;
  radius: number;
  mat: MeshStandardMaterial | null;
  on: Object3D | null;
}

/** What the fight's done, for the probes. */
export const titanStats = {
  phase: 'off' as Phase,
  hp: 1,
  name: '',
  act: null as { path: StrikePath; stage: Stage; left: number } | null,
  /** Which weak points are open: 'both', or the one that's blinking. */
  open: 'both' as 'both' | WeakPart,
  enraged: false,
  /** The decree in the air: where its gap is (pad x), or null. */
  decreeGap: null as number | null,
  hitsTaken: 0,
  blocks: 0,
  hitsLanded: 0,
  armourHits: 0,
  /** Bolts and shells thrown this fight. */
  bolts: 0,
};

/** Test hooks for the headless checks: force a move, hold its fire, set its health. */
export const titanDebug = {
  force: null as StrikePath | null,
  hold: false,
  setHp: null as number | null,
};

const _v = new Vector3();
const _w = new Vector3();
const _head = new Vector3();
const _local = new Vector3();
const _dir = new Vector3();
const _far = new Vector3();
const _aim = new Vector3();
const _prev = new Vector3();
const _into = new Vector3();
const UP = new Vector3(0, 1, 0);
const WHITE = new Color(0xffffff);
const ease = (t: number): number => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};
const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
/** How big each blow's whoosh is. */
const SWING: Record<StrikePath, number> = {
  jab: 0.2,
  hook: 0.6,
  overhand: 0.5,
  sweep: 1,
  piston: 0.3,
  clap: 0.8,
  beam: 0,
  sweepbeam: 0,
  volley: 0,
  mortar: 0,
  decree: 0,
};
const BOLTS = 20;
const PARTS: readonly WeakPart[] = ['head', 'core', 'low', 'shoulderL', 'shoulderR'];

export class TitanSystem extends createSystem({}) {
  private phase: Phase = 'off';
  private look!: TitanLook;
  private fight!: TitanFight;
  private rig: TitanRig | null = null;
  private k = 1;
  private arms: Arm[] = [];
  private act: Act | null = null;
  private last: StrikePath | null = null;
  private gap = 0;
  private stagger = 0;
  private lunge = 0;
  private yaw = Math.PI;
  private t = 0;
  private phaseT = 0;
  private hp = 1;
  private fightTime = 0;
  private flinch = 0;
  private weakFlash = 0;
  private beat = 0;
  private groups = 0;
  /** Its weak points, and the order they open in. */
  private weak = new WeakCycle('both');
  private readonly spots = new Map<WeakPart, Spot>();
  /** Half health, for a titan that has one: angrier, never quicker to tell. */
  private enraged = false;
  private weights: TitanFight['weights'] = {};
  private gapRange: readonly [number, number] = [FIGHT.gapMin, FIGHT.gapMax];
  /** A weak-point hit freezes it for a beat; and flares every edge on it. */
  private hitStop = 0;
  private edgeFlash = 0;
  private edgeMats: { mat: MeshBasicMaterial; base: Color; opacity: number }[] = [];
  /** Bolts in flight, where they leave from, and the wings' flare. */
  private readonly bolts: Bolt[] = [];
  private tips: { wings: Emitter[]; pods: Emitter[] } = { wings: [], pods: [] };
  private flare = 0;
  private wingRest: { gy: number; gz: number; wz: number }[] = [];
  /** GOLIATH's chain of office: how far it's swung out (radians), how
   *  fast, and the lunge it's reacting to. */
  private chainSwing = 0;
  private chainVel = 0;
  private lastLunge = 0;
  private lungeVel = 0;

  /** Clipping for the print-in: everything below the plane's height shows. */
  private readonly clip = new Plane(new Vector3(0, -1, 0), 0);
  private clipped: Material[] = [];
  private scanRing!: Mesh;

  /** The armour (a hittable): the chest's bulk, kept live each frame. */
  private readonly armour = { pos: new Vector3(), radius: 0.4 };
  private chestLocal = new Vector3();

  private beamCore!: Mesh;
  private beamHalo!: Mesh;
  private aimLine!: Mesh;
  /** A sweeping beam's path, shown across the pad at the height it locked. */
  private sweepLine!: Mesh;
  /** A decree's gap, marked on your floor: stand HERE. */
  private gapMark!: Mesh;
  private flash!: Mesh;
  private flashMat!: MeshBasicMaterial;
  private flashT = 0;

  private hud!: Group;
  private hudFrame!: MeshBasicMaterial;
  private hudFill!: Mesh;
  private hudChip!: Mesh;
  private chip = 1;
  private chipHold = 0;
  private hudName!: TextPlane;

  init(): void {
    this.renderer.localClippingEnabled = true;

    // Both sides: a beam fired at YOU is a tube you're looking down the
    // inside of, and its inner walls are all you'd see of it.
    const beamMat = (color: number, opacity: number): MeshBasicMaterial =>
      new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false, side: DoubleSide });
    // Unit cylinders along +y from 0 to 1, stretched between two points.
    const unit = (r: number): CylinderGeometry => new CylinderGeometry(r, r, 1, 10, 1, true).translate(0, 0.5, 0);
    this.beamCore = new Mesh(unit(1), beamMat(NEON.hot, 1));
    this.beamHalo = new Mesh(unit(1), beamMat(NEON.cyan, 0.35));
    this.aimLine = new Mesh(unit(1), beamMat(NEON.cyan, 0.35));
    this.sweepLine = new Mesh(unit(1), beamMat(NEON.cyan, 0.3));
    for (const m of [this.beamCore, this.beamHalo, this.aimLine, this.sweepLine]) {
      m.visible = false;
      this.scene.add(m);
    }

    // The scan line the titan prints in on.
    this.scanRing = new Mesh(
      new RingGeometry(0.62, 0.7, 48),
      new MeshBasicMaterial({ color: NEON.cyan, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    );
    this.scanRing.rotation.x = -Math.PI / 2;
    this.scanRing.visible = false;
    this.scene.add(this.scanRing);

    // The decree's safe spot: a lime ring on your floor.
    this.gapMark = new Mesh(
      new RingGeometry(0.11, 0.15, 32),
      new MeshBasicMaterial({ color: NEON.lime, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
    );
    this.gapMark.rotation.x = -Math.PI / 2;
    this.gapMark.visible = false;
    this.scene.add(this.gapMark);

    // Taking a hit: a red flash round your head.
    this.flashMat = new MeshBasicMaterial({
      color: NEON.danger,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      side: BackSide,
    });
    this.flash = new Mesh(new SphereGeometry(0.3, 16, 12), this.flashMat);
    this.flash.renderOrder = 999;
    this.flash.visible = false;
    this.camera.add(this.flash);

    // Its health: a bar over its head, facing you.
    this.hud = new Group();
    // Big enough to read from the pad: text ~5 cm tall at 2.2 m.
    this.hud.add(glass(0.9, 0.12, 0.014));
    const hudFrame = frame(0.9, 0.12, 0.004, NEON.ember, 0.014);
    this.hudFrame = hudFrame.material as MeshBasicMaterial;
    this.hud.add(hudFrame);
    this.hudName = textPlane(0.84, 0.055);
    this.hudName.mesh.position.y = 0.024;
    this.hud.add(this.hudName.mesh);
    this.hudFill = new Mesh(
      new PlaneGeometry(1, 1).translate(0.5, 0, 0),
      new MeshBasicMaterial({ color: NEON.ember, transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.hudFill.position.set(-0.41, -0.03, 0.002);
    this.hudFill.scale.set(0.82, 0.022, 1);
    this.hudFill.renderOrder = 12;
    this.hud.add(this.hudFill);
    // Behind it, a white trail of the health you just took off, catching up.
    this.hudChip = new Mesh(
      this.hudFill.geometry,
      new MeshBasicMaterial({ color: NEON.hot, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.hudChip.position.set(-0.41, -0.03, 0.001);
    this.hudChip.scale.set(0.82, 0.022, 1);
    this.hudChip.renderOrder = 11;
    this.hud.add(this.hudChip);
    this.hud.visible = false;
    this.scene.add(this.hud);

    // The bolts: a bright glow in its accent round a white-hot heart.
    for (let i = 0; i < BOLTS; i++) {
      const obj = new Group();
      const halo = glowSprite(0xffffff, 1, 0.95);
      obj.add(halo, glowSprite(NEON.hot, 0.08));
      obj.visible = false;
      this.scene.add(obj);
      this.bolts.push({ obj, halo, pos: new Vector3(), vel: new Vector3(), g: 0, radius: 0, age: 0, damage: 0, group: 0, live: false, held: false });
    }

    // Weak points first, so a ball that clips both counts on the weak point.
    for (const part of PARTS) this.spots.set(part, { part, pos: new Vector3(), radius: 0.15, mat: null, on: null });
    const self = this;
    for (const part of [...PARTS, null]) {
      const w = part ? this.spots.get(part)! : this.armour;
      addHittable({
        pos: w.pos,
        get radius() {
          return w.radius;
        },
        live: () => self.phase === 'fight' && (part === null || self.weak.has(part)),
        // Throws bend toward an OPEN weak point only.
        get assist() {
          return part !== null && self.weak.isOpen(part);
        },
        onReturn: false,
        hit: (ball) => (part && self.weak.isOpen(part) ? self.weakHit(ball.at) : self.armourHit(ball.at)),
      });
    }
  }

  update(real: number): void {
    // A weak-point hit stops the titan's clock for a beat (hit-stop): the
    // blow reads as landing. Everything of yours runs on.
    let delta = real;
    if (this.hitStop > 0) {
      this.hitStop -= real;
      delta = real * 0.08;
    }
    this.t += delta;
    const want = game.mode === 'titans';
    if (want && this.phase === 'off') this.spawn();
    if (!want && this.phase !== 'off') this.despawn();
    if (this.phase === 'off' || !this.rig) {
      titanStats.phase = 'off';
      return;
    }
    this.phaseT += delta;
    this.camera.getWorldPosition(_head);

    if (titanDebug.setHp !== null) {
      this.hp = titanDebug.setHp;
      titanDebug.setHp = null;
      if (this.hp <= 0 && this.phase === 'fight') this.enter('falling');
    }
    if (this.phase === 'fight') this.checkEnrage();

    switch (this.phase) {
      case 'rising': {
        const u = this.phaseT / FIGHT.riseTime;
        this.printTo(u);
        if (u >= 1) this.enter('fight');
        break;
      }
      case 'fight':
        this.fightTime += delta;
        this.fightStep(delta);
        break;
      case 'falling': {
        const u = this.phaseT / FIGHT.fallTime;
        this.printTo(1 - u);
        if (Math.random() < 0.5) {
          _v.set(rand(-0.4, 0.4), this.clip.constant, rand(-0.3, 0.3)).add(this.rig.root.position);
          fx.sparks?.burst(_v, 3, this.look.line, 1.2);
        }
        if (u >= 1) this.finish();
        break;
      }
    }
    // (Falling can finish the fight, and take the titan with it.)
    if (!this.rig) return;

    this.pose(delta);
    this.sound(delta);
    // Judge the blow where it IS this frame, after posing, so the frame
    // the fist arrives on you is always judged, whatever the frame rate.
    const a = this.act;
    if (this.phase === 'fight' && a && a.stage === 'strike') {
      if (a.def.limb === 'eye') this.beamFire(a);
      else if (a.def.limb === 'bolts') this.boltsStep(a);
      else this.judgeFists(a);
      if (a.stage === 'strike' && a.t >= a.def.strike) {
        // Missed you: it goes past your head.
        if (!a.landed && isFist(a.def)) for (const sw of a.swings) sfx('whiff', this.arms[sw.i].at);
        this.toRecover(a);
      }
    }
    if (this.phase === 'fight') this.stepBolts(real);
    this.updateGapMark(real);
    this.updateHud(real);
    this.updateFlash(real);
    this.syncStats();
  }

  /* ── the fight ─────────────────────────────────────────────────────── */

  private fightStep(delta: number): void {
    // Standing off the pad costs you.
    if (game.headOutside) this.hurt(FIGHT.outsideDrain * delta, false);
    this.stagger = Math.max(0, this.stagger - delta);

    if (!this.act) {
      this.gap -= delta;
      const forced = titanDebug.force;
      if ((this.gap <= 0 && this.stagger <= 0 && !titanDebug.hold) || forced) {
        const def = forced
          ? this.fight.moves.find((m) => m.path === forced) ?? this.fight.moves[0]
          : pickStrike(this.fight.moves, this.weights, this.last);
        titanDebug.force = null;
        this.begin(def);
      }
      return;
    }

    const a = this.act;
    a.t += delta;
    const d = a.def;
    if (a.stage === 'windup') {
      if (d.limb === 'eye') this.beamWindup(a);
      if (d.path === 'decree') this.decreeWindup(a);
      if (a.t >= d.windup) {
        // The windup ends: SNAPSHOT your head, and go.
        if (isFist(d)) {
          a.to.copy(_head);
          for (const sw of a.swings) this.windupPoint(sw, d.path, sw.from);
        }
        this.planLunge(a);
        a.stage = 'strike';
        a.t = 0;
        for (const sw of a.swings) {
          const at = this.arms[sw.i].at;
          fx.sparks?.burst(at, 10, this.look.accent, 1.4);
          sfx('swing', at, SWING[d.path]);
        }
        if (d.limb === 'eye') sfx('beamFire', this.rig!.eyeFx.getWorldPosition(_v));
        if (d.path === 'decree') this.decreeFire(a);
      }
    } else if (a.stage === 'recover' && a.t >= d.recover) {
      this.act = null;
      // A chain carries on from the other arm, on the beat, unless you broke it.
      if (a.left > 0 && !a.blocked && (d.limb === 0 || d.limb === 1)) {
        this.begin({ ...d, limb: d.limb === 0 ? 1 : 0, windup: d.beat ?? d.windup }, a.left - 1);
        return;
      }
      this.last = d.path;
      this.gap = rand(this.gapRange[0], this.gapRange[1]);
    }
  }

  private begin(def: StrikeDef, left = (def.combo ?? 1) - 1): void {
    const root = this.rig!.root;
    const a: Act = {
      def,
      stage: 'windup',
      t: 0,
      to: new Vector3().copy(_head),
      swings: armsOf(def).map((i) => ({
        i,
        from: new Vector3(),
        outward: new Vector3(this.arms[i].side, 0, 0).transformDirection(root.matrixWorld),
        home: new Vector3(),
      })),
      lunge: 0,
      locked: false,
      landed: false,
      left,
      blocked: false,
      fired: 0,
      sweepFrom: new Vector3(),
      sweepTo: new Vector3(),
      plan: null,
      held: [],
      group: ++this.groups,
    };
    // The tell, from where it's coming: your ears know which side.
    for (const sw of a.swings) sfx('windup', this.arms[sw.i].at, def.windup);
    if (def.limb === 'eye') sfx('beamCharge', this.rig!.eyeFx.getWorldPosition(_v), def.windup);
    if (def.path === 'volley' || def.path === 'mortar') sfx('volleyCharge', this.armour.pos, def.windup);
    if (def.path === 'decree') {
      // Planned from where you stand NOW: the gap is somewhere else.
      a.plan = planDecree(_head.x);
      sfx('decreeCharge', this.rig!.head.getWorldPosition(_v), def.windup);
    }
    this.act = a;
  }

  private toRecover(a: Act): void {
    a.stage = 'recover';
    a.t = 0;
    for (const sw of a.swings) sw.home.copy(this.arms[sw.i].at);
    this.beamCore.visible = this.beamHalo.visible = this.aimLine.visible = this.sweepLine.visible = false;
    this.rig!.eyeFx.visible = false;
  }

  /** How far to step in so every swinging fist can reach where you are. */
  private planLunge(a: Act): void {
    a.lunge = 0;
    for (const sw of a.swings) {
      const arm = this.arms[sw.i];
      arm.pivot.getWorldPosition(_v);
      const reachWorld = (arm.upper + arm.fore + arm.fistLen + FIGHT.telescope * this.look.scale) * this.k;
      const need = _v.distanceTo(a.to) - reachWorld * 0.9;
      a.lunge = Math.max(a.lunge, Math.min(FIGHT.lungeMax, Math.max(0, need + 0.1)));
    }
  }

  /** The windup point for a swinging arm, world space (moves with the titan). */
  private windupPoint(sw: Swing, path: StrikePath, out: Vector3): Vector3 {
    const arm = this.arms[sw.i];
    windupOffset(path, arm.side, _local).multiplyScalar(this.look.scale).add(arm.pivot.position);
    return this.rig!.root.localToWorld(out.copy(_local));
  }

  /** The fists in flight: swept against your hands first, then your head. */
  private judgeFists(a: Act): void {
    for (const sw of a.swings) {
      if (a.stage !== 'strike') return;
      const arm = this.arms[sw.i];
      const from = arm.was;
      const to = arm.at;
      // Which way the fist is travelling: a palm blocks by facing INTO that,
      // judged on the travel, not on where the fist has got to (a fast fist
      // can pass a palm between two frames).
      _dir.copy(to).sub(from);
      if (_dir.lengthSq() < 1e-10) continue;
      _dir.normalize().negate();
      const stop = this.blocker(from, to, arm.radius, _dir);
      if (stop) return this.blocked(a, stop);
      if (!a.landed && segmentDistance(from, to, _head) <= arm.radius + FIGHT.headRadius) {
        a.landed = true;
        this.hurt(a.def.damage, true);
        fx.sparks?.burst(to, 30, NEON.danger, 2);
        // The shockwave a little way out along the blow, not in your eyes.
        fx.impacts?.hit(_v.copy(from).sub(to).setLength(0.35).add(to), NEON.danger, 0.4, 1);
        sfx('hitTaken');
        this.toRecover(a);
      }
    }
  }

  /** What in your hands stops something travelling from → to (game/guard.ts). */
  private blocker(from: Vector3, to: Vector3, r: number, into: Vector3): Vector3 | null {
    return guardStop(from, to, r, into);
  }

  private blocked(a: Act, at: Vector3): void {
    titanStats.blocks++;
    fx.sparks?.burst(at, 40, NEON.hot, 2.4);
    fx.impacts?.hit(at, NEON.hot, 0.5, 2);
    sfx('block', at);
    sfx('titanGrunt', this.rig!.head.getWorldPosition(_w));
    this.stagger = FIGHT.stagger;
    this.flinch = 1;
    this.chainVel += 4;
    a.lunge = 0;
    a.blocked = true;
    this.toRecover(a);
  }

  /* ── the eye beams ─────────────────────────────────────────────────── */

  private beamWindup(a: Act): void {
    const rig = this.rig!;
    const u = a.t / a.def.windup;
    rig.eyeFx.visible = true;
    rig.eyeFx.scale.setScalar(0.3 + 1.2 * u);
    const eye = rig.eyeFx.getWorldPosition(_v);
    // It tracks you, then LOCKS: the rest of the windup is your time to move.
    if (!a.locked) a.to.copy(_head);
    if (!a.locked && u >= FIGHT.beamLock) {
      a.locked = true;
      fx.sparks?.burst(eye, 12, this.look.accent, 0.8);
      sfx('beamLock', eye);
      if (a.def.path === 'sweepbeam') {
        // Locked at your head's HEIGHT: it'll scythe across from one side
        // to the other, level, so only ducking (or a block) gets you out.
        const side = Math.random() < 0.5 ? -1 : 1;
        _dir.copy(a.to).sub(eye).setY(0).normalize();
        const across = _w.crossVectors(UP, _dir).normalize().multiplyScalar(FIGHT.sweepReach * side);
        a.sweepFrom.copy(a.to).add(across);
        a.sweepTo.copy(a.to).sub(across);
      }
    }
    const sweep = a.def.path === 'sweepbeam' && a.locked;
    this.stretch(this.aimLine, eye, sweep ? a.sweepFrom : a.to, a.locked ? 0.006 : 0.003);
    (this.aimLine.material as MeshBasicMaterial).opacity = a.locked ? 0.7 : 0.25;
    (this.aimLine.material as MeshBasicMaterial).color.setHex(a.locked ? NEON.hot : this.look.accent);
    // The sweep's path, drawn level across the pad: duck under this.
    if (sweep) {
      this.stretch(this.sweepLine, a.sweepFrom, a.sweepTo, 0.004);
      (this.sweepLine.material as MeshBasicMaterial).color.setHex(this.look.accent);
      (this.sweepLine.material as MeshBasicMaterial).opacity = 0.25 + 0.25 * Math.sin(this.t * 18) ** 2;
    } else this.sweepLine.visible = false;
  }

  private beamFire(a: Act): void {
    const eye = this.rig!.eyeFx.getWorldPosition(_v);
    this.aimLine.visible = false;
    const sweep = a.def.path === 'sweepbeam';
    const aim = sweep ? _aim.lerpVectors(a.sweepFrom, a.sweepTo, Math.min(1, a.t / a.def.strike)) : a.to;
    // The beam runs from the eye through the aim point and on.
    const far = _far.copy(aim).sub(eye).normalize().multiplyScalar(6).add(eye);
    // A palm facing the eye, or an orbiting ball, on the line stops it
    // there; the nearest one to the eye wins.
    let end: Vector3 = far;
    let endT = 1;
    for (const side of SIDES) {
      const h = hands[side];
      const palm = h.shape.tracked && !h.shape.closed && h.palmNormal.dot(_dir.copy(eye).sub(h.palm).normalize()) >= FIGHT.palmFacing;
      for (const p of [orbitingBall(side), palm ? h.palm : null]) {
        if (!p || segmentDistance(eye, far, p) > FIGHT.beamRadius + FIGHT.palmReach) continue;
        const t = segmentParam(eye, far, p);
        if (t < endT) {
          endT = t;
          end = p;
        }
      }
    }
    const blocked = end !== far;
    this.stretch(this.beamCore, eye, end, FIGHT.beamRadius * 0.45);
    this.stretch(this.beamHalo, eye, end, FIGHT.beamRadius * 1.8);
    (this.beamHalo.material as MeshBasicMaterial).color.setHex(this.look.accent);
    if (blocked) {
      if (!a.landed) {
        a.landed = true;
        titanStats.blocks++;
        this.stagger = FIGHT.stagger * 0.6;
        fx.impacts?.hit(end, this.look.accent, 0.45, 2);
        sfx('block', end);
        // A sweep you catch on your palm is parried: it stops there.
        if (sweep) {
          fx.sparks?.burst(end, 30, NEON.hot, 2);
          this.toRecover(a);
          return;
        }
      }
      if (Math.random() < 0.6) fx.sparks?.burst(end, 4, NEON.hot, 1.6);
    } else if (!a.landed && segmentDistance(eye, far, _head) <= FIGHT.headRadius + FIGHT.beamRadius) {
      a.landed = true;
      this.hurt(a.def.damage, true);
      sfx('hitTaken');
    }
    if (sweep && Math.random() < 0.5) fx.sparks?.burst(end, 2, this.look.accent, 0.8);
  }

  /** Stretch a unit cylinder between two world points. */
  private stretch(m: Mesh, from: Vector3, to: Vector3, r: number): void {
    _dir.copy(to).sub(from);
    const len = _dir.length();
    m.visible = len > 1e-4;
    if (!m.visible) return;
    m.position.copy(from);
    m.quaternion.setFromUnitVectors(_w.set(0, 1, 0), _dir.divideScalar(len));
    m.scale.set(r, len, r);
  }

  /* ── things it throws ──────────────────────────────────────────────── */

  /** Where a volley or mortar leaves from. */
  private emittersFor(path: StrikePath): Emitter[] {
    if (path === 'volley' && this.tips.wings.length) return this.tips.wings;
    return this.tips.pods;
  }

  /** Throw each bolt or shell as its beat comes round, from alternating tips. */
  private boltsStep(a: Act): void {
    if (a.def.path === 'decree') return;
    const n = a.def.combo ?? 1;
    const beat = a.def.beat ?? 0.4;
    while (a.fired < n && a.t >= a.fired * beat) {
      this.throwFrom(a, a.fired);
      a.fired++;
    }
  }

  private freeBolt(): Bolt | null {
    return this.bolts.find((x) => !x.live) ?? null;
  }

  private throwFrom(a: Act, i: number): void {
    const tips = this.emittersFor(a.def.path);
    const e = tips[i % tips.length];
    const b = this.freeBolt();
    if (!b || !e) return;
    e.on.localToWorld(b.pos.copy(e.local));
    const shell = a.def.path === 'mortar';
    if (shell) {
      // Lobbed to come down on where your head is as it leaves.
      lob(b.pos, _head, FIGHT.shellTime, FIGHT.shellGravity, b.vel);
      this.launch(b, a, FIGHT.shellGravity, FIGHT.shellRadius, 0.36);
      sfx('mortarFire', b.pos);
      fx.impacts?.hit(b.pos, this.look.accent, 0.4, 1);
    } else {
      // Straight at where your head is as it leaves: keep moving.
      b.vel.copy(_head).sub(b.pos).setLength(FIGHT.boltSpeed);
      this.launch(b, a, 0, FIGHT.boltRadius, 0.24);
      sfx('boltFire', b.pos);
      fx.impacts?.hit(b.pos, this.look.accent, 0.3, 0);
    }
    fx.sparks?.burst(b.pos, 14, this.look.accent, 1.2);
  }

  private launch(b: Bolt, a: Act, g: number, radius: number, size: number): void {
    b.g = g;
    b.radius = radius;
    b.age = 0;
    b.damage = a.def.damage;
    b.group = a.group;
    b.live = true;
    b.held = false;
    b.halo.scale.setScalar(size);
    b.obj.position.copy(b.pos);
    b.obj.visible = true;
    titanStats.bolts++;
  }

  /**
   * THE DECREE's windup: its bolts gather one by one in a row over the
   * king's crown, one per lane across your pad, the gap left dark; and a
   * lime ring on your floor marks the gap. Stand there.
   */
  private decreeWindup(a: Act): void {
    const plan = a.plan!;
    const n = plan.lanes.length;
    const shown = Math.min(n, Math.floor((a.t / (a.def.windup * 0.55)) * n) + 1);
    // The row: in front of its head, lane for lane with your pad's x.
    const head = this.rig!.head.getWorldPosition(_w);
    const rowY = head.y + 0.25;
    const rowZ = head.z + 0.45;
    while (a.held.length < shown) {
      const j = a.held.length;
      const b = this.freeBolt();
      if (!b) break;
      b.pos.set(plan.lanes[j], rowY, rowZ);
      b.vel.set(0, 0, 0);
      this.launch(b, a, 0, FIGHT.boltRadius, 0.26);
      titanStats.bolts--; // not thrown yet
      b.held = true;
      a.held.push(b);
      fx.sparks?.burst(b.pos, 8, this.look.accent, 0.6);
      sfx('decreeOrb', b.pos, j / Math.max(1, n - 1));
    }
    // The row holds to its lanes, and breathes.
    for (let j = 0; j < a.held.length; j++) {
      const b = a.held[j];
      b.pos.set(plan.lanes[j], rowY + Math.sin(this.t * 5 + j) * 0.015, rowZ);
      b.obj.position.copy(b.pos);
    }
  }

  /** Every held bolt fires at once, across its lane at your head's height. */
  private decreeFire(a: Act): void {
    for (const b of a.held) {
      _aim.set(b.pos.x, _head.y, _head.z);
      b.vel.copy(_aim).sub(b.pos).setLength(FIGHT.decreeSpeed);
      b.held = false;
      titanStats.bolts++;
    }
    a.held = [];
    sfx('decreeFire', this.rig!.head.getWorldPosition(_v));
    fx.impacts?.hit(_v, this.look.accent, 1.2, 2);
  }

  /** Bolts in flight, swept frame to frame: palms and balls, then your head. */
  private stepBolts(delta: number): void {
    for (const b of this.bolts) {
      if (!b.live || b.held) continue;
      b.age += delta;
      _prev.copy(b.pos);
      b.vel.y -= b.g * delta;
      b.pos.addScaledVector(b.vel, delta);
      b.obj.position.copy(b.pos);
      if (Math.random() < 0.8) fx.sparks?.burst(b.pos, 1, this.look.accent, 0.25);
      // A palm blocks by facing into its travel.
      _into.copy(b.vel).normalize().negate();
      const stop = this.blocker(_prev, b.pos, b.radius, _into);
      if (stop) {
        titanStats.blocks++;
        fx.sparks?.burst(stop, 24, NEON.hot, 2);
        fx.impacts?.hit(stop, this.look.accent, 0.35, 1);
        sfx('block', stop);
        this.killBolt(b);
      } else if (segmentDistance(_prev, b.pos, _head) <= b.radius + FIGHT.headRadius) {
        // One volley can hit you once per bolt, but a decree only once.
        const decree = this.act?.group === b.group && this.act.def.path === 'decree';
        if (!(decree && this.act!.landed)) {
          if (decree) this.act!.landed = true;
          this.hurt(b.damage, true);
          fx.sparks?.burst(b.pos, 24, NEON.danger, 1.8);
          sfx('hitTaken');
        }
        this.killBolt(b);
      } else if (b.age > FIGHT.boltLife || b.pos.y < 0.03) {
        if (b.g > 0) {
          // A shell bursting on your floor.
          b.pos.y = Math.max(0.03, b.pos.y);
          fx.sparks?.burst(b.pos, 30, this.look.accent, 1.6);
          fx.impacts?.hit(b.pos, this.look.accent, 0.5, 1);
          sfx('shellBurst', b.pos);
        } else fx.sparks?.burst(b.pos, 10, this.look.accent, 0.8);
        this.killBolt(b);
      }
    }
  }

  private killBolt(b: Bolt): void {
    b.live = false;
    b.held = false;
    b.obj.visible = false;
  }

  private clearBolts(): void {
    for (const b of this.bolts) this.killBolt(b);
  }

  /** The decree's gap ring on your floor, while a decree is in the air. */
  private updateGapMark(delta: number): void {
    const a = this.act;
    const plan = this.phase === 'fight' && a?.plan && (a.stage === 'windup' || a.stage === 'strike') ? a.plan : null;
    titanStats.decreeGap = plan ? plan.gap : null;
    const mat = this.gapMark.material as MeshBasicMaterial;
    mat.opacity = plan ? Math.min(0.9, mat.opacity + delta * 3) : Math.max(0, mat.opacity - delta * 3);
    this.gapMark.visible = mat.opacity > 0.01;
    if (plan) {
      this.gapMark.position.set(plan.gap, 0.01, 0);
      this.gapMark.scale.setScalar(1 + 0.15 * Math.sin(this.t * 8));
    }
  }

  /* ── being hit, and hitting ────────────────────────────────────────── */

  private weakHit(at: Vector3): 'stop' {
    titanStats.hitsLanded++;
    this.hp = Math.max(0, this.hp - 1 / this.fight.hits);
    titanStats.hp = this.hp;
    this.weak.hit();
    this.weakFlash = 1;
    this.flinch = Math.max(this.flinch, 0.7);
    this.chainVel += 3;
    this.hitStop = FIGHT.hitStop;
    this.edgeFlash = 1;
    this.chipHold = 0.45;
    fx.sparks?.burst(at, 50, this.look.accent, 2.6);
    fx.sparks?.burst(at, 20, NEON.hot, 1.6);
    fx.impacts?.hit(at, this.look.accent, 0.8, 2);
    sfx('weakHit', at);
    if (this.hp <= 0) {
      // The killing blow: the whole machine goes up in light.
      const core = this.spots.get('core')!.pos;
      fx.sparks?.burst(core, 120, this.look.accent, 3.2);
      fx.impacts?.hit(core, this.look.accent, 1.8, 2);
      this.hitStop = FIGHT.hitStop * 3;
      this.enter('falling');
    } else this.checkEnrage();
    return 'stop';
  }

  private armourHit(at: Vector3): 'stop' {
    titanStats.armourHits++;
    fx.sparks?.burst(at, 16, this.look.line, 1.2);
    fx.impacts?.hit(at, this.look.line, 0.22, 1);
    sfx('armour', at);
    return 'stop';
  }

  /** Half health: it roars, burns brighter, and closes the gaps. */
  private checkEnrage(): void {
    const e = this.fight.enrage;
    if (!e || this.enraged || this.hp > e.at || this.hp <= 0) return;
    this.enraged = true;
    this.weights = e.weights;
    this.gapRange = e.gap;
    this.stagger = Math.max(this.stagger, 1.2); // it stops to roar
    this.chainVel += 6;
    this.edgeFlash = 1;
    this.hitStop = FIGHT.hitStop * 2;
    for (const m of this.edgeMats) if (m.mat.transparent) m.opacity *= 1.7;
    const head = this.rig!.head.getWorldPosition(_v);
    sfx('enrage', head);
    fx.impacts?.hit(head, this.look.accent, 2.2, 2);
    fx.sparks?.burst(head, 140, this.look.accent, 3.4);
  }

  private hurt(amount: number, flash: boolean): void {
    if (this.phase !== 'fight') return;
    game.playerHp = Math.max(0, game.playerHp - amount);
    if (flash) {
      titanStats.hitsTaken++;
      this.flashT = 1;
    }
    if (game.playerHp <= 0) this.enter('falling');
  }

  /* ── posing it, every frame ────────────────────────────────────────── */

  private pose(delta: number): void {
    const rig = this.rig!;
    const root = rig.root;
    const a = this.act;
    const striking = a && a.stage !== 'windup';
    const fists = a && isFist(a.def);

    // Face you, except mid-blow: a committed blow doesn't follow your dodge.
    if (!striking) {
      const want = Math.atan2(-(_head.x - root.position.x), -(_head.z - root.position.z));
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, delta * 3);
    }

    // The lunge in behind a blow, and back.
    let lungeWant = 0;
    if (a && fists) {
      if (a.stage === 'windup') lungeWant = a.lunge * 0.25 * ease(a.t / a.def.windup);
      else if (a.stage === 'strike') lungeWant = a.lunge;
    }
    if (a && a.stage === 'windup' && fists && a.lunge === 0) {
      // Pre-plan from where you are now, so the windup can lean in early.
      a.to.copy(_head);
      this.planLunge(a);
    }
    const rate = a && a.stage === 'strike' ? 10 : 3;
    this.lunge += (lungeWant - this.lunge) * Math.min(1, delta * rate);

    this.flinch = Math.max(0, this.flinch - delta * 2);
    const sway = Math.sin(this.t * 0.55) * FIGHT.sway * (striking ? 0.3 : 1);
    const fwdX = -Math.sin(this.yaw);
    const fwdZ = -Math.cos(this.yaw);
    root.position.set(sway * Math.cos(this.yaw) + fwdX * this.lunge, Math.sin(this.t * 1.4) * FIGHT.bob, -STAGE.distance + fwdZ * this.lunge);
    // Keep it off your pad whatever happens.
    root.position.z = Math.min(root.position.z, -1.15);
    root.rotation.set(-0.18 * this.flinch - (this.stagger > 0 ? 0.08 : 0), this.yaw, 0);
    root.updateMatrixWorld(true);

    // The arms.
    for (let i = 0; i < 2; i++) {
      const arm = this.arms[i];
      const sw = a?.swings.find((x) => x.i === i) ?? null;
      arm.was.copy(arm.at);
      const target = this.fistTarget(i, sw, _v);
      _local.copy(target);
      root.worldToLocal(_local);
      const pole = _w.set(arm.side * 0.8, -0.5, 0.35);
      const ext = reach(arm, _local, pole, FIGHT.telescope * this.look.scale);
      arm.rod.visible = ext > 0.004;
      arm.rod.scale.set(1, Math.max(ext, 1e-4), 1);
      arm.rod.position.y = -arm.fore;
      root.updateMatrixWorld(true);
      arm.wrist.localToWorld(arm.at.set(0, -arm.fistLen, 0));
      if (this.phase !== 'fight' || !sw) arm.was.copy(arm.at);
      // The windup's light on a striking fist.
      const u = sw && a?.stage === 'windup' ? a.t / a.def.windup : 0;
      arm.glow.visible = u > 0;
      arm.glow.scale.setScalar(0.1 + 0.5 * u * this.look.scale);
    }

    // Throwing: the wings flare wide and forward, and the tips (or the
    // launcher pods) swell with light.
    const throwing = a && (a.def.path === 'volley' || a.def.path === 'mortar') && a.stage !== 'recover' ? a : null;
    const flaring = throwing && throwing.def.path === 'volley' && this.tips.wings.length > 0;
    this.flare += ((flaring ? 1 : 0) - this.flare) * Math.min(1, delta * 5);
    rig.wings.forEach((w, i) => {
      const r = this.wingRest[i];
      w.group.rotation.y = r.gy * (1 - 0.9 * this.flare);
      w.group.rotation.z = r.gz + w.side * 0.3 * this.flare;
      w.wrist.rotation.z = r.wz - w.side * 0.35 * this.flare;
    });
    const charge = throwing ? (throwing.stage === 'windup' ? throwing.t / throwing.def.windup : 1) : 0;
    const lit = throwing ? this.emittersFor(throwing.def.path) : [];
    for (const e of [...this.tips.wings, ...this.tips.pods]) {
      const on = lit.includes(e) && charge > 0;
      e.glow.visible = on;
      if (on) e.glow.scale.setScalar((0.08 + 0.3 * charge) / this.k);
    }

    this.swingChain(delta);

    // A weak-point hit flares every lit edge on it, white, for a moment.
    this.edgeFlash = Math.max(0, this.edgeFlash - delta * 5);
    for (const e of this.edgeMats) {
      if (e.mat.transparent) e.mat.opacity = e.opacity * (1 + 3 * this.edgeFlash);
      else e.mat.color.copy(e.base).lerp(WHITE, 0.85 * this.edgeFlash);
    }

    // An open weak point blinks; a shut one sits dim and steady. Enraged,
    // everything burns hotter.
    this.weakFlash = Math.max(0, this.weakFlash - delta * 4);
    const blink = 0.5 + 0.5 * Math.sin(this.t * (this.enraged ? 9 : 6));
    const heat = this.enraged ? 1.4 : 1;
    for (const s of this.spots.values()) {
      if (!s.mat || !this.weak.has(s.part)) continue;
      const [lo, amp, shut] = s.part === 'head' ? [1.2, 1.2, 0.35] : s.part === 'core' ? [0.5, 1.4, 0.15] : [0.6, 1.6, 0.12];
      s.mat.emissiveIntensity = this.weak.isOpen(s.part) ? heat * (lo + amp * blink) + 3 * this.weakFlash : shut;
    }
    rig.head.rotation.x = -0.4 * this.flinch;

    // Keep the hittables on it.
    for (const s of this.spots.values()) s.on?.getWorldPosition(s.pos);
    root.localToWorld(this.armour.pos.copy(this.chestLocal));
  }

  /**
   * The chain of office swings like a real one: a damped pendulum hanging
   * off its anchor line, flung out by the king's own moves. It lags behind
   * a lunge and swings out as he pulls up, jumps when he's hit or roars,
   * and can only swing OUT: behind it is his chest, which it rests against.
   */
  private swingChain(delta: number): void {
    const chain = this.rig!.chain;
    if (!chain || delta < 1e-3) return;
    // The lunge's acceleration, toward you: pulling up flings it forward.
    const v = (this.lunge - this.lastLunge) / delta;
    const acc = Math.max(-25, Math.min(25, (v - this.lungeVel) / delta));
    this.lastLunge = this.lunge;
    this.lungeVel = v;
    // Leaning back (a flinch, a stagger) leaves it hanging forward of him.
    const lean = 0.18 * this.flinch + (this.stagger > 0 ? 0.08 : 0);
    this.chainVel += (-30 * (this.chainSwing - lean) - 2.6 * this.chainVel - 0.9 * acc) * delta;
    this.chainSwing += this.chainVel * delta;
    if (this.chainSwing < 0) {
      // It meets his chest and bounces off, softly.
      this.chainSwing = 0;
      this.chainVel = Math.abs(this.chainVel) * 0.3;
    }
    this.chainSwing = Math.min(1.1, this.chainSwing);
    chain.rotation.x = this.chainSwing;
  }

  /** Where arm `i`'s fist should be this frame, world space. */
  private fistTarget(i: number, sw: Swing | null, out: Vector3): Vector3 {
    const arm = this.arms[i];
    const root = this.rig!.root;
    // The guard: fists up in front of its chest, breathing.
    const s = this.look.scale;
    const guard = _w.set(arm.side * 0.02, -0.5 + Math.sin(this.t * 1.4 + i) * 0.02, -0.38).multiplyScalar(s).add(arm.pivot.position);
    root.localToWorld(guard);
    const a = this.act;
    if (!a || !sw || this.phase !== 'fight') return out.copy(guard);
    const d = a.def;
    if (a.stage === 'windup') {
      this.windupPoint(sw, d.path, out);
      return out.lerpVectors(guard, out, ease(a.t / (d.windup * 0.7)));
    }
    if (a.stage === 'strike') {
      return strikePoint(d.path, sw.from, a.to, sw.outward, a.t / d.strike, out);
    }
    return out.lerpVectors(sw.home, guard, ease(a.t / d.recover));
  }

  /* ── in and out ────────────────────────────────────────────────────── */

  private spawn(): void {
    if (!playable(TITANS[game.titan]?.name)) game.titan = 0;
    this.look = TITANS[game.titan];
    this.fight = FIGHTS[this.look.name];
    const rig = buildTitan(this.look);
    this.rig = rig;
    this.k = stageScale(rig.height);
    rig.root.scale.setScalar(this.k);
    rig.root.position.set(0, 0, -STAGE.distance);
    this.yaw = Math.PI;
    rig.root.rotation.set(0, this.yaw, 0);
    this.scene.add(rig.root);
    rig.root.updateMatrixWorld(true);

    // Every material on it prints in under the clipping plane.
    const mats = new Set<Material>();
    rig.root.traverse((o) => {
      const m = (o as Mesh).material as Material | Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => mats.add(x));
      else if (m) mats.add(m);
    });
    this.clipped = [...mats];

    // The arms, as reach chains, with their pistons and windup lights.
    const s = this.look.scale;
    this.arms = rig.arms.map((ra, i) => {
      const side = (i === 0 ? -1 : 1) as -1 | 1;
      // The fist centre, down the forearm from the wrist.
      ra.wrist.rotation.set(0, 0, 0);
      rig.root.updateMatrixWorld(true);
      const box = new Box3().setFromObject(ra.fist);
      const centre = ra.wrist.worldToLocal(box.getCenter(new Vector3()));
      const size = box.getSize(new Vector3());
      const rod = new Group();
      const rodMat = new MeshBasicMaterial({ color: this.look.line, toneMapped: false });
      const rodHalo = new MeshBasicMaterial({ color: this.look.line, transparent: true, opacity: 0.25, blending: AdditiveBlending, depthWrite: false });
      rod.add(new Mesh(new CylinderGeometry(0.022 * s, 0.022 * s, 1, 10).translate(0, -0.5, 0), rodMat));
      rod.add(new Mesh(new CylinderGeometry(0.045 * s, 0.045 * s, 1, 10).translate(0, -0.5, 0), rodHalo));
      rod.visible = false;
      ra.elbow.add(rod);
      this.clipped.push(rodMat, rodHalo);
      const glow = glowSprite(this.look.accent, 1, 0.9);
      glow.visible = false;
      glow.position.copy(centre);
      ra.wrist.add(glow);
      return {
        pivot: ra.pivot,
        elbow: ra.elbow,
        wrist: ra.wrist,
        fist: ra.fist,
        upper: 0.5 * s,
        fore: 0.42 * s,
        fistLen: Math.max(0.05 * s, -centre.y),
        side,
        rod,
        glow,
        radius: Math.max(0.08, (Math.max(size.x, size.y, size.z) / 2) * 0.8),
        at: new Vector3(),
        was: new Vector3(),
      };
    });
    for (const m of this.clipped) m.clippingPlanes = [this.clip];

    // Weak points, sized off the rig, and the order they open in.
    this.weak = new WeakCycle(this.fight.weak);
    const half = (o: Object3D): number => Math.max(...new Box3().setFromObject(o).getSize(new Vector3()).toArray()) / 2;
    const place = (part: WeakPart, on: Object3D, mat: MeshStandardMaterial, radius: number): void => {
      Object.assign(this.spots.get(part)!, { on, mat, radius });
    };
    place('head', rig.head, rig.visorMat, half(rig.head) * 0.75);
    // Generous: a ball orbiting your palm leaves up to ~17 cm off it, and
    // there's no trigger to steady a hand-thrown shot.
    place('core', rig.core, rig.coreMat, Math.max(0.14, half(rig.core) * 2));
    place('low', rig.low, rig.lowMat, Math.max(0.14, half(rig.low) * 1.8));
    place('shoulderL', rig.shoulders[0], rig.shoulderMats[0], Math.max(0.14, half(rig.shoulders[0]) * 1.6));
    place('shoulderR', rig.shoulders[1], rig.shoulderMats[1], Math.max(0.14, half(rig.shoulders[1]) * 1.6));
    // The armour: the chest's bulk, set BEHIND the core (+z is its back)
    // and small enough that it never sits in front of a weak point, so a
    // clean shot at the core is never spent on armour first.
    this.chestLocal.set(0, rig.coreY, 0.12 * s);
    this.armour.radius = 0.3 * s * this.k;

    this.hudName.draw((g, w, h) => {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${h * 0.8}px ${FONT}`;
      glowText(g, this.look.name, w / 2, h / 2, this.look.line);
    });
    (this.hudFill.material as MeshBasicMaterial).color.setHex(this.look.line);
    this.hudFrame.color.setHex(this.look.line);
    (this.scanRing.material as MeshBasicMaterial).color.setHex(this.look.accent);

    // Its lit edges, to flare on a hit.
    const seen = new Set<Material>();
    this.edgeMats = [];
    rig.root.traverse((o) => {
      if (o.name !== 'neon-edges' && o.name !== 'neon-halo') return;
      const mat = (o as Mesh).material as MeshBasicMaterial;
      if (seen.has(mat)) return;
      seen.add(mat);
      this.edgeMats.push({ mat, base: mat.color.clone(), opacity: mat.opacity });
    });
    this.edgeFlash = 0;

    // Where things are thrown from: the wingtips, and the launcher pods
    // (found by their lamps' material).
    this.wingRest = rig.wings.map((w) => ({ gy: w.group.rotation.y, gz: w.group.rotation.z, wz: w.wrist.rotation.z }));
    this.flare = 0;
    const emitter = (on: Object3D, local: Vector3): Emitter => {
      const glow = glowSprite(this.look.accent, 1, 0.95);
      glow.visible = false;
      glow.position.copy(local);
      on.add(glow);
      return { on, local, glow };
    };
    const pods: Object3D[] = [];
    for (const pm of rig.podMats) {
      let found: Object3D | null = null;
      rig.root.traverse((o) => {
        if (!found && (o as Mesh).material === pm) found = o;
      });
      pods.push(found ?? rig.shoulders[pods.length]);
    }
    this.tips = {
      wings: rig.wings.map((w) => emitter(w.wrist, new Vector3(w.side * 0.44 * s, 0, 0))),
      pods: pods.map((p) => emitter(p, new Vector3())),
    };
    for (const b of this.bolts) b.halo.material.color.setHex(this.look.accent);
    (this.sweepLine.material as MeshBasicMaterial).color.setHex(this.look.accent);
    this.chip = 1;
    this.chipHold = 0;
    this.hitStop = 0;
    this.enraged = false;
    this.chainSwing = this.chainVel = this.lastLunge = this.lungeVel = 0;
    this.weights = this.fight.weights;
    this.gapRange = this.fight.gap ?? [FIGHT.gapMin, FIGHT.gapMax];

    this.hp = 1;
    game.playerHp = 1;
    game.result = null;
    this.act = null;
    this.last = null;
    this.gap = 1.2;
    this.stagger = 0;
    this.lunge = 0;
    this.fightTime = 0;
    Object.assign(titanStats, { name: this.look.name, hp: 1, act: null, enraged: false, decreeGap: null, hitsTaken: 0, blocks: 0, hitsLanded: 0, armourHits: 0, bolts: 0 });
    this.enter('rising');
    this.printTo(0);
  }

  private enter(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    const at = this.rig?.head.getWorldPosition(_w);
    if (p === 'rising' && this.rig) sfx('titanPrint', this.rig.root.position);
    if (p === 'fight') sfx('titanRoar', at);
    if (p === 'falling') {
      sfx('titanFall', at);
      sfx(this.hp <= 0 ? 'win' : 'lose');
      this.act = null;
      this.clearBolts();
      this.beamCore.visible = this.beamHalo.visible = this.aimLine.visible = this.sweepLine.visible = false;
      if (this.rig) this.rig.eyeFx.visible = false;
    }
  }

  /** Print it in (or out) to fraction `u` of its height. */
  private printTo(u: number): void {
    const top = this.rig!.height * this.k + 0.1;
    const y = Math.max(0, Math.min(1, u)) * top;
    this.clip.constant = y;
    this.scanRing.visible = u > 0 && u < 1;
    this.scanRing.position.set(this.rig!.root.position.x, y, this.rig!.root.position.z);
    this.scanRing.scale.setScalar(this.k * this.look.scale * 0.8);
    if (u >= 1) this.clip.constant = 100;
  }

  private finish(): void {
    game.result = { mode: 'titans', titan: this.look.name, won: this.hp <= 0, time: this.fightTime };
    this.despawn();
    setMode('home');
  }

  private despawn(): void {
    hum('titan', 'engine', this.armour.pos, 0);
    this.clearBolts();
    this.tips = { wings: [], pods: [] };
    this.rig?.dispose();
    this.rig = null;
    this.arms = [];
    this.act = null;
    this.phase = 'off';
    this.scanRing.visible = false;
    this.hud.visible = false;
    this.gapMark.visible = false;
    (this.gapMark.material as MeshBasicMaterial).opacity = 0;
    this.beamCore.visible = this.beamHalo.visible = this.aimLine.visible = this.sweepLine.visible = false;
    game.playerHp = 1;
    setPlatformDanger(0);
  }

  /** The engine in its chest, and your heart when you're nearly done. It
   *  barely ticks over at idle and revs as the machine lunges, so it's
   *  heard when it means something, not as a drone under the whole fight. */
  private sound(delta: number): void {
    const rev = Math.min(1, this.lunge / 0.5);
    const level = this.phase === 'fight' ? 0.012 + 0.05 * rev : this.phase === 'rising' ? 0.012 * (this.phaseT / FIGHT.riseTime) : 0;
    hum('titan', 'engine', this.armour.pos, level, 1 + 0.5 * rev);
    this.beat -= delta;
    if (this.phase === 'fight' && game.playerHp < 0.3 && this.beat <= 0) {
      sfx('heartbeat');
      this.beat = 0.55 + game.playerHp * 1.5;
    }
  }

  private updateHud(delta: number): void {
    const rig = this.rig!;
    this.hud.visible = this.phase === 'fight';
    if (!this.hud.visible) return;
    // The trail holds a moment, then catches the bar up.
    if (this.chipHold > 0) this.chipHold -= delta;
    else this.chip = Math.max(this.hp, this.chip - delta * 0.5);
    this.hudChip.scale.x = Math.max(0.0001, 0.82 * this.chip);
    const top = Math.min(STAGE.maxHeight + 0.05, rig.height * this.k + 0.12);
    this.hud.position.set(rig.root.position.x, top, rig.root.position.z);
    this.hud.lookAt(_head);
    this.hudFill.scale.x = Math.max(0.0001, 0.82 * this.hp);
  }

  private updateFlash(delta: number): void {
    this.flashT = Math.max(0, this.flashT - delta * 3);
    this.flash.visible = this.flashT > 0;
    this.flashMat.opacity = 0.5 * this.flashT;
    setPlatformDanger(this.phase === 'off' ? 0 : 1 - game.playerHp, this.t);
  }

  private syncStats(): void {
    titanStats.phase = this.phase;
    titanStats.hp = this.hp;
    titanStats.act = this.act ? { path: this.act.def.path, stage: this.act.stage, left: this.act.left } : null;
    titanStats.open = this.weak.open;
    titanStats.enraged = this.enraged;
  }
}

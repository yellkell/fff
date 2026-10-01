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
 * Judging is in 3D against your real head and hands, swept frame to frame:
 *   - a fist's path through your head is a HIT (your platform rim reddens);
 *   - an open palm facing the fist, or a ball orbiting your hand, in its
 *     path BLOCKS it: the fist bounces off and the titan staggers;
 *   - the eye beam locks on before it fires; the same palm or ball blocks it.
 * Your fireballs hurt it on its lit weak points (visor and chest core);
 * anywhere else on it they spark off the armour. Some titans open only one
 * weak point at a time (titans/fights.ts): a shut one is armour too.
 *
 * Which titan you fight is `game.titan` (the console sets it); how it
 * fights is its entry in titans/fights.ts.
 *
 * A VOLLEY throws bolts instead of a fist: they leave the wingtips (or the
 * shoulders), fly at where your head was as each one left, and are judged
 * like a fist, swept frame to frame against your palms, balls and head.
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
  type Object3D,
  MeshBasicMaterial,
  Plane,
  PlaneGeometry,
  RingGeometry,
  SphereGeometry,
  type Sprite,
  Vector3,
} from 'three';
import { setPlatformDanger } from '../arena/platform.js';
import { hum, sfx } from '../audio/sfx.js';
import { FIGHT, FIREBALL, NEON, STAGE } from '../config.js';
import { fx, glowSprite } from '../fx/neon.js';
import { addHittable } from '../game/hittables.js';
import { game, setMode } from '../game/state.js';
import { hands, SIDES } from '../input/hands.js';
import { FIGHTS, playable, type TitanFight } from '../titans/fights.js';
import { type ArmChain, reach } from '../titans/ik.js';
import { buildTitan, type TitanRig } from '../titans/rigs.js';
import { TITANS, type TitanLook } from '../titans/roster.js';
import { stageScale } from '../titans/stage.js';
import { isFist, pickStrike, segmentDistance, segmentParam, type StrikeDef, type StrikePath, strikePoint, windupOffset } from '../titans/strike.js';
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

interface Act {
  def: StrikeDef;
  stage: Stage;
  t: number;
  /** World: the windup point the blow leaves from, and your head, snapped. */
  from: Vector3;
  to: Vector3;
  outward: Vector3;
  /** Where the fist was when the blow ended, for the way home. */
  home: Vector3;
  lunge: number;
  locked: boolean;
  landed: boolean;
  /** Blows still to come in this chain (a PISTON), and whether you broke it. */
  left: number;
  blocked: boolean;
  /** Bolts thrown so far (a volley). */
  fired: number;
}

/** A volley's bolt in flight. */
interface Bolt {
  obj: Group;
  pos: Vector3;
  vel: Vector3;
  age: number;
  damage: number;
  live: boolean;
}

/** Where a volley's bolts leave from: a point on a wingtip or shoulder. */
interface Emitter {
  on: Object3D;
  local: Vector3;
  glow: Sprite;
}

/** What the fight's done, for the probes. */
export const titanStats = {
  phase: 'off' as Phase,
  hp: 1,
  name: '',
  act: null as { path: StrikePath; stage: Stage; left: number } | null,
  /** Which weak points are open: 'both', or the one that's blinking. */
  open: 'both' as WeakOpen,
  hitsTaken: 0,
  blocks: 0,
  hitsLanded: 0,
  armourHits: 0,
  /** Bolts thrown this fight. */
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
const ease = (t: number): number => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};
const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);
/** How big each blow's whoosh is. */
const SWING: Record<StrikePath, number> = { jab: 0.2, hook: 0.6, overhand: 0.5, sweep: 1, piston: 0.3, beam: 0, volley: 0 };
const WHITE = new Color(0xffffff);
const _prev = new Vector3();
const _into = new Vector3();
const BOLTS = 8;

type WeakOpen = 'both' | 'head' | 'core';

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
  private open: WeakOpen = 'both';
  /** Hits on the open weak point since it opened ('double' swaps at 2). */
  private openHits = 0;
  /** A weak-point hit freezes it for a beat; and flares every edge on it. */
  private hitStop = 0;
  private edgeFlash = 0;
  private edgeMats: { mat: MeshBasicMaterial; base: Color; opacity: number }[] = [];
  /** The volley: bolts in flight, where they leave from, and the wings' flare. */
  private readonly bolts: Bolt[] = [];
  private emitters: Emitter[] = [];
  private flare = 0;
  private wingRest: { gy: number; gz: number; wz: number }[] = [];

  /** Clipping for the print-in: everything below the plane's height shows. */
  private readonly clip = new Plane(new Vector3(0, -1, 0), 0);
  private clipped: Material[] = [];
  private scanRing!: Mesh;

  /** Weak points and armour (hittables): centres kept live each frame. */
  private readonly weakHead = { pos: new Vector3(), radius: 0.2 };
  private readonly weakCore = { pos: new Vector3(), radius: 0.15 };
  private readonly armour = { pos: new Vector3(), radius: 0.4 };
  private chestLocal = new Vector3();

  private beamCore!: Mesh;
  private beamHalo!: Mesh;
  private aimLine!: Mesh;
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
    for (const m of [this.beamCore, this.beamHalo, this.aimLine]) {
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

    // The volley's bolts: a venom-bright glow round a white-hot heart.
    for (let i = 0; i < BOLTS; i++) {
      const obj = new Group();
      obj.add(glowSprite(0xffffff, 0.24, 0.95), glowSprite(NEON.hot, 0.08));
      obj.visible = false;
      this.scene.add(obj);
      this.bolts.push({ obj, pos: new Vector3(), vel: new Vector3(), age: 0, damage: 0, live: false });
    }
    this.hud.visible = false;
    this.scene.add(this.hud);

    // Weak points first, so a ball that clips both counts on the weak point.
    const self = this;
    for (const [w, part] of [
      [this.weakHead, 'head'],
      [this.weakCore, 'core'],
      [this.armour, null],
    ] as const) {
      addHittable({
        pos: w.pos,
        get radius() {
          return w.radius;
        },
        live: () => self.phase === 'fight',
        // Throws bend toward an OPEN weak point only.
        get assist() {
          return part !== null && self.isOpen(part);
        },
        onReturn: false,
        hit: (ball) => (part && self.isOpen(part) ? self.weakHit(ball.at) : self.armourHit(ball.at)),
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
      else if (a.def.limb === 'wings') this.volleyStep(a);
      else this.judgeFist(a);
      if (a.stage === 'strike' && a.t >= a.def.strike) {
        // Missed you: it goes past your head.
        if (!a.landed && isFist(a.def)) sfx('whiff', this.arms[a.def.limb].at);
        this.toRecover(a);
      }
    }
    if (this.phase === 'fight') this.stepBolts(real);
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
          : pickStrike(this.fight.moves, this.fight.weights, this.last);
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
      if (a.t >= d.windup) {
        // The windup ends: SNAPSHOT your head, and go.
        if (isFist(d)) {
          a.to.copy(_head);
          this.windupPoint(a, a.from);
        }
        this.planLunge(a);
        a.stage = 'strike';
        a.t = 0;
        if (isFist(d)) {
          fx.sparks?.burst(this.arms[d.limb].at, 10, this.look.accent, 1.4);
          sfx('swing', this.arms[d.limb].at, SWING[d.path]);
        } else if (d.limb === 'eye') {
          sfx('beamFire', this.rig!.eyeFx.getWorldPosition(_v));
        }
      }
    } else if (a.stage === 'recover' && a.t >= d.recover) {
      this.act = null;
      // A chain carries on from the other arm, on the beat, unless you broke it.
      if (a.left > 0 && !a.blocked && isFist(d)) {
        this.begin({ ...d, limb: d.limb === 0 ? 1 : 0, windup: d.beat ?? d.windup }, a.left - 1);
        return;
      }
      this.last = d.path;
      const [lo, hi] = this.fight.gap ?? [FIGHT.gapMin, FIGHT.gapMax];
      this.gap = rand(lo, hi);
    }
  }

  private begin(def: StrikeDef, left = (def.combo ?? 1) - 1): void {
    const a: Act = {
      def,
      stage: 'windup',
      t: 0,
      from: new Vector3(),
      to: new Vector3().copy(_head),
      outward: new Vector3(),
      home: new Vector3(),
      lunge: 0,
      locked: false,
      landed: false,
      left,
      blocked: false,
      fired: 0,
    };
    if (isFist(def)) {
      const arm = this.arms[def.limb];
      a.outward.set(arm.side, 0, 0).transformDirection(this.rig!.root.matrixWorld);
      // The tell, from the fist that's coming: your ears know which side.
      sfx('windup', arm.at, def.windup);
    } else if (def.limb === 'eye') {
      sfx('beamCharge', this.rig!.eyeFx.getWorldPosition(_v), def.windup);
    } else {
      sfx('volleyCharge', this.armour.pos, def.windup);
    }
    this.act = a;
  }

  private toRecover(a: Act): void {
    a.stage = 'recover';
    a.t = 0;
    if (isFist(a.def)) a.home.copy(this.arms[a.def.limb].at);
    this.beamCore.visible = this.beamHalo.visible = this.aimLine.visible = false;
    this.rig!.eyeFx.visible = false;
  }

  /** How far to step in so the blow can reach where you are. */
  private planLunge(a: Act): void {
    if (!isFist(a.def)) {
      a.lunge = 0;
      return;
    }
    const arm = this.arms[a.def.limb];
    arm.pivot.getWorldPosition(_v);
    const reachWorld = (arm.upper + arm.fore + arm.fistLen + FIGHT.telescope * this.look.scale) * this.k;
    const need = _v.distanceTo(a.to) - reachWorld * 0.9;
    a.lunge = Math.min(FIGHT.lungeMax, Math.max(0, need + 0.1));
  }

  /** The windup point for this act's arm, world space (moves with the titan). */
  private windupPoint(a: Act, out: Vector3): Vector3 {
    const arm = this.arms[a.def.limb as 0 | 1];
    windupOffset(a.def.path, arm.side, _local).multiplyScalar(this.look.scale).add(arm.pivot.position);
    return this.rig!.root.localToWorld(out.copy(_local));
  }

  /** The fist in flight: swept against your hands first, then your head. */
  private judgeFist(a: Act): void {
    const arm = this.arms[a.def.limb as 0 | 1];
    const from = arm.was;
    const to = arm.at;
    // Which way the fist is travelling: a palm blocks by facing INTO that,
    // judged on the travel, not on where the fist has got to (a fast fist
    // can pass a palm between two frames).
    _dir.copy(to).sub(from);
    if (_dir.lengthSq() < 1e-10) return;
    _dir.normalize().negate();
    // Blocks: an orbiting ball, or an open palm facing the fist.
    for (const side of SIDES) {
      const ball = orbitingBall(side);
      if (ball && segmentDistance(from, to, ball) <= arm.radius + FIREBALL.radius) return this.blocked(a, ball);
      const h = hands[side];
      if (!h.shape.tracked || h.shape.closed) continue;
      if (segmentDistance(from, to, h.palm) > arm.radius + FIGHT.palmReach) continue;
      if (h.palmNormal.dot(_dir) >= FIGHT.palmFacing) return this.blocked(a, h.palm);
    }
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

  private blocked(a: Act, at: Vector3): void {
    titanStats.blocks++;
    fx.sparks?.burst(at, 40, NEON.hot, 2.4);
    fx.impacts?.hit(at, NEON.hot, 0.5, 2);
    sfx('block', at);
    sfx('titanGrunt', this.rig!.head.getWorldPosition(_w));
    this.stagger = FIGHT.stagger;
    this.flinch = 1;
    a.lunge = 0;
    a.blocked = true;
    this.toRecover(a);
  }

  /* ── the eye beam ──────────────────────────────────────────────────── */

  private beamWindup(a: Act): void {
    const rig = this.rig!;
    const u = a.t / a.def.windup;
    rig.eyeFx.visible = true;
    rig.eyeFx.scale.setScalar(0.3 + 1.2 * u);
    // It tracks you, then LOCKS: the rest of the windup is your time to move.
    if (!a.locked) a.to.copy(_head);
    if (!a.locked && u >= FIGHT.beamLock) {
      a.locked = true;
      fx.sparks?.burst(rig.eyeFx.getWorldPosition(_v), 12, this.look.accent, 0.8);
      sfx('beamLock', _v);
    }
    rig.eyeFx.getWorldPosition(_v);
    this.stretch(this.aimLine, _v, a.to, a.locked ? 0.006 : 0.003);
    (this.aimLine.material as MeshBasicMaterial).opacity = a.locked ? 0.7 : 0.25;
    (this.aimLine.material as MeshBasicMaterial).color.setHex(a.locked ? NEON.hot : this.look.accent);
  }

  private beamFire(a: Act): void {
    const eye = this.rig!.eyeFx.getWorldPosition(_v);
    this.aimLine.visible = false;
    // The beam runs from the eye through the locked point and on.
    const far = _far.copy(a.to).sub(eye).normalize().multiplyScalar(6).add(eye);
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
      }
      if (Math.random() < 0.6) fx.sparks?.burst(end, 4, NEON.hot, 1.6);
    } else if (!a.landed && segmentDistance(eye, far, _head) <= FIGHT.headRadius + FIGHT.beamRadius) {
      a.landed = true;
      this.hurt(a.def.damage, true);
      sfx('hitTaken');
    }
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

  /* ── the volley ────────────────────────────────────────────────────── */

  /** Throw each bolt as its beat comes round, from alternating tips. */
  private volleyStep(a: Act): void {
    const n = a.def.combo ?? 1;
    const beat = a.def.beat ?? 0.4;
    while (a.fired < n && a.t >= a.fired * beat) {
      this.throwBolt(a.fired, a.def.damage);
      a.fired++;
    }
  }

  private throwBolt(i: number, damage: number): void {
    const b = this.bolts.find((x) => !x.live);
    const e = this.emitters[i % this.emitters.length];
    if (!b || !e) return;
    e.on.localToWorld(b.pos.copy(e.local));
    // At where your head is as it leaves: keep moving.
    b.vel.copy(_head).sub(b.pos).setLength(FIGHT.boltSpeed);
    b.age = 0;
    b.damage = damage;
    b.live = true;
    b.obj.position.copy(b.pos);
    b.obj.visible = true;
    titanStats.bolts++;
    fx.sparks?.burst(b.pos, 14, this.look.accent, 1.2);
    fx.impacts?.hit(b.pos, this.look.accent, 0.3, 0);
    sfx('boltFire', b.pos);
  }

  /** Bolts in flight, swept frame to frame: palms and balls, then your head. */
  private stepBolts(delta: number): void {
    for (const b of this.bolts) {
      if (!b.live) continue;
      b.age += delta;
      _prev.copy(b.pos);
      b.pos.addScaledVector(b.vel, delta);
      b.obj.position.copy(b.pos);
      if (Math.random() < 0.8) fx.sparks?.burst(b.pos, 1, this.look.accent, 0.25);
      // A palm blocks by facing into the bolt's travel.
      _into.copy(b.vel).normalize().negate();
      let stop: Vector3 | null = null;
      for (const side of SIDES) {
        const ball = orbitingBall(side);
        if (ball && segmentDistance(_prev, b.pos, ball) <= FIGHT.boltRadius + FIREBALL.radius) {
          stop = ball;
          break;
        }
        const h = hands[side];
        if (!h.shape.tracked || h.shape.closed) continue;
        if (segmentDistance(_prev, b.pos, h.palm) > FIGHT.boltRadius + FIGHT.palmReach) continue;
        if (h.palmNormal.dot(_into) >= FIGHT.palmFacing) {
          stop = h.palm;
          break;
        }
      }
      if (stop) {
        titanStats.blocks++;
        fx.sparks?.burst(stop, 24, NEON.hot, 2);
        fx.impacts?.hit(stop, this.look.accent, 0.35, 1);
        sfx('block', stop);
        this.killBolt(b);
      } else if (segmentDistance(_prev, b.pos, _head) <= FIGHT.boltRadius + FIGHT.headRadius) {
        this.hurt(b.damage, true);
        fx.sparks?.burst(b.pos, 24, NEON.danger, 1.8);
        sfx('hitTaken');
        this.killBolt(b);
      } else if (b.age > FIGHT.boltLife || b.pos.y < 0) {
        fx.sparks?.burst(b.pos, 10, this.look.accent, 0.8);
        this.killBolt(b);
      }
    }
  }

  private killBolt(b: Bolt): void {
    b.live = false;
    b.obj.visible = false;
  }

  private clearBolts(): void {
    for (const b of this.bolts) this.killBolt(b);
  }

  /* ── being hit, and hitting ────────────────────────────────────────── */

  /** Is this weak point open right now? */
  private isOpen(part: 'head' | 'core'): boolean {
    return this.open === 'both' || this.open === part;
  }

  private weakHit(at: Vector3): 'stop' {
    titanStats.hitsLanded++;
    this.hp = Math.max(0, this.hp - 1 / this.fight.hits);
    titanStats.hp = this.hp;
    // Taking turns: shut this one and open the other, after one hit
    // ('alternate') or two ('double').
    if (this.open !== 'both' && ++this.openHits >= (this.fight.weak === 'double' ? 2 : 1)) {
      this.open = this.open === 'head' ? 'core' : 'head';
      this.openHits = 0;
    }
    this.weakFlash = 1;
    this.flinch = Math.max(this.flinch, 0.7);
    this.hitStop = FIGHT.hitStop;
    this.edgeFlash = 1;
    this.chipHold = 0.45;
    fx.sparks?.burst(at, 50, this.look.accent, 2.6);
    fx.sparks?.burst(at, 20, NEON.hot, 1.6);
    fx.impacts?.hit(at, this.look.accent, 0.8, 2);
    sfx('weakHit', at);
    if (this.hp <= 0) {
      // The killing blow: the whole machine goes up in light.
      fx.sparks?.burst(this.weakCore.pos, 120, this.look.accent, 3.2);
      fx.impacts?.hit(this.weakCore.pos, this.look.accent, 1.8, 2);
      this.hitStop = FIGHT.hitStop * 3;
      this.enter('falling');
    }
    return 'stop';
  }

  private armourHit(at: Vector3): 'stop' {
    titanStats.armourHits++;
    fx.sparks?.burst(at, 16, this.look.line, 1.2);
    fx.impacts?.hit(at, this.look.line, 0.22, 1);
    sfx('armour', at);
    return 'stop';
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

    // Face you, except mid-blow: a committed blow doesn't follow your dodge.
    if (!striking) {
      const want = Math.atan2(-(_head.x - root.position.x), -(_head.z - root.position.z));
      let dy = want - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += dy * Math.min(1, delta * 3);
    }

    // The lunge in behind a blow, and back.
    let lungeWant = 0;
    if (a && isFist(a.def)) {
      if (a.stage === 'windup') lungeWant = a.lunge * 0.25 * ease(a.t / a.def.windup);
      else if (a.stage === 'strike') lungeWant = a.lunge;
    }
    if (a && a.stage === 'windup' && isFist(a.def) && a.lunge === 0) {
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
      arm.was.copy(arm.at);
      const target = this.fistTarget(i, _v);
      _local.copy(target);
      root.worldToLocal(_local);
      const pole = _w.set(arm.side * 0.8, -0.5, 0.35);
      const ext = reach(arm, _local, pole, FIGHT.telescope * this.look.scale);
      arm.rod.visible = ext > 0.004;
      arm.rod.scale.set(1, Math.max(ext, 1e-4), 1);
      arm.rod.position.y = -arm.fore;
      root.updateMatrixWorld(true);
      arm.wrist.localToWorld(arm.at.set(0, -arm.fistLen, 0));
      if (this.phase !== 'fight' || !a || a.def.limb !== i) arm.was.copy(arm.at);
      // The windup's light on the striking fist.
      const u = a && a.def.limb === i && a.stage === 'windup' ? a.t / a.def.windup : 0;
      arm.glow.visible = u > 0;
      arm.glow.scale.setScalar(0.1 + 0.5 * u * this.look.scale);
    }

    // A volley: the wings flare wide and forward, the tips swell with light.
    const volley = a && a.def.limb === 'wings' && a.stage !== 'recover' ? a : null;
    this.flare += ((volley ? 1 : 0) - this.flare) * Math.min(1, delta * 5);
    rig.wings.forEach((w, i) => {
      const r = this.wingRest[i];
      w.group.rotation.y = r.gy * (1 - 0.9 * this.flare);
      w.group.rotation.z = r.gz + w.side * 0.3 * this.flare;
      w.wrist.rotation.z = r.wz - w.side * 0.35 * this.flare;
    });
    const charge = volley ? (volley.stage === 'windup' ? volley.t / volley.def.windup : 1) : 0;
    for (const e of this.emitters) {
      e.glow.visible = charge > 0;
      e.glow.scale.setScalar((0.08 + 0.3 * charge) / this.k);
    }

    // A weak-point hit flares every lit edge on it, white, for a moment.
    this.edgeFlash = Math.max(0, this.edgeFlash - delta * 5);
    for (const e of this.edgeMats) {
      if (e.mat.transparent) e.mat.opacity = e.opacity * (1 + 3 * this.edgeFlash);
      else e.mat.color.copy(e.base).lerp(WHITE, 0.85 * this.edgeFlash);
    }

    // An open weak point blinks; a shut one sits dim and steady.
    this.weakFlash = Math.max(0, this.weakFlash - delta * 4);
    const blink = 0.5 + 0.5 * Math.sin(this.t * 6);
    rig.visorMat.emissiveIntensity = this.isOpen('head') ? 1.2 + 1.2 * blink + 3 * this.weakFlash : 0.35;
    rig.coreMat.emissiveIntensity = this.isOpen('core') ? 0.5 + 1.4 * blink + 3 * this.weakFlash : 0.15;
    rig.head.rotation.x = -0.4 * this.flinch;

    // Keep the hittables on it.
    rig.head.getWorldPosition(this.weakHead.pos);
    rig.core.getWorldPosition(this.weakCore.pos);
    root.localToWorld(this.armour.pos.copy(this.chestLocal));
  }

  /** Where arm `i`'s fist should be this frame, world space. */
  private fistTarget(i: number, out: Vector3): Vector3 {
    const arm = this.arms[i];
    const root = this.rig!.root;
    // The guard: fists up in front of its chest, breathing.
    const s = this.look.scale;
    const guard = _w.set(arm.side * 0.02, -0.5 + Math.sin(this.t * 1.4 + i) * 0.02, -0.38).multiplyScalar(s).add(arm.pivot.position);
    root.localToWorld(guard);
    const a = this.act;
    if (!a || a.def.limb !== i || this.phase !== 'fight') return out.copy(guard);
    const d = a.def;
    if (a.stage === 'windup') {
      this.windupPoint(a, out);
      return out.lerpVectors(guard, out, ease(a.t / (d.windup * 0.7)));
    }
    if (a.stage === 'strike') {
      return strikePoint(d.path, a.from, a.to, a.outward, a.t / d.strike, out);
    }
    return out.lerpVectors(a.home, guard, ease(a.t / d.recover));
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

    // Weak points and armour, sized off the rig.
    const headBox = new Box3().setFromObject(rig.head);
    this.weakHead.radius = (Math.max(...headBox.getSize(new Vector3()).toArray()) / 2) * 0.75;
    const coreBox = new Box3().setFromObject(rig.core);
    // Generous: a ball orbiting your palm leaves up to ~17 cm off it, and
    // there's no trigger to steady a hand-thrown shot.
    this.weakCore.radius = Math.max(0.14, (Math.max(...coreBox.getSize(new Vector3()).toArray()) / 2) * 2);
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
    // The core opens first when they take turns: it's the easier shot.
    this.open = this.fight.weak === 'both' ? 'both' : 'core';
    this.openHits = 0;

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

    // Where a volley leaves from: the wingtips, or failing wings the shoulders.
    this.wingRest = rig.wings.map((w) => ({ gy: w.group.rotation.y, gz: w.group.rotation.z, wz: w.wrist.rotation.z }));
    this.flare = 0;
    const tips: [Object3D, Vector3][] = rig.wings.length
      ? rig.wings.map((w) => [w.wrist, new Vector3(w.side * 0.44 * s, 0, 0)])
      : rig.shoulders.map((m) => [m, new Vector3()]);
    this.emitters = tips.map(([on, local]) => {
      const glow = glowSprite(this.look.accent, 1, 0.95);
      glow.visible = false;
      glow.position.copy(local);
      on.add(glow);
      return { on, local, glow };
    });
    for (const b of this.bolts) (b.obj.children[0] as Sprite).material.color.setHex(this.look.accent);
    this.chip = 1;
    this.chipHold = 0;
    this.hitStop = 0;

    this.hp = 1;
    game.playerHp = 1;
    game.result = null;
    this.act = null;
    this.last = null;
    this.gap = 1.2;
    this.stagger = 0;
    this.lunge = 0;
    this.fightTime = 0;
    Object.assign(titanStats, { name: this.look.name, hp: 1, act: null, hitsTaken: 0, blocks: 0, hitsLanded: 0, armourHits: 0, bolts: 0 });
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
    }
    if (p === 'falling') {
      this.act = null;
      this.clearBolts();
      this.beamCore.visible = this.beamHalo.visible = this.aimLine.visible = false;
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
    game.result = { titan: this.look.name, won: this.hp <= 0, time: this.fightTime };
    this.despawn();
    setMode('home');
  }

  private despawn(): void {
    hum('titan', 'engine', this.armour.pos, 0);
    this.clearBolts();
    this.emitters = [];
    this.rig?.dispose();
    this.rig = null;
    this.arms = [];
    this.act = null;
    this.phase = 'off';
    this.scanRing.visible = false;
    this.hud.visible = false;
    this.beamCore.visible = this.beamHalo.visible = this.aimLine.visible = false;
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
    titanStats.open = this.open;
  }
}

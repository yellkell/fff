/**
 * 1V1 (DESIGN §4): FIRE FIGHT 2's classic duel, against its bot. A rival
 * stands on its own pad across the gap with two fireballs of its own, and
 * you box it: first to two rounds.
 *
 *   INTRO       its pad lights and it fades into your room.
 *   COUNTDOWN   3, 2, 1 over its head; it's already moving. Then the bell.
 *   FIGHT       a round: 60 s, or until one of you is down. At the bell's
 *               end the healthier one takes it.
 *   ROUND OVER  a breather, then the next countdown.
 *   MATCH OVER  the verdict; it fades out and the console comes back on
 *               its results face (REMATCH · NEXT BOT · HOME).
 *
 * THE BOT is FF2's (systems/BotSystem.ts there), its numbers off the ladder
 * (config BOT_LADDER, duel/brain.ts): it strafes and bobs, winds a ball up
 * in orbit round its glove (the tell), throws it at you, and recalls it.
 * The sharper rungs lead your head, punish empty hands, feint, double-tap
 * and dodge before your ball has left your hand; a rookie throws at where
 * you were and often just watches your fire come.
 *
 * JUDGING, in 3D, swept frame to frame:
 *   - its ball against your guard (game/guard.ts: an open palm facing it,
 *     or one of your balls orbiting or flying home): knocked out of the air;
 *   - then against your body (duel/body.ts: head, chest, pelvis, solved
 *     from your head): a hit, 25% on the head, 20% on the body;
 *   - your ball against its raised guard (a glove with its ball home):
 *     slapped down; against its ball in the air: both burn out (a clash);
 *     against its body: a hit, the same damage.
 * Standing off your pad drains you, as against a titan.
 *
 * The rival is a puppet (duel/rival.ts): the bot drives it now; a remote
 * player drives the same puppet when the relay comes.
 */

import { createSystem } from '@iwsdk/core';
import { AdditiveBlending, BackSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Quaternion, SphereGeometry, Vector3 } from 'three';
import { buildPlatform, setPlatformDanger } from '../arena/platform.js';
import { hum, sfx } from '../audio/sfx.js';
import { BOT, BOT_LADDER, DUEL, FIGHT, FIREBALL, NEON } from '../config.js';
import { aimThrow } from '../duel/aim.js';
import { type BodySphere, makeBody, solveBody } from '../duel/body.js';
import { type BotBrain, brainFor } from '../duel/brain.js';
import { Rival } from '../duel/rival.js';
import { fx, glowSprite } from '../fx/neon.js';
import { guardStop } from '../game/guard.js';
import { addHittable } from '../game/hittables.js';
import { game, setMode } from '../game/state.js';
import { segmentDistance } from '../titans/strike.js';
import { FONT, frame, glass, glowText, textPlane, type TextPlane } from '../ui/kit.js';
import { ballsInFlight, ballStates } from './FireballSystem.js';

type Phase = 'off' | 'intro' | 'countdown' | 'fight' | 'roundOver' | 'matchOver' | 'outro';
type BallState = 'home' | 'orbit' | 'flying' | 'spent' | 'returning';

interface RivalBall {
  hand: 0 | 1;
  state: BallState;
  pos: Vector3;
  prev: Vector3;
  vel: Vector3;
  age: number;
  angle: number;
  /** Counts down to the bot calling it home (<0: not called for). */
  recall: number;
  trail: number;
  group: Group;
  core: Group;
}

/** Where the bot is on its pad and what it's doing (FF2's Bot). */
interface Bot {
  x: number;
  y: number;
  z: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  moveTimer: number;
  throwTimer: number;
  windupHand: 0 | 1;
  /** <0 idle, else seconds to the release. */
  windup: number;
  /** This wind-up throws dead straight at your head (the probes' throw). */
  exact: 'head' | 'low' | null;
  guardPhase: number;
  decideTimer: number;
  blockTimer: number;
  blockHand: 0 | 1;
  blockAt: Vector3;
  noticeTimer: number;
  burst: number;
  spinSeen: boolean;
  punishArmed: boolean;
  followUp: number;
}

/** What the duel's doing, for the probes and the HUDs. */
export const duelStats = {
  phase: 'off' as Phase,
  round: 0,
  /** Rounds won: yours, then the rival's. */
  rounds: [0, 0] as [number, number],
  rivalHp: 1,
  rung: 0,
  label: '',
  message: '',
  timer: 0,
  throws: 0,
  hitsTaken: 0,
  hitsLanded: 0,
  headHits: 0,
  blocks: 0,
  rivalBlocks: 0,
  clashes: 0,
  rivalHead: [0, 0, 0] as number[],
  rivalBalls: [] as BallState[],
};

/** Test hooks for the headless checks. */
export const duelDebug = {
  /** The bot never throws on its own, and the round clock stands still. */
  hold: false,
  /** The bot stands at the middle of its pad and never dodges or guards. */
  still: false,
  /** Wind up and throw one ball dead at your head (or your hips). */
  throwNow: null as 'head' | 'low' | null,
  /** Hold its right glove up as a guard, in front of its face. */
  guard: false,
  setRivalHp: null as number | null,
  setPlayerHp: null as number | null,
};

const _v = new Vector3();
const _w = new Vector3();
const _head = new Vector3();
const _dir = new Vector3();
const _aim = new Vector3();
const _fwd = new Vector3();
const _right = new Vector3();
const _look = new Quaternion();
const _pitchQ = new Quaternion();
const UP = new Vector3(0, 1, 0);
const RIGHT = new Vector3(1, 0, 0);

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const rand = (lo: number, hi: number): number => lo + Math.random() * (hi - lo);

/** Where the rival's head sits when it's just standing, and the HUD over it. */
const HUD_Y = 2.05;

export class DuelSystem extends createSystem({}) {
  private phase: Phase = 'off';
  private phaseT = 0;
  private t = 0;
  private rung = 0;
  private brain: BotBrain = brainFor(0);
  private rival!: Rival;
  private pad!: Group;
  private readonly balls: RivalBall[] = [];
  private bot!: Bot;
  private readonly pose = {
    head: new Vector3(0, BOT.headY, -DUEL.gap),
    headQuat: new Quaternion(),
    hands: [new Vector3(), new Vector3()] as [Vector3, Vector3],
    blocking: [false, false] as [boolean, boolean],
    winding: [false, false] as [boolean, boolean],
  };
  private rivalHp = 1;
  private rounds: [number, number] = [0, 0];
  private round = 0;
  private timer: number = DUEL.roundTime;
  private fightTime = 0;
  private message = '';
  private lastCount = 0;
  private beat = 0;
  private won = false;

  /** Your body, solved from your head each frame. */
  private readonly you: BodySphere[] = makeBody();

  // The bot's read of you: head velocity, its recent trail, the duck habit.
  private headPrev = new Vector3();
  private headVel = new Vector3();
  private headTrail: { t: number; pos: Vector3 }[] = [];
  private restY = BOT.headY;
  private duckFrac = 0;

  // Being hit: a red flash round your head.
  private flash!: Mesh;
  private flashMat!: MeshBasicMaterial;
  private flashT = 0;

  // Its HUD: a message over its head, its name, its health and the score.
  private hud!: Group;
  private hudFill!: Mesh;
  private hudChip!: Mesh;
  private hudName!: TextPlane;
  private hudBig!: TextPlane;
  private chip = 1;
  private chipHold = 0;
  private drawnName = '';
  private drawnBig = '';

  init(): void {
    this.rival = new Rival(NEON.ember, NEON.hot);
    this.rival.setFade(0);
    this.scene.add(this.rival.root);

    // Its pad: the same octagon, turned round to face you, in its colours.
    this.pad = buildPlatform({ rim: NEON.ember, stripe: NEON.violet, yours: false });
    this.pad.position.set(0, 0, -DUEL.gap);
    this.pad.rotation.y = Math.PI;
    this.pad.visible = false;
    this.scene.add(this.pad);

    // Its two fireballs: ember, round a white-hot heart.
    for (const hand of [0, 1] as const) {
      const group = new Group();
      group.add(glowSprite(NEON.ember, FIREBALL.radius * 7));
      const core = new Group();
      core.add(glowSprite(NEON.hot, FIREBALL.radius * 2.6));
      group.add(core);
      group.visible = false;
      this.scene.add(group);
      this.balls.push({ hand, state: 'home', pos: new Vector3(), prev: new Vector3(), vel: new Vector3(), age: 0, angle: hand * Math.PI, recall: -1, trail: 0, group, core });
    }
    this.bot = this.freshBot();

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

    this.buildHud();

    // What your fireballs can hit. Its guard and its balls in the air come
    // first, so a ball that clips a glove and a head is stopped by the glove.
    const self = this;
    const fighting = (): boolean => self.phase === 'fight';
    for (const hand of [0, 1] as const) {
      addHittable({
        pos: this.pose.hands[hand],
        radius: BOT.gloveRadius + DUEL.deflectBonus,
        live: () => fighting() && self.pose.blocking[hand] && self.ballHome(hand),
        assist: false,
        onReturn: false,
        hit: (ball) => self.guarded(ball.at),
      });
    }
    for (const b of this.balls) {
      addHittable({
        pos: b.pos,
        radius: FIREBALL.radius + DUEL.deflectBonus,
        live: () => fighting() && b.state === 'flying',
        assist: false,
        onReturn: false,
        hit: (ball) => self.clash(b, ball.at),
      });
    }
    for (const part of this.rival.body) {
      addHittable({
        pos: part.pos,
        radius: part.radius,
        live: fighting,
        // Throws within ~25° of its head are bent onto it.
        assist: part.part === 'head',
        onReturn: false,
        hit: (ball) => self.landed(part, ball.at),
      });
    }
  }

  update(delta: number): void {
    this.t += delta;
    const want = game.mode === 'duel';
    if (want && this.phase === 'off') this.spawn();
    if (!want && this.phase !== 'off') this.despawn();
    if (this.phase === 'off') {
      duelStats.phase = 'off';
      return;
    }
    this.phaseT += delta;
    this.camera.getWorldPosition(_head);
    this.camera.getWorldDirection(_dir);
    solveBody(this.you, _head, Math.atan2(-_dir.x, -_dir.z));
    this.readPlayer(delta);
    this.applyDebug();

    switch (this.phase) {
      case 'intro': {
        const u = Math.min(1, this.phaseT / DUEL.introTime);
        this.rival.setFade(u);
        if (Math.random() < 0.6) fx.sparks?.burst(_v.set(rand(-0.3, 0.3), rand(0.2, 1.6), -DUEL.gap + rand(-0.2, 0.2)), 2, NEON.ember, 0.8);
        if (u >= 1) this.startCountdown();
        break;
      }
      case 'countdown': {
        const left = DUEL.countdown - this.phaseT;
        const n = Math.ceil(left);
        if (n !== this.lastCount && n > 0) {
          this.lastCount = n;
          this.message = String(n);
          sfx('count');
        }
        if (left <= 0) this.startRound();
        break;
      }
      case 'fight':
        this.fightStep(delta);
        break;
      case 'roundOver':
        if (this.phaseT >= DUEL.roundOverTime) {
          if (Math.max(...this.rounds) >= DUEL.winTarget) this.enter('matchOver');
          else this.startCountdown();
        }
        break;
      case 'matchOver':
        if (this.phaseT >= DUEL.matchOverTime) this.enter('outro');
        break;
      case 'outro': {
        const u = Math.min(1, this.phaseT / 1);
        this.rival.setFade(1 - u);
        if (u >= 1) return this.finish();
        break;
      }
    }

    this.moveBot(delta);
    this.poseBot(delta);
    this.rival.pose(this.pose, delta);
    this.stepBalls(delta);
    this.sound(delta);
    this.updateHud(delta);
    this.updateFlash(delta);
    this.syncStats();
  }

  /** The rung's name (a mercy-softened brain still answers to it). */
  private get label(): string {
    return BOT_LADDER[this.rung].label;
  }

  /* ── the match ─────────────────────────────────────────────────────── */

  private spawn(): void {
    this.rung = clamp(game.rung, 0, BOT_LADDER.length - 1);
    game.rung = this.rung;
    this.brain = brainFor(this.rung);
    this.rounds = [0, 0];
    this.round = 0;
    this.fightTime = 0;
    this.rivalHp = 1;
    this.chip = 1;
    game.playerHp = 1;
    game.result = null;
    this.bot = this.freshBot();
    this.homeBalls();
    this.headTrail.length = 0;
    this.camera.getWorldPosition(this.headPrev);
    this.restY = this.headPrev.y;
    this.headVel.set(0, 0, 0);
    this.duckFrac = 0;
    this.pad.visible = true;
    this.rival.setFade(0);
    Object.assign(duelStats, { throws: 0, hitsTaken: 0, hitsLanded: 0, headHits: 0, blocks: 0, rivalBlocks: 0, clashes: 0 });
    this.message = '';
    this.enter('intro');
    sfx('titanPrint', this.pose.head);
  }

  private startCountdown(): void {
    this.round++;
    // Each round's brain: its rung, softened by mercy if you're behind.
    this.brain = brainFor(this.rung, this.rounds[0], this.rounds[1]);
    this.rivalHp = 1;
    this.chip = 1;
    game.playerHp = 1;
    this.timer = DUEL.roundTime;
    this.lastCount = 0;
    this.bot.windup = -1;
    this.bot.followUp = -1;
    this.bot.blockTimer = 0;
    this.bot.throwTimer = this.brain.throwInterval * (0.7 + Math.random() * 0.8);
    this.homeBalls();
    this.message = `ROUND ${this.round}`;
    this.enter('countdown');
  }

  private startRound(): void {
    this.message = 'FIGHT';
    sfx('bell');
    this.enter('fight');
  }

  private fightStep(delta: number): void {
    if (this.message === 'FIGHT' && this.phaseT > 1) this.message = '';
    this.fightTime += delta;
    if (!duelDebug.hold) this.timer = Math.max(0, this.timer - delta);
    // Standing off the pad costs you, as it does against a titan.
    if (game.headOutside) this.hurt(FIGHT.outsideDrain * delta, false);
    if (this.phase !== 'fight') return;
    this.fightBot(delta);
    if (this.timer <= 0) {
      const d = game.playerHp - this.rivalHp;
      this.endRound(Math.abs(d) < 1e-6 ? null : d > 0 ? 0 : 1);
    }
  }

  /** A round's over: `winner` 0 is you, 1 the rival, null a draw. */
  private endRound(winner: 0 | 1 | null): void {
    if (this.phase !== 'fight') return;
    if (winner !== null) this.rounds[winner]++;
    // Down, not out-pointed at the bell: the knockout.
    if (winner !== null && (winner === 0 ? this.rivalHp : game.playerHp) <= 0) sfx('ko');
    this.won = this.rounds[0] >= DUEL.winTarget;
    const label = this.label;
    this.message = winner === null ? 'DRAW' : winner === 0 ? 'ROUND TO YOU' : `ROUND TO ${label}`;
    for (const b of this.balls) if (b.state === 'flying') this.spend(b, false);
    this.bot.windup = -1;
    this.bot.followUp = -1;
    this.enter('roundOver');
  }

  private enter(p: Phase): void {
    this.phase = p;
    this.phaseT = 0;
    if (p === 'matchOver') {
      this.message = this.won ? 'YOU WIN' : `${this.label} WINS`;
      sfx(this.won ? 'win' : 'lose');
    }
  }

  private finish(): void {
    game.result = { mode: 'duel', titan: this.label, won: this.won, time: this.fightTime, rounds: [...this.rounds] };
    this.despawn();
    setMode('home');
  }

  private despawn(): void {
    this.phase = 'off';
    this.rival.setFade(0);
    this.pad.visible = false;
    this.hud.visible = false;
    for (const b of this.balls) {
      b.state = 'home';
      b.group.visible = false;
      hum(`rival-${b.hand}`, 'fire', b.pos, 0);
    }
    game.playerHp = 1;
    setPlatformDanger(0);
    this.flashT = 0;
    this.flash.visible = false;
    duelStats.phase = 'off';
  }

  /* ── hits ──────────────────────────────────────────────────────────── */

  private hurt(amount: number, flash: boolean): void {
    if (this.phase !== 'fight') return;
    game.playerHp = Math.max(0, game.playerHp - amount);
    if (flash) {
      duelStats.hitsTaken++;
      this.flashT = 1;
    }
    if (game.playerHp <= 0) this.endRound(1);
  }

  /** Your ball on its body. */
  private landed(part: BodySphere, at: Vector3): 'stop' {
    const head = part.part === 'head';
    this.rivalHp = Math.max(0, this.rivalHp - (head ? DUEL.headDamage : DUEL.bodyDamage));
    duelStats.hitsLanded++;
    duelStats.rivalHp = this.rivalHp;
    if (head) duelStats.headHits++;
    this.chipHold = 0.45;
    this.rival.flash();
    fx.sparks?.burst(at, head ? 50 : 32, NEON.ember, head ? 2.6 : 2);
    fx.sparks?.burst(at, 16, NEON.hot, 1.4);
    fx.impacts?.hit(at, NEON.ember, head ? 0.7 : 0.5, head ? 2 : 1);
    sfx('rivalHit', at, head ? 1 : 0);
    // A clean hit rocks it back: the bot loses its wind-up.
    this.bot.windup = -1;
    this.bot.followUp = -1;
    this.pose.winding[0] = this.pose.winding[1] = false;
    for (const b of this.balls) if (b.state === 'orbit') b.state = 'home';
    if (this.rivalHp <= 0) {
      fx.sparks?.burst(this.rival.body[1].pos, 120, NEON.ember, 3.2);
      fx.impacts?.hit(this.rival.body[1].pos, NEON.ember, 1.6, 2);
      this.endRound(0);
    }
    return 'stop';
  }

  /** Your ball on its raised guard: slapped down. */
  private guarded(at: Vector3): 'stop' {
    duelStats.rivalBlocks++;
    fx.sparks?.burst(at, 30, NEON.hot, 2);
    fx.impacts?.hit(at, NEON.hot, 0.4, 1);
    sfx('block', at);
    return 'stop';
  }

  /** Your ball meets its ball in the air: both burn out. */
  private clash(b: RivalBall, at: Vector3): 'stop' {
    duelStats.clashes++;
    fx.sparks?.burst(at, 30, NEON.ember, 2.2);
    fx.sparks?.burst(at, 30, NEON.cyan, 2.2);
    fx.impacts?.hit(at, NEON.hot, 0.5, 2);
    sfx('block', at);
    this.spend(b, false);
    return 'stop';
  }

  /* ── its fireballs ─────────────────────────────────────────────────── */

  private stepBalls(delta: number): void {
    for (const b of this.balls) {
      const glove = this.pose.hands[b.hand];
      if (b.recall >= 0) {
        b.recall -= delta;
        if (b.recall < 0 && (b.state === 'flying' || b.state === 'spent')) {
          b.state = 'returning';
          sfx('recall', b.pos);
        }
      }
      switch (b.state) {
        case 'home':
          // Just over its knuckles, toward you.
          _v.copy(_head).sub(glove).setLength(0.06).add(glove);
          _v.y += 0.04;
          b.pos.lerp(_v, Math.min(1, delta * FIREBALL.hoverLerp));
          break;
        case 'orbit': {
          b.angle += lerp(FIREBALL.orbitSpeedMin, FIREBALL.orbitSpeedMax, 0.6) * delta;
          // A circle round the glove, in the plane facing you.
          const axis = _dir.copy(glove).sub(_head).normalize();
          const u = _v.crossVectors(UP, axis).normalize();
          const w = _w.crossVectors(axis, u);
          b.pos
            .copy(glove)
            .addScaledVector(u, Math.cos(b.angle) * FIREBALL.orbitRadius)
            .addScaledVector(w, Math.sin(b.angle) * FIREBALL.orbitRadius);
          break;
        }
        case 'flying': {
          b.age += delta;
          b.prev.copy(b.pos);
          b.vel.y -= FIREBALL.gravity * delta;
          b.pos.addScaledVector(b.vel, delta);
          if (this.phase === 'fight') this.judgeBall(b);
          if (b.state === 'flying' && (b.age > FIREBALL.lifetime || b.pos.y < 0)) this.spend(b, true);
          break;
        }
        case 'spent':
          break;
        case 'returning': {
          _v.copy(glove).sub(b.pos);
          const dist = _v.length();
          b.pos.addScaledVector(_v.normalize(), Math.min(dist, Math.min(FIREBALL.returnSpeed, 3 + dist * 7) * delta));
          if (b.pos.distanceTo(glove) <= FIREBALL.catchRadius) {
            b.state = 'home';
            b.recall = -1;
            fx.sparks?.burst(b.pos, 10, NEON.ember, 0.8);
            sfx('catch', b.pos);
          }
          break;
        }
      }
      const away = b.state === 'flying' || b.state === 'returning';
      b.group.visible = this.rival.root.visible && b.state !== 'spent';
      b.group.position.copy(b.pos);
      const lit = b.state !== 'home';
      b.group.scale.setScalar(lit ? 1 : 0.55);
      b.core.visible = lit;
      hum(`rival-${b.hand}`, 'fire', b.pos, b.group.visible && away ? 0.22 : 0, b.state === 'returning' ? 1.25 : 1);
      if (away) {
        b.trail -= delta;
        if (b.trail <= 0) {
          b.trail = 0.025;
          fx.sparks?.burst(b.pos, 2, NEON.ember, 0.3);
        }
      }
    }
  }

  /** Its ball's travel this frame, against your guard and then your body. */
  private judgeBall(b: RivalBall): void {
    _dir.copy(b.pos).sub(b.prev);
    if (_dir.lengthSq() < 1e-12) return;
    _dir.normalize().negate();
    const stop = guardStop(b.prev, b.pos, FIREBALL.radius, _dir, { returning: true, reach: DUEL.deflectBonus });
    if (stop) {
      duelStats.blocks++;
      fx.sparks?.burst(stop, 36, NEON.hot, 2.2);
      fx.impacts?.hit(stop, NEON.hot, 0.45, 2);
      sfx('block', stop);
      this.spend(b, false);
      return;
    }
    for (const part of this.you) {
      if (segmentDistance(b.prev, b.pos, part.pos) > part.radius + FIREBALL.radius) continue;
      const head = part.part === 'head';
      fx.sparks?.burst(b.pos, 30, NEON.danger, 2);
      // The shockwave a little way back along its flight, not in your eyes.
      fx.impacts?.hit(_v.copy(b.prev).sub(b.pos).setLength(0.35).add(b.pos), NEON.danger, 0.4, 1);
      sfx('hitTaken');
      this.spend(b, false);
      this.hurt(head ? DUEL.headDamage : DUEL.bodyDamage, true);
      return;
    }
  }

  /** A ball's done (it hit, was stopped, or burnt out): it waits for the call home. */
  private spend(b: RivalBall, fizzle: boolean): void {
    if (fizzle) {
      fx.sparks?.burst(b.pos, 18, NEON.ember, 1);
      sfx('fizzle', b.pos);
    }
    b.state = 'spent';
    if (b.recall < 0) b.recall = this.brain.recallDelay * 0.5;
  }

  private homeBalls(): void {
    for (const b of this.balls) {
      b.state = 'home';
      b.recall = -1;
      b.pos.copy(this.pose.hands[b.hand]);
    }
    this.pose.winding[0] = this.pose.winding[1] = false;
  }

  private ballHome(hand: 0 | 1): boolean {
    const s = this.balls[hand].state;
    return s === 'home' || s === 'orbit';
  }

  /* ── the bot (FF2's BotSystem, for one) ────────────────────────────── */

  private freshBot(): Bot {
    return {
      x: 0,
      y: BOT.headY,
      z: 0,
      targetX: 0,
      targetY: BOT.headY,
      targetZ: 0,
      moveTimer: 1,
      throwTimer: 2,
      windupHand: 0,
      windup: -1,
      exact: null,
      guardPhase: 0,
      decideTimer: 0,
      blockTimer: 0,
      blockHand: 0,
      blockAt: new Vector3(),
      noticeTimer: -1,
      burst: 0,
      spinSeen: false,
      punishArmed: false,
      followUp: -1,
    };
  }

  private applyDebug(): void {
    if (duelDebug.setRivalHp !== null) {
      this.rivalHp = duelDebug.setRivalHp;
      duelDebug.setRivalHp = null;
      if (this.rivalHp <= 0) this.endRound(0);
    }
    if (duelDebug.setPlayerHp !== null) {
      game.playerHp = duelDebug.setPlayerHp;
      duelDebug.setPlayerHp = null;
      if (game.playerHp <= 0) this.endRound(1);
    }
    if (duelDebug.throwNow && this.phase === 'fight' && this.bot.windup < 0) {
      const hand = this.ballHome(1) ? 1 : 0;
      if (this.ballHome(hand)) {
        this.windUp(hand, this.brain.windup);
        this.bot.exact = duelDebug.throwNow;
      }
      duelDebug.throwNow = null;
    }
  }

  /** Track your head: velocity (for LEAD), its trail (for AIM LAG), how
   *  much you duck (for the low/high read). */
  private readPlayer(delta: number): void {
    if (delta > 0) {
      _v.copy(_head).sub(this.headPrev).divideScalar(delta);
      // Never trust a teleport-sized jump (a recentre).
      if (_v.lengthSq() < 36) this.headVel.lerp(_v, Math.min(1, delta * 12));
      else this.headVel.set(0, 0, 0);
    }
    this.headPrev.copy(_head);
    this.headTrail.push({ t: this.t, pos: _head.clone() });
    while (this.headTrail.length > 2 && this.t - this.headTrail[0].t > BOT.headLagWindow) this.headTrail.shift();
    const up = _head.y > this.restY;
    this.restY += (_head.y - this.restY) * Math.min(1, delta * (up ? 2.5 : 0.2));
    const ducked = _head.y < this.restY - 0.18 ? 1 : 0;
    this.duckFrac += (ducked - this.duckFrac) * Math.min(1, delta * 0.35);
  }

  /** Where your head was `lag` seconds ago. */
  private laggedHead(lag: number, out: Vector3): Vector3 {
    if (lag <= 0.005 || this.headTrail.length === 0) return out.copy(_head);
    const want = this.t - lag;
    let pick = this.headTrail[0];
    for (const s of this.headTrail) {
      if (s.t <= want) pick = s;
      else break;
    }
    return out.copy(pick.pos);
  }

  private pickDrift(): void {
    const bot = this.bot;
    const b = this.brain;
    const roam = BOT.padHalfWidth * b.roam;
    const r = Math.random();
    if (r < 0.2) bot.targetX = bot.x + rand(-0.25, 0.25);
    else if (r < 0.45) bot.targetX = rand(-0.3, 0.3) * b.roam;
    else bot.targetX = rand(-1, 1) * roam;
    bot.targetX = clamp(bot.targetX, -roam, roam);
    const d = Math.random();
    if (d < 0.25) bot.targetY = BOT.headYMin + Math.random() * 0.2;
    else if (d < 0.4) bot.targetY = BOT.headYMax - Math.random() * 0.1;
    else bot.targetY = BOT.headY + rand(-0.12, 0.12);
    bot.targetY = clamp(bot.targetY, BOT.headYMin, BOT.headYMax);
    bot.targetZ = clamp(rand(-0.5, 0.5) * b.roam, -0.5, 0.5);
    bot.moveTimer = (Math.random() < 0.3 ? rand(0.35, 0.85) : rand(0.9, 2)) / b.restless;
  }

  /** Strafe and bob, with the reactive dodges and the guard. */
  private moveBot(delta: number): void {
    const bot = this.bot;
    const b = this.brain;
    bot.guardPhase += delta;
    if (duelDebug.still || this.phase === 'intro' || this.phase === 'outro') {
      bot.targetX = 0;
      bot.targetY = BOT.headY;
      bot.targetZ = 0;
      bot.blockTimer = 0;
    } else {
      bot.moveTimer -= delta;
      if (bot.moveTimer <= 0) this.pickDrift();

      // PRE-DODGE: you're spinning a ball up; the sharper rungs step now.
      const spinning = ballStates().includes('orbit');
      if (spinning && !bot.spinSeen) {
        bot.spinSeen = true;
        if (Math.random() < b.preDodge) {
          const roam = BOT.padHalfWidth * b.roam;
          const side = -Math.sign(bot.x) || (Math.random() < 0.5 ? -1 : 1);
          bot.targetX = clamp(side * roam * rand(0.4, 1), -roam, roam);
          bot.moveTimer = rand(0.5, 0.9);
          bot.burst = BOT.dodgeBurst * 0.6;
        }
      } else if (!spinning) bot.spinSeen = false;

      // One decision per approach of your ball: after its hesitation, and
      // only if it decides to act at all, a dodge or a raised guard.
      bot.decideTimer = Math.max(0, bot.decideTimer - delta);
      bot.blockTimer = Math.max(0, bot.blockTimer - delta);
      const threat = this.phase === 'fight' ? this.incoming() : null;
      if (threat) {
        bot.noticeTimer = bot.noticeTimer < 0 ? 0 : bot.noticeTimer + delta;
        if (bot.blockTimer > 0) bot.blockAt.copy(threat);
        else if (bot.decideTimer <= 0 && bot.noticeTimer >= b.reactDelay) {
          bot.decideTimer = BOT.decideEvery;
          if (Math.random() < b.defendChance) this.defend(threat);
        }
      } else bot.noticeTimer = -1;
    }
    bot.burst = Math.max(0, bot.burst - delta);

    const gain = bot.burst > 0 ? BOT.dodgeBurstGain : 1;
    const step = (from: number, to: number, speed: number): number => {
      const d = to - from;
      return Math.abs(d) <= speed * delta ? to : from + Math.sign(d) * speed * delta;
    };
    bot.x = step(bot.x, bot.targetX, b.moveSpeed * gain);
    bot.y = step(bot.y, bot.targetY, b.duckSpeed * gain);
    bot.z = step(bot.z, bot.targetZ, b.moveSpeed * 0.8 * gain);
  }

  /** The nearest of your balls in the air, inside its notice range and
   *  closing on it, or null. A ball sailing wide isn't a threat. */
  private incoming(): Vector3 | null {
    const head = this.pose.head;
    let best: Vector3 | null = null;
    let bestD = this.brain.reactDistance;
    for (const ball of ballsInFlight()) {
      const d = ball.pos.distanceTo(head);
      if (d >= bestD) continue;
      if (ball.vel.dot(_v.copy(head).sub(ball.pos)) <= 0) continue;
      bestD = d;
      best = ball.pos;
    }
    return best;
  }

  /** One answer to the ball at `at`: a guard, or a dodge. */
  private defend(at: Vector3): void {
    const bot = this.bot;
    const b = this.brain;
    const ballX = at.x;
    const near: 0 | 1 = ballX < bot.x ? 0 : 1;
    const guardHand: 0 | 1 = bot.windup >= 0 && bot.windupHand === near ? ((1 - near) as 0 | 1) : near;
    // A guard needs its ball home in that glove (your parry's law).
    if (Math.random() < b.blockChance && this.ballHome(guardHand)) {
      bot.blockTimer = BOT.blockHold;
      bot.blockAt.copy(at);
      bot.blockHand = guardHand;
      return;
    }
    // A sidestep away from the ball's line, and a duck under a high one or
    // a stand over a low one. A rookie sometimes steps INTO it; a cornered
    // bot goes vertical.
    const wrong = Math.random() < b.wrongWayChance;
    let away = Math.sign(bot.x - ballX) || (Math.random() < 0.5 ? -1 : 1);
    if (wrong) away = -away;
    const room = BOT.padHalfWidth - away * bot.x;
    bot.targetX = room < 0.25 && !wrong ? bot.x : clamp(bot.x + away * 0.6, -BOT.padHalfWidth, BOT.padHalfWidth);
    const high = at.y > bot.y - 0.15;
    bot.targetY = (wrong ? !high : high) ? BOT.headYMin : BOT.headYMax;
    // Back, away from you (its pad's back is −z).
    bot.targetZ = -0.5;
    bot.burst = BOT.dodgeBurst;
    bot.moveTimer = Math.max(bot.moveTimer, 0.45);
  }

  /** The puppet: its head facing you, its gloves on guard, winding or blocking. */
  private poseBot(delta: number): void {
    const bot = this.bot;
    const head = this.pose.head.set(bot.x, bot.y, -DUEL.gap + bot.z);
    _v.copy(_head).sub(head);
    const yaw = Math.atan2(-_v.x, -_v.z);
    const pitch = clamp(Math.atan2(_v.y, Math.hypot(_v.x, _v.z) || 1e-4), -BOT.headPitchMax, BOT.headPitchMax);
    _look.setFromAxisAngle(UP, yaw).multiply(_pitchQ.setFromAxisAngle(RIGHT, pitch));
    this.pose.headQuat.slerp(_look, Math.min(1, delta * BOT.headTurnSpeed));
    _fwd.set(_v.x, 0, _v.z);
    if (_fwd.lengthSq() < 1e-6) _fwd.set(0, 0, 1);
    _fwd.normalize();
    // Its right, as it faces you.
    _right.crossVectors(_fwd, UP).normalize();

    const guard = duelDebug.guard && this.ballHome(1);
    if (guard) {
      bot.blockHand = 1;
      bot.blockTimer = Math.max(bot.blockTimer, 0.1);
      bot.blockAt.copy(_head);
    }
    for (const hand of [0, 1] as const) {
      const side = hand === 0 ? -1 : 1;
      const bob = Math.sin(bot.guardPhase * 2.4 + hand * 1.7) * 0.02;
      const winding = bot.windup >= 0 && bot.windupHand === hand;
      const blocking = bot.blockTimer > 0 && bot.blockHand === hand && !winding;
      const at = this.pose.hands[hand];
      if (blocking) {
        // The guard: this glove on the line between its head and your ball.
        _w.copy(bot.blockAt).sub(head);
        if (_w.lengthSq() < 1e-6) _w.copy(_fwd);
        _w.setLength(guard ? 0.3 : BOT.blockReach).add(head);
        at.lerp(_w, Math.min(1, delta * 16));
      } else {
        _w.set(head.x, head.y - (winding ? 0.05 : 0.18) + bob, head.z)
          .addScaledVector(_right, side * (winding ? 0.34 : 0.22))
          .addScaledVector(_fwd, winding ? -0.16 : 0.18);
        at.lerp(_w, Math.min(1, delta * 9));
      }
      this.pose.blocking[hand] = blocking;
      this.pose.winding[hand] = winding;
    }
  }

  private windUp(hand: 0 | 1, seconds: number): void {
    this.bot.windupHand = hand;
    this.bot.windup = seconds;
    this.bot.exact = null;
    this.balls[hand].state = 'orbit';
    fx.sparks?.burst(this.balls[hand].pos, 14, NEON.ember, 1);
    sfx('ignite', this.balls[hand].pos);
  }

  /** The cadence: wind up, throw, alternate gloves; and the tricks. */
  private fightBot(delta: number): void {
    const bot = this.bot;
    const b = this.brain;
    if (bot.windup >= 0) {
      bot.windup -= delta;
      if (bot.windup < 0) this.release();
      return;
    }
    if (duelDebug.hold) return;

    // DOUBLE TAP: the other glove follows within a beat.
    if (bot.followUp >= 0) {
      bot.followUp -= delta;
      if (bot.followUp < 0) {
        const other = (1 - bot.windupHand) as 0 | 1;
        if (this.ballHome(other)) this.windUp(other, b.windup * 0.5);
      }
      return;
    }

    // PUNISH: both your hands are empty: you can't parry what you don't hold.
    const yours = ballStates();
    const empty = yours.every((s) => s === 'flying' || s === 'returning');
    if (empty && !bot.punishArmed) {
      bot.punishArmed = true;
      if (Math.random() < b.punish) bot.throwTimer = Math.min(bot.throwTimer, BOT.punishFuse);
    } else if (!empty) bot.punishArmed = false;

    bot.throwTimer -= delta;
    if (bot.throwTimer > 0) return;
    let hand = (1 - bot.windupHand) as 0 | 1;
    if (!this.ballHome(hand)) hand = bot.windupHand;
    if (!this.ballHome(hand)) {
      bot.throwTimer = 0.25;
      return;
    }
    bot.throwTimer = b.throwInterval * rand(0.8, 1.3);
    // FEINT: the orbit held past its beat, so an early dodge is spent.
    this.windUp(hand, b.windup + (Math.random() < b.feint ? BOT.feintHold : 0));
  }

  private release(): void {
    const bot = this.bot;
    const b = this.brain;
    const hand = bot.windupHand;
    const ball = this.balls[hand];
    this.pose.winding[hand] = false;
    if (ball.state !== 'orbit') return;
    const from = ball.pos.copy(this.pose.hands[hand]);

    if (bot.exact) {
      // The probes' throw: dead on your head (or your hips), no slop.
      _aim.copy(_head);
      if (bot.exact === 'low') _aim.y -= BOT.lowAimDrop;
    } else {
      // AIM LAG: a rookie throws at your ghost. LEAD: a veteran throws at
      // where your head will be when the ball gets there.
      this.laggedHead(b.aimLag, _aim);
      if (b.lead > 0) {
        const flight = _aim.distanceTo(from) / b.throwSpeed;
        _v.copy(this.headVel).multiplyScalar(b.lead * flight);
        if (_v.lengthSq() > 0.8 * 0.8) _v.setLength(0.8);
        _aim.add(_v);
      }
      // Most throws hunt your head; the rest dip for your hips, more often
      // the more you duck (a brain that reads habits).
      const habit = clamp(this.duckFrac * 1.2, 0.1, 0.8);
      if (Math.random() < lerp(b.lowAimChance, habit, b.readsHabits)) _aim.y -= BOT.lowAimDrop;
      _aim.x += rand(-1, 1) * b.aimError;
      _aim.y += rand(-1, 1) * b.aimError;
    }
    bot.exact = null;
    aimThrow(from, _aim, b.throwSpeed, FIREBALL.gravity, ball.vel);
    ball.state = 'flying';
    ball.age = 0;
    ball.prev.copy(from);
    ball.recall = b.recallDelay;
    duelStats.throws++;
    fx.sparks?.burst(from, 20, NEON.ember, 1.6);
    sfx('throw', from);

    const other = (1 - hand) as 0 | 1;
    if (!duelDebug.hold && Math.random() < b.doubleTap && this.ballHome(other)) bot.followUp = BOT.doubleTapGap;
  }

  /* ── what you see and hear ─────────────────────────────────────────── */

  private buildHud(): void {
    this.hud = new Group();
    this.hud.add(glass(0.9, 0.12, 0.014));
    this.hud.add(frame(0.9, 0.12, 0.004, NEON.ember, 0.014));
    this.hudName = textPlane(0.84, 0.055);
    this.hudName.mesh.position.y = 0.024;
    this.hud.add(this.hudName.mesh);
    const bar = (color: number, opacity: number, order: number, z: number): Mesh => {
      const m = new Mesh(
        new PlaneGeometry(1, 1).translate(0.5, 0, 0),
        new MeshBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
      );
      m.position.set(-0.41, -0.03, z);
      m.scale.set(0.82, 0.022, 1);
      m.renderOrder = order;
      this.hud.add(m);
      return m;
    };
    this.hudChip = bar(NEON.hot, 0.55, 11, 0.001);
    this.hudFill = bar(NEON.ember, 1, 12, 0.002);
    // The big line over it: ROUND 1, 3, 2, 1, FIGHT, the verdict.
    this.hudBig = textPlane(1.2, 0.16);
    this.hudBig.mesh.position.y = 0.17;
    this.hud.add(this.hudBig.mesh);
    this.hud.visible = false;
    this.scene.add(this.hud);
  }

  private updateHud(delta: number): void {
    this.hud.visible = this.phase !== 'off' && this.phase !== 'outro';
    if (!this.hud.visible) return;
    this.hud.position.set(0, HUD_Y, -DUEL.gap);
    this.hud.lookAt(_head);
    if (this.chipHold > 0) this.chipHold -= delta;
    else this.chip = Math.max(this.rivalHp, this.chip - delta * 0.5);
    this.hudFill.scale.x = Math.max(0.0001, 0.82 * this.rivalHp);
    this.hudChip.scale.x = Math.max(0.0001, 0.82 * this.chip);

    const secs = Math.ceil(this.timer);
    const name = `${this.label}|${this.rounds[0]} – ${this.rounds[1]}|${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    if (name !== this.drawnName) {
      this.drawnName = name;
      const [label, score, clock] = name.split('|');
      this.hudName.draw((g, w, h) => {
        g.textBaseline = 'middle';
        g.font = `900 ${h * 0.55}px ${FONT}`;
        g.textAlign = 'left';
        glowText(g, label, w * 0.02, h / 2, NEON.ember);
        g.textAlign = 'center';
        glowText(g, `YOU ${score}`, w / 2, h / 2, NEON.cyan);
        g.textAlign = 'right';
        glowText(g, clock, w * 0.98, h / 2, NEON.hot);
      });
    }
    if (this.message !== this.drawnBig) {
      this.drawnBig = this.message;
      const text = this.message;
      const color = /YOU/.test(text) ? NEON.lime : /WINS|ROUND TO/.test(text) ? NEON.danger : NEON.hot;
      this.hudBig.draw((g, w, h) => {
        if (!text) return;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.font = `900 ${h * (text.length > 4 ? 0.5 : 0.8)}px ${FONT}`;
        glowText(g, text, w / 2, h / 2, color);
      });
    }
  }

  private updateFlash(delta: number): void {
    this.flashT = Math.max(0, this.flashT - delta * 3);
    this.flash.visible = this.flashT > 0;
    this.flashMat.opacity = 0.5 * this.flashT;
    setPlatformDanger(1 - game.playerHp, this.t);
  }

  /** Your heartbeat when you're nearly down. */
  private sound(delta: number): void {
    this.beat -= delta;
    if (this.phase === 'fight' && game.playerHp < 0.3 && this.beat <= 0) {
      sfx('heartbeat');
      this.beat = 0.55 + game.playerHp * 1.5;
    }
  }

  private syncStats(): void {
    duelStats.phase = this.phase;
    duelStats.round = this.round;
    duelStats.rounds = [...this.rounds];
    duelStats.rivalHp = this.rivalHp;
    duelStats.rung = this.rung;
    duelStats.label = this.label;
    duelStats.message = this.message;
    duelStats.timer = this.timer;
    duelStats.rivalHead = this.pose.head.toArray();
    duelStats.rivalBalls = this.balls.map((b) => b.state);
  }
}

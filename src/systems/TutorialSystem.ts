/**
 * THE TUTORIAL (DESIGN §4.2): FIRE FIGHT 2's, with its guide. EMBER, a warm
 * little ball of light with a voice, catches your eye, and walks you
 * through Flux's hands on the rust bucket: light a ball, throw it, call it
 * home, block a real throw (twice), step out of the way of one (each way),
 * then knock him down. TUTORIAL on the console starts it.
 *
 * It rides DuelSystem's bout (game mode 'tutorial') the way FF2's rode its
 * bot bout, and holds it through `duelTutor`: the lessons are calm (no
 * throws but the drills', no clock, no damage), the drills' balls are thrown
 * on request and report how they ended, and the knockdown waits on her last
 * line. Everything else it reads from outside: your balls' states, the
 * duel's hit counts.
 *
 * Her lines are FF2's recordings, only the ones true here (tutorial/script.ts).
 * What your hands do goes on the cue line under her caption, never in her
 * mouth. She talks from THE PODIUM, 1.5 m dead ahead at eye height (FF2's
 * playtest: anything said from beside your head goes unread), marks the
 * rust bucket from over his head, circles your fist to show where a ball
 * orbits, and darts to the side she calls in the footwork drill, where the
 * half of your pad to step into lights up green.
 */

import { createSystem } from '@iwsdk/core';
import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, Quaternion, Shape, ShapeGeometry, type Sprite, Vector3 } from 'three';
import { sfx } from '../audio/sfx.js';
import { preloadTutorVoice, sayTutorLine, setTutorVoicePosition, stopTutorVoice, tutorLineReady, tutorVoiceActive } from '../audio/tutorVoice.js';
import { CONSOLE, NEON, PLATFORM } from '../config.js';
import { fx, glowSprite } from '../fx/neon.js';
import { game } from '../game/state.js';
import { hands } from '../input/hands.js';
import { CUES, LINES, type LineKey, PRAISE_POOL } from '../tutorial/script.js';
import { markTutorialDone } from '../tutorial/progress.js';
import { tubes } from '../titans/neon.js';
import { css, FONT, frame, glass, glowText, textPlane, type TextPlane } from '../ui/kit.js';
import { addButton, PokeButton } from '../ui/poke.js';
import { duelStats, duelTutor } from './DuelSystem.js';
import { ballStates } from './FireballSystem.js';

type Beat = 'attention' | 'ignite' | 'throw' | 'recall' | 'block' | 'move' | 'grad' | 'fight' | 'wrapup';
type Cue = keyof typeof CUES;

/** What your balls and the duel did since last frame. */
interface Events {
  orbit: boolean;
  flying: boolean;
  returning: boolean;
  /** A ball let go too slowly: it settled back instead of flying. */
  soft: boolean;
  /** A ball called home (not sent home by a hit). */
  recalled: boolean;
  caught: boolean;
  /** Your ball landed on the rust bucket; his on you. */
  landed: boolean;
  taken: boolean;
}

/** EMBER's colours: FF2's ember gold round a white-hot heart. */
const GOLD = 0xffc04d;
const HEART = 0xfff4dc;
const HALO = 0.26;
const CORE = 0.105;

/** The footwork drill: one clean step each way, a missed side again. */
const REPS: ('L' | 'R')[] = ['L', 'R'];
/** How far your head has to go the called way, metres. */
const DODGE = 0.35;
/** The rust bucket under this health: "It's done for." */
const WOBBLE = 0.2;

/** A wait this long replays the lesson's line; as long again, "No rush". */
const NUDGE = 14;
/** The line a stalled lesson replays (none: straight to "No rush"). */
const NUDGE_LINE: Partial<Record<Beat, LineKey>> = { attention: 'begin', throw: 'throwIt', recall: 'recall', block: 'block' };

/** Her caption plate: width, and its rows (metres). */
const CAP_W = 0.62;
const CAP_MAX = 0.24;
const CAP_PAD = 0.018;
const CAP_TAG = 0.03;
const CAP_ROW = 0.027;
const CAP_CUE = 0.03;

/** What the tutorial's doing, for the probes. */
export const tutorStats = { beat: 'off' as Beat | 'off', line: '', caption: '', cue: '', blocks: 0, reps: 0, said: [] as string[] };

/** Test hooks: `quick` speaks every line in a blink, silently. */
export const tutorDebug = { quick: false };

const UP = new Vector3(0, 1, 0);
const _head = new Vector3();
const _q = new Quaternion();
const _fwd = new Vector3();
const _flat = new Vector3();
const _right = new Vector3();
const _v = new Vector3();
const _w = new Vector3();

export class TutorialSystem extends createSystem({}) {
  private active = false;
  /** Released to go home: don't start again before the bout's gone. */
  private finished = false;
  private t = 0;
  private beat: Beat = 'attention';
  private beatT = 0;
  private sub = 0;
  private subT = 0;

  // EMBER.
  private readonly orb = new Group();
  private halo!: Sprite;
  private core!: Sprite;
  private readonly at = new Vector3();
  private readonly target = new Vector3();
  private readonly attnFwd = new Vector3(0, 0, -1);
  private gaze = 0;
  private trail = 0;
  private dim = 1;

  // Her words, and the cue under them.
  private readonly caption = new Group();
  private capGlass: Mesh | null = null;
  private capFrame: Mesh | null = null;
  private capH = 0;
  private capText!: TextPlane;
  private said = '';
  private saidUntil = 0;
  private speakUntil = 0;
  private cue: Cue | null = null;
  private cueOverride: { cue: Cue; until: number } | null = null;
  private drawn = '';
  private queue: LineKey[] = [];
  private lastPraise: LineKey | null = null;

  // THE BEGIN PANEL, at the console's spot.
  private readonly panel = new Group();
  private begin!: PokeButton;
  private panelRise = 0;
  private pressed = false;

  // The footwork cue on your pad.
  private zone!: Group;
  private zoneFill!: MeshBasicMaterial;
  private readonly chevrons: Mesh[] = [];
  private zoneT = 0;

  // Your balls, and the duel's counts, frame to frame.
  private prevBalls: string[] = ['hover', 'hover'];
  private prevLanded = 0;
  private prevTaken = 0;

  // The drills' ball: asked for, in the air, ended.
  private lob: 'none' | 'asked' | 'flying' = 'none';
  private lobThrown = 0;
  private lobT = 0;
  private lobFlight = 1;
  private lobSpeed = 2.4;
  private blocks = 0;
  private rep = 0;
  private sideFails = 0;
  private readonly repAxis = new Vector3();
  private readonly repStart = new Vector3();

  // Per-lesson progress.
  private thrown = false;
  private recalled = false;
  private recalledThenCaught = false;
  private saidHit = false;
  private saidTaken = false;
  private saidLow = false;
  private wait = 0;
  private nudge = 0;

  init(): void {
    this.halo = glowSprite(GOLD, HALO, 0.9);
    this.core = glowSprite(HEART, CORE, 1);
    this.halo.renderOrder = 30;
    this.core.renderOrder = 31;
    this.orb.add(this.halo, this.core);
    this.orb.visible = false;
    this.scene.add(this.orb);

    this.capText = textPlane(CAP_W, CAP_MAX);
    this.capText.mesh.position.y = -CAP_MAX / 2;
    this.capText.mesh.renderOrder = 29;
    this.caption.add(this.capText.mesh);
    this.caption.visible = false;
    this.scene.add(this.caption);

    this.buildPanel();
    this.buildZone();
  }

  update(delta: number): void {
    this.t += delta;
    if (game.mode !== 'tutorial') {
      if (this.active) this.end();
      this.finished = false;
      tutorStats.beat = 'off';
      return;
    }
    if (this.finished) return;
    if (!this.active) this.start();
    this.beatT += delta;
    this.subT += delta;

    this.camera.getWorldPosition(_head);
    this.camera.getWorldQuaternion(_q);
    _fwd.set(0, 0, -1).applyQuaternion(_q);
    _flat.set(_fwd.x, 0, _fwd.z);
    if (_flat.lengthSq() < 1e-4) _flat.set(0, 0, -1);
    _flat.normalize();
    _right.crossVectors(_flat, UP).normalize();

    // What happened since last frame, read from outside.
    const balls = ballStates();
    const ev = {
      orbit: balls.includes('orbit'),
      flying: balls.includes('flying'),
      returning: balls.includes('returning'),
      soft: false,
      recalled: false,
      caught: false,
      landed: duelStats.hitsLanded > this.prevLanded,
      taken: duelStats.hitsTaken > this.prevTaken,
    };
    balls.forEach((s, i) => {
      const was = this.prevBalls[i];
      if (was === 'orbit' && s === 'hover') ev.soft = true;
      // Home without hitting anything: you called it.
      if (was === 'flying' && s === 'returning' && !ev.landed) ev.recalled = true;
      if (was === 'returning' && (s === 'orbit' || s === 'hover')) ev.caught = true;
    });
    this.prevBalls = balls;
    this.prevLanded = duelStats.hitsLanded;
    this.prevTaken = duelStats.hitsTaken;

    this.run(delta, ev);
    if (!this.active) return;
    this.upkeep(delta);
    this.sync();
  }

  /* ── the lessons ───────────────────────────────────────────────────── */

  private run(delta: number, ev: Events): void {
    switch (this.beat) {
      case 'attention':
        return this.attention();

      case 'ignite':
        // She circles your fist, tracing the orbit a ball will take.
        this.onFist(this.beatT < 4 ? 0.2 : 0);
        if (ev.orbit) {
          this.say('igniteDone');
          this.goto('throw');
        }
        return;

      case 'throw':
        // She stays on the fist she's praising, and flies over to mark the
        // rust bucket as "See this rust bucket?" starts.
        if (this.queue.length) this.onFist(0);
        else this.overHim();
        if (ev.soft && !this.thrown) this.flashCue('throwSoft', 3.5);
        if (ev.flying) this.thrown = true;
        if (ev.recalled) this.recalled = true;
        if (ev.caught && this.recalled) this.recalledThenCaught = true;
        if (this.thrown && ev.landed) {
          this.say('throwDone');
          this.afterThrow();
        } else if (this.thrown && !ev.flying && !ev.returning) {
          // It came home without landing: the throw still counts.
          this.sayPraise();
          this.afterThrow();
        }
        return;

      case 'recall':
        this.podium();
        if (ev.recalled) this.recalled = true;
        if (ev.caught && this.recalled) {
          this.say('recallDone');
          this.goto('block');
        }
        return;

      case 'block': {
        const res = this.watchLob(delta);
        if (res === 'blocked') {
          this.blocks++;
          if (this.blocks === 1) {
            this.say('blockDone');
            this.lobSpeed = 3.2;
          } else {
            this.say('blockTwo');
            this.goto('move');
            return;
          }
        } else if (res) {
          this.say('blockRetry');
          // Easier after a miss; the second rep comes back to pace.
          this.lobSpeed = this.blocks === 0 ? 2.1 : 2.4;
        }
        // He won't throw until your shield's up.
        if (this.lob === 'none' && this.speechIdle() && ev.orbit) {
          this.askLob(0, _v.copy(_head).setY(_head.y - 0.35), this.lobSpeed);
        }
        if (this.lob === 'flying') {
          // Out of the firing line while it's coming.
          this.target.copy(_head).addScaledVector(_flat, 0.9).addScaledVector(_right, -0.7);
          this.target.y = _head.y - 0.05;
        } else this.podium();
        return;
      }

      case 'move': {
        const res = this.watchLob(delta);
        this.stepZone(delta);
        if (res) {
          this.hideZone();
          _v.copy(_head).sub(this.repStart).setY(0);
          if (res === 'missed' && _v.dot(this.repAxis) >= DODGE) {
            this.sideFails = 0;
            this.rep++;
            this.sayPraise();
            if (this.rep >= REPS.length) {
              this.queueLine('grad');
              this.goto('grad');
              return;
            }
          } else {
            // Hit, stood still, went the wrong way, or blocked when the
            // lesson was to move: that side again.
            this.sideFails++;
            this.say('moveRetry');
          }
        }
        if (this.lob !== 'none') {
          // Out on the called side, ahead of you, in sight.
          this.target.copy(_head).addScaledVector(this.repAxis, 1.0).addScaledVector(_flat, 1.1);
          this.target.y = _head.y;
        } else if (this.speechIdle()) {
          const side = REPS[this.rep];
          this.repAxis.copy(_right);
          if (side === 'L') this.repAxis.negate();
          this.repStart.copy(_head);
          // At your head, from the glove across from the call.
          this.askLob(side === 'L' ? 1 : 0, _head, this.sideFails >= 2 ? 2.3 : 2.6);
          this.say(side === 'L' ? 'moveLeft' : 'moveRight');
          this.showZone(this.repAxis.x >= 0 ? 1 : -1);
        } else {
          this.podium();
          // The explain line: a gentle sway across the two lanes.
          if (this.rep === 0 && this.sideFails === 0) this.target.addScaledVector(_right, Math.sin(this.beatT * 0.7) * 0.35);
        }
        return;
      }

      case 'grad':
        this.perch();
        if (this.speechIdle() && this.beatT > 2) this.goto('fight');
        return;

      case 'fight':
        this.perch();
        if (this.beatT > 3 && this.cue === 'fight') this.cue = null;
        if (ev.landed && !this.saidHit) {
          this.saidHit = true;
          this.say('fightHit');
        }
        if (ev.taken && !this.saidTaken) {
          this.saidTaken = true;
          this.say('fightTaken');
        }
        if (duelStats.rivalHp <= WOBBLE && duelStats.rivalHp > 0 && !this.saidLow) {
          this.saidLow = true;
          this.say('fightLow');
        }
        if (duelStats.phase === 'roundOver') {
          const won = duelStats.rivalHp <= 0;
          this.say(won ? 'win' : 'lose');
          if (won) markTutorialDone();
          this.goto('wrapup');
        }
        return;

      case 'wrapup':
        // Back down from her perch to see you off.
        this.podium();
        if (this.speechIdle() || this.beatT > 12) {
          duelTutor.release = true;
          this.finished = true;
          this.end(false); // her line, if it's still going, finishes on its own
        }
        return;
    }
  }

  /** She doesn't start in front of you: she catches your eye. */
  private attention(): void {
    switch (this.sub) {
      case 0:
        // A dim spark off to the side until her first line can speak.
        if (tutorLineReady(LINES.overHere.id) || this.subT > 3 || tutorDebug.quick) {
          sfx('emberChime', this.at);
          this.say('overHere');
          this.toSub(1);
        }
        break;
      case 1: {
        // Drifting across from ~10 o'clock on a path fixed in the room, so
        // turning toward her catches her.
        const k = Math.min(1, this.subT / 6);
        _v.copy(this.attnFwd).applyAxisAngle(UP, 0.95 - k * 1.5);
        this.target.copy(_head).addScaledVector(_v, 2.3);
        this.target.y = _head.y - 0.05;
        if (this.gaze > 0.4) this.toSub(2);
        else if (this.subT > 4.5) {
          // Not seen yet: straight into your eyeline.
          sfx('emberChime', this.at);
          this.toSub(2);
        }
        break;
      }
      case 2:
        this.podium();
        if (this.at.distanceTo(this.target) < 0.35) {
          fx.sparks?.burst(this.at, 16, GOLD, 1.2);
          this.say('hello');
          this.toSub(3);
        }
        break;
      case 3:
        this.podium();
        if (this.speechIdle()) {
          // "Press the button here": she drops to the panel as it rises.
          this.say('begin');
          this.showPanel();
          this.toSub(4);
        }
        break;
      case 4:
        // Just over the panel, a little beyond it.
        this.target.copy(this.panel.position).addScaledVector(_flat, 0.3);
        this.target.y += 0.13;
        if (this.pressed) {
          sfx('emberChime', this.at);
          fx.sparks?.burst(this.at, 20, GOLD, 1.4);
          this.hidePanel();
          this.goto('ignite');
        }
        break;
    }
  }

  private afterThrow(): void {
    // Already called one home and caught it? The recall lesson's done.
    if (this.recalledThenCaught) {
      this.queueLine('recallDone');
      this.goto('block');
    } else this.goto('recall');
  }

  private goto(beat: Beat): void {
    this.beat = beat;
    this.beatT = 0;
    this.toSub(0);
    this.wait = 0;
    this.nudge = 0;
    this.lob = 'none';
    duelTutor.lob = null;
    this.hideZone();
    this.cueOverride = null;
    this.cue = null;
    switch (beat) {
      case 'ignite':
        this.cue = 'ignite';
        break;
      case 'throw':
        this.thrown = false;
        this.recalled = false;
        this.recalledThenCaught = false;
        // "See this rust bucket?": he comes to as she names him.
        duelTutor.awake = true;
        this.cue = 'throwIt';
        this.queueLine('throwIt');
        break;
      case 'recall':
        this.recalled = false;
        this.cue = 'recall';
        this.queueLine('recall');
        break;
      case 'block':
        this.blocks = 0;
        this.lobSpeed = 2.4;
        this.cue = 'block';
        this.queueLine('block');
        break;
      case 'move':
        this.rep = 0;
        this.sideFails = 0;
        this.cue = 'move';
        this.queueLine('move');
        break;
      case 'fight':
        this.saidHit = this.saidTaken = this.saidLow = false;
        duelTutor.lesson = false;
        duelTutor.bell = true;
        this.cue = 'fight';
        break;
    }
  }

  private toSub(n: number): void {
    this.sub = n;
    this.subT = 0;
  }

  /* ── where she goes ────────────────────────────────────────────────── */

  /** THE PODIUM: dead ahead, 1.5 m, eye level. Every explainer is said here. */
  private podium(): void {
    this.target.copy(_head).addScaledVector(_flat, 1.5);
    this.target.y = _head.y;
  }

  /** Round your fist (or just over it). */
  private onFist(circle: number): void {
    const h = hands.right.shape.tracked || !hands.left.shape.tracked ? hands.right : hands.left;
    this.target.copy(h.palm);
    if (circle > 0) {
      this.target.addScaledVector(_right, Math.cos(this.beatT * 3.2) * circle);
      this.target.y += Math.sin(this.beatT * 3.2) * circle;
    } else this.target.y += 0.28;
  }

  /** Over the rust bucket's head: a living target marker. */
  private overHim(): void {
    this.target.fromArray(duelStats.rivalHead);
    this.target.y += 0.45;
  }

  /** Up and to the side, out of the fight, still watching. */
  private perch(): void {
    this.target.set(1.0, Math.max(2.1, _head.y + 0.6), -1.7);
  }

  /* ── the drills' ball ──────────────────────────────────────────────── */

  private askLob(hand: 0 | 1, at: Vector3, speed: number): void {
    duelTutor.lob = { hand, at: at.clone(), speed };
    duelTutor.outcome = null;
    this.lob = 'asked';
    this.lobThrown = duelTutor.thrown;
    this.lobT = 0;
    this.lobSpeed = speed;
    this.lobFlight = 0.6 + Math.max(0.3, at.distanceTo(_w.fromArray(duelStats.rivalHead)) / speed);
  }

  /** The drill ball, to its end. */
  private watchLob(delta: number): 'blocked' | 'hit' | 'missed' | null {
    if (this.lob === 'none') return null;
    this.lobT += delta;
    if (this.lob === 'asked') {
      if (duelTutor.thrown > this.lobThrown) {
        this.lob = 'flying';
        if (this.beat === 'block') this.say('blockIncoming');
      }
      return null;
    }
    const out = duelTutor.outcome;
    if (!out) return null;
    duelTutor.outcome = null;
    this.lob = 'none';
    return out;
  }

  /* ── the footwork cue: the half of your pad to step into ───────────── */

  private buildZone(): void {
    this.zone = new Group();
    // The right half of your pad (mirrored for the left), cut to its own
    // chamfers and drawn a little inside its rim.
    const P = PLATFORM;
    const half: [number, number][] = [
      [0.1, -P.frontDepth],
      [P.edgeHalf, -P.frontDepth],
      [P.halfWidth, -P.frontChamfer],
      [P.halfWidth, P.backChamfer],
      [P.edgeHalf, P.backDepth],
      [0.1, P.backDepth],
    ];
    const cx = 0.48;
    const cz = (P.backDepth - P.frontDepth) / 2;
    const pts = half.map(([x, z]) => [cx + (x - cx) * 0.84, cz + (z - cz) * 0.84] as const);
    const shape = new Shape();
    pts.forEach(([x, z], i) => (i ? shape.lineTo(x, -z) : shape.moveTo(x, -z)));
    this.zoneFill = new MeshBasicMaterial({ color: NEON.lime, transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
    const fill = new Mesh(new ShapeGeometry(shape), this.zoneFill);
    fill.rotation.x = -Math.PI / 2;
    fill.position.y = 0.012;
    const rim: number[] = [];
    pts.forEach(([x, z], i) => {
      const [x1, z1] = pts[(i + 1) % pts.length];
      rim.push(x, 0.014, z, x1, 0.014, z1);
    });
    this.zone.add(fill, new Mesh(tubes(rim, 0.006), new MeshBasicMaterial({ color: NEON.lime, transparent: true, blending: AdditiveBlending, depthWrite: false })));
    // Three chevrons marching out into it.
    for (let i = 0; i < 3; i++) {
      const segs = [0, 0, -0.12, 0.09, 0, 0, 0.09, 0, 0, 0, 0, 0.12];
      const m = new Mesh(tubes(segs, 0.008), new MeshBasicMaterial({ color: NEON.lime, transparent: true, blending: AdditiveBlending, depthWrite: false }));
      this.zone.add(m);
      this.chevrons.push(m);
    }
    this.zone.visible = false;
    this.scene.add(this.zone);
  }

  private showZone(side: -1 | 1): void {
    this.zoneT = 0;
    this.zone.scale.x = side;
    this.zone.visible = true;
  }

  private hideZone(): void {
    this.zone.visible = false;
  }

  private stepZone(delta: number): void {
    if (!this.zone.visible) return;
    this.zoneT += delta;
    // It charges with the throw, like a titan's tell, inverted: stand HERE.
    const k = Math.min(1, this.zoneT / this.lobFlight);
    this.zoneFill.opacity = 0.1 + 0.25 * k;
    const z = (PLATFORM.backDepth - PLATFORM.frontDepth) / 2;
    this.chevrons.forEach((c, i) => {
      const u = (this.zoneT * 0.9 + i / 3) % 1;
      c.position.set(0.2 + u * 0.5, 0.016, z);
      (c.material as MeshBasicMaterial).opacity = Math.sin(Math.PI * u) * 0.9;
    });
  }

  /* ── the BEGIN panel ───────────────────────────────────────────────── */

  private buildPanel(): void {
    const W = 0.34;
    const H = 0.2;
    this.panel.add(glass(W, H, 0.016));
    this.panel.add(frame(W, H, 0.004, GOLD, 0.016));
    const head = textPlane(W * 0.9, 0.09);
    head.mesh.position.y = H / 2 - 0.05;
    head.draw((g, w, h) => {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${h * 0.36}px ${FONT}`;
      glowText(g, 'TUTORIAL', w / 2, h * 0.3, GOLD);
      g.font = `700 ${h * 0.17}px ${FONT}`;
      g.fillStyle = 'rgba(233,236,255,0.75)';
      g.fillText('LIGHT · THROW · RECALL · BLOCK · MOVE · ONE FIGHT', w / 2, h * 0.75);
    });
    this.panel.add(head.mesh);
    this.begin = addButton(
      new PokeButton({ id: 'begin', width: 0.16, height: 0.07, label: 'BEGIN', accent: GOLD, onPress: () => (this.pressed = true) }),
    );
    this.begin.root.position.set(0, -0.04, 0.004);
    this.begin.active = false;
    this.panel.add(this.begin.root);
    this.panel.visible = false;
    this.scene.add(this.panel);
  }

  private showPanel(): void {
    // At the console's spot: in reach, below your eyes, facing you.
    const y = Math.min(CONSOLE.maxY, Math.max(CONSOLE.minY, _head.y - CONSOLE.belowEyes));
    this.panel.position.copy(_head).addScaledVector(_flat, CONSOLE.distance).setY(y);
    this.panel.lookAt(_head);
    this.panel.visible = true;
    this.panelRise = 0;
    this.pressed = false;
    game.panelUp = true;
    sfx('consoleRise', this.panel.position);
  }

  private hidePanel(): void {
    this.panel.visible = false;
    this.begin.active = false;
    game.panelUp = false;
  }

  /* ── speech ────────────────────────────────────────────────────────── */

  /** Speak now, cutting off the line before; anything queued is dropped. */
  private say(key: LineKey): void {
    this.queue.length = 0;
    this.speak(key);
  }

  private speak(key: LineKey): void {
    const line = LINES[key];
    const secs = tutorDebug.quick ? 0.25 : sayTutorLine(line.id, line.text);
    this.said = line.text;
    this.saidUntil = this.t + secs + 0.8;
    this.speakUntil = this.t + secs + 0.35;
    this.wait = 0;
    tutorStats.line = key;
    tutorStats.said.push(key);
  }

  private queueLine(key: LineKey): void {
    this.queue.push(key);
  }

  private speechIdle(): boolean {
    return this.queue.length === 0 && this.t >= this.speakUntil;
  }

  private sayPraise(): void {
    const picks = PRAISE_POOL.filter((k) => k !== this.lastPraise);
    const key = picks[Math.floor(Math.random() * picks.length)];
    this.lastPraise = key;
    this.say(key);
  }

  private flashCue(cue: Cue, secs: number): void {
    this.cueOverride = { cue, until: this.t + secs };
  }

  /* ── every frame: her body, her caption, the panel, the nudges ─────── */

  private upkeep(delta: number): void {
    if (this.queue.length && this.t >= this.speakUntil) this.speak(this.queue.shift()!);

    // Her flight: a damped chase and a gentle bob.
    const was = _w.copy(this.at);
    this.at.lerp(this.target, 1 - Math.exp(-5.5 * delta));
    this.orb.position.copy(this.at);
    this.orb.position.y += Math.sin(this.t * 2.2) * 0.03;
    // She glows brighter while she talks, and dims to a spark on her perch.
    const talking = tutorVoiceActive() || this.t < this.speakUntil;
    const pulse = talking ? 1 + 0.14 * Math.abs(Math.sin(this.t * 7)) : 1;
    this.dim += ((this.beat === 'fight' && !talking ? 0.55 : 1) - this.dim) * Math.min(1, delta * 3);
    this.halo.scale.setScalar(HALO * pulse * this.dim);
    this.core.scale.setScalar(CORE * (talking ? 1 + 0.1 * Math.abs(Math.sin(this.t * 7 + 1)) : 1) * this.dim);
    this.trail += delta;
    if (this.trail > 0.12 && was.distanceTo(this.at) > 0.02) {
      this.trail = 0;
      fx.sparks?.burst(this.orb.position, 2, GOLD, 0.25);
    }
    setTutorVoicePosition(this.orb.position);

    if (this.beat === 'attention') {
      _v.copy(this.at).sub(_head).normalize();
      this.gaze = _fwd.dot(_v) > 0.92 ? this.gaze + delta : 0;
    }

    // The BEGIN panel rises like the console.
    if (this.panel.visible) {
      this.panelRise = Math.min(1, this.panelRise + delta / CONSOLE.riseTime);
      const e = this.panelRise * this.panelRise * (3 - 2 * this.panelRise);
      this.panel.scale.set(0.6 + 0.4 * e, Math.max(0.001, e), 1);
      this.begin.active = this.panelRise >= 1;
    }

    this.updateCaption();

    // A lesson waiting on you: its line again, then "No rush", then quiet.
    const waiting = ['ignite', 'throw', 'recall', 'block'].includes(this.beat) || (this.beat === 'attention' && this.sub === 4);
    if (waiting && this.nudge < 2 && this.speechIdle() && this.lob === 'none') {
      this.wait += delta;
      const replay = NUDGE_LINE[this.beat];
      if (this.wait > NUDGE) {
        this.say(this.nudge === 0 && replay ? replay : 'noRush');
        this.nudge = this.nudge === 0 && replay ? 1 : 2;
      }
    }
  }

  /** Her plate: EMBER, what she's saying, and what your hands should do. */
  private updateCaption(): void {
    if (this.said && this.t > this.saidUntil) this.said = '';
    if (this.cueOverride && this.t > this.cueOverride.until) this.cueOverride = null;
    const cueKey = this.cueOverride?.cue ?? this.cue;
    const cue = cueKey ? CUES[cueKey] : '';
    const warn = !!this.cueOverride;
    tutorStats.caption = this.said;
    tutorStats.cue = cue;
    const show = !!(this.said || cue);
    this.caption.visible = show;
    if (!show) return;

    const key = `${this.said}|${cue}|${warn}`;
    if (key !== this.drawn) {
      this.drawn = key;
      this.drawCaption(cue, warn);
    }
    // Under her, facing you; over her when she's low (over the panel), so
    // the plate never hides what she's pointing at. Out marking the rust
    // bucket, a plate under her big enough to read would cover him: her
    // words come up near you instead, like subtitles, just under your view
    // of him.
    if (this.at.distanceTo(_head) > 2.2) {
      this.caption.position.copy(_head).addScaledVector(_flat, 1.4);
      this.caption.position.y -= 0.36;
      this.caption.scale.setScalar(1);
    } else {
      const low = this.at.y < _head.y - 0.15;
      this.caption.position.copy(this.orb.position);
      this.caption.position.y += low ? this.capH + 0.17 : -0.17;
      // A readable size wherever she is: bigger the further away.
      this.caption.scale.setScalar(Math.min(2.4, Math.max(0.75, this.caption.position.distanceTo(_head) / 1.5)));
    }
    this.caption.lookAt(_head);
  }

  private drawCaption(cue: string, warn: boolean): void {
    const said = this.said;
    // Measure first, so the plate fits the rows.
    let rows: string[] = [];
    this.capText.draw((g, w) => {
      const px = w / CAP_W;
      const pad = CAP_PAD * px;
      g.font = `600 ${CAP_ROW * 0.72 * px}px ${FONT}`;
      rows = said ? wrap(g, said, w - pad * 2) : [];
      let y = pad;
      g.textBaseline = 'top';
      g.textAlign = 'left';
      if (said) {
        // Her name tag: a lit notch, EMBER, and a rule fading out.
        g.save();
        g.shadowColor = css(GOLD);
        g.shadowBlur = 10;
        g.fillStyle = css(GOLD);
        g.fillRect(pad, y + CAP_TAG * 0.12 * px, 0.004 * px, CAP_TAG * 0.62 * px);
        g.restore();
        g.font = `900 ${CAP_TAG * 0.6 * px}px ${FONT}`;
        glowText(g, 'EMBER', pad + 0.012 * px, y + CAP_TAG * 0.1 * px, GOLD);
        const rule = g.createLinearGradient(pad, 0, w - pad, 0);
        rule.addColorStop(0, 'rgba(255,192,77,0.7)');
        rule.addColorStop(1, 'rgba(255,192,77,0)');
        g.fillStyle = rule;
        g.fillRect(pad, y + CAP_TAG * 0.86 * px, w - pad * 2, 0.0012 * px);
        y += CAP_TAG * px + 0.004 * px;
        g.font = `600 ${CAP_ROW * 0.72 * px}px ${FONT}`;
        g.fillStyle = '#f2f4ff';
        for (const r of rows) {
          g.fillText(r, pad, y);
          y += CAP_ROW * px;
        }
      }
      if (cue) {
        y += said ? 0.006 * px : 0;
        g.font = `800 ${CAP_CUE * 0.52 * px}px ${FONT}`;
        g.textAlign = 'center';
        glowText(g, cue, w / 2, y + 0.004 * px, warn ? NEON.danger : NEON.cyan);
      }
    });
    const h = Math.min(
      CAP_MAX,
      CAP_PAD * 2 + (said ? CAP_TAG + 0.004 + rows.length * CAP_ROW : 0) + (cue ? CAP_CUE + (said ? 0.006 : 0) : 0),
    );
    if (Math.abs(h - this.capH) > 1e-4) {
      this.capH = h;
      for (const m of [this.capGlass, this.capFrame]) {
        if (!m) continue;
        this.caption.remove(m);
        m.geometry.dispose();
        (m.material as MeshBasicMaterial).dispose();
      }
      this.capGlass = glass(CAP_W, h, 0.014);
      this.capFrame = frame(CAP_W, h, 0.003, GOLD, 0.014);
      (this.capFrame.material as MeshBasicMaterial).opacity = 0.6;
      for (const m of [this.capGlass, this.capFrame]) {
        m.position.y = -h / 2;
        m.renderOrder += 17;
        this.caption.add(m);
      }
    }
  }

  /* ── start and end ─────────────────────────────────────────────────── */

  private start(): void {
    this.active = true;
    preloadTutorVoice();
    Object.assign(duelTutor, { lesson: true, awake: false, lob: null, outcome: null, bell: false, release: false });
    this.camera.getWorldPosition(_head);
    this.camera.getWorldQuaternion(_q);
    this.attnFwd.set(0, 0, -1).applyQuaternion(_q).setY(0);
    if (this.attnFwd.lengthSq() < 1e-4) this.attnFwd.set(0, 0, -1);
    this.attnFwd.normalize();
    // She spawns dim and off-stage, at ~10 o'clock, at the edge of your eye.
    this.at.copy(_head).addScaledVector(_v.copy(this.attnFwd).applyAxisAngle(UP, 0.95), 2.5);
    this.at.y = _head.y - 0.1;
    this.target.copy(this.at);
    this.orb.position.copy(this.at);
    this.orb.visible = true;
    this.dim = 1;
    this.beat = 'attention';
    this.beatT = 0;
    this.toSub(0);
    this.gaze = 0;
    this.queue.length = 0;
    this.said = '';
    this.speakUntil = 0;
    this.cue = null;
    this.drawn = '';
    this.prevBalls = ballStates();
    this.prevLanded = duelStats.hitsLanded;
    this.prevTaken = duelStats.hitsTaken;
    this.lob = 'none';
    tutorStats.said = [];
  }

  private end(stopVoice = true): void {
    if (stopVoice) stopTutorVoice();
    this.active = false;
    this.orb.visible = false;
    this.caption.visible = false;
    this.hidePanel();
    this.hideZone();
    this.queue.length = 0;
    this.said = '';
    this.cue = null;
    this.cueOverride = null;
    duelTutor.lob = null;
    this.beat = 'attention';
    tutorStats.beat = 'off';
  }

  private sync(): void {
    tutorStats.beat = this.beat;
    tutorStats.blocks = this.blocks;
    tutorStats.reps = this.rep;
  }
}

/** Break `text` into rows no wider than `max` pixels. */
function wrap(g: CanvasRenderingContext2D, text: string, max: number): string[] {
  const rows: string[] = [];
  let row = '';
  for (const word of text.split(/\s+/)) {
    const next = row ? `${row} ${word}` : word;
    if (row && g.measureText(next).width > max) {
      rows.push(row);
      row = word;
    } else row = next;
  }
  if (row) rows.push(row);
  return rows;
}

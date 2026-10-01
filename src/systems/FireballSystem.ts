/**
 * Your two fireballs, one per hand, played with bare hands.
 * (FIRE FIGHT 2's state machine, re-grammared for hand tracking.)
 *
 *   HOVER      the ball idles just above your palm, dim.
 *   ORBIT      close a FIST or PINCH near it: it lights and circles your hand,
 *              spinning up while you hold. It's your shield, too.
 *   FLYING     punch and OPEN your hand mid-swing: it flies along the punch.
 *              (Open slowly and it just settles back to HOVER.)
 *   RETURNING  close your hand while it's away: it homes back to your palm,
 *              and is caught into ORBIT if you're still closed, HOVER if not.
 *
 * The throw takes the FASTEST hand velocity in the last ~0.15 s, not the
 * velocity at the moment of release: a hand opens after the punch peaks,
 * and a release-time read would throw every ball soft. Positions only come
 * from fresh tracking frames, so a dropout can't smear the velocity.
 */

import { createSystem } from '@iwsdk/core';
import { Group, Vector3 } from 'three';
import { FIREBALL, NEON } from '../config.js';
import { hum, sfx } from '../audio/sfx.js';
import { fx, glowSprite } from '../fx/neon.js';
import { game, handsOnMenu } from '../game/state.js';
import { hands, SIDES, type Side } from '../input/hands.js';
import { hittables } from '../game/hittables.js';

const enum State {
  Hover,
  Orbit,
  Flying,
  Returning,
}

interface Sample {
  p: Vector3;
  t: number;
}

interface Ball {
  side: Side;
  state: State;
  pos: Vector3;
  vel: Vector3;
  age: number;
  spin: number;
  angle: number;
  recallLock: number;
  trail: number;
  group: Group;
  core: Group;
  samples: Sample[];
}

const _v = new Vector3();
const _a = new Vector3();
const _b = new Vector3();
const _head = new Vector3();
const _prev = new Vector3();

/** Fastest palm velocity over the release window (out), from fresh samples. */
function releaseVelocity(samples: Sample[], now: number, out: Vector3): Vector3 {
  out.set(0, 0, 0);
  let best = 0;
  for (let i = samples.length - 1; i >= 0; i--) {
    const s = samples[i];
    // (The newest three samples always count: when frames drop, they can
    // be older than the whole window by the time the hand opens. At full
    // frame rate three samples are well inside it, so nothing changes.)
    if (now - s.t > FIREBALL.releaseWindow && i < samples.length - 3) break;
    // Velocity over ~50 ms ending at this sample: steadier than frame-to-frame.
    for (let j = i - 1; j >= 0; j--) {
      const dt = s.t - samples[j].t;
      if (dt < 0.05) continue;
      _a.copy(s.p).sub(samples[j].p).divideScalar(dt);
      const sp = _a.lengthSq();
      if (sp > best) {
        best = sp;
        out.copy(_a);
      }
      break;
    }
  }
  return out;
}

const STATE_NAMES = ['hover', 'orbit', 'flying', 'returning'] as const;

/** Both balls' states, left then right (the headless probes read this). */
export function ballStates(): string[] {
  return live.map((b) => STATE_NAMES[b.state]);
}

/** Both balls' positions and speeds, for the probes. */
export function ballPoses(): { pos: number[]; speed: number }[] {
  return live.map((b) => ({ pos: b.pos.toArray(), speed: b.vel.length() }));
}

/** A ball ORBITING a hand, if any: it's your shield, and it parries a
 *  titan's fist (TitanSystem reads this). */
export function orbitingBall(side: Side): Vector3 | null {
  const b = live.find((x) => x.side === side);
  return b && b.state === State.Orbit && b.group.visible ? b.pos : null;
}

let live: Ball[] = [];

/** The last release's numbers, for the probes: its speed, and the newest
 *  palm samples as [ms before the release, z]. */
export let lastRelease: { speed: number; tracked: boolean; samples: number[][] } | null = null;
export function releaseInfo(): typeof lastRelease {
  return lastRelease;
}

export class FireballSystem extends createSystem({}) {
  private balls: Ball[] = [];

  init(): void {
    for (const side of SIDES) {
      const color = side === 'left' ? NEON.cyan : NEON.magenta;
      const group = new Group();
      group.add(glowSprite(color, FIREBALL.radius * 7));
      const core = new Group();
      core.add(glowSprite(NEON.hot, FIREBALL.radius * 2.6));
      group.add(core);
      group.visible = false;
      this.scene.add(group);
      this.balls.push({
        side,
        state: State.Hover,
        pos: new Vector3(),
        vel: new Vector3(),
        age: 0,
        spin: 0,
        angle: 0,
        recallLock: 0,
        trail: 0,
        group,
        core,
        samples: [],
      });
    }
    live = this.balls;
  }

  update(delta: number): void {
    const now = performance.now() / 1000;
    this.camera.getWorldPosition(_head);
    // At the console there's nothing to fight: the balls wait, unlit, out of sight.
    if (game.mode === 'home') {
      for (const b of this.balls) {
        b.state = State.Hover;
        b.samples.length = 0;
        b.pos.copy(hands[b.side].palm);
        b.group.visible = false;
        hum(`ball-${b.side}`, 'fire', b.pos, 0);
      }
      return;
    }
    const menu = handsOnMenu();
    for (const b of this.balls) {
      const h = hands[b.side];
      if (h.fresh) {
        b.samples.push({ p: h.palm.clone(), t: now });
        while (b.samples.length > 24) b.samples.shift();
      }
      b.recallLock = Math.max(0, b.recallLock - delta);
      const shape = h.shape;
      // While your hands are on a menu, a hand shape does nothing to a ball.
      const justClosed = !menu && shape.justClosed;
      const justOpened = !menu && shape.justOpened;

      switch (b.state) {
        case State.Hover: {
          this.hoverTarget(b, _v);
          b.pos.lerp(_v, Math.min(1, delta * FIREBALL.hoverLerp));
          if (justClosed && b.pos.distanceTo(h.palm) <= FIREBALL.nearHandRadius) {
            b.state = State.Orbit;
            b.spin = 0;
            fx.sparks?.burst(b.pos, 18, this.color(b), 1.2);
            sfx('ignite', b.pos);
          }
          break;
        }
        case State.Orbit: {
          if (justOpened || !shape.tracked) {
            releaseVelocity(b.samples, now, _v);
            lastRelease = {
              speed: _v.length(),
              tracked: shape.tracked,
              samples: b.samples.slice(-6).map((x) => [Math.round((now - x.t) * 1000), +x.p.z.toFixed(3)]),
            };
            if (shape.tracked && _v.length() >= FIREBALL.minPunchSpeed) this.throwBall(b, _v);
            else {
              b.state = State.Hover;
              // Losing the hand to the cameras isn't something you did:
              // the ball just dims, silently. (It used to zap every time,
              // and mid-fight hands leave the cameras all the time.)
              if (shape.tracked) sfx('drop', b.pos);
            }
            break;
          }
          b.spin = Math.min(1, b.spin + delta / FIREBALL.orbitSpinUp);
          const speed = FIREBALL.orbitSpeedMin + (FIREBALL.orbitSpeedMax - FIREBALL.orbitSpeedMin) * b.spin;
          b.angle += speed * delta;
          this.orbitPoint(b, _v);
          b.pos.copy(_v);
          break;
        }
        case State.Flying: {
          b.age += delta;
          _prev.copy(b.pos);
          b.vel.y -= FIREBALL.gravity * delta;
          b.pos.addScaledVector(b.vel, delta);
          if (this.checkHits(b, _prev, b.pos, false)) {
            b.state = State.Returning;
            break;
          }
          if (b.age > FIREBALL.lifetime || b.pos.y < 0) {
            fx.sparks?.burst(b.pos, 20, this.color(b), 1);
            sfx('fizzle', b.pos);
            b.state = State.Hover;
            b.pos.copy(h.palm);
          } else if (justClosed && b.recallLock <= 0) {
            b.state = State.Returning;
            sfx('recall', h.palm);
          }
          break;
        }
        case State.Returning: {
          _prev.copy(b.pos);
          _v.copy(h.palm).sub(b.pos);
          const dist = _v.length();
          const step = Math.min(dist, Math.min(FIREBALL.returnSpeed, 3 + dist * 7) * delta);
          b.pos.addScaledVector(_v.normalize(), step);
          // A recalled ball that passes back through a ring still counts.
          this.checkHits(b, _prev, b.pos, true);
          if (b.pos.distanceTo(h.palm) <= FIREBALL.catchRadius) {
            b.state = shape.closed ? State.Orbit : State.Hover;
            fx.sparks?.burst(b.pos, 12, this.color(b), 0.8);
            sfx('catch', b.pos);
          }
          break;
        }
      }

      // Draw. The ball only shows while its hand is tracked, or while it's
      // away from the hand (in flight, or coming home).
      const away = b.state === State.Flying || b.state === State.Returning;
      // An idle ball over a palm that's holding up the wrist panel would sit
      // right behind the panel: it steps out of the way.
      const underPanel = game.wristOpen && b.side === 'left' && b.state === State.Hover;
      b.group.visible = (away || shape.tracked) && !underPanel;
      b.group.position.copy(b.pos);
      const lit = b.state !== State.Hover;
      b.group.scale.setScalar(lit ? 1 : 0.55);
      b.core.visible = lit;
      // In flight it roars like the flame it is, so you can hear where it
      // is; in your hand it's quiet (as in FIRE FIGHT 2: a ball held all
      // fight long next to your ears would be a drone you can't escape).
      hum(`ball-${b.side}`, 'fire', b.pos, b.group.visible && away ? 0.22 : 0, b.state === State.Returning ? 1.25 : 1);
      if (away) {
        b.trail -= delta;
        if (b.trail <= 0) {
          b.trail = 0.025;
          fx.sparks?.burst(b.pos, 2, this.color(b), 0.3);
        }
      }
    }
  }

  private color(b: Ball): number {
    return b.side === 'left' ? NEON.cyan : NEON.magenta;
  }

  /** Just above the palm, nudged toward the fight. */
  private hoverTarget(b: Ball, out: Vector3): Vector3 {
    const o = FIREBALL.hoverOffset;
    return out.copy(hands[b.side].palm).add(_a.set(o[0], o[1], o[2]));
  }

  /** A circle round the hand, in the plane facing your eyes. */
  private orbitPoint(b: Ball, out: Vector3): Vector3 {
    const palm = hands[b.side].palm;
    const axis = _a.copy(palm).sub(_head).normalize();
    // Two perpendicular directions in the plane across that axis.
    const u = _b.set(0, 1, 0).cross(axis);
    if (u.lengthSq() < 1e-6) u.set(1, 0, 0);
    u.normalize();
    const w = out.copy(axis).cross(u).normalize();
    const c = Math.cos(b.angle) * FIREBALL.orbitRadius;
    const s = Math.sin(b.angle) * FIREBALL.orbitRadius;
    return w.multiplyScalar(s).addScaledVector(u, c).add(palm);
  }

  private throwBall(b: Ball, handVel: Vector3): void {
    const speed = Math.min(FIREBALL.throwSpeedMax, Math.max(FIREBALL.throwSpeedMin, handVel.length() * FIREBALL.punchGain));
    const dir = _a.copy(handVel).normalize();
    // Aim assist: a throw within ~25° of a live target is bent 40% onto it.
    let best: Vector3 | null = null;
    let bestDot = Math.cos((25 * Math.PI) / 180);
    for (const t of hittables) {
      if (!t.assist || !t.live()) continue;
      const to = _b.copy(t.pos).sub(b.pos).normalize();
      const d = to.dot(dir);
      if (d > bestDot) {
        bestDot = d;
        best = t.pos;
      }
    }
    if (best) dir.lerp(_b.copy(best).sub(b.pos).normalize(), 0.4).normalize();
    b.vel.copy(dir).multiplyScalar(speed);
    b.state = State.Flying;
    sfx('throw', b.pos);
    b.age = 0;
    b.recallLock = FIREBALL.recallLockout;
    fx.sparks?.burst(b.pos, 24, this.color(b), 1.8);
  }

  /** Swept test: the segment this frame against everything hittable.
   *  True when the ball was spent on something and should come home. */
  private checkHits(b: Ball, from: Vector3, to: Vector3, returning: boolean): boolean {
    for (const t of hittables) {
      if (returning && !t.onReturn) continue;
      if (!t.live()) continue;
      if (segDist(from, to, t.pos) > FIREBALL.radius + t.radius) continue;
      const out = t.hit({ side: b.side, at: to, speed: b.vel.length() });
      if (out === 'stop') return true;
    }
    return false;
  }
}

const _ab = new Vector3();
const _ap = new Vector3();

function segDist(a: Vector3, b: Vector3, p: Vector3): number {
  _ab.copy(b).sub(a);
  const len2 = _ab.lengthSq();
  const k = len2 > 0 ? Math.min(1, Math.max(0, _ap.copy(p).sub(a).dot(_ab) / len2)) : 0;
  return _ap.copy(a).addScaledVector(_ab, k).distanceTo(p);
}

/**
 * THE STRIKE (DESIGN §3.2): an attack is a body action with a target, not
 * a zone on your floor. It starts at the titan's body and travels to where
 * your head was when the windup ended.
 *
 *   WINDUP   the tell. The limb draws back into a silhouette you learn to
 *            read (a jab cocks low, an overhand rises, a hook swings wide),
 *            and its fist or eye swells with light. Sacred: nothing ever
 *            shortens it.
 *   STRIKE   the travel. At the windup's end your head is SNAPSHOTTED and
 *            the fist flies along its path to that point: step off the
 *            line, duck, or put a palm (or an orbiting ball) in its way.
 *   RECOVER  the fist comes home.
 *
 * Pure: three.js maths only (tools/strike-check.mjs runs it under Node).
 */

import { Vector3 } from 'three';

export type StrikePath =
  | 'jab'
  | 'hook'
  | 'overhand'
  | 'sweep'
  | 'piston'
  | 'clap'
  | 'spinback'
  | 'spinhammer'
  | 'beam'
  | 'sweepbeam'
  | 'volley'
  | 'mortar'
  | 'decree'
  | 'orb';

export interface StrikeDef {
  path: StrikePath;
  /** Which arm (0 or 1), 'both' (a clap), 'eye' for a beam, or 'bolts' for
   *  things it throws: a volley from the wingtips (or launcher pods), a
   *  mortar lobbed from the pods, a decree from over its crown, an orb
   *  that hunts you from over it. */
  limb: 0 | 1 | 'both' | 'eye' | 'bolts';
  windup: number;
  strike: number;
  recover: number;
  damage: number;
  /** Blows in a chain (default 1). Each one after the first comes from the
   *  OTHER arm, wound up for `beat` seconds, aimed at where your head is by
   *  then: keep moving on the beat. A block breaks the chain. On a volley
   *  it's the bolts thrown, `beat` seconds apart; on a decree, a second
   *  row gathered for `beat` seconds, its gap planned from where you went. */
  combo?: number;
  beat?: number;
}

/**
 * Where the fist draws back to for the windup, relative to its SHOULDER,
 * in the titan's root space (its own −z is toward you), in rig metres per
 * unit of rig scale. `side` is the arm's side (−1 or +1 along the rig's x).
 */
export function windupOffset(path: StrikePath, side: number, out: Vector3): Vector3 {
  switch (path) {
    case 'jab':
      return out.set(side * -0.05, -0.28, -0.12); // cocked low and tight at the chin
    case 'hook':
      return out.set(side * 0.55, -0.1, 0.25); // swung out wide and back
    case 'overhand':
      return out.set(side * 0.15, 0.45, 0.2); // raised high over the shoulder
    case 'sweep':
      return out.set(side * 0.75, -0.25, -0.1); // out wide, low, the arm laid open
    case 'piston':
      return out.set(side * 0.05, -0.38, 0.25); // drawn right back to the hip, a ram cocked
    case 'clap':
      return out.set(side * 0.65, 0.05, 0.1); // both arms thrown wide open, level
    case 'spinback':
      return out.set(side * -0.45, -0.15, -0.3); // folded across the chest, the back of the fist out
    case 'spinhammer':
      return out.set(side * -0.1, 0.5, 0.05); // raised high, over its head
    case 'beam':
    case 'sweepbeam':
    case 'volley':
    case 'mortar':
    case 'decree':
    case 'orb':
      return out.set(0, 0, 0);
  }
}

/** The arms a move swings. */
export function armsOf(d: StrikeDef): (0 | 1)[] {
  return d.limb === 'both' ? [0, 1] : d.limb === 0 || d.limb === 1 ? [d.limb] : [];
}

/**
 * A lobbed shot: the launch velocity (out) that carries a shell from `from`
 * to `to` in `time` seconds under gravity `g` (m/s², pulling −y).
 */
export function lob(from: Vector3, to: Vector3, time: number, g: number, out: Vector3): Vector3 {
  return out.copy(to).sub(from).divideScalar(time).setY((to.y - from.y) / time + 0.5 * g * time);
}

/** Does this move swing an arm (and so lunge, whoosh and whiff)? */
export const isFist = (d: StrikeDef): boolean => armsOf(d).length > 0;

/**
 * The fist's path from `from` (the windup point) through `to` (your head,
 * snapshotted), all in world space. `outward` is the striking arm's side,
 * as a world direction. A sweep carries on past you to the far side; every
 * other path ends on you.
 */
export function strikePoint(
  path: StrikePath,
  from: Vector3,
  to: Vector3,
  outward: Vector3,
  t: number,
  out: Vector3,
): Vector3 {
  const u = Math.min(1, Math.max(0, t));
  const c = new Vector3().copy(from).add(to).multiplyScalar(0.5);
  let end = to;
  switch (path) {
    case 'jab':
    case 'piston':
      break; // straight down the line
    case 'hook':
      c.addScaledVector(outward, 0.55); // arcs in from the side
      break;
    case 'clap':
      c.addScaledVector(outward, 0.4); // each arm sweeps in from its side, to meet on you
      break;
    case 'overhand':
      c.y += 0.6; // comes down on you from above
      break;
    case 'spinback':
    case 'spinhammer':
      break; // the body's turn carries these (spinPoint); straight is the fallback
    case 'sweep': {
      // Level at your head, from its side, through you, out the far side:
      // a quadratic whose midpoint is exactly on you.
      end = new Vector3().copy(to).addScaledVector(outward, -0.9);
      end.y = to.y;
      c.copy(to).multiplyScalar(2).addScaledVector(from, -0.5).addScaledVector(end, -0.5);
      break;
    }
    case 'beam':
    case 'sweepbeam':
    case 'volley':
    case 'mortar':
    case 'decree':
    case 'orb':
      return out.copy(to);
  }
  // Quadratic Bézier from → c → end.
  const a = (1 - u) * (1 - u);
  const b = 2 * (1 - u) * u;
  const d = u * u;
  return out.set(
    a * from.x + b * c.x + d * end.x,
    a * from.y + b * c.y + d * end.y,
    a * from.z + b * c.z + d * end.z,
  );
}

const _ab = new Vector3();
const _ap = new Vector3();

/**
 * THE SPINNING BLOWS: the backfist and the hammerfist. The whole titan
 * turns, the striking shoulder going back first, and keeps turning:
 *
 *   WINDUP   it turns its BACK on you (the tell: no other move does),
 *            the fist folded across its chest, or raised high for a hammer;
 *   STRIKE   the turn carries on round and the arm whips out, the fist on
 *            a level arc about its own spine that ends on your head as its
 *            striking shoulder comes round to face you (a hammer drops
 *            onto you as it comes);
 *   RECOVER  the turn finishes, a whole revolution, and it faces you again.
 *
 * Turn is in radians, 0 → 2π, of a turn whose sign is −side (the striking
 * shoulder leads backwards).
 */
export const isSpin = (path: StrikePath): boolean => path === 'spinback' || path === 'spinhammer';

export const SPIN = {
  /** Turned this far round by the windup's end: its back to you. */
  windup: 0.85 * Math.PI,
  /** And this far when the fist lands: its striking shoulder toward you. */
  contact: 1.5 * Math.PI,
  /** A hammerfist starts its arc this far over your head (rig-free metres). */
  lift: 0.7,
};

const smooth = (t: number): number => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/**
 * How far round a spinning blow has turned the titan, `u` (0–1) through
 * `stage`. A recovery finishes the revolution from `from`, wherever the
 * strike was cut off (a block stops the fist, not the body).
 */
export function spinTurn(stage: 'windup' | 'strike' | 'recover', u: number, from: number = SPIN.contact): number {
  const t = Math.min(1, Math.max(0, u));
  if (stage === 'windup') return SPIN.windup * smooth(t / 0.85);
  if (stage === 'strike') return SPIN.windup + (SPIN.contact - SPIN.windup) * t;
  return from + (2 * Math.PI - from) * smooth(t);
}

/**
 * Where a spinning blow's fist is: your head (`to`, snapshotted) turned
 * back round the titan's spine (the vertical through `axis`) by the turn
 * still to come, `behind` radians about +y, so it rides the body round and
 * lands exactly on you when `behind` reaches 0. A hammerfist also comes
 * down from `SPIN.lift` over you as `t` (0–1) runs out.
 */
export function spinPoint(path: StrikePath, axis: Vector3, to: Vector3, behind: number, t: number, out: Vector3): Vector3 {
  const dx = to.x - axis.x;
  const dz = to.z - axis.z;
  const c = Math.cos(behind);
  const s = Math.sin(behind);
  out.set(axis.x + c * dx + s * dz, to.y, axis.z - s * dx + c * dz);
  if (path === 'spinhammer') out.y += SPIN.lift * (1 - smooth(t));
  return out;
}

/** Distance from point `p` to the segment a→b. */
export function segmentDistance(a: Vector3, b: Vector3, p: Vector3): number {
  _ab.copy(b).sub(a);
  const len2 = _ab.lengthSq();
  const k = len2 > 0 ? Math.min(1, Math.max(0, _ap.copy(p).sub(a).dot(_ab) / len2)) : 0;
  return _ap.copy(a).addScaledVector(_ab, k).distanceTo(p);
}

/** Parameter (0–1) of the point on a→b nearest `p`. */
export function segmentParam(a: Vector3, b: Vector3, p: Vector3): number {
  _ab.copy(b).sub(a);
  const len2 = _ab.lengthSq();
  return len2 > 0 ? Math.min(1, Math.max(0, _ap.copy(p).sub(a).dot(_ab) / len2)) : 0;
}

/**
 * THE GRAMMAR's first laws (FF2 grammar.ts): never the same move twice
 * running, and otherwise weighted. `rand` is injectable for the checks.
 */
export function pickStrike<T extends { path: StrikePath }>(
  moves: readonly T[],
  weights: Partial<Record<StrikePath, number>>,
  last: StrikePath | null,
  rand: () => number = Math.random,
): T {
  const pool = moves.filter((m) => m.path !== last && (weights[m.path] ?? 0) > 0);
  const list = pool.length > 0 ? pool : moves;
  const total = list.reduce((s, m) => s + (weights[m.path] ?? 1), 0);
  let r = rand() * total;
  for (const m of list) {
    r -= weights[m.path] ?? 1;
    if (r <= 0) return m;
  }
  return list[list.length - 1];
}

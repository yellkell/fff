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

export type StrikePath = 'jab' | 'hook' | 'overhand' | 'sweep' | 'beam';

export interface StrikeDef {
  path: StrikePath;
  /** Which arm (0 or 1), or 'eye' for the beam. */
  limb: 0 | 1 | 'eye';
  windup: number;
  strike: number;
  recover: number;
  damage: number;
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
    case 'beam':
      return out.set(0, 0, 0);
  }
}

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
      break; // straight down the line
    case 'hook':
      c.addScaledVector(outward, 0.55); // arcs in from the side
      break;
    case 'overhand':
      c.y += 0.6; // comes down on you from above
      break;
    case 'sweep': {
      // Level at your head, from its side, through you, out the far side:
      // a quadratic whose midpoint is exactly on you.
      end = new Vector3().copy(to).addScaledVector(outward, -0.9);
      end.y = to.y;
      c.copy(to).multiplyScalar(2).addScaledVector(from, -0.5).addScaledVector(end, -0.5);
      break;
    }
    case 'beam':
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

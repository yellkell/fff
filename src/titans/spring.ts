/**
 * THE SPRING: a critically damped follower, so a titan's body and fists
 * move like weight, not like a cursor. Wherever the target jumps, the
 * follower closes on it as fast as it can without overshoot, carrying the
 * velocity it already had: a fist that finishes a blow travels on a little
 * before it turns for home, and a body that stops lunging settles back.
 *
 * Exact for any step (the closed form, not an integration), so a long frame
 * can't make it ring or blow up. `omega` is its stiffness in rad/s: it
 * settles to within 5% in about 4.7 / omega seconds.
 *
 * Pure: plain maths (tools/strike-check.mjs runs it under Node).
 */

import type { Vector3 } from 'three';

/** One axis: returns the new position; `v[0]` carries its velocity. */
export function spring(x: number, v: [number], target: number, omega: number, dt: number): number {
  if (dt <= 0) return x;
  const y = x - target;
  const k = v[0] + omega * y;
  const e = Math.exp(-omega * dt);
  v[0] = (v[0] - k * omega * dt) * e;
  return target + (y + k * dt) * e;
}

const _v: [number] = [0];

/** A point: `x` follows `target`, `vel` carries its velocity (both in place). */
export function springVec(x: Vector3, vel: Vector3, target: Vector3, omega: number, dt: number): Vector3 {
  _v[0] = vel.x;
  x.x = spring(x.x, _v, target.x, omega, dt);
  vel.x = _v[0];
  _v[0] = vel.y;
  x.y = spring(x.y, _v, target.y, omega, dt);
  vel.y = _v[0];
  _v[0] = vel.z;
  x.z = spring(x.z, _v, target.z, omega, dt);
  vel.z = _v[0];
  return x;
}

/**
 * A THROW THAT ARRIVES (FF2's bot release): the launch velocity for a ball
 * leaving `from` at `speed` to reach `to` under `gravity`. It flies straight
 * at the point and is lifted by half the drop it will suffer on the way, so
 * it arcs onto it rather than diving under. Close enough for any throw a
 * duel makes (checked in tools/duel-check.mjs).
 *
 * Pure: three.js maths only.
 */

import { Vector3 } from 'three';

export function aimThrow(from: Vector3, to: Vector3, speed: number, gravity: number, out = new Vector3()): Vector3 {
  out.copy(to).sub(from);
  const dist = out.length();
  out.normalize().multiplyScalar(speed);
  out.y += 0.5 * gravity * (dist / speed);
  return out;
}

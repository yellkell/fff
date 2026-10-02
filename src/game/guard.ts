/**
 * YOUR GUARD: what in your hands stops something coming at you. The same
 * law for a titan's fist, its beam and bolts, and a rival's fireball:
 *
 *   - a ball ORBITING your hand, in its path (your shield);
 *   - an OPEN PALM in its path, facing into its travel (DESIGN §2's block).
 *
 * In a duel a ball flying HOME to your hand parries too (FF2's parry):
 * recalling through an incoming shot knocks it out of the air.
 */

import type { Vector3 } from 'three';
import { FIGHT, FIREBALL } from '../config.js';
import { hands, SIDES } from '../input/hands.js';
import { orbitingBall, returningBall } from '../systems/FireballSystem.js';
import { segmentDistance } from '../titans/strike.js';

/**
 * What stops something travelling from → to (radius r)? `into` is the way
 * a palm must face to block it: against its travel. `reach` is extra
 * contact distance for a ball meeting a ball. The point it stops at, or null.
 */
export function guardStop(from: Vector3, to: Vector3, r: number, into: Vector3, opts: { returning?: boolean; reach?: number } = {}): Vector3 | null {
  const reach = opts.reach ?? 0;
  for (const side of SIDES) {
    const ball = orbitingBall(side) ?? (opts.returning ? returningBall(side) : null);
    if (ball && segmentDistance(from, to, ball) <= r + FIREBALL.radius + reach) return ball;
    const h = hands[side];
    if (!h.shape.tracked || h.shape.closed) continue;
    if (segmentDistance(from, to, h.palm) > r + FIGHT.palmReach) continue;
    if (h.palmNormal.dot(into) >= FIGHT.palmFacing) return h.palm;
  }
  return null;
}

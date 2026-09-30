/**
 * Everything a fireball can hit: practice rings, a titan's weak points, its
 * armour. FireballSystem sweeps each ball's travel against every live one.
 */

import type { Vector3 } from 'three';

export type HitOutcome =
  /** The ball flies on through (a practice ring bursting). */
  | 'through'
  /** The ball is spent on it and comes home to your hand. */
  | 'stop';

export interface BallHit {
  side: 'left' | 'right';
  /** Where the ball was when it hit, and how fast it was going. */
  at: Vector3;
  speed: number;
}

export interface Hittable {
  /** Centre, world space. Kept live by whoever owns it. */
  pos: Vector3;
  radius: number;
  live(): boolean;
  /** Throws within ~25° of it are bent toward it. */
  assist: boolean;
  /** Can a ball flying HOME still hit it? (Rings yes; a titan no, or a
   *  recalled ball would score twice.) */
  onReturn: boolean;
  hit(ball: BallHit): HitOutcome;
}

export const hittables: Hittable[] = [];

export function addHittable(h: Hittable): Hittable {
  hittables.push(h);
  return h;
}

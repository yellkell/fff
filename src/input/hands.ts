/**
 * The live state of both hands, written once a frame by HandSystem and read
 * by everything that plays on them. World space throughout.
 */

import { Vector3 } from 'three';
import { HANDS } from '../config.js';
import { HandShape } from './handPose.js';

export type Side = 'left' | 'right';
export const SIDES: readonly Side[] = ['left', 'right'];

export interface HandState {
  shape: HandShape;
  /** Palm centre (between the wrist and the middle knuckle), world. */
  palm: Vector3;
  /** Index fingertip, world — for poking buttons. */
  indexTip: Vector3;
  /** Palm normal (out of the palm), world. */
  palmNormal: Vector3;
  /** Joint data arrived THIS frame (the shape may still be held through a
   *  dropout; positions are only fresh when this is true). */
  fresh: boolean;
  /** Seconds (performance clock) of the last fresh frame. */
  seenAt: number;
}

const make = (): HandState => ({
  shape: new HandShape(HANDS),
  palm: new Vector3(),
  indexTip: new Vector3(),
  palmNormal: new Vector3(0, 0, -1),
  fresh: false,
  seenAt: -Infinity,
});

export const hands: Record<Side, HandState> = { left: make(), right: make() };

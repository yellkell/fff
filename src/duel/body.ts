/**
 * A BODY TO HIT (FF2's head-driven spine): three spheres, head, chest and
 * pelvis, solved from the head alone. The hips are pinned under the head
 * at hip height (never closer below it than BODY.hipBelowHead, so a deep
 * duck or a seated player still has a torso) and set back behind the face
 * along its yaw, since your face sits forward of your spine. Ducking and
 * leaning swing the whole torso: dodging is a whole-body act.
 *
 * The same solve gives the rival its body, so what you aim at is what the
 * judge tests.
 *
 * Pure: three.js maths only (tools/duel-check.mjs runs it under Node).
 */

import { Vector3 } from 'three';
import { BODY } from '../config.js';

export type BodyPart = 'head' | 'chest' | 'pelvis';

export interface BodySphere {
  part: BodyPart;
  pos: Vector3;
  radius: number;
}

export function makeBody(): BodySphere[] {
  return [
    { part: 'head', pos: new Vector3(), radius: BODY.headRadius },
    { part: 'chest', pos: new Vector3(), radius: BODY.chestRadius },
    { part: 'pelvis', pos: new Vector3(), radius: BODY.pelvisRadius },
  ];
}

const _neck = new Vector3();

/**
 * Solve `body` (from makeBody) for a head at `head` facing `yaw` (0 = −z,
 * the way you face the fight). Returns the body.
 */
export function solveBody(body: BodySphere[], head: Vector3, yaw: number): BodySphere[] {
  // Forward along the floor, from the yaw.
  const fx = -Math.sin(yaw);
  const fz = -Math.cos(yaw);
  const hipY = Math.min(BODY.hipHeight, head.y - BODY.hipBelowHead);
  const back = BODY.spineSetBack;
  const pelvis = body[2].pos.set(head.x - fx * back, hipY, head.z - fz * back);
  // The spine runs from the hips to the neck, which sits behind the face.
  _neck.set(head.x - fx * back, head.y - BODY.headRadius, head.z - fz * back);
  body[0].pos.copy(head);
  body[1].pos.copy(pelvis).lerp(_neck, BODY.chestAlong);
  return body;
}

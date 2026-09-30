/**
 * THE REACH: a two-bone solve that puts a titan's FIST exactly on a point.
 *
 * Every titan arm is the same chain (rigs.ts): a shoulder PIVOT, an upper
 * arm hanging down its −y, an ELBOW that bends about its own x only, a
 * forearm down the elbow's −y to the WRIST, and the fist hanging below the
 * wrist. The solve works in the pivot's PARENT space (the titan's root):
 *
 *  - too far to reach? The forearm TELESCOPES (the wrist slides out along
 *    the forearm, up to `maxExt`), then the arm points straight at it;
 *  - in reach? The elbow bends, kicked toward `pole` (out, down and back,
 *    like a boxer's elbow), by the law of cosines;
 *  - the pivot is then turned so its x is the elbow's hinge, and the elbow
 *    angle is read back off the real forearm direction, so no sign in the
 *    rig's own conventions can put the fist anywhere but the target.
 *
 * Pure: three.js maths only (tools/strike-check.mjs runs it under Node).
 */

import { Matrix4, type Object3D, Quaternion, Vector3 } from 'three';

export interface ArmChain {
  pivot: Object3D;
  elbow: Object3D;
  wrist: Object3D;
  /** Shoulder → elbow. */
  upper: number;
  /** Elbow → wrist at rest (no telescope). */
  fore: number;
  /** Wrist → fist centre, straight on down the forearm. */
  fistLen: number;
}

const _dir = new Vector3();
const _perp = new Vector3();
const _e = new Vector3();
const _t = new Vector3();
const _u = new Vector3();
const _f = new Vector3();
const _x = new Vector3();
const _y = new Vector3();
const _z = new Vector3();
const _m = new Matrix4();
const _qi = new Quaternion();
const _fl = new Vector3();

/**
 * Pose `arm` so its fist centre lands on `target` (pivot-parent space).
 * Returns how far the forearm telescoped. If even fully telescoped it
 * can't reach, the fist stops short on the straight line toward it.
 */
export function reach(arm: ArmChain, target: Vector3, pole: Vector3, maxExt: number): number {
  const S = arm.pivot.position;
  const L1 = arm.upper;
  const L2rest = arm.fore + arm.fistLen;
  _dir.copy(target).sub(S);
  let d = _dir.length();
  if (d < 1e-6) _dir.set(0, -1, 0);
  else _dir.divideScalar(d);

  const ext = Math.min(maxExt, Math.max(0, d - (L1 + L2rest) * 0.999));
  const L2 = L2rest + ext;
  // Never ask for the impossible: too far, or folded tighter than the chain.
  d = Math.min(d, (L1 + L2) * 0.9999);
  d = Math.max(d, Math.abs(L1 - L2) + 1e-4);
  _t.copy(S).addScaledVector(_dir, d);

  // The elbow, out toward the pole.
  const cosA = Math.min(1, Math.max(-1, (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const sinA = Math.sqrt(1 - cosA * cosA);
  _perp.copy(pole).addScaledVector(_dir, -pole.dot(_dir));
  if (_perp.lengthSq() < 1e-8) _perp.set(0, 0, 1).addScaledVector(_dir, -_dir.z);
  _perp.normalize();
  _e.copy(S).addScaledVector(_dir, L1 * cosA).addScaledVector(_perp, L1 * sinA);

  _u.copy(_e).sub(S).normalize(); // upper arm
  _f.copy(_t).sub(_e).normalize(); // forearm

  // Pivot basis: −y down the upper arm, x the elbow hinge, z = x × y.
  _y.copy(_u).negate();
  _x.crossVectors(_u, _f);
  if (_x.lengthSq() < 1e-10) _x.crossVectors(_y, _perp);
  _x.normalize();
  _z.crossVectors(_x, _y);
  // Keep the arm's back facing back (+z at rest), not twisted round.
  if (_z.z < 0) {
    _x.negate();
    _z.negate();
  }
  _m.makeBasis(_x, _y, _z);
  arm.pivot.quaternion.setFromRotationMatrix(_m);

  // The elbow angle, read off the forearm in the pivot's own frame:
  // Rx(β)·(0,−1,0) = (0, −cos β, −sin β).
  _fl.copy(_f).applyQuaternion(_qi.copy(arm.pivot.quaternion).invert());
  arm.elbow.rotation.set(Math.atan2(-_fl.z, -_fl.y), 0, 0);
  arm.wrist.rotation.set(0, 0, 0);
  arm.wrist.position.set(0, -(arm.fore + ext), 0);
  return ext;
}

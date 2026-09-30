/**
 * Reads both tracked hands every frame: the 25 joints straight off the
 * XRFrame (fillPoses in the session's reference space, then through the
 * player rig into world space), the palm and fingertip positions, and the
 * hand shape (input/handPose.ts). Writes input/hands.ts.
 *
 * Also hides IWSDK's own hand model: in passthrough your real hands are
 * already there, and a second, slightly-off pair on top of them reads as a
 * glitch. (IWSDK forces the model itself visible every frame, so it's the
 * model's children that are switched off.)
 */

import { createSystem } from '@iwsdk/core';
import { Matrix4, Vector3 } from 'three';
import { JOINT, JOINT_COUNT, measureHand } from '../input/handPose.js';
import { hands, SIDES } from '../input/hands.js';

/** XRFrame.fillPoses (WebXR Hand Input) — missing from the DOM typings. */
type HandFrame = XRFrame & {
  fillPoses?: (spaces: XRSpace[], base: XRSpace, out: Float32Array) => boolean;
};

const _m = new Matrix4();
const _a = new Vector3();
const _b = new Vector3();

export class HandSystem extends createSystem({}) {
  private readonly joints: Record<'left' | 'right', Float32Array> = {
    left: new Float32Array(JOINT_COUNT * 16),
    right: new Float32Array(JOINT_COUNT * 16),
  };

  update(delta: number): void {
    const frame = this.renderer.xr.getFrame() as HandFrame | null;
    const ref = this.renderer.xr.getReferenceSpace();
    const rig = this.player.matrixWorld;
    const now = performance.now() / 1000;

    for (const side of SIDES) {
      const h = hands[side];
      h.fresh = false;
      const src = this.input.xr.getPrimaryInputSource(side);
      const hand = src?.hand;
      const buf = this.joints[side];
      let ok = false;
      if (frame && ref && hand && hand.size >= JOINT_COUNT && frame.fillPoses) {
        ok = frame.fillPoses(Array.from(hand.values()), ref, buf);
      }
      if (ok) {
        h.fresh = true;
        h.seenAt = now;
        // Palm centre: midway between the wrist and the middle knuckle.
        this.jointWorld(buf, JOINT.wrist, rig, _a);
        this.jointWorld(buf, JOINT.middleKnuckle, rig, _b);
        h.palm.copy(_a).add(_b).multiplyScalar(0.5);
        this.jointWorld(buf, JOINT.indexTip, rig, h.indexTip);
        // The palm faces along the wrist joint's −y in the WebXR hand model.
        _m.fromArray(buf, JOINT.wrist * 16).premultiply(rig);
        h.palmNormal.set(-_m.elements[4], -_m.elements[5], -_m.elements[6]).normalize();
      }
      h.shape.update(ok ? measureHand(buf) : null, delta);
    }

    // IWSDK's hand model: off. (Its gripSpace tracking is left alone.)
    for (const side of SIDES) {
      const model = this.input.xr.visualAdapters.hand[side].visual?.model;
      if (model) for (const c of model.children) c.visible = false;
    }
  }

  private jointWorld(buf: Float32Array, j: number, rig: Matrix4, out: Vector3): Vector3 {
    return out.set(buf[j * 16 + 12], buf[j * 16 + 13], buf[j * 16 + 14]).applyMatrix4(rig);
  }
}

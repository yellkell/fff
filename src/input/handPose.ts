/**
 * THE HAND-SHAPE READER. Turns a frame of WebXR hand joints into the two
 * shapes FLUX plays on (a fist and a pinch), with hysteresis so a hand at
 * the line can't flicker, and a dropout hold so losing tracking mid-punch
 * can't read as an open hand.
 *
 * Deliberately dependency-free and frame-agnostic: it takes the 25 joint
 * matrices in ANY one space (IWSDK fills them relative to the grip; a test
 * can fill them in world space), because every quantity it reads is a
 * distance between joints. tools/hand-check.mjs runs it under plain Node.
 */

/** WebXR joint indices (the XRHand iteration order). Each finger runs
 *  metacarpal → phalanx-proximal → intermediate → distal → tip, and the
 *  METACARPAL joint sits at the heel of the hand, by the wrist: the knuckle
 *  is the phalanx-proximal joint, one along. */
export const JOINT = {
  wrist: 0,
  thumbTip: 4,
  indexKnuckle: 6,
  indexTip: 9,
  middleKnuckle: 11,
  middleTip: 14,
  ringTip: 19,
  pinkyTip: 24,
} as const;

export const JOINT_COUNT = 25;

export interface HandThresholds {
  fistOn: number;
  fistOff: number;
  pinchOn: number;
  pinchOff: number;
  dropoutHold: number;
}

/** The raw measures of one frame. */
export interface HandMeasure {
  /** Mean fingertip→wrist distance ÷ wrist→middle-knuckle length. ~2 open, ~1 fist. */
  curl: number;
  /** Thumb tip → index tip, metres. */
  pinch: number;
}

/** Read a frame's measures from 25 column-major 4×4 matrices (16 floats
 *  each, translation at [12..14]). Null if the frame is degenerate. */
export function measureHand(joints: ArrayLike<number>): HandMeasure | null {
  if (joints.length < JOINT_COUNT * 16) return null;
  const at = (j: number, k: number): number => joints[j * 16 + 12 + k];
  const dist = (a: number, b: number): number =>
    Math.hypot(at(a, 0) - at(b, 0), at(a, 1) - at(b, 1), at(a, 2) - at(b, 2));
  const palm = dist(JOINT.wrist, JOINT.middleKnuckle);
  if (!(palm > 0.02)) return null; // not a hand (all zeros, or garbage)
  const tips = [JOINT.indexTip, JOINT.middleTip, JOINT.ringTip, JOINT.pinkyTip];
  let sum = 0;
  for (const t of tips) sum += dist(t, JOINT.wrist);
  return { curl: sum / tips.length / palm, pinch: dist(JOINT.thumbTip, JOINT.indexTip) };
}

/**
 * One hand's shape over time. Feed it every frame with `update`; read
 * `closed` (a fist OR a pinch, either lights the ball) and the edges
 * `justClosed` / `justOpened` for that frame.
 */
export class HandShape {
  fist = false;
  pinching = false;
  /** Tracked this frame (or still inside the dropout hold). */
  tracked = false;
  justClosed = false;
  justOpened = false;
  /** Last good measure, for debugging HUDs. */
  last: HandMeasure | null = null;
  private lostFor = Infinity;
  private readonly th: HandThresholds;

  constructor(th: HandThresholds) {
    this.th = th;
  }

  get closed(): boolean {
    return this.fist || this.pinching;
  }

  /** `m` null = no joint data this frame. */
  update(m: HandMeasure | null, delta: number): void {
    const wasClosed = this.closed;
    if (!m) {
      // Hold the last shape briefly: a punch outruns the cameras, and a
      // frame or two of lost tracking must not throw the ball for you.
      this.lostFor += delta;
      this.tracked = this.lostFor <= this.th.dropoutHold;
      if (!this.tracked) {
        this.fist = false;
        this.pinching = false;
      }
    } else {
      this.lostFor = 0;
      this.tracked = true;
      this.last = m;
      this.fist = this.fist ? m.curl < this.th.fistOff : m.curl < this.th.fistOn;
      this.pinching = this.pinching ? m.pinch < this.th.pinchOff : m.pinch < this.th.pinchOn;
    }
    this.justClosed = !wasClosed && this.closed;
    this.justOpened = wasClosed && !this.closed;
  }
}

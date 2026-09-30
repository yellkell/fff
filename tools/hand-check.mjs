#!/usr/bin/env node
/**
 * THE HAND-SHAPE READER, headless (src/input/handPose.ts, run under Node's
 * type stripping). Builds synthetic hands (open, fist, pinch, half-curled)
 * joint by joint and proves the reader's laws: fist and pinch both close,
 * hysteresis holds a hand at the line, a short tracking dropout can't read
 * as an open hand (no false throws), a long one lets go, and garbage frames
 * are refused.
 *
 *   npm run check:hands
 */

import { HandShape, JOINT, JOINT_COUNT, measureHand } from '../src/input/handPose.ts';

const TH = { fistOn: 1.05, fistOff: 1.3, pinchOn: 0.02, pinchOff: 0.045, dropoutHold: 0.15 };

/** 25 identity matrices, then place the joints we read. */
function hand({ tip = 0.185, thumbToIndex = 0.07 } = {}) {
  const m = new Float32Array(JOINT_COUNT * 16);
  for (let j = 0; j < JOINT_COUNT; j++) m[j * 16] = m[j * 16 + 5] = m[j * 16 + 10] = m[j * 16 + 15] = 1;
  const put = (j, x, y, z) => {
    m[j * 16 + 12] = x;
    m[j * 16 + 13] = y;
    m[j * 16 + 14] = z;
  };
  put(JOINT.wrist, 0, 0, 0);
  put(JOINT.middleKnuckle, 0, 0.095, 0); // a 9.5 cm palm
  put(JOINT.indexKnuckle, 0.02, 0.09, 0);
  // Fingertips `tip` metres from the wrist.
  put(JOINT.indexTip, 0.02, tip, 0);
  put(JOINT.middleTip, 0, tip, 0);
  put(JOINT.ringTip, -0.02, tip, 0);
  put(JOINT.pinkyTip, -0.04, tip, 0);
  put(JOINT.thumbTip, 0.02 + thumbToIndex, tip, 0);
  return m;
}

const OPEN = hand();
const FIST = hand({ tip: 0.085 });
const HALF = hand({ tip: 0.115 }); // curl ≈ 1.2: between fistOn and fistOff
const PINCH = hand({ thumbToIndex: 0.01 });
const HALF_PINCH = hand({ thumbToIndex: 0.03 }); // between pinchOn and pinchOff

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

console.log('=== measures ===');
const mo = measureHand(OPEN);
const mf = measureHand(FIST);
check('an open hand reads open', mo.curl > TH.fistOff, `curl ${mo.curl.toFixed(2)}`);
check('a fist reads curled', mf.curl < TH.fistOn, `curl ${mf.curl.toFixed(2)}`);
check('zeros are refused', measureHand(new Float32Array(JOINT_COUNT * 16)) === null);
check('a short buffer is refused', measureHand(new Float32Array(10)) === null);

console.log('=== the shape over time ===');
const dt = 1 / 72;
{
  const s = new HandShape(TH);
  s.update(measureHand(OPEN), dt);
  check('open: not closed', !s.closed && s.tracked);
  s.update(measureHand(FIST), dt);
  check('fist: closes, with a closing edge', s.closed && s.fist && s.justClosed);
  s.update(measureHand(FIST), dt);
  check('the edge fires once', s.closed && !s.justClosed);
  s.update(measureHand(HALF), dt);
  check('hysteresis: a half-curl keeps a fist closed', s.closed);
  s.update(measureHand(OPEN), dt);
  check('open again: an opening edge', !s.closed && s.justOpened);
  s.update(measureHand(HALF), dt);
  check('hysteresis: a half-curl does not close an open hand', !s.closed);
}
{
  const s = new HandShape(TH);
  s.update(measureHand(OPEN), dt);
  s.update(measureHand(PINCH), dt);
  check('pinch: closes too', s.closed && s.pinching && !s.fist && s.justClosed);
  s.update(measureHand(HALF_PINCH), dt);
  check('hysteresis: a loosening pinch holds', s.closed);
  s.update(measureHand(OPEN), dt);
  check('pinch released: opens', !s.closed && s.justOpened);
}
{
  const s = new HandShape(TH);
  s.update(measureHand(FIST), dt);
  // A punch outruns the cameras: ~100 ms of nothing.
  let opened = false;
  for (let t = 0; t < 0.1; t += dt) {
    s.update(null, dt);
    opened ||= s.justOpened;
  }
  check('a short dropout holds the fist (no false throw)', s.closed && s.tracked && !opened);
  s.update(measureHand(FIST), dt);
  check('tracking back: still closed, no edge', s.closed && !s.justClosed && !s.justOpened);
  for (let t = 0; t < 0.3; t += dt) s.update(null, dt);
  check('a long dropout lets go and reports untracked', !s.closed && !s.tracked);
}

const bad = results.filter((r) => !r).length;
console.log(`\n${bad === 0 ? 'ALL PASS' : `${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);

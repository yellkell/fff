#!/usr/bin/env node
/**
 * THE REACH AND THE STRIKE, headless (src/titans/ik.ts and strike.ts, run
 * under Node's type stripping). Builds a titan-shaped arm chain and proves:
 * the fist lands on any target in reach, in any direction, whatever the
 * rig's conventions; out of reach it telescopes, then stops short on the
 * line; the elbow bends toward its pole; every strike path starts at the
 * windup and passes through your head; and the grammar never repeats a move.
 *
 *   npm run check:strike
 */

import { Group, Vector3 } from 'three';
import { reach } from '../src/titans/ik.ts';
import { pickStrike, segmentDistance, strikePoint, windupOffset } from '../src/titans/strike.ts';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

/** A rig-shaped arm under a root turned round to face +z, like a staged titan. */
function arm(s = 1.25) {
  const root = new Group();
  root.rotation.y = Math.PI;
  root.position.set(0.1, 0, -2.2);
  const pivot = new Group();
  pivot.position.set(0.5 * s, 1.26 * s, 0);
  pivot.rotation.set(0.18, 0, 0.14); // FF2's rest pose, to be overwritten
  const elbow = new Group();
  elbow.position.y = -0.5 * s;
  const wrist = new Group();
  wrist.position.y = -0.42 * s;
  const fist = new Group();
  fist.position.y = -0.15 * s;
  root.add(pivot);
  pivot.add(elbow);
  elbow.add(wrist);
  wrist.add(fist);
  return { root, fist, chain: { pivot, elbow, wrist, upper: 0.5 * s, fore: 0.42 * s, fistLen: 0.15 * s }, s };
}

const fistAt = (a) => {
  a.root.updateMatrixWorld(true);
  return a.root.worldToLocal(a.fist.getWorldPosition(new Vector3()));
};

let rng = 7;
const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);

// In reach, every direction.
{
  const a = arm();
  const pole = new Vector3(0.7, -0.6, 0.4);
  let worst = 0;
  for (let i = 0; i < 400; i++) {
    const dir = new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();
    const d = 0.25 + rand() * 1.1; // L1 + L2 = 1.34 at s = 1.25
    const target = new Vector3().copy(a.chain.pivot.position).addScaledVector(dir, d);
    const ext = reach(a.chain, target, pole, 0.6);
    worst = Math.max(worst, fistAt(a).distanceTo(target), ext > 0 && d < 1.3 ? 1 : 0);
  }
  check('in reach, the fist lands on the target, any direction, without telescoping', worst < 1e-3, `worst miss ${(worst * 1000).toFixed(3)} mm`);
}

// Out of reach: telescope, then stop short on the line.
{
  const a = arm();
  const pole = new Vector3(0.7, -0.6, 0.4);
  const S = a.chain.pivot.position.clone();
  const t1 = S.clone().add(new Vector3(0.2, -0.1, -1.6)); // 1.62: needs ~0.3 of telescope
  const e1 = reach(a.chain, t1, pole, 0.6);
  check('just out of reach, the forearm telescopes onto it', e1 > 0.2 && fistAt(a).distanceTo(t1) < 1e-3, `ext ${e1.toFixed(3)}`);
  const t2 = S.clone().add(new Vector3(0, 0, -4));
  const e2 = reach(a.chain, t2, pole, 0.6);
  const f = fistAt(a);
  const onLine = segmentDistance(S, t2, f) < 1e-3;
  check('far out of reach, fully telescoped and short on the line', Math.abs(e2 - 0.6) < 1e-9 && onLine, `fist ${f.distanceTo(S).toFixed(3)} from the shoulder`);
}

// The elbow goes where the pole says.
{
  const a = arm();
  const S = a.chain.pivot.position.clone();
  const target = S.clone().add(new Vector3(0, -0.2, -0.7));
  for (const pole of [new Vector3(1, 0, 0), new Vector3(0, -1, 0)]) {
    reach(a.chain, target, pole, 0.6);
    a.root.updateMatrixWorld(true);
    const e = a.root.worldToLocal(a.chain.elbow.getWorldPosition(new Vector3())).sub(S);
    const along = e.dot(pole);
    check(`the elbow bends toward its pole (${pole.toArray().join(',')})`, along > 0.1, `${along.toFixed(3)} m that way`);
  }
}

// Strike paths.
{
  const from = new Vector3(0.6, 1.3, -1.6);
  const head = new Vector3(0.05, 1.6, 0);
  const outward = new Vector3(1, 0, 0);
  for (const path of ['jab', 'hook', 'overhand', 'sweep']) {
    const p0 = strikePoint(path, from, head, outward, 0, new Vector3());
    let nearest = Infinity;
    const prev = p0.clone();
    for (let i = 1; i <= 200; i++) {
      const p = strikePoint(path, from, head, outward, i / 200, new Vector3());
      nearest = Math.min(nearest, segmentDistance(prev, p, head));
      prev.copy(p);
    }
    check(`the ${path} starts at the windup and passes through your head`, p0.distanceTo(from) < 1e-9 && nearest < 1e-3, `${(nearest * 1000).toFixed(2)} mm`);
  }
  const w = windupOffset('overhand', 1, new Vector3());
  check('the overhand winds up high', w.y > 0.3);
}

// The grammar.
{
  const moves = ['jab', 'hook', 'overhand', 'sweep', 'beam'].map((path) => ({ path }));
  let last = null;
  let repeats = 0;
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const m = pickStrike(moves, { jab: 3, hook: 3, overhand: 2, sweep: 2, beam: 2 }, last, rand);
    if (m.path === last) repeats++;
    seen.add(m.path);
    last = m.path;
  }
  check('the grammar never repeats a move', repeats === 0);
  check('and uses the whole roster', seen.size === 5, [...seen].join(' · '));
  const none = pickStrike(moves, { jab: 1 }, 'jab', rand);
  check('with one move left, it still answers', none.path === 'jab');
}

const bad = results.filter((r) => !r).length;
console.log(`\n${bad === 0 ? 'ALL PASS' : `${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);

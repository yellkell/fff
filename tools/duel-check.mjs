#!/usr/bin/env node
/**
 * THE DUEL'S LAWS, headless (src/duel/brain.ts, body.ts and aim.ts, run
 * under Node's type stripping). Proves: every rung is exactly its row of
 * FF2's ladder and the blend between rungs is a ramp, not a cliff; mercy
 * softens only the lower rungs, only while you trail, and only so far; a
 * body solved from a head stands, ducks, sits and leans the way yours does;
 * a bot's throw arrives where it was aimed at every speed and range on the
 * ladder; and the dodge is real: a throw at a head that stays put hits it,
 * and stepping aside after the release takes the whole body out of its path.
 *
 *   npm run check:duel
 */

import { Vector3 } from 'three';
import { BODY, BOT, BOT_LADDER, BOT_MERCY, FIREBALL } from '../src/config.ts';
import { aimThrow } from '../src/duel/aim.ts';
import { makeBody, solveBody } from '../src/duel/body.ts';
import { brainFor, brainForSkill, mercyFor, skillForRung } from '../src/duel/brain.ts';
import { segmentDistance } from '../src/titans/strike.ts';

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// ── THE LADDER ──
{
  let exact = true;
  for (let r = 0; r < BOT_LADDER.length; r++) {
    const b = brainFor(r);
    for (const [k, v] of Object.entries(BOT_LADDER[r])) if (typeof v === 'number' ? !near(b[k], v) : b[k] !== v) exact = false;
  }
  check('every rung is exactly its row of the ladder', exact, BOT_LADDER.map((r) => r.label).join(' → '));

  // Sharper all the way up: quicker cadence, faster balls, truer aim.
  let ramp = true;
  let prev = brainForSkill(0);
  for (let s = 0.01; s <= 1.0001; s += 0.01) {
    const b = brainForSkill(s);
    if (b.throwInterval > prev.throwInterval + 1e-9 || b.throwSpeed < prev.throwSpeed - 1e-9 || b.aimError > prev.aimError + 1e-9) ramp = false;
    prev = b;
  }
  check('between rungs it is a ramp: never slower, never sloppier', ramp);

  const mid = brainForSkill((skillForRung(2) + skillForRung(3)) / 2);
  check(
    'halfway between two rungs is halfway between their numbers',
    near(mid.throwInterval, (BOT_LADDER[2].throwInterval + BOT_LADDER[3].throwInterval) / 2, 1e-6),
    `throw interval ${mid.throwInterval.toFixed(3)}`,
  );
  const top = BOT_LADDER.at(-1);
  check('the top rung is still slower than your hardest haymaker', top.throwSpeed < 8.5, `${top.throwSpeed} m/s`);
}

// ── MERCY ──
{
  check('no mercy while you lead or draw', mercyFor(1, 1, 1) === 0 && mercyFor(1, 1, 0) === 0);
  check('trailing a round softens a lower rung', near(mercyFor(1, 0, 1), BOT_MERCY.perRound) && brainFor(1, 0, 1).throwInterval > brainFor(1).throwInterval);
  check('never by more than the cap', near(mercyFor(0, 0, 9), BOT_MERCY.max));
  check('the upper rungs get the bot they asked for', mercyFor(BOT_MERCY.belowRung, 0, 3) === 0 && brainFor(BOT_MERCY.belowRung, 0, 3).skill === skillForRung(BOT_MERCY.belowRung));
}

// ── THE BODY ──
{
  const body = makeBody();
  const [head, chest, pelvis] = body;
  solveBody(body, new Vector3(0, 1.6, 0), 0);
  check('standing: hips at hip height, behind the face', near(pelvis.pos.y, BODY.hipHeight) && near(pelvis.pos.z, BODY.spineSetBack), `pelvis (${pelvis.pos.toArray().map((v) => v.toFixed(2))})`);
  check(
    'the chest sits between them, clear of the head',
    chest.pos.y > pelvis.pos.y && chest.pos.y + chest.radius <= head.pos.y - head.radius + 1e-9,
    `chest top ${(chest.pos.y + chest.radius).toFixed(3)}, chin ${(head.pos.y - head.radius).toFixed(3)}`,
  );
  solveBody(body, new Vector3(0, 1.0, 0), 0);
  check('a deep duck pulls the hips down with it', near(pelvis.pos.y, 1.0 - BODY.hipBelowHead) && chest.pos.y < 1.0);
  solveBody(body, new Vector3(0.4, 1.5, 0), 0);
  check('a lean sideways swings the whole torso', near(pelvis.pos.x, 0.4) && near(chest.pos.x, 0.4));
  solveBody(body, new Vector3(0, 1.5, -3), Math.PI);
  check('turned round (the rival), its spine is behind its face too', near(pelvis.pos.z, -3 - BODY.spineSetBack), `pelvis z ${pelvis.pos.z.toFixed(3)}`);
}

/** Fly a ball under gravity; its closest approach to `p`, and the path. */
function fly(from, vel, steps = 400, dt = 1 / 120) {
  const pos = from.clone();
  const v = vel.clone();
  const path = [pos.clone()];
  for (let i = 0; i < steps; i++) {
    v.y -= FIREBALL.gravity * dt;
    pos.addScaledVector(v, dt);
    path.push(pos.clone());
  }
  return path;
}
const closest = (path, p) => {
  let best = Infinity;
  for (let i = 1; i < path.length; i++) best = Math.min(best, segmentDistance(path[i - 1], path[i], p));
  return best;
};

// ── THE THROW ──
{
  let worst = 0;
  for (const row of BOT_LADDER) {
    for (const z of [-2.4, -3, -3.6]) {
      for (const dy of [-0.6, -0.2, 0.15]) {
        for (const dx of [-0.6, 0, 0.6]) {
          const from = new Vector3(0.2, 1.3, z);
          const to = new Vector3(dx, 1.6 + dy, 0);
          const miss = closest(fly(from, aimThrow(from, to, row.throwSpeed, FIREBALL.gravity)), to);
          worst = Math.max(worst, miss);
        }
      }
    }
  }
  check('every rung’s throw arrives where it was aimed', worst < BODY.headRadius * 0.5, `worst miss ${(worst * 100).toFixed(1)} cm over every speed, range and height`);
}

// ── THE DODGE ──
{
  const from = new Vector3(0.25, BOT.headY - 0.13, -3 + 0.18);
  const headAt = new Vector3(0, 1.6, 0);
  const slow = BOT_LADDER[0].throwSpeed;
  const path = fly(from, aimThrow(from, headAt, slow, FIREBALL.gravity));
  const body = solveBody(makeBody(), headAt, 0);
  const hits = (b) => b.filter((s) => closest(path, s.pos) <= s.radius + FIREBALL.radius).map((s) => s.part);
  const still = hits(body);
  check('a throw at a head that stays put hits it', still.includes('head'), still.join(', '));
  const stepped = hits(solveBody(makeBody(), new Vector3(0.45, 1.6, 0), 0));
  check('a step of 45 cm aside after the release takes your whole body out of its path', stepped.length === 0, stepped.length ? `still hits ${stepped.join(', ')}` : 'clean miss');
  const ducked = hits(solveBody(makeBody(), new Vector3(0, 1.15, 0), 0));
  check('a duck under a head-high throw lets it sail over', !ducked.includes('head'), ducked.length ? `hits ${ducked.join(', ')}` : 'clean miss');
  const low = new Vector3(0, 1.6 - BOT.lowAimDrop, 0);
  const lowPath = fly(from, aimThrow(from, low, slow, FIREBALL.gravity));
  const lowHit = body.filter((s) => closest(lowPath, s.pos) <= s.radius + FIREBALL.radius).map((s) => s.part);
  check('a low throw finds your hips, not your head', lowHit.length > 0 && !lowHit.includes('head'), lowHit.join(', '));
}

const bad = results.filter((r) => !r).length;
console.log(`\n${bad === 0 ? 'ALL PASS' : `${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);

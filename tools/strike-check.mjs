#!/usr/bin/env node
/**
 * THE REACH AND THE STRIKE, headless (src/titans/ik.ts and strike.ts, run
 * under Node's type stripping). Builds a titan-shaped arm chain and proves:
 * the fist lands on any target in reach, in any direction, whatever the
 * rig's conventions; out of reach it telescopes, then stops short on the
 * line; the elbow bends toward its pole; every strike path starts at the
 * windup and passes through your head; a spinning blow turns its back on
 * you, rides the turn in and lands on you; and the grammar never repeats a move.
 *
 *   npm run check:strike
 */

import { Group, Vector3 } from 'three';
import { reach } from '../src/titans/ik.ts';
import { armsOf, isSpin, lob, pickStrike, segmentDistance, SPIN, spinPoint, spinTurn, strikePoint, windupOffset } from '../src/titans/strike.ts';
import { WeakCycle } from '../src/titans/weak.ts';
import { DECREE, laneXs, planDecree } from '../src/titans/decree.ts';
import { BOUTS, freshCareer, LAST, record, stakes } from '../src/game/career.ts';

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
  for (const path of ['jab', 'hook', 'overhand', 'sweep', 'piston', 'clap']) {
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

// The spinning blows: back to you for the tell, a whole revolution, and
// the fist riding the turn in to land on you.
{
  check('the backfist and hammerfist spin; nothing else does', isSpin('spinback') && isSpin('spinhammer') && !isSpin('hook') && !isSpin('sweep'));
  const at = (stage, u, from) => spinTurn(stage, u, from);
  const seams = [
    Math.abs(at('windup', 0) - 0),
    Math.abs(at('windup', 1) - at('strike', 0)),
    Math.abs(at('strike', 1) - SPIN.contact),
    Math.abs(at('recover', 0) - SPIN.contact),
    Math.abs(at('recover', 1) - 2 * Math.PI),
  ];
  check('its turn runs 0 → 2π with no jumps between stages', Math.max(...seams) < 1e-9);
  const back = at('windup', 1);
  check('by the windup’s end its back is to you', Math.abs(back - Math.PI) < 0.5, `${((back / Math.PI) * 180).toFixed(0)}°`);
  const cut = at('recover', 1, 1.2 * Math.PI);
  check('a blocked spin still finishes the revolution', Math.abs(cut - 2 * Math.PI) < 1e-9 && Math.abs(at('recover', 0, 1.2 * Math.PI) - 1.2 * Math.PI) < 1e-9);

  // A titan at its stage spot, facing you, striking with its +x arm (side
  // 1). The fist sits still in the titan's own frame (its arm locked out)
  // and the body's turn carries it.
  const axis = new Vector3(0, 0, -1.6);
  const head = new Vector3(0.1, 1.6, 0);
  for (const side of [-1, 1]) {
    const local = [];
    const pts = [];
    for (let i = 0; i <= 100; i++) {
      const u = i / 100;
      const turn = spinTurn('strike', u);
      const p = spinPoint('spinback', axis, head, side * (SPIN.contact - turn), u, new Vector3());
      pts.push(p);
      // Into the titan's frame: undo its whole yaw (π to face you, plus the spin).
      const yaw = Math.PI - side * turn;
      local.push(p.clone().sub(axis).applyAxisAngle(new Vector3(0, 1, 0), -yaw));
    }
    const drift = Math.max(...local.map((l) => l.distanceTo(local[0])));
    check(`the backfist (arm ${side}) rides the turn, locked out in the titan's frame`, drift < 1e-9, `${(drift * 1000).toFixed(4)} mm`);
    check(`and lands exactly on your head`, pts[100].distanceTo(head) < 1e-9);
    check(`level all the way, at your head's height`, pts.every((p) => Math.abs(p.y - head.y) < 1e-9));
    const r = Math.hypot(head.x - axis.x, head.z - axis.z);
    check('on a circle about its spine', pts.every((p) => Math.abs(Math.hypot(p.x - axis.x, p.z - axis.z) - r) < 1e-9));
    // It comes round from one side: the head-on line's far side, opposite
    // the arm (in world x, with the titan facing +z, its +x arm is at −x).
    check('coming in from the side', Math.sign(pts[80].x - head.x) === side && Math.abs(pts[80].x - head.x) > 0.2, `${(pts[80].x - head.x).toFixed(2)} m out at 80%`);
  }
  const h0 = spinPoint('spinhammer', axis, head, 0.3, 0, new Vector3());
  const h1 = spinPoint('spinhammer', axis, head, 0, 1, new Vector3());
  check('the hammerfist comes down on you from above', h0.y - head.y > 0.5 && h1.distanceTo(head) < 1e-9, `${(h0.y - head.y).toFixed(2)} m over you at the start`);
  check('the backfist folds across the chest; the hammer winds up high', windupOffset('spinback', 1, new Vector3()).x < 0 && windupOffset('spinhammer', 1, new Vector3()).y > 0.3);
}

// The career: a belt at every step, a defence that can strip it, and a
// world champion who defends forever.
{
  const c = freshCareer();
  const titans = BOUTS.map((b) => b.titan).join();
  check('the career walks the roster: RUSTHOOK to GOLIATH, then GOLIATH again', titans === '0,1,2,3,4,4', titans);
  const lostFirst = record(c, 0, false);
  check('losing a bout holds you there', c.next === 0 && !lostFirst.won && !lostFirst.lost);
  const wins = [0, 1, 2].map((i) => record(c, i, true).won);
  check('the amateur, national and intercontinental bouts each win their belt', wins.join() === 'amateur,national,intercontinental' && c.next === 3, wins.join());
  check('a title fight is for its belt', stakes(c, 4) === 'FOR THE WORLD BELT');
  check('a defence puts yours on the line', stakes(c, 3) === 'YOUR INTERCONTINENTAL BELT ON THE LINE');
  const lost = record(c, 3, false);
  check('lose a defence and the belt is stripped, and you go again', lost.lost === 'intercontinental' && !c.held.includes('intercontinental') && c.next === 3);
  check('the rematch is to win it back', stakes(c, 3) === 'TO WIN THE INTERCONTINENTAL BELT BACK');
  const back = record(c, 3, true);
  check('win it and it is back, and the world title opens', back.won === 'intercontinental' && c.held.includes('intercontinental') && c.next === 4);
  record(c, 4, true);
  const d1 = record(c, LAST, true);
  const d2 = record(c, LAST, true);
  check('the world champion defends, again and again, counted', d1.kept === 'world' && d2.kept === 'world' && c.defences.world === 2 && c.next === LAST);
  const replay = record(c, 0, true);
  check('an old bout won again changes nothing', !replay.won && !replay.kept && c.held.length === 4 && c.next === LAST);
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

// The clap: both arms, each from its own side, meeting on you.
{
  check('a clap swings both arms', armsOf({ limb: 'both' }).join() === '0,1' && armsOf({ limb: 0 }).join() === '0' && armsOf({ limb: 'eye' }).length === 0);
  const head = new Vector3(0, 1.6, 0);
  const ends = [-1, 1].map((side) => {
    const from = new Vector3(side * 0.9, 1.7, -1.4);
    const outward = new Vector3(side, 0, 0);
    const mid = strikePoint('clap', from, head, outward, 0.5, new Vector3());
    return { side, mid, end: strikePoint('clap', from, head, outward, 1, new Vector3()) };
  });
  check('each clap arm comes in from its own side, and both end on your head', ends.every((e) => Math.sign(e.mid.x) === e.side && e.end.distanceTo(head) < 1e-9));
}

// The mortar's lob: a shell launched with it lands where it was aimed, on time.
{
  let worst = 0;
  let apex = 0;
  for (let i = 0; i < 50; i++) {
    const from = new Vector3(rand() * 1.4 - 0.7, 1.8 + rand() * 0.4, -2.2 + rand() * 0.4);
    const to = new Vector3(rand() * 1.4 - 0.7, 1.1 + rand() * 0.7, rand() * 0.6 - 0.3);
    const v = lob(from, to, 1.05, 2.8, new Vector3());
    const p = from.clone();
    const dt = 1 / 2000;
    for (let t = 0; t < 1.05 - 1e-9; t += dt) {
      v.y -= 2.8 * dt;
      p.addScaledVector(v, dt);
      apex = Math.max(apex, p.y);
    }
    worst = Math.max(worst, p.distanceTo(to));
  }
  check('a lobbed shell lands where it was aimed', worst < 0.01, `${(worst * 1000).toFixed(1)} mm`);
  check('and clears an ordinary ceiling', apex < 2.5, `apex ${apex.toFixed(2)} m`);
}

// The weak points: every pattern opens in its order.
{
  const walk = (pattern, n) => {
    const w = new WeakCycle(pattern);
    const seen = [];
    for (let i = 0; i < n; i++) {
      seen.push(w.open);
      w.hit();
    }
    return { seen, w };
  };
  check("'both' keeps the visor and core open", walk('both', 3).seen.every((o) => o === 'both') && new WeakCycle('both').isOpen('head') && !new WeakCycle('both').has('low'));
  check("'alternate' swaps every hit, the core first", walk('alternate', 4).seen.join() === 'core,head,core,head');
  check("'double' swaps every second hit", walk('double', 6).seen.join() === 'core,core,head,head,core,core');
  check("'triple' walks visor, core, low", walk('triple', 4).seen.join() === 'head,core,low,head');
  const crown = walk('crown', 15);
  check("the crown walks all five stops, three times round in fifteen hits", crown.seen.slice(0, 5).join() === 'head,shoulderL,core,shoulderR,low' && crown.w.loops === 3);
  const t = new WeakCycle('triple');
  check('a shut weak point is shut', t.isOpen('head') && !t.isOpen('core') && !t.isOpen('low'));
}

// The decree: always a gap you can stand in, always somewhere you aren't.
{
  const xs = laneXs();
  const kill = 0.06 + 0.11; // bolt radius + head radius
  let worstBand = Infinity;
  let nearest = Infinity;
  let offPad = 0;
  for (let i = 0; i < 400; i++) {
    const head = rand() * 1.6 - 0.8;
    const p = planDecree(head, rand);
    // Every lane fired but two, and the gap between its neighbours.
    const left = Math.max(...p.lanes.filter((x) => x < p.gap));
    const right = Math.min(...p.lanes.filter((x) => x > p.gap));
    worstBand = Math.min(worstBand, right - left - 2 * kill);
    nearest = Math.min(nearest, Math.abs(p.gap - head));
    if (Math.abs(p.gap) > 0.86 - 0.15) offPad++;
    if (p.lanes.length !== xs.length - 2) offPad++;
  }
  check('a decree fires all but two lanes and leaves a gap a head fits in', worstBand >= 0.25, `safe band ${(worstBand * 100).toFixed(0)} cm`);
  check('the gap is never where you already stand', nearest >= DECREE.away - 1e-9, `nearest ${(nearest * 100).toFixed(0)} cm away`);
  check('the gap is always well on the pad', offPad === 0);
}

const bad = results.filter((r) => !r).length;
console.log(`\n${bad === 0 ? 'ALL PASS' : `${bad} FAILURE(S)`}`);
process.exit(bad === 0 ? 0 : 1);

#!/usr/bin/env node
/**
 * SMOKE, headless: the page boots in the IWSDK desktop emulator, offers
 * the passthrough session and enters it, onto the CONSOLE. Then the
 * emulator's HANDS drive everything with real fingertip pokes: a locked
 * card refuses, PRACTICE starts; the whole fireball loop plays (a pinch
 * lights the ball, a punch that opens throws it, a lazy open just drops it
 * back, a pinch while it's away recalls it and a held pinch catches it);
 * a palm turned up and looked at opens the WRIST PANEL, whose LEAVE goes
 * home. Then TITANS: RUSTHOOK prints in; a jab lands on a still head,
 * misses one that steps aside after the windup, and bounces off an open
 * palm; the eye beam lands; a thrown ball hits it; and felling it brings
 * the console back on its results face. Last, from off-centre, RECENTRE
 * puts the pad back under you. Throughout, the sound: it starts with the
 * Enter press, every moment above fires its sound, and SOUND on the wrist
 * panel mutes it and brings it back; and the music follows along (Overtime
 * at the console, Aim in practice, a battle track in the fight, the victory
 * sting, then Overtime again), with MUSIC muting it. No page errors
 * throughout.
 * (The fist path is proven joint by joint in check:hands; the emulator's
 * hands only know open and pinch.)
 *
 *   npm run dev              # terminal 1
 *   npm run check:smoke [-- --shots]
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.PREVIEW_BASE ?? 'http://localhost:5173';
const shots = process.argv.includes('--shots');
const here = dirname(fileURLToPath(import.meta.url));

async function launch() {
  const args = ['--ignore-certificate-errors'];
  try {
    return await chromium.launch({ args });
  } catch {
    return chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args });
  }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 900, height: 600 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  // A blocked CDN or a missing favicon is the network, not the game.
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

await page.goto(base, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.goto(base));
const offered = await page
  .waitForFunction(() => !document.getElementById('enter').disabled, { timeout: 30000 })
  .then(() => true, () => false);
check('the passthrough session is offered', offered, await page.textContent('#status'));
if (offered) {
  await page.click('#enter');
  const entered = await page
    .waitForFunction(() => document.body.classList.contains('in-xr'), { timeout: 20000 })
    .then(() => true, () => false);
  check('entering starts the session', entered);
  await page.evaluate(() => {
    window.IWER_DEVICE.primaryInputMode = 'hand';
  });
  await page.waitForTimeout(1000);
  const R = () => page.evaluate(() => ({ hand: window.__flux.hands().right, ball: window.__flux.balls()[1] }));
  const S = () =>
    page.evaluate(() => ({ mode: window.__flux.mode(), wrist: window.__flux.wristOpen(), buttons: window.__flux.buttons() }));
  const pinch = (v) => page.evaluate((v) => window.IWER_DEVICE.hands.right.updatePinchValue(v), v);
  const settle = (ms = 400) => page.waitForTimeout(ms);
  /** Place a device through the emulator's remote-control queue (its panel
   *  re-seats hands every frame, but respects this). */
  const place = (device, position, orientation) =>
    page.evaluate(
      ({ device, position, orientation }) =>
        window.IWER_DEVICE.remote.dispatch('set_transform', { device, position, ...(orientation ? { orientation } : {}) }),
      { device, position, orientation },
    );
  const lookAt = (target) =>
    page.evaluate((target) => window.IWER_DEVICE.remote.dispatch('look_at', { device: 'headset', target }), target);
  /** A finger that arrives from the SIDE, already 2 cm deep, and sweeps
   *  across the face: it must not press anything. */
  const sweep = (id, side = 'right') =>
    page.evaluate(
      async ({ id, side }) => {
        const d = window.IWER_DEVICE;
        const dev = `hand-${side}`;
        const raf = () => new Promise(requestAnimationFrame);
        const b = window.__flux.buttons()[id];
        const tr = await d.remote.dispatch('get_transform', { device: dev });
        const tip = window.__flux.hands()[side].indexTip;
        const off = [tip[0] - tr.position.x, tip[1] - tr.position.y, tip[2] - tr.position.z];
        for (let a = 0.14; a >= -0.001; a -= 0.01) {
          const p = [0, 1, 2].map((i) => b.centre[i] - b.normal[i] * 0.02 + b.across[i] * a - off[i]);
          await d.remote.dispatch('set_transform', { device: dev, position: { x: p[0], y: p[1], z: p[2] } });
          await raf();
        }
        await d.remote.dispatch('set_transform', { device: dev, position: tr.position });
        for (let i = 0; i < 3; i++) await raf();
      },
      { id, side },
    );
  /** A real poke: carry the fingertip straight at the button's face from
   *  8 cm out, 2.5 cm through it, and back out, a few millimetres a frame. */
  const poke = (id, side = 'right') =>
    page.evaluate(
      async ({ id, side }) => {
        const d = window.IWER_DEVICE;
        const dev = `hand-${side}`;
        const raf = () => new Promise(requestAnimationFrame);
        const b = window.__flux.buttons()[id];
        const tr = await d.remote.dispatch('get_transform', { device: dev });
        const tip = window.__flux.hands()[side].indexTip;
        const off = [tip[0] - tr.position.x, tip[1] - tr.position.y, tip[2] - tr.position.z];
        const at = (k) => ({
          x: b.centre[0] + b.normal[0] * k - off[0],
          y: b.centre[1] + b.normal[1] * k - off[1],
          z: b.centre[2] + b.normal[2] * k - off[2],
        });
        const path = [];
        for (let k = 0.08; k >= -0.025; k -= 0.005) path.push(k);
        for (let k = -0.025; k <= 0.08; k += 0.01) path.push(k);
        for (const k of path) {
          await d.remote.dispatch('set_transform', { device: dev, position: at(k) });
          await raf();
        }
        await d.remote.dispatch('set_transform', { device: dev, position: tr.position });
        for (let i = 0; i < 3; i++) await raf();
      },
      { id, side },
    );
  /** A punch: the right hand driven down −z at `speed` m/s for `secs`, on
   *  the page's own frames and timed by its clock (a slow headless frame
   *  mustn't turn a punch into a lazy push). With `release` the hand opens
   *  halfway and keeps travelling, a follow-through: the emulator animates
   *  a pinch opening over several frames, and a hand that's already
   *  stopped by the time it reads as open is (rightly) a drop, not a throw. */
  const HOME = { x: 0.25, y: 1.5, z: -0.4 };
  const swing = (release, from = HOME, speed = 3.5, secs = 0.36) =>
    page.evaluate(
      async ({ release, from, speed, secs }) => {
        const d = window.IWER_DEVICE;
        const t0 = performance.now();
        for (;;) {
          const t = Math.min(secs, (performance.now() - t0) / 1000);
          await d.remote.dispatch('set_transform', { device: 'hand-right', position: { ...from, z: from.z - speed * t } });
          if (release && t >= secs / 2) d.hands.right.updatePinchValue(0);
          await new Promise(requestAnimationFrame);
          if (t >= secs) break;
        }
        for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
      },
      { release, from, speed, secs },
    );
  const home = () => place('hand-right', HOME);
  /** Chest height, centre-right: a straight punch from here is on the core. */
  const AIM = { x: 0.12, y: 1.32, z: -0.4 };
  /** Turn the left palm up just below the eyes, in front of `head`
   *  (position, yaw), and look at it. */
  const PALM_UP = { x: 0, y: 0, z: 1, w: 0 };
  const PALM_DOWN = { x: 0, y: 0, z: 0, w: 1 };
  const palmUp = async (head = { x: 0, z: 0, yaw: 0 }) => {
    const fx = -Math.sin(head.yaw);
    const fz = -Math.cos(head.yaw);
    await place('hand-left', { x: head.x + fx * 0.3 - fz * 0.05, y: 1.22, z: head.z + fz * 0.3 + fx * 0.05 }, PALM_UP);
    await settle(150);
    const palm = (await page.evaluate(() => window.__flux.hands().left.palm));
    await lookAt({ x: palm[0], y: palm[1], z: palm[2] });
    await settle(600);
  };
  const palmDown = async () => {
    await place('hand-left', { x: -0.25, y: 1.5, z: -0.4 }, PALM_DOWN);
    await place('headset', { x: 0, y: 1.6, z: 0 }, { x: 0, y: 0, z: 0, w: 1 });
    await settle(600);
  };

  // ── THE CONSOLE ──
  await settle(600); // let it finish rising
  const SND = () => page.evaluate(() => window.__flux.sound());
  // Make sure a remembered SOUND OFF from an earlier run doesn't carry in.
  await page.evaluate(() => localStorage.removeItem('flux-sound'));
  const snd0 = await SND();
  check('sound starts with the Enter press', snd0.state === 'running', snd0.state);
  const MUS = () => page.evaluate(() => window.__flux.music());
  const musicIs = async (cue, track, ms = 12000) => {
    const end = Date.now() + ms;
    let m = await MUS();
    while (Date.now() < end && !(m.cue === cue && m.playing && (!track || track(m.track)))) {
      await page.waitForTimeout(100);
      m = await MUS();
    }
    return m;
  };
  await page.evaluate(() => localStorage.removeItem('flux-music'));
  let m = await musicIs('home', (tr) => tr === 'overtime');
  check('the console plays Overtime', m.cue === 'home' && m.track === 'overtime' && m.playing, `${m.cue} · ${m.track} · level ${m.level.toFixed(2)}`);
  let s = await S();
  check('you arrive at the console', s.mode === 'home' && s.buttons.practice?.active, s.mode);
  check('no balls at the console', (await page.evaluate(() => window.__flux.balls())).length === 2);
  await poke('1v1');
  s = await S();
  check('a locked card refuses', s.mode === 'home' && s.buttons['1v1'].presses === 0 && s.buttons['1v1'].refusals === 1);
  await settle(350); // one poke, one action: past the cooldown
  await sweep('practice');
  s = await S();
  check('a finger sliding in from the side presses nothing', s.mode === 'home' && s.buttons.practice.presses === 0);
  await settle(350);
  await poke('practice');
  s = await S();
  check('poking PRACTICE starts practice', s.mode === 'practice' && s.buttons.practice.presses === 1, s.mode);
  await settle(700); // the console sinks away
  s = await S();
  check('the console sinks and sleeps', !s.buttons.practice.active);
  m = await musicIs('practice', (tr) => tr === 'aim');
  check('practice plays Aim', m.cue === 'practice' && m.track === 'aim' && m.playing, `${m.cue} · ${m.track}`);

  // ── THE FIREBALL LOOP ──
  let r = await R();
  check('the emulated hand is tracked, open', r.hand.tracked && !r.hand.closed, `curl ${r.hand.curl?.toFixed(2)}`);
  check('its ball hovers', r.ball === 'hover');
  await pinch(1);
  await settle();
  r = await R();
  check('a pinch lights it into orbit', r.hand.closed && r.ball === 'orbit');
  // A lazy open: the hand barely moving.
  await pinch(0);
  await settle();
  check('opening a still hand drops it back to hover', (await R()).ball === 'hover');
  await pinch(1);
  await settle();
  // A punch, opening at the end.
  await swing(true);
  r = await R();
  check('a punch that opens throws it', r.ball === 'flying', r.ball);
  await home();
  await settle(700); // past the recall lockout
  await pinch(1);
  await settle(120);
  r = await R();
  check('a pinch while it flies recalls it', r.ball === 'returning', r.ball);
  await settle(1200);
  check('held pinch: caught into orbit', (await R()).ball === 'orbit');
  await pinch(0);
  await settle();

  {
    const log = (await SND()).log;
    const need = ['consoleRise', 'consoleSink', 'uiClick', 'uiDenied', 'ignite', 'drop', 'throw', 'recall', 'catch'];
    const missing = need.filter((n) => !log[n]);
    check('the menus and the fireball loop all make their sounds', missing.length === 0, missing.length ? `silent: ${missing.join(', ')}` : need.join(' · '));
  }

  // ── THE WRIST PANEL ──
  await palmUp();
  s = await S();
  const pn = (await page.evaluate(() => window.__flux.hands().left.palmNormal));
  check('palm up and looked at: the wrist panel opens', s.wrist && s.buttons.leave.active, `palm normal y ${pn[1].toFixed(2)}`);
  await pinch(1);
  await settle(200);
  check('a hand shape does nothing while it is open', (await R()).ball === 'hover');
  await pinch(0);
  await settle(200);
  await poke('sound');
  await settle(300);
  let snd = await SND();
  check('SOUND on the wrist panel switches it off', snd.muted && snd.gain < 0.01, `gain ${snd.gain.toFixed(3)}`);
  await settle(350);
  await poke('sound');
  await settle(300);
  snd = await SND();
  check('and back on', !snd.muted && snd.gain > 0.5, `gain ${snd.gain.toFixed(3)}`);
  await settle(350);
  await poke('music');
  await settle(300);
  m = await MUS();
  check('MUSIC on the wrist panel switches it off', m.muted && m.bus < 0.01, `bus ${m.bus.toFixed(3)}`);
  await settle(350);
  await poke('music');
  await settle(300);
  m = await MUS();
  check('and back on', !m.muted && m.bus > 0.9, `bus ${m.bus.toFixed(3)}`);
  await settle(350);
  await poke('leave');
  s = await S();
  check('LEAVE goes back to the console', s.mode === 'home' && s.buttons.leave.presses === 1, s.mode);
  await palmDown();
  check('palm turned over: the wrist panel closes', !(await S()).wrist);

  await page.waitForTimeout(500);

  // ── TITANS ──
  const T = () => page.evaluate(() => window.__flux.titan());
  const debug = (patch) => page.evaluate((p) => Object.assign(window.__flux.titanDebug, p), patch);
  const until = async (fn, ms = 8000) => {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      const t = await T();
      if (fn(t)) return t;
      await page.waitForTimeout(40);
    }
    return T();
  };
  // Hands out of the way unless a test puts them somewhere.
  const handsDown = async () => {
    await place('hand-left', { x: -0.55, y: 0.5, z: 0.2 }, PALM_DOWN);
    await place('hand-right', { x: 0.55, y: 0.5, z: 0.2 }, PALM_DOWN);
  };
  await debug({ hold: true });
  await poke('titans');
  let t = await T();
  check('poking TITANS starts the fight', (await S()).mode === 'titans' && (t.phase === 'rising' || t.phase === 'fight'), t.phase);
  await handsDown();
  t = await until((x) => x.phase === 'fight');
  check('RUSTHOOK prints into the room', t.phase === 'fight');
  m = await musicIs('titans', (tr) => tr && tr !== 'aim' && tr !== 'overtime');
  check('a battle track plays under the fight', m.cue === 'titans' && m.playing && m.tracks === 6, `${m.track} (one of ${m.tracks})`);

  await debug({ force: 'jab' });
  t = await until((x) => x.act === null && x.hitsTaken > 0, 10000);
  check('a jab lands on a head that stays put', t.hitsTaken === 1 && t.playerHp < 1, `your health ${t.playerHp.toFixed(2)}`);

  await debug({ force: 'jab' });
  await until((x) => x.act?.stage === 'strike');
  await place('headset', { x: 0.55, y: 1.6, z: 0 });
  t = await until((x) => x.act === null || x.act.stage === 'recover');
  await settle(300);
  t = await T();
  check('stepping aside after the windup makes it miss', t.hitsTaken === 1, `hits taken ${t.hitsTaken}`);
  await place('headset', { x: 0, y: 1.6, z: 0 });
  await until((x) => x.act === null);

  // An open palm facing it, in front of your face.
  const PALM_OUT = { x: 0.5, y: 0, z: 0, w: 0.8660254 };
  await place('hand-left', { x: 0, y: 1.5, z: -0.3 }, PALM_OUT);
  await settle(150);
  const pl = await page.evaluate(() => window.__flux.hands().left);
  const want = [0.0, 1.55, -0.28];
  const lt = await page.evaluate(() => window.IWER_DEVICE.remote.dispatch('get_transform', { device: 'hand-left' }));
  await place('hand-left', { x: lt.position.x + want[0] - pl.palm[0], y: lt.position.y + want[1] - pl.palm[1], z: lt.position.z + want[2] - pl.palm[2] }, PALM_OUT);
  await settle(150);
  const pn2 = (await page.evaluate(() => window.__flux.hands().left.palmNormal));
  await debug({ force: 'jab' });
  t = await until((x) => x.act === null && x.blocks > 0, 10000);
  check('an open palm in its path blocks the jab', t.blocks === 1 && t.hitsTaken === 1, `palm facing z ${pn2[2].toFixed(2)}, blocks ${t.blocks}, hits ${t.hitsTaken}`);
  await handsDown();
  await until((x) => x.act === null);
  await settle(1300); // past the stagger

  await debug({ force: 'beam' });
  t = await until((x) => x.act === null && x.hitsTaken > 1, 10000);
  check('the eye beam lands on a head that stays put', t.hitsTaken === 2, `hits taken ${t.hitsTaken}`);

  // Your turn: light the right ball and punch it at the titan's core, a
  // ball or three till one finds a weak point (a hand-thrown ball can clip
  // the armour, fairly).
  let first = null;
  for (let i = 0; i < 3; i++) {
    await place('hand-right', AIM);
    await settle(i === 0 ? 400 : 900);
    await pinch(1);
    await settle(300);
    await swing(true, AIM);
    t = await until((x) => x.hitsLanded + x.armourHits > (first ? first.hitsLanded + first.armourHits : 0), 3000);
    if (!first) {
      first = t;
      check('a thrown ball hits the titan', t.hitsLanded + t.armourHits > 0, `${t.hitsLanded} on a weak point, ${t.armourHits} on armour, its health ${t.hp.toFixed(2)}; release ${JSON.stringify(await page.evaluate(() => window.__flux.releaseInfo()))}`);
    }
    if (t.hitsLanded > 0) break;
  }
  check('the weak points take it', t.hitsLanded > 0 && t.hp < 1, `${t.hitsLanded} on a weak point, ${t.armourHits} on armour`);

  // Fell it: one hit from done, then a ball or three till one lands.
  await debug({ setHp: 0.01 });
  for (let i = 0; i < 3; i++) {
    await place('hand-right', AIM);
    await settle(900); // the last ball's home
    const bPre = await page.evaluate(() => window.__flux.balls()[1]);
    await pinch(1);
    await settle(300);
    const bLit = await page.evaluate(() => `${window.__flux.balls()[1]}/${window.__flux.hands().right.closed}`);
    await swing(true, AIM);
    const b0 = `${bPre} → ${bLit} → ` + (await page.evaluate(() => window.__flux.balls()[1]));
    t = await until((x) => x.phase === 'falling' || x.phase === 'off', 2500);
    if (t.phase !== 'fight') break;
    console.log(`      (throw ${i + 1} missed: ball was ${b0} after the punch; ${t.hitsLanded} weak, ${t.armourHits} armour; release ${JSON.stringify(await page.evaluate(() => window.__flux.releaseInfo()))})`);
  }
  m = await musicIs('victory', (tr) => tr === 'victory', 8000);
  check('the victory sting plays as it falls', m.cue === 'victory' && m.track === 'victory', `${m.cue} · ${m.track}`);
  check('the last hit fells it', t.phase === 'falling' || t.phase === 'off', `${t.phase} · ${t.hitsLanded} weak, ${t.armourHits} armour · balls ${(await page.evaluate(() => window.__flux.balls())).join(',')}`);
  await until((x) => x.phase === 'off', 5000);
  await settle(700);
  s = await S();
  t = await T();
  check('the console comes back on its results face', s.mode === 'home' && t.result?.won === true && s.buttons.rematch.active, JSON.stringify(t.result));

  // ── PISTONKAISER, from NEXT TITAN ──
  check('NEXT TITAN is open now PISTONKAISER is built', !s.buttons.next.locked);
  await poke('next');
  await handsDown();
  t = await until((x) => x.phase === 'fight');
  check('NEXT TITAN prints PISTONKAISER in', t.name === 'PISTONKAISER' && t.phase === 'fight', `${t.name} · ${t.phase}`);
  check('its weak points take turns: the core opens first', t.open === 'core', t.open);
  {
    const before = t.hitsTaken;
    await debug({ force: 'piston' });
    const lefts = new Set();
    const end = Date.now() + 10000;
    while (Date.now() < end) {
      t = await T();
      if (t.act) lefts.add(t.act.left);
      if (lefts.has(0) && t.act === null) break;
      await page.waitForTimeout(40);
    }
    check('the PISTON is three blows on the beat, all landing on a head that stays put', t.hitsTaken - before === 3 && lefts.size === 3, `hits ${t.hitsTaken - before}, chain ${[...lefts].join('→')}`);
  }
  {
    // A ball at the core: it's open, it counts, and the visor opens instead.
    let hit = null;
    for (let i = 0; i < 3 && !hit; i++) {
      const pre = await T();
      await place('hand-right', AIM);
      await settle(900);
      await pinch(1);
      await settle(300);
      await swing(true, AIM);
      t = await until((x) => x.hitsLanded + x.armourHits > pre.hitsLanded + pre.armourHits, 3000);
      if (t.hitsLanded > pre.hitsLanded) hit = t;
    }
    check('a hit on the open core shuts it and opens the visor', hit?.open === 'head', hit ? `${hit.hitsLanded} weak · open ${hit.open}` : 'no weak hit in 3 throws');
    // The same throw again: the core is shut now, so it's armour.
    const pre = await T();
    for (let i = 0; i < 3; i++) {
      await place('hand-right', AIM);
      await settle(900);
      await pinch(1);
      await settle(300);
      await swing(true, AIM);
      t = await until((x) => x.hitsLanded + x.armourHits > pre.hitsLanded + pre.armourHits, 3000);
      if (t.hitsLanded + t.armourHits > pre.hitsLanded + pre.armourHits) break;
    }
    check('a ball on the shut core only sparks off', t.armourHits > pre.armourHits && t.hitsLanded === pre.hitsLanded, `${t.hitsLanded - pre.hitsLanded} weak, ${t.armourHits - pre.armourHits} armour`);
  }
  await debug({ setHp: 0 });
  await until((x) => x.phase === 'off', 6000);
  await settle(700);
  s = await S();
  t = await T();
  check('PISTONKAISER falls to the results face', s.mode === 'home' && t.result?.titan === 'PISTONKAISER' && t.result?.won === true, JSON.stringify(t.result));
  check('and NEXT TITAN locks again: VULTURE is still being built', s.buttons.next.locked);
  await poke('home');
  s = await S();
  check('HOME goes back to the cards', !(await T()).result && s.buttons.titans.active);
  {
    const log = (await SND()).log;
    const need = ['titanPrint', 'titanRoar', 'windup', 'swing', 'hitTaken', 'whiff', 'block', 'titanGrunt', 'beamCharge', 'beamLock', 'beamFire', 'weakHit', 'titanFall', 'win'];
    const missing = need.filter((n) => !log[n]);
    check('the fight makes all its sounds', missing.length === 0, missing.length ? `silent: ${missing.join(', ')}` : `${need.length} sounds`);
  }
  await debug({ hold: false });

  m = await musicIs('home', (tr) => tr === 'overtime', 15000);
  check('then the console’s music comes back', m.cue === 'home' && m.track === 'overtime', `${m.cue} · ${m.track}`);

  // RECENTRE last: it moves the world, and every poke above assumes it hasn't.
  // ── RECENTRE, from off to one side and turned ──
  const off = { x: 0.4, z: 0.3, yaw: (40 * Math.PI) / 180 };
  await place('headset', { x: off.x, y: 1.6, z: off.z }, { x: 0, y: Math.sin(off.yaw / 2), z: 0, w: Math.cos(off.yaw / 2) });
  await settle(300);
  await palmUp(off);
  check('the wrist panel opens at the console too', (await S()).wrist);
  await poke('recentre');
  await settle(200);
  const head = await page.evaluate(() => window.__flux.head());
  const yaw = Math.atan2(-head.dir[0], -head.dir[2]);
  check(
    'RECENTRE puts the pad under you, facing where you look',
    Math.hypot(head.pos[0], head.pos[2]) < 0.03 && Math.abs(yaw) < 0.05,
    `head at (${head.pos[0].toFixed(3)}, ${head.pos[2].toFixed(3)}), yaw ${yaw.toFixed(3)}`,
  );
  if (shots) {
    const file = join(here, 'smoke.png');
    writeFileSync(file, await page.screenshot());
    console.log(`  wrote ${file}`);
  }
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const bad = results.filter((r) => !r).length;
console.log(`\n${bad === 0 ? 'ALL PASS' : `${bad} FAILURE(S)`}`);
await browser.close();
process.exit(bad === 0 ? 0 : 1);

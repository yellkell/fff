#!/usr/bin/env node
/**
 * SMOKE, headless: the page boots in the IWSDK desktop emulator, offers
 * the passthrough session and enters it, onto the CONSOLE. Then the
 * emulator's HANDS drive everything with real fingertip pokes: a locked
 * card refuses, PRACTICE starts; the whole fireball loop plays (a pinch
 * lights the ball, a punch that opens throws it, a lazy open just drops it
 * back, a pinch while it's away recalls it and a held pinch catches it);
 * a palm turned up and looked at opens the WRIST PANEL, whose LEAVE goes
 * home; and from off-centre, RECENTRE puts the pad back under you. No
 * page errors throughout.
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
  /** Move the right hand `dz` per frame for `frames` frames, then optionally
   *  let go of the pinch — on the page's own frames. */
  const HOME = { x: 0.25, y: 1.5, z: -0.4 };
  const swing = (dz, frames, release) =>
    page.evaluate(
      async ({ dz, frames, release, HOME }) => {
        const d = window.IWER_DEVICE;
        for (let i = 1; i <= frames; i++) {
          await d.remote.dispatch('set_transform', { device: 'hand-right', position: { ...HOME, z: HOME.z + dz * i } });
        }
        if (release) d.hands.right.updatePinchValue(0);
        for (let i = 0; i < 3; i++) await new Promise(requestAnimationFrame);
      },
      { dz, frames, release, HOME },
    );
  const home = () => place('hand-right', HOME);
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
  let s = await S();
  check('you arrive at the console', s.mode === 'home' && s.buttons.practice?.active, s.mode);
  check('no balls at the console', (await page.evaluate(() => window.__flux.balls())).length === 2);
  await poke('titans');
  s = await S();
  check('a locked card refuses', s.mode === 'home' && s.buttons.titans.presses === 0 && s.buttons.titans.refusals === 1);
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
  // A punch: 6 cm a step down −z, opening at the end.
  await swing(-0.06, 8, true);
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
  await poke('leave');
  s = await S();
  check('LEAVE goes back to the console', s.mode === 'home' && s.buttons.leave.presses === 1, s.mode);
  await palmDown();
  check('palm turned over: the wrist panel closes', !(await S()).wrist);

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
  await page.waitForTimeout(500);
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

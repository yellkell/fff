#!/usr/bin/env node
/**
 * SMOKE, headless: the page boots in the IWSDK desktop emulator, offers
 * the passthrough session and enters it; then the emulator's HANDS play
 * the whole fireball loop: a pinch lights the ball, a punch that opens
 * throws it, a lazy open just drops it back, a pinch while it's away
 * recalls it and a held pinch catches it. No page errors throughout.
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
  const pinch = (v) => page.evaluate((v) => window.IWER_DEVICE.hands.right.updatePinchValue(v), v);
  const settle = (ms = 400) => page.waitForTimeout(ms);
  /** Move the right hand `dz` per frame for `frames` frames, then optionally
   *  let go of the pinch — on the page's own frames. The emulator's panel
   *  re-seats a hand every frame, so it's moved through the emulator's own
   *  remote-control queue (set_transform), which the panel respects. */
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
  const home = () =>
    page.evaluate((HOME) => window.IWER_DEVICE.remote.dispatch('set_transform', { device: 'hand-right', position: HOME }), HOME);

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
  await page.waitForTimeout(1000);
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

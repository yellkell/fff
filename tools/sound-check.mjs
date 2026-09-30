#!/usr/bin/env node
/**
 * SOUNDS, headless: every cue on the sound board (sounds.html) renders
 * offline, makes a sound (not silence), doesn't clip, and ends in time.
 * No page errors.
 *
 *   npm run dev                          # terminal 1
 *   npm run check:sounds [-- --reel out.wav]   # --reel: every sound, in order, as one WAV
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const base = process.env.PREVIEW_BASE ?? 'http://localhost:5173';
const reelAt = process.argv.indexOf('--reel');
const reelPath = reelAt > 0 ? process.argv[reelAt + 1] : null;

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }
}

const browser = await launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(m.text());
});

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};

await page.goto(`${base}/sounds.html`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.goto(`${base}/sounds.html`));
await page.waitForFunction(() => window.__sounds, { timeout: 30000 });
const cues = await page.evaluate(() => window.__sounds.cues);
check('the board has every cue', cues.length >= 30, `${cues.length} cues`);

for (const c of cues) {
  const r = await page.evaluate(({ name, k }) => window.__sounds.render(name, k).then(({ peak, secs }) => ({ peak, secs })), c);
  // Clearly audible, clear of clipping, and over in time.
  const ok = r.peak > 0.06 && r.peak < 0.95 && r.secs < 2.95;
  check(`${c.label}`, ok, `peak ${r.peak.toFixed(2)}, ${r.secs.toFixed(2)} s`);
}

if (reelPath) {
  const r = await page.evaluate(() => window.__sounds.reel());
  writeFileSync(reelPath, Buffer.from(r.wav, 'base64'));
  writeFileSync(reelPath.replace(/\.wav$/, '.txt'), r.marks.map((m) => `${m.at.toFixed(1).padStart(5)} s  ${m.label}`).join('\n') + '\n');
  console.log(`  wrote ${reelPath} (+ .txt with where each sound starts)`);
}
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const bad = results.filter((r) => !r).length;
console.log(`\n${bad === 0 ? 'ALL PASS' : `${bad} FAILURE(S)`}`);
await browser.close();
process.exit(bad === 0 ? 0 : 1);

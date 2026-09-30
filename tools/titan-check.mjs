#!/usr/bin/env node
/**
 * TITANS, headless: every titan in the roster builds in neon in the titan
 * viewer (titans.html), stands no taller than the room allows, carries lit
 * edges and live glows, and stays inside a draw-call budget. No page errors.
 *
 *   npm run dev               # terminal 1
 *   npm run check:titans [-- --shots]   # --shots: a picture of each, dark and lit room
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = process.env.PREVIEW_BASE ?? 'http://localhost:5173';
const shots = process.argv.includes('--shots');
const here = dirname(fileURLToPath(import.meta.url));
/** Draw calls for one titan, its edges and halos, plus the platform. */
const DRAW_BUDGET = 400;
const MAX_HEIGHT = 2.3 + 1e-6;

async function launch() {
  const args = ['--ignore-certificate-errors'];
  try {
    return await chromium.launch({ args });
  } catch {
    return chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args });
  }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
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

await page.goto(`${base}/titans.html?still`, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => page.goto(`${base}/titans.html?still`));
await page.waitForFunction(() => window.__titans, { timeout: 30000 });
const names = await page.evaluate(() => window.__titans.names);
check('the roster has all five titans', names.length === 5, names.join(' · '));

for (let i = 0; i < names.length; i++) {
  await page.evaluate((i) => window.__titans.show(i), i);
  await page.waitForTimeout(250);
  const s = await page.evaluate(() => ({ ...window.__titans.stats(), calls: window.__titans.drawCalls() }));
  check(
    `${s.name} builds in neon`,
    s.plates > 20 && s.edges > 100 && s.glows > 0 && s.edgeMeshes > 0,
    `${s.plates} plates, ${s.edges} lit edges, ${s.glows} glows`,
  );
  check(`${s.name} fits the room`, s.height <= MAX_HEIGHT, `${s.height.toFixed(2)} m (×${s.scale.toFixed(2)})`);
  check(`${s.name} stays in the draw budget`, s.calls <= DRAW_BUDGET, `${s.calls} draw calls, ${s.tubeTriangles} edge triangles`);
  if (shots) {
    for (const room of ['dark', 'lit']) {
      await page.evaluate((r) => window.__titans.setRoom(r), room);
      await page.waitForTimeout(150);
      const file = join(here, `titan-${s.name.toLowerCase()}-${room}.png`);
      writeFileSync(file, await page.screenshot());
    }
    await page.evaluate(() => window.__titans.setRoom('dark'));
  }
}
if (shots) console.log(`  wrote tools/titan-*.png`);
check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));

const bad = results.filter((r) => !r).length;
console.log(`\n${bad === 0 ? 'ALL PASS' : `${bad} FAILURE(S)`}`);
await browser.close();
process.exit(bad === 0 ? 0 : 1);

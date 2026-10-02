/**
 * THE SOUND BOARD (sounds.html): every sound in the kit on a button, to
 * audition on any screen. Probes (window.__sounds) render sounds offline to
 * WAV, one at a time or as a reel, for tools/sound-check.mjs.
 */

import { renderSound, type SoundName, sfx, toWav, unlockAudio } from './sfx.js';

interface Cue {
  name: SoundName;
  label: string;
  what: string;
  k?: number;
}

const GROUPS: { title: string; cues: Cue[] }[] = [
  {
    title: 'YOUR FIREBALLS',
    cues: [
      { name: 'ignite', label: 'Ignite', what: 'fist or pinch lights it' },
      { name: 'throw', label: 'Throw', what: 'punch and open' },
      { name: 'drop', label: 'Drop', what: 'opened without a punch' },
      { name: 'recall', label: 'Recall', what: 'close while it flies' },
      { name: 'catch', label: 'Catch', what: 'back in your hand' },
      { name: 'fizzle', label: 'Fizzle', what: 'burnt out, or hit the floor' },
      { name: 'fireRoar', label: 'In flight', what: 'the roar a flying ball makes' },
      { name: 'targetPop', label: 'Target pop', what: 'a practice ring bursts' },
    ],
  },
  {
    title: 'MENUS',
    cues: [
      { name: 'uiHover', label: 'Hover', what: 'fingertip arrives' },
      { name: 'uiClick', label: 'Press', what: 'a button fires' },
      { name: 'uiDenied', label: 'Locked', what: 'not built yet' },
      { name: 'consoleRise', label: 'Console up', what: 'rises from the floor' },
      { name: 'consoleSink', label: 'Console down', what: 'sinks away' },
      { name: 'wristOpen', label: 'Wrist open', what: 'palm up, looked at' },
      { name: 'wristClose', label: 'Wrist close', what: 'palm turned over' },
      { name: 'boundary', label: 'Off the pad', what: 'repeats until you step back' },
    ],
  },
  {
    title: '1V1',
    cues: [
      { name: 'count', label: 'Count', what: 'the 3-2-1 before a round' },
      { name: 'bell', label: 'Bell', what: 'the round starts' },
      { name: 'rivalHit', label: 'Body hit', what: 'your ball lands on it', k: 0 },
      { name: 'rivalHit', label: 'Head hit', what: 'a clean one, on the head', k: 1 },
      { name: 'ko', label: 'Knockout', what: 'one of you is down' },
    ],
  },
  {
    title: 'THE TITAN',
    cues: [
      { name: 'titanPrint', label: 'Print in', what: 'it builds in your room' },
      { name: 'titanRoar', label: 'Roar', what: 'the fight starts' },
      { name: 'windup', label: 'Windup', what: 'the tell, from the fist', k: 1.1 },
      { name: 'swing', label: 'Jab', what: 'the blow leaves', k: 0.2 },
      { name: 'swing', label: 'Sweep', what: 'a big limb', k: 1 },
      { name: 'whiff', label: 'Whiff', what: 'it missed you' },
      { name: 'hitTaken', label: 'You’re hit', what: 'a blow lands' },
      { name: 'block', label: 'Block', what: 'palm or ball stops it' },
      { name: 'titanGrunt', label: 'Stagger', what: 'blocked, it reels' },
      { name: 'beamCharge', label: 'Beam charge', what: 'the eye tracks you', k: 1.5 },
      { name: 'beamLock', label: 'Beam lock', what: 'move now' },
      { name: 'beamFire', label: 'Beam fire', what: 'down the locked line' },
      { name: 'volleyCharge', label: 'Volley charge', what: 'the wings flare', k: 1.3 },
      { name: 'boltFire', label: 'Bolt', what: 'one leaves a wingtip' },
      { name: 'mortarFire', label: 'Mortar', what: 'a shell leaves a pod' },
      { name: 'shellBurst', label: 'Shell burst', what: 'it lands on your floor' },
      { name: 'decreeCharge', label: 'Decree charge', what: 'the king raises it', k: 1.8 },
      { name: 'decreeOrb', label: 'Decree bolt', what: 'one gathers over the crown', k: 0.5 },
      { name: 'decreeFire', label: 'Decree fire', what: 'every bolt at once' },
      { name: 'enrage', label: 'Enrage', what: 'half health, furious' },
      { name: 'weakHit', label: 'Weak point', what: 'your ball on visor or core' },
      { name: 'armour', label: 'Armour', what: 'your ball sparks off' },
      { name: 'heartbeat', label: 'Heartbeat', what: 'you’re nearly done' },
      { name: 'titanFall', label: 'Un-print', what: 'the fight ends' },
      { name: 'win', label: 'Win', what: 'it’s down' },
      { name: 'lose', label: 'Lose', what: 'your pad went red' },
    ],
  },
];

const board = document.getElementById('board')!;
for (const g of GROUPS) {
  const h = document.createElement('h2');
  h.textContent = g.title;
  const grid = document.createElement('div');
  grid.className = 'grid';
  for (const c of g.cues) {
    const b = document.createElement('button');
    b.innerHTML = `<b>${c.label}</b><span>${c.what}</span>`;
    b.onclick = () => {
      unlockAudio();
      // Give a first-ever tap a moment for the context to wake.
      setTimeout(() => sfx(c.name, null, c.k), 30);
    };
    grid.append(b);
  }
  board.append(h, grid);
}

const b64 = (buf: ArrayBuffer): string => {
  let s = '';
  const u = new Uint8Array(buf);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};

/** Trim a rendered sound's silent tail. */
function trimmed(buf: AudioBuffer): Float32Array[] {
  const chans = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
  let end = buf.length;
  while (end > 1 && chans.every((c) => Math.abs(c[end - 1]) < 1e-4)) end--;
  return chans.map((c) => c.slice(0, Math.min(buf.length, end + 2205)));
}

(window as unknown as { __sounds: unknown }).__sounds = {
  cues: GROUPS.flatMap((g) => g.cues.map((c) => ({ name: c.name, label: c.label, k: c.k }))),
  /** One sound: its peak level and length, and the WAV as base64. */
  async render(name: SoundName, k?: number) {
    const buf = await renderSound(name, k);
    const t = trimmed(buf);
    let peak = 0;
    for (const c of t) for (const v of c) peak = Math.max(peak, Math.abs(v));
    return { peak, secs: t[0].length / buf.sampleRate, wav: b64(toWav(buf)) };
  },
  /** Every cue in order with a gap between, as one WAV, and where each starts. */
  async reel(gap = 0.45) {
    const rate = 44100;
    const parts: Float32Array[][] = [];
    const marks: { label: string; at: number }[] = [];
    let at = 0;
    for (const g of GROUPS) {
      for (const c of g.cues) {
        const t = trimmed(await renderSound(c.name, c.k));
        marks.push({ label: `${g.title} · ${c.label}`, at });
        parts.push(t);
        at += t[0].length / rate + gap;
      }
    }
    const total = Math.ceil(at * rate);
    const off = new OfflineAudioContext(2, total, rate);
    const out = off.createBuffer(2, total, rate);
    let o = 0;
    parts.forEach((p, i) => {
      for (let ch = 0; ch < 2; ch++) out.getChannelData(ch).set(p[ch] ?? p[0], o);
      o = Math.round(marks[i + 1]?.at * rate) || o;
    });
    return { marks, wav: b64(toWav(out)) };
  },
};

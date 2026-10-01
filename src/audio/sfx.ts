/**
 * THE SOUND KIT. Every sound is synthesised at runtime with WebAudio: no
 * files to ship or load. The building blocks come from FIRE FIGHT 2's kit
 * (`tone`, `noise`, `clank`, `swell`, `growl`, `servo`), retuned from
 * FF2's industrial steel toward NEON: zaps, shimmer and hum, with metal
 * kept for what really is metal (a titan's armour).
 *
 * SPACE. A sound given a world position plays from there, through an HRTF
 * panner, and the listener rides your head (systems/AudioSystem.ts). A
 * titan's fist winds up with a whine from ITS side, so your ears tell you
 * which arm is coming before your eyes do. Sounds with no position (your
 * own hits, the menu's clicks) play straight in your ears.
 *
 * HUMS are the continuous ones (a ball orbiting your hand, the titan's
 * engine): started once, then steered every frame.
 *
 * The AudioContext can only start inside a user gesture: the page's
 * Enter button unlocks it (`unlockAudio`). Everything also renders offline
 * (`renderSound`) for the sound board and the checks.
 */

import type { Vector3 } from 'three';

type Pos = Vector3 | null | undefined;

/** Where the sound being built right now goes. */
interface Out {
  c: BaseAudioContext;
  dest: AudioNode;
}

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let cur: Out | null = null;
let muted = ((): boolean => {
  try {
    return localStorage.getItem('flux-sound') === 'off';
  } catch {
    return false;
  }
})();

/** Every sound fired, by name (the headless checks read this). */
export const sfxLog: Record<string, number> = {};

/** The master level: loud enough for a headset's open speakers, with the
 *  biggest sound (the roar) still clear of clipping (check:sounds). */
const MIX = 0.85;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : MIX;
    master.connect(ctx.destination);
  }
  return ctx;
}

/** Call from a user gesture (the Enter button): audio may only start there. */
export function unlockAudio(): void {
  const c = getCtx();
  if (c && c.state === 'suspended') void c.resume();
}

if (typeof window !== 'undefined') {
  for (const ev of ['pointerdown', 'click', 'keydown', 'touchstart']) {
    window.addEventListener(ev, unlockAudio, { capture: true });
  }
}

/** The shared AudioContext, once there is one (the music plays through it). */
export function audioContext(): AudioContext | null {
  return getCtx();
}

export function audioState(): string {
  return ctx?.state ?? 'none';
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem('flux-sound', m ? 'off' : 'on');
  } catch {
    /* private window: it just won't be remembered */
  }
  if (ctx && master) master.gain.setTargetAtTime(m ? 0 : MIX, ctx.currentTime, 0.03);
}

export function masterGain(): number {
  return master?.gain.value ?? 0;
}

/** The listener: your head. AudioSystem calls this every frame. */
export function setListener(pos: Vector3, forward: Vector3, up: Vector3): void {
  if (!ctx || ctx.state !== 'running') return;
  const l = ctx.listener;
  const t = ctx.currentTime;
  if (l.positionX) {
    l.positionX.setTargetAtTime(pos.x, t, 0.01);
    l.positionY.setTargetAtTime(pos.y, t, 0.01);
    l.positionZ.setTargetAtTime(pos.z, t, 0.01);
    l.forwardX.setTargetAtTime(forward.x, t, 0.01);
    l.forwardY.setTargetAtTime(forward.y, t, 0.01);
    l.forwardZ.setTargetAtTime(forward.z, t, 0.01);
    l.upX.setTargetAtTime(up.x, t, 0.01);
    l.upY.setTargetAtTime(up.y, t, 0.01);
    l.upZ.setTargetAtTime(up.z, t, 0.01);
  } else {
    l.setPosition(pos.x, pos.y, pos.z);
    l.setOrientation(forward.x, forward.y, forward.z, up.x, up.y, up.z);
  }
}

function panner(c: BaseAudioContext, at: Vector3, into: AudioNode): PannerNode {
  const p = c.createPanner();
  p.panningModel = 'HRTF';
  p.distanceModel = 'inverse';
  p.refDistance = 0.8;
  p.rolloffFactor = 0.9;
  p.maxDistance = 30;
  if (p.positionX) {
    p.positionX.value = at.x;
    p.positionY.value = at.y;
    p.positionZ.value = at.z;
  } else {
    p.setPosition(at.x, at.y, at.z);
  }
  p.connect(into);
  return p;
}

/** Fire sound `name`, from `at` (or in your ears), built by `body`. */
function play(name: string, at: Pos, body: () => void): void {
  sfxLog[name] = (sfxLog[name] ?? 0) + 1;
  const c = ctx;
  if (!c || !master || muted) return;
  if (c.state === 'suspended') void c.resume();
  if (c.state !== 'running') return;
  cur = { c, dest: at ? panner(c, at, master) : master };
  try {
    body();
  } finally {
    cur = null;
  }
}

/* ── the building blocks (FF2's, via `cur`) ────────────────────────────── */

interface ToneOpts {
  freq: number;
  to?: number;
  type?: OscillatorType;
  dur?: number;
  gain?: number;
  delay?: number;
}

function tone(o: ToneOpts): void {
  if (!cur) return;
  const { c, dest } = cur;
  const { freq, to, type = 'sine', dur = 0.12, gain = 0.2, delay = 0 } = o;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** Bandpassed noise: the basis of every whoosh. */
function noise(dur: number, gain: number, fromHz: number, toHz: number, delay = 0, q = 1.1): void {
  if (!cur) return;
  const { c, dest } = cur;
  const t0 = c.currentTime + delay;
  const frames = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i++) {
    const p = i / frames;
    data[i] = (Math.random() * 2 - 1) * (p < 0.12 ? p / 0.12 : 1) * (1 - p) ** 0.8;
  }
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = q;
  bp.frequency.setValueAtTime(fromHz, t0);
  bp.frequency.exponentialRampToValueAtTime(toHz, t0 + dur * 0.6);
  const g = c.createGain();
  g.gain.value = gain;
  src.connect(bp).connect(g).connect(dest);
  src.start(t0);
}

/** Struck plate: an inharmonic partial stack over a noise tick. */
function clank(base: number, gain = 0.2, dur = 0.3, delay = 0): void {
  if (!cur) return;
  const { c, dest } = cur;
  const t0 = c.currentTime + delay;
  [1, 1.51, 2.27, 3.43, 4.83].forEach((ratio, i) => {
    const osc = c.createOscillator();
    osc.frequency.value = base * ratio * (1 + (Math.random() - 0.5) * 0.015);
    const env = c.createGain();
    const d = Math.max(0.04, dur * (1 - i * 0.12));
    env.gain.setValueAtTime(0.0001, t0);
    env.gain.exponentialRampToValueAtTime(gain / (i + 1), t0 + 0.004);
    env.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    osc.connect(env).connect(dest);
    osc.start(t0);
    osc.stop(t0 + d + 0.05);
  });
  noise(0.03, gain * 0.7, base * 4, base * 2, delay);
}

/** A slow sub-bass sine swell: the weight under every big moment. */
function swell(from: number, to: number, dur: number, gain: number, delay = 0, attack = 0.05): void {
  if (!cur) return;
  const { c, dest } = cur;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(attack, dur * 0.5));
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** The titan's voice: five detuned saws falling onto the note through a
 *  darkening lowpass, with an ~11 Hz shudder. */
function growl(base: number, dur: number, gain: number, delay = 0): void {
  if (!cur) return;
  const { c, dest } = cur;
  const t0 = c.currentTime + delay;
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.12);
  env.gain.setValueAtTime(gain, t0 + dur * 0.55);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const trem = c.createGain();
  const lfo = c.createOscillator();
  lfo.frequency.value = 10 + Math.random() * 4;
  const depth = c.createGain();
  depth.gain.value = 0.35;
  lfo.connect(depth).connect(trem.gain);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 1.2;
  lp.frequency.setValueAtTime(base * 10, t0);
  lp.frequency.exponentialRampToValueAtTime(base * 3.5, t0 + dur);
  for (const det of [-9, -4, 0, 5, 11]) {
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    const f = base * (1 + det / 600);
    osc.frequency.setValueAtTime(f * 1.9, t0);
    osc.frequency.exponentialRampToValueAtTime(f, t0 + dur * 0.35);
    osc.connect(lp);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }
  lp.connect(trem).connect(env).connect(dest);
  lfo.start(t0);
  lfo.stop(t0 + dur + 0.05);
}

/** Servo whine: a narrow-banded saw gliding between two pitches. */
function servo(from: number, to: number, dur: number, gain = 0.07, delay = 0): void {
  if (!cur) return;
  const { c, dest } = cur;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 7;
  bp.frequency.setValueAtTime(from * 2, t0);
  bp.frequency.exponentialRampToValueAtTime(Math.max(1, to * 2), t0 + dur);
  const env = c.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.02);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(bp).connect(env).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

/** NEON: a plucked synth note, a square through a closing lowpass. The
 *  bright glassy blip every menu and chime in Flux is built from. */
function pluck(freq: number, gain = 0.12, dur = 0.18, delay = 0): void {
  if (!cur) return;
  const { c, dest } = cur;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = 'square';
  osc.frequency.value = freq;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 6;
  lp.frequency.setValueAtTime(freq * 8, t0);
  lp.frequency.exponentialRampToValueAtTime(freq * 1.2, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(lp).connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** NEON: an electric zap, a saw diving through a resonant filter. */
function zap(from: number, to: number, dur: number, gain: number, delay = 0): void {
  if (!cur) return;
  const { c, dest } = cur;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(from * 1.5, t0);
  f.frequency.exponentialRampToValueAtTime(Math.max(1, to * 1.5), t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(f).connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

/** A crescendo: a soft oscillator swelling across the whole of `dur` and
 *  cut at its top, through a gentle lowpass. The tells are built on it:
 *  they grow toward the moment, without a siren's whine. */
function rise(from: number, to: number, dur: number, gain: number, type: OscillatorType = 'triangle', lpHz = 1200, delay = 0): void {
  if (!cur) return;
  const { c, dest } = cur;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.7;
  lp.frequency.value = lpHz;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + dur);
  g.gain.linearRampToValueAtTime(0.0001, t0 + dur + 0.06);
  osc.connect(lp).connect(g).connect(dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.1);
}

/** A ratchet: soft ticks that speed up and climb toward `dur`'s end, a
 *  countdown you can hear the end of coming. */
function ratchet(dur: number, gain: number, fromHz: number, toHz: number): void {
  let t = 0;
  let gap = Math.min(0.24, dur / 4);
  while (t < dur - 0.02) {
    const u = t / dur;
    pluck(fromHz * (toHz / fromHz) ** u, gain * (0.45 + 0.55 * u), 0.05, t);
    t += gap;
    gap = Math.max(0.055, gap * 0.8);
  }
}

/* ── the sounds ────────────────────────────────────────────────────────── */

/** Every sound's body, by name: the game's calls, the sound board and the
 *  offline renderer all go through these. `k` is a 0–1 knob some use. */
export const SOUNDS = {
  // Fireballs. You make these sounds hundreds of times a fight, right
  // under your ears, so they're soft, low and short: a body you feel more
  // than a sound you hear, no zaps, no hiss, no whistling sweeps.
  ignite: () => {
    noise(0.18, 0.08, 160, 600, 0, 0.8); // the flame catching
    tone({ freq: 90, to: 55, dur: 0.16, gain: 0.14 });
  },
  throw: () => {
    tone({ freq: 110, to: 45, dur: 0.2, gain: 0.24 }); // the whoomp you feel
    noise(0.24, 0.12, 600, 180, 0, 0.8); // air, low
  },
  drop: () => {
    tone({ freq: 240, to: 130, type: 'triangle', dur: 0.14, gain: 0.1 }); // settling back to sleep
  },
  recall: () => {
    tone({ freq: 196, to: 392, type: 'triangle', dur: 0.2, gain: 0.08 });
    noise(0.2, 0.05, 300, 800, 0, 0.8);
  },
  catch: () => {
    pluck(660, 0.06, 0.08);
    tone({ freq: 130, to: 85, type: 'triangle', dur: 0.08, gain: 0.14 });
  },
  fizzle: () => {
    noise(0.22, 0.1, 900, 250, 0, 0.8);
    tone({ freq: 180, to: 80, type: 'triangle', dur: 0.18, gain: 0.1 });
  },
  targetPop: () => {
    [880, 1109, 1319, 1760].forEach((f, i) => pluck(f, 0.1, 0.16, i * 0.045));
    noise(0.25, 0.1, 900, 3000);
    tone({ freq: 160, to: 70, dur: 0.12, gain: 0.14 });
  },

  // Menus.
  uiHover: () => pluck(1760, 0.07, 0.05),
  uiClick: () => {
    pluck(1320, 0.1, 0.09);
    tone({ freq: 110, dur: 0.05, gain: 0.08 });
  },
  uiDenied: () => {
    pluck(330, 0.1, 0.1);
    pluck(247, 0.1, 0.14, 0.09);
  },
  consoleRise: () => {
    servo(90, 360, 0.5, 0.05);
    noise(0.5, 0.06, 200, 1800);
    [523, 659, 784].forEach((f, i) => pluck(f, 0.05, 0.25, 0.3 + i * 0.05));
  },
  consoleSink: () => {
    servo(360, 90, 0.45, 0.19);
    noise(0.45, 0.19, 1600, 200);
  },
  wristOpen: () => {
    pluck(988, 0.07, 0.12);
    pluck(1480, 0.06, 0.16, 0.05);
  },
  wristClose: () => {
    pluck(1480, 0.05, 0.1);
    pluck(988, 0.05, 0.12, 0.05);
  },
  boundary: () => {
    tone({ freq: 72, to: 46, type: 'sawtooth', dur: 0.16, gain: 0.1 });
    noise(0.12, 0.08, 95, 520);
  },

  // The titan.
  titanPrint: () => {
    // Printing in: the room's floor humming up under a rising scan.
    swell(30, 55, 2.4, 0.3, 0, 1.1);
    servo(60, 480, 2.2, 0.06);
    noise(2.3, 0.1, 120, 2400, 0, 2);
    for (let i = 0; i < 8; i++) pluck(220 * 2 ** (i / 4), 0.035, 0.12, 0.25 * i);
  },
  titanRoar: () => {
    const base = 58 * (0.94 + Math.random() * 0.12);
    growl(base, 1.4, 0.24);
    growl(base * 0.5, 1.6, 0.16, 0.05);
    swell(base * 1.2, base * 0.55, 1.5, 0.24, 0.02, 0.08);
    noise(1.2, 0.1, 90, 280, 0.05);
  },
  titanGrunt: () => {
    const base = 70 * (0.94 + Math.random() * 0.12);
    growl(base, 0.55, 0.2);
    clank(90, 0.1, 0.5, 0.03);
  },
  windup: (k = 1) => {
    // The tell, `k` seconds long: a ratchet ticking faster and higher as
    // the arm cocks, over a low swell, so the blow lands where the ticks
    // run out. (It was a pair of detuned saw sirens: too whiny to hear
    // every two seconds.)
    ratchet(k, 0.11, 330, 880);
    rise(55, 98, k, 0.2, 'sine', 400);
  },
  beamCharge: (k = 1) => {
    // Rising the whole windup, so the lock and the fire land on its top:
    // a soft chord climbing, not a screech.
    rise(220, 660, k, 0.12, 'triangle', 1400);
    rise(330, 990, k, 0.05, 'sine', 1800);
    rise(110, 220, k, 0.1, 'sine', 500);
  },
  volleyCharge: (k = 1) => {
    // The wings flaring: a low pulse that quickens, under a rising fourth.
    rise(147, 294, k, 0.1, 'triangle', 900);
    rise(196, 392, k, 0.06, 'triangle', 900);
    ratchet(k, 0.06, 196, 392);
  },
  boltFire: () => {
    // A venom bolt spat from a wingtip: a soft hiss and a dropping note.
    noise(0.16, 0.12, 1800, 700, 0, 1.4);
    tone({ freq: 520, to: 240, type: 'triangle', dur: 0.14, gain: 0.12 });
    tone({ freq: 95, to: 60, dur: 0.12, gain: 0.12 });
  },
  beamLock: () => {
    pluck(1976, 0.09, 0.08);
    pluck(1976, 0.09, 0.08, 0.1);
  },
  beamFire: () => {
    zap(1900, 240, 0.34, 0.12);
    zap(1911, 236, 0.34, 0.08);
    noise(0.34, 0.2, 2400, 500);
    swell(95, 42, 0.5, 0.22, 0.02, 0.02);
  },
  swing: (k = 1) => {
    // A limb cutting the air: `k` scales it from a jab (short) to a sweep.
    noise(0.22 + 0.25 * k, 0.26, 420, 2000);
    noise(0.3 + 0.2 * k, 0.1, 200, 800, 0.03);
    servo(300, 120, 0.2 + 0.2 * k, 0.05);
  },
  whiff: () => {
    // A blow that missed, going past your head.
    noise(0.3, 0.2, 2200, 500);
    tone({ freq: 300, to: 140, dur: 0.18, gain: 0.05 });
  },
  hitTaken: () => {
    tone({ freq: 105, to: 36, type: 'sawtooth', dur: 0.3, gain: 0.28 });
    zap(1200, 90, 0.3, 0.12);
    noise(0.14, 0.14, 380, 140);
    swell(60, 30, 0.4, 0.2, 0, 0.01);
  },
  block: () => {
    // Your palm or ball stopping a fist: a shield's bright crack.
    clank(1240, 0.2, 0.4);
    zap(2400, 600, 0.18, 0.08);
    noise(0.1, 0.1, 2600, 1000);
    tone({ freq: 90, to: 50, dur: 0.18, gain: 0.2 });
  },
  armour: () => {
    clank(1650, 0.18, 0.12);
    clank(2300, 0.06, 0.07, 0.01);
    noise(0.05, 0.08, 3200, 1400);
  },
  weakHit: () => {
    clank(420, 0.26, 0.5);
    zap(1600, 320, 0.22, 0.09);
    tone({ freq: 190, to: 60, dur: 0.26, gain: 0.26 });
    [1319, 1760].forEach((f, i) => pluck(f, 0.06, 0.2, 0.05 + i * 0.05));
  },
  titanFall: () => {
    growl(46, 2.2, 0.22);
    swell(55, 24, 2.4, 0.3, 0, 0.1);
    servo(480, 50, 2.1, 0.06);
    noise(2.2, 0.1, 2400, 120, 0, 2);
  },
  heartbeat: () => {
    tone({ freq: 62, to: 40, dur: 0.12, gain: 0.26 });
    tone({ freq: 58, to: 38, dur: 0.14, gain: 0.2, delay: 0.18 });
  },
  win: () => {
    [523, 659, 784, 1047].forEach((f, i) => pluck(f, 0.1, 0.4, i * 0.09));
    [1047, 1319, 1568].forEach((f) => pluck(f, 0.06, 0.9, 0.42));
    swell(80, 60, 1.2, 0.12, 0.35, 0.05);
  },
  lose: () => {
    [392, 311, 262, 196].forEach((f, i) => pluck(f, 0.1, 0.45, i * 0.14));
    swell(70, 30, 1.4, 0.2, 0.3, 0.05);
  },
} satisfies Record<string, (k?: number) => void>;

export type SoundName = keyof typeof SOUNDS;

/** Play a sound, from a world position or (none) in your ears. */
export function sfx(name: SoundName, at?: Pos, k?: number): void {
  play(name, at, () => SOUNDS[name](k));
}

/* ── hums ──────────────────────────────────────────────────────────────── */

export type HumKind = 'ball' | 'engine';

interface HumVoice {
  oscs: OscillatorNode[];
  filter: BiquadFilterNode;
  gain: GainNode;
  pan: PannerNode;
  base: number;
  mults: number[];
}

const hums = new Map<string, HumVoice>();

function makeHum(c: AudioContext, kind: HumKind): HumVoice {
  const gain = c.createGain();
  gain.gain.value = 0;
  const pan = c.createPanner();
  pan.panningModel = 'HRTF';
  pan.distanceModel = 'inverse';
  pan.refDistance = kind === 'ball' ? 0.3 : 1;
  pan.rolloffFactor = 0.9;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  const oscs: OscillatorNode[] = [];
  // A ball: a soft triangle and its fifth, a live neon tube's hum. The
  // engine: a low triangle and its octave, a machine ticking over. Both
  // purely tuned and darkly filtered: they run all fight long, so nothing
  // in them may beat, buzz or whine (saws and detuned pairs did).
  const base = kind === 'ball' ? 196 : 55;
  const shape: OscillatorType = 'triangle';
  filter.frequency.value = kind === 'ball' ? 900 : 260;
  filter.Q.value = 0.7;
  const mults = kind === 'ball' ? [1, 1.5] : [1, 2];
  for (const mult of mults) {
    const o = c.createOscillator();
    o.type = shape;
    o.frequency.value = base * mult;
    o.connect(filter);
    o.start();
    oscs.push(o);
  }
  filter.connect(gain).connect(pan).connect(master!);
  return { oscs, filter, gain, pan, base, mults };
}

/**
 * Steer hum `id` this frame: where it is, how loud (0 = silent), and a
 * pitch multiplier. Cheap to call every frame; silent hums idle for free.
 */
export function hum(id: string, kind: HumKind, at: Vector3, level: number, pitch = 1): void {
  const c = ctx;
  if (!c || !master || c.state !== 'running') return;
  let h = hums.get(id);
  if (!h) {
    if (level <= 0) return;
    h = makeHum(c, kind);
    hums.set(id, h);
  }
  const t = c.currentTime;
  h.gain.gain.setTargetAtTime(Math.max(0, level), t, 0.05);
  const v = h;
  v.oscs.forEach((o, i) => o.frequency.setTargetAtTime(v.base * pitch * v.mults[i], t, 0.05));
  if (h.pan.positionX) {
    h.pan.positionX.setTargetAtTime(at.x, t, 0.02);
    h.pan.positionY.setTargetAtTime(at.y, t, 0.02);
    h.pan.positionZ.setTargetAtTime(at.z, t, 0.02);
  } else {
    h.pan.setPosition(at.x, at.y, at.z);
  }
}

/* ── offline: the sound board's renderer ───────────────────────────────── */

/** Render one sound to an AudioBuffer (stereo, in your ears), off the clock. */
export async function renderSound(name: SoundName, k?: number, secs = 3): Promise<AudioBuffer> {
  const rate = 44100;
  const off = new OfflineAudioContext(2, Math.ceil(rate * secs), rate);
  const g = off.createGain();
  g.gain.value = MIX;
  g.connect(off.destination);
  cur = { c: off, dest: g };
  try {
    SOUNDS[name](k);
  } finally {
    cur = null;
  }
  return off.startRendering();
}

/** A rendered buffer as a 16-bit WAV file. */
export function toWav(buf: AudioBuffer): ArrayBuffer {
  const ch = buf.numberOfChannels;
  const n = buf.length;
  const out = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(out);
  const str = (o: number, s: string): void => [...s].forEach((x, i) => v.setUint8(o + i, x.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + n * ch * 2, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, ch, true);
  v.setUint32(24, buf.sampleRate, true);
  v.setUint32(28, buf.sampleRate * ch * 2, true);
  v.setUint16(32, ch * 2, true);
  v.setUint16(34, 16, true);
  str(36, 'data');
  v.setUint32(40, n * ch * 2, true);
  const data = [...Array(ch)].map((_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      const s = Math.max(-1, Math.min(1, data[c][i]));
      v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      o += 2;
    }
  }
  return out;
}

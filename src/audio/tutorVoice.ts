/**
 * EMBER's voice: FIRE FIGHT 2's recorded tutorial lines (tutorial/script.ts),
 * played through an HRTF panner pinned to her orb, so her voice comes FROM
 * the little light wherever she flies. The listener is already on your head
 * (AudioSystem), and she rides the effects bus, so SOUND mutes her too.
 *
 * A line whose clip isn't decoded yet plays silently and returns an
 * estimated length, so the captions and the pacing work the same without it.
 */

import type { Vector3 } from 'three';
import { estimateLineSeconds } from '../tutorial/script.js';
import { audioContext, sfxOut } from './sfx.js';

const modules = import.meta.glob('../assets/tutor/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

const urls: Record<string, string> = {};
/** Line id → its take stems ('e100' → ['e100', 'e100_2']). */
const takes: Record<string, string[]> = {};
for (const [path, url] of Object.entries(modules)) {
  const stem = (path.split('/').pop() ?? '').replace(/\.mp3$/i, '');
  if (!stem) continue;
  urls[stem] = url;
  (takes[stem.replace(/_\d+$/, '')] ??= []).push(stem);
}

const buffers: Record<string, AudioBuffer> = {};
let loading: Promise<void> | null = null;

function load(c: AudioContext): Promise<void> {
  loading ??= Promise.all(
    Object.keys(urls).map(async (k) => {
      try {
        buffers[k] = await c.decodeAudioData(await (await fetch(urls[k])).arrayBuffer());
      } catch {
        /* stays silent; the caption carries it */
      }
    }),
  ).then(() => undefined);
  return loading;
}

/** Decode her clips ahead of time (the tutorial calls this as it starts). */
export function preloadTutorVoice(): void {
  const c = audioContext();
  if (c) void load(c);
}

let panner: PannerNode | null = null;
let current: AudioBufferSourceNode | null = null;
const at = { x: 0, y: 1.6, z: -1.5 };

function ensurePanner(c: AudioContext): PannerNode | null {
  if (panner) return panner;
  const out = sfxOut();
  if (!out) return null;
  panner = c.createPanner();
  panner.panningModel = 'HRTF';
  panner.distanceModel = 'inverse';
  panner.refDistance = 1.5;
  panner.maxDistance = 24;
  // Gentle: she flies over to the rust bucket mid-line and must still carry.
  panner.rolloffFactor = 0.4;
  panner.connect(out);
  return panner;
}

/** Speak a line, cutting off whatever she was saying. Returns its length (s). */
export function sayTutorLine(id: string, text: string): number {
  const est = estimateLineSeconds(text);
  const c = audioContext();
  if (!c) return est;
  const stems = takes[id];
  const stem = stems && stems.length > 1 ? stems[Math.floor(Math.random() * stems.length)] : id;
  const buf = buffers[stem] ?? buffers[id];
  if (!buf) {
    void load(c);
    return est;
  }
  if (c.state !== 'running') return est;
  const p = ensurePanner(c);
  if (!p) return est;
  stopTutorVoice();
  if (p.positionX) {
    p.positionX.setValueAtTime(at.x, c.currentTime);
    p.positionY.setValueAtTime(at.y, c.currentTime);
    p.positionZ.setValueAtTime(at.z, c.currentTime);
  } else p.setPosition(at.x, at.y, at.z);
  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(p);
  src.onended = () => {
    if (current === src) current = null;
  };
  src.start();
  current = src;
  return buf.duration;
}

/** A clip is sounding right now (her glow pulses with it). */
export function tutorVoiceActive(): boolean {
  return current !== null;
}

/** `id` is decoded and ready: the opening waits a moment on its first line. */
export function tutorLineReady(id: string): boolean {
  return !!buffers[id];
}

export function stopTutorVoice(): void {
  try {
    current?.stop();
  } catch {
    /* already ended */
  }
  current = null;
}

/** Keep her voice on the orb: every frame while the tutorial runs. */
export function setTutorVoicePosition(pos: Vector3): void {
  at.x = pos.x;
  at.y = pos.y;
  at.z = pos.z;
  const c = audioContext();
  if (!current || !c || !panner) return;
  const t = c.currentTime + 0.04;
  if (panner.positionX) {
    panner.positionX.linearRampToValueAtTime(pos.x, t);
    panner.positionY.linearRampToValueAtTime(pos.y, t);
    panner.positionZ.linearRampToValueAtTime(pos.z, t);
  } else panner.setPosition(pos.x, pos.y, pos.z);
}

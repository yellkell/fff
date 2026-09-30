/**
 * THE MUSIC, cued by what you're doing: Flux's own menu track, and FIRE
 * FIGHT 2's score for everything else.
 *
 *   home      "Overtime", under the console.
 *   practice  "Aim", looped.
 *   titans    one of FF2's battle tracks, never the same one twice running.
 *   victory   FF2's victory sting as a titan falls to you, then home.
 *   silence   a fight you lost goes quiet before the console comes back.
 *
 * Tracks crossfade. Like FF2, music plays through WebAudio, never an
 * <audio> element: an audible media element trips a Meta Browser
 * media-session crash on Quest (see FF2's musicTrack.ts).
 *
 * Memory: a whole song decoded at full rate is 50–110 MB of PCM, enough to
 * take down a Quest tab. Flux decodes at 24 kHz (plenty for a score under
 * the fight) and keeps only the track that's playing.
 *
 * LOUDNESS: the tracks are mastered anywhere from quiet to hot (FF2's
 * battle pool alone spans nearly 2×), so each is measured as it decodes
 * and played at a set LOUDNESS, not a set gain. The music is the floor
 * and the sound effects the foreground.
 */

import aimUrl from '../assets/music/aim.mp3?url';
import overtimeUrl from '../assets/music/overtime.mp3?url';
import victoryUrl from '../assets/music/victory.mp3?url';
import { audioContext } from './sfx.js';

/** FF2's battle pool: drop more tracks in assets/music/battle and they join it. */
const BATTLE: string[] = Object.values(
  import.meta.glob('../assets/music/battle/*.mp3', { eager: true, query: '?url', import: 'default' }) as Record<string, string>,
);

export type MusicCue = 'home' | 'practice' | 'titans' | 'victory' | 'silence';

/** Target loudness (RMS) per cue: under the effects in a fight, a little
 *  fuller at the console where there's little else to hear. */
const LOUDNESS: Record<MusicCue, number> = {
  home: 0.09,
  practice: 0.065,
  titans: 0.07,
  victory: 0.1,
  silence: 0,
};
const FADE = 1.4;
const RATE = 24000;

interface Loaded {
  buffer: AudioBuffer;
  /** Seconds of silence at the head (FF2's tracks carry some): skipped. */
  head: number;
  /** Its loudness (RMS), measured once. */
  rms: number;
}

interface Deck {
  url: string;
  source: AudioBufferSourceNode;
  gain: GainNode;
}

let bus: GainNode | null = null;
let cue: MusicCue | null = null;
let deck: Deck | null = null;
let lastBattle = '';
let wanted = '';
let loading: { url: string; pending: Promise<Loaded | null> } | null = null;
let ended = false;
let lastLevel = 0;
let muted = ((): boolean => {
  try {
    return localStorage.getItem('flux-music') === 'off';
  } catch {
    return false;
  }
})();

function out(): { c: AudioContext; bus: GainNode } | null {
  const c = audioContext();
  if (!c || c.state !== 'running') return null;
  if (!bus) {
    bus = c.createGain();
    bus.gain.value = muted ? 0 : 1;
    bus.connect(c.destination);
  }
  return { c, bus };
}

/** The first 50 ms window with real energy (FF2's rule: dither and stray
 *  clicks in a "silent" head don't count). */
function firstAudible(b: AudioBuffer): number {
  const d = b.getChannelData(0);
  const win = Math.max(1, Math.floor(b.sampleRate * 0.05));
  for (let s = 0; s < d.length; s += win) {
    const end = Math.min(s + win, d.length);
    let sum = 0;
    for (let i = s; i < end; i++) sum += d[i] * d[i];
    if (Math.sqrt(sum / (end - s)) > 0.003) return Math.max(0, s / b.sampleRate - 0.05);
  }
  return 0;
}

/** RMS over both channels, sampled (every 16th frame is plenty). */
function loudness(b: AudioBuffer): number {
  let sum = 0;
  let n = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    for (let i = 0; i < d.length; i += 16) {
      sum += d[i] * d[i];
      n++;
    }
  }
  return Math.sqrt(sum / Math.max(1, n)) || 0.1;
}

async function load(url: string): Promise<Loaded | null> {
  try {
    const bytes = await (await fetch(url)).arrayBuffer();
    // Decoded through a context pinned at RATE, so the decoder resamples
    // down instead of handing back a 48 kHz giant.
    const buffer = await new OfflineAudioContext(2, 1, RATE).decodeAudioData(bytes);
    return { buffer, head: firstAudible(buffer), rms: loudness(buffer) };
  } catch {
    return null; // stays silent; the next cue tries again
  }
}

function fadeOut(d: Deck, c: AudioContext): void {
  const t = c.currentTime;
  d.gain.gain.cancelScheduledValues(t);
  d.gain.gain.setValueAtTime(d.gain.gain.value, t);
  d.gain.gain.linearRampToValueAtTime(0, t + FADE);
  d.source.onended = null;
  d.source.stop(t + FADE + 0.05);
}

async function start(url: string, target: number, loop: boolean): Promise<void> {
  wanted = url;
  if (!loading || loading.url !== url) loading = { url, pending: load(url) };
  const got = await loading.pending;
  // A newer cue came in while this one loaded: it wins.
  if (wanted !== url) return;
  loading = null;
  const o = out();
  if (!got || !o) return;
  const { c } = o;
  if (deck) fadeOut(deck, c);
  const source = c.createBufferSource();
  source.buffer = got.buffer;
  source.loop = loop;
  source.loopStart = got.head;
  source.loopEnd = got.buffer.duration;
  // Played at the cue's loudness, whatever the track's mastering.
  const level = Math.min(1.5, target / got.rms);
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, c.currentTime);
  gain.gain.linearRampToValueAtTime(level, c.currentTime + FADE);
  source.connect(gain).connect(o.bus);
  ended = false;
  source.onended = () => {
    if (deck?.source === source) ended = true;
  };
  source.start(0, got.head);
  deck = { url, source, gain };
  lastLevel = level;
}

/** Ask for the music that fits. Cheap to call every frame: it only acts
 *  when the cue changes (or the context has only just started running). */
export function setMusicCue(next: MusicCue): void {
  const o = out();
  if (!o) return;
  if (next === cue) return;
  cue = next;
  switch (next) {
    case 'home':
      void start(overtimeUrl, LOUDNESS.home, true);
      break;
    case 'practice':
      void start(aimUrl, LOUDNESS.practice, true);
      break;
    case 'titans': {
      const pool = BATTLE.filter((u) => u !== lastBattle);
      lastBattle = pool[Math.floor(Math.random() * pool.length)] ?? BATTLE[0];
      void start(lastBattle, LOUDNESS.titans, true);
      break;
    }
    case 'victory':
      void start(victoryUrl, LOUDNESS.victory, false);
      break;
    case 'silence':
      wanted = '';
      if (deck) fadeOut(deck, o.c);
      deck = null;
      break;
  }
}

/** The victory sting has played out. */
export function musicEnded(): boolean {
  return ended;
}

export function musicCue(): MusicCue | null {
  return cue;
}

export function isMusicMuted(): boolean {
  return muted;
}

export function setMusicMuted(m: boolean): void {
  muted = m;
  try {
    localStorage.setItem('flux-music', m ? 'off' : 'on');
  } catch {
    /* not remembered in a private window */
  }
  const c = audioContext();
  if (c && bus) bus.gain.setTargetAtTime(m ? 0 : 1, c.currentTime, 0.05);
}

/** For the probes. */
export function musicState(): { cue: MusicCue | null; track: string; playing: boolean; muted: boolean; bus: number; level: number; tracks: number } {
  return {
    level: lastLevel,
    cue,
    track: deck ? (deck.url.split('/').pop() ?? '').replace(/[-.][A-Za-z0-9_]{6,}(?=\.mp3$)|\.mp3$/g, '') : '',
    playing: !!deck && !ended,
    muted,
    bus: bus?.gain.value ?? 0,
    tracks: BATTLE.length,
  };
}

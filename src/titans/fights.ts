/**
 * How each titan fights: its moves (strike.ts), how often it picks each,
 * how its weak points open, and how many weak-point hits fell it. A titan
 * is playable once it's in here; the rest of the roster joins as each
 * fight is built.
 *
 * RUSTHOOK's arms: 0 is the gauntlet, 1 the crane hook. The hook does the
 * wide work (the hook, the sweep); the gauntlet the straight work (the
 * jab, the overhand); the eye fires the beam. Its weak points are both
 * open the whole fight (FF2's 'both'): the visor and the chest core.
 *
 * PISTONKAISER, the foundry press, fights on a BEAT (FF2's march): its
 * signature is the PISTON, three straight hammer-block punches from
 * alternating arms, each aimed at where you are when it fires, so you
 * step left, right, left in time (or block one and break the chain). The
 * overhand is its drop-forge, the heaviest blow in the game so far. Its
 * weak points take turns (FF2's 'alternate'): only one blinks at a time,
 * and every hit you land on it flips to the other. Shorter gaps than
 * RUSTHOOK, two more hits to fell.
 *
 * VULTURE, the executioner, fights from range first: its signature is the
 * VOLLEY (FF2's one real projectile, now aimed at you), its wings flaring
 * wide and three venom bolts spat from the wingtips, a beat apart, each at
 * where your head is as it leaves. Dodge them, or put a palm or an
 * orbiting ball in their way. Its one eye fires the beam more than any
 * titan before it, and its talons hook and scythe. Its weak points stay
 * open for TWO hits before they swap (FF2's 'double'). Sixteen hits.
 */

import type { StrikeDef, StrikePath } from './strike.js';

/** How the weak points open (FF2's names): 'both' are open all fight;
 *  'alternate' opens one at a time, swapping on every hit landed;
 *  'double' opens one at a time, swapping after every second hit. */
export type WeakPattern = 'both' | 'alternate' | 'double';

export interface TitanFight {
  moves: StrikeDef[];
  weights: Partial<Record<StrikePath, number>>;
  /** Weak-point hits to fell it. */
  hits: number;
  weak: WeakPattern;
  /** Seconds between one move's recovery and the next windup (default FIGHT.gapMin–gapMax). */
  gap?: readonly [number, number];
}

export const FIGHTS: Record<string, TitanFight> = {
  RUSTHOOK: {
    moves: [
      { path: 'jab', limb: 0, windup: 0.9, strike: 0.45, recover: 0.6, damage: 0.15 },
      { path: 'hook', limb: 1, windup: 1.1, strike: 0.55, recover: 0.7, damage: 0.2 },
      { path: 'overhand', limb: 0, windup: 1.2, strike: 0.5, recover: 0.7, damage: 0.25 },
      { path: 'sweep', limb: 1, windup: 1.3, strike: 0.75, recover: 0.8, damage: 0.2 },
      { path: 'beam', limb: 'eye', windup: 1.5, strike: 0.35, recover: 0.5, damage: 0.2 },
    ],
    weights: { jab: 3, hook: 3, overhand: 2, sweep: 2, beam: 2 },
    hits: 12,
    weak: 'both',
  },
  PISTONKAISER: {
    moves: [
      { path: 'piston', limb: 0, windup: 1.0, strike: 0.3, recover: 0.2, damage: 0.1, combo: 3, beat: 0.5 },
      { path: 'jab', limb: 1, windup: 0.8, strike: 0.4, recover: 0.55, damage: 0.15 },
      { path: 'overhand', limb: 1, windup: 1.25, strike: 0.45, recover: 0.85, damage: 0.3 },
      { path: 'sweep', limb: 0, windup: 1.2, strike: 0.7, recover: 0.8, damage: 0.2 },
      { path: 'beam', limb: 'eye', windup: 1.4, strike: 0.35, recover: 0.5, damage: 0.2 },
    ],
    weights: { piston: 4, jab: 2, overhand: 3, sweep: 2, beam: 2 },
    hits: 14,
    weak: 'alternate',
    gap: [0.6, 1.2],
  },
  VULTURE: {
    moves: [
      { path: 'volley', limb: 'wings', windup: 1.3, strike: 1.2, recover: 0.7, damage: 0.1, combo: 3, beat: 0.4 },
      { path: 'beam', limb: 'eye', windup: 1.3, strike: 0.35, recover: 0.5, damage: 0.2 },
      { path: 'sweep', limb: 1, windup: 1.1, strike: 0.6, recover: 0.75, damage: 0.2 },
      { path: 'hook', limb: 0, windup: 1.0, strike: 0.5, recover: 0.65, damage: 0.2 },
      { path: 'jab', limb: 1, windup: 0.75, strike: 0.38, recover: 0.5, damage: 0.15 },
    ],
    weights: { volley: 4, beam: 3, sweep: 3, hook: 2, jab: 2 },
    hits: 16,
    weak: 'double',
    gap: [0.6, 1.1],
  },
};

/** Is this titan's fight built yet? */
export const playable = (name: string | undefined): boolean => !!name && name in FIGHTS;

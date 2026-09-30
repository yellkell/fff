/**
 * How each titan fights: its moves (strike.ts), how often it picks each,
 * and how many weak-point hits fell it. Only RUSTHOOK is built; the rest
 * join as their fights are.
 *
 * RUSTHOOK's arms: 0 is the gauntlet, 1 the crane hook. The hook does the
 * wide work (the hook, the sweep); the gauntlet the straight work (the
 * jab, the overhand); the eye fires the beam. Its weak points are both
 * open the whole fight (FF2's 'both'): the visor and the chest core.
 */

import type { StrikeDef, StrikePath } from './strike.js';

export interface TitanFight {
  moves: StrikeDef[];
  weights: Partial<Record<StrikePath, number>>;
  /** Weak-point hits to fell it. */
  hits: number;
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
  },
};

/**
 * THE BOT BRAIN (FF2's combat/botBrain.ts): which sparring partner a rung
 * serves, and how sharp. A SKILL in 0..1 walks the ladder's rows
 * continuously, so a brain between two rungs is a blend of both; MERCY
 * softens the lower rungs while you trail on rounds.
 *
 * Pure: no three.js, no DOM (tools/duel-check.mjs runs it under Node).
 */

import { BOT_LADDER, BOT_MERCY, type BotLadderRow } from '../config.js';

export type BotBrain = BotLadderRow & {
  /** The skill this brain was blended at, 0..1. */
  skill: number;
};

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** The skill a rung sits at: exactly that row of the ladder. */
export function skillForRung(rung: number): number {
  return clamp01(rung / BOT_LADDER.length);
}

/** The brain at a skill: the two ladder rows either side of it, blended. */
export function brainForSkill(skill: number): BotBrain {
  const n = BOT_LADDER.length;
  const pos = clamp01(skill) * n;
  const i = Math.min(n - 1, Math.floor(pos));
  const t = Math.min(1, pos - i);
  const a = BOT_LADDER[i];
  const b = BOT_LADDER[Math.min(n - 1, i + 1)];
  const out = { ...a } as Record<string, number | string>;
  for (const key of Object.keys(a) as Array<keyof BotLadderRow>) {
    const av = a[key];
    const bv = b[key];
    if (typeof av === 'number' && typeof bv === 'number') out[key] = av + (bv - av) * t;
  }
  return { ...(out as unknown as BotLadderRow), skill: clamp01(skill) };
}

/** How far below its rung the bot drops while you trail on rounds. Zero
 *  from BOT_MERCY.belowRung up: those rungs get the bot they asked for. */
export function mercyFor(rung: number, roundsWon: number, roundsLost: number): number {
  if (rung >= BOT_MERCY.belowRung) return 0;
  return Math.min(BOT_MERCY.max, Math.max(0, (roundsLost - roundsWon) * BOT_MERCY.perRound));
}

/** The brain for a rung this round: its row, less any mercy. */
export function brainFor(rung: number, roundsWon = 0, roundsLost = 0): BotBrain {
  return brainForSkill(skillForRung(rung) - mercyFor(rung, roundsWon, roundsLost));
}

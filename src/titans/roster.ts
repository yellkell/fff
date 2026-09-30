/**
 * The gauntlet, in fighting order (DESIGN §3.3), and how each titan looks
 * in neon. Only the look lives here for now; the fight numbers (health,
 * cadence, the strike grammar) arrive with strike.ts.
 *
 * Every titan wears two colours:
 *   line    its lit edges: the machine itself, drawn in light;
 *   accent  its eye, chest core, weak points and glowing trims: FF2's
 *           signature colour, kept. What you aim at is never line-coloured.
 */

/** Which bespoke chassis buildTitan assembles. */
export type TitanStyle = 'hook' | 'piston' | 'vulture' | 'fortress' | 'king';

export interface TitanLook {
  name: string;
  style: TitanStyle;
  /** FF2's rig size multiplier (the duel boxer is roughly 1). Staging in a
   *  room scales the whole machine again (titans/stage.ts). */
  scale: number;
  line: number;
  accent: number;
}

export const TITANS: readonly TitanLook[] = [
  // The scrapyard: rust turned to embers, and its cold blue eye.
  { name: 'RUSTHOOK', style: 'hook', scale: 1.25, line: 0xff7a1a, accent: 0x19f0ff },
  // The foundry: white-hot steel, amber furnace glow.
  { name: 'PISTONKAISER', style: 'piston', scale: 1.5, line: 0x8fdcff, accent: 0xffb000 },
  // The executioner: magenta plumage, one venom-green eye.
  { name: 'VULTURE', style: 'vulture', scale: 1.8, line: 0xff2bd6, accent: 0x7cff4a },
  // The fortress: deep blue armour, violet core.
  { name: 'JUGGERNAUT', style: 'fortress', scale: 2.15, line: 0x4d7cff, accent: 0xb26bff },
  // The king: cold white plate, gold trim, red eyes.
  { name: 'GOLIATH', style: 'king', scale: 2.6, line: 0xe9ecff, accent: 0xff2b4e },
];

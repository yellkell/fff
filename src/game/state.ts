/**
 * What the game is doing, shared by every system.
 *
 *   home      the console is up; no fireballs, no targets.
 *   practice  the target rings; the console has sunk away.
 *   titans    a titan fight (TitanSystem).
 *
 * 1V1 joins this list when it's built.
 */

export type Mode = 'home' | 'practice' | 'titans';

export interface FightResult {
  titan: string;
  won: boolean;
  /** Seconds the fight took. */
  time: number;
}

export const game = {
  mode: 'home' as Mode,
  /** The wrist panel is open: your hands are poking, not fighting. */
  wristOpen: false,
  /** Bumped on every recentre, so anything placed from your head re-places. */
  recentred: 0,
  /** Your health in a fight, 0–1 (1 outside one). */
  playerHp: 1,
  /** Your head is off the platform (BoundarySystem). */
  headOutside: false,
  /** How the last fight ended; the console shows it until you move on. */
  result: null as FightResult | null,
};

export function setMode(mode: Mode): void {
  game.mode = mode;
}

/** Your hands belong to a menu right now: a hand shape must not light,
 *  throw or recall a ball. (A pointing hand has three fingers curled,
 *  which sits right in the fist reader's grey zone.) */
export function handsOnMenu(): boolean {
  return game.mode === 'home' || game.wristOpen;
}

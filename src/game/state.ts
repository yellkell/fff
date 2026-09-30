/**
 * What the game is doing, shared by every system.
 *
 *   home      the console is up; no fireballs, no targets.
 *   practice  the target rings; the console has sunk away.
 *
 * TITANS and 1V1 join this list as they're built.
 */

export type Mode = 'home' | 'practice';

export const game = {
  mode: 'home' as Mode,
  /** The wrist panel is open: your hands are poking, not fighting. */
  wristOpen: false,
  /** Bumped on every recentre, so anything placed from your head re-places. */
  recentred: 0,
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

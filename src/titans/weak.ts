/**
 * THE WEAK POINTS, and the order they open in (FF2's patterns). Whatever is
 * open BLINKS; a shut one sits dim and counts as armour. No prompts: the
 * light is the whole instruction.
 *
 *   both       the visor and the core, open the whole fight (RUSTHOOK).
 *   alternate  core, then visor, then core... swapping on every hit
 *              (PISTONKAISER).
 *   double     the same two, but each stays open for TWO hits (VULTURE).
 *   triple     visor → core → the LOW BLOW, the emblem on its belt, one
 *              hit each (JUGGERNAUT).
 *   crown      GOLIATH's five-point circuit: visor → left shoulder → core
 *              → right shoulder → low, one hit each, round and round.
 *
 * Pure: no three.js, so tools/strike-check.mjs runs it under Node.
 */

export type WeakPart = 'head' | 'core' | 'low' | 'shoulderL' | 'shoulderR';
export type WeakPattern = 'both' | 'alternate' | 'double' | 'triple' | 'crown';

const CYCLES: Record<WeakPattern, { cycle: readonly WeakPart[]; every: number }> = {
  // every = 0: the whole cycle is open at once.
  both: { cycle: ['head', 'core'], every: 0 },
  alternate: { cycle: ['core', 'head'], every: 1 },
  double: { cycle: ['core', 'head'], every: 2 },
  triple: { cycle: ['head', 'core', 'low'], every: 1 },
  crown: { cycle: ['head', 'shoulderL', 'core', 'shoulderR', 'low'], every: 1 },
};

export class WeakCycle {
  private i = 0;
  private hits = 0;
  /** Full trips round the cycle (the crown's rings). */
  loops = 0;
  readonly pattern: WeakPattern;
  readonly cycle: readonly WeakPart[];
  private readonly every: number;

  // (No parameter properties: the checks run this under Node's type stripping.)
  constructor(pattern: WeakPattern) {
    this.pattern = pattern;
    this.cycle = CYCLES[pattern].cycle;
    this.every = CYCLES[pattern].every;
  }

  /** Does this titan have this part as a weak point at all? */
  has(p: WeakPart): boolean {
    return this.cycle.includes(p);
  }

  isOpen(p: WeakPart): boolean {
    return this.every === 0 ? this.has(p) : this.cycle[this.i] === p;
  }

  /** 'both' while they're all open; otherwise the one that is. */
  get open(): 'both' | WeakPart {
    return this.every === 0 ? 'both' : this.cycle[this.i];
  }

  /** A hit landed on the open one: move round when it's had its share. */
  hit(): void {
    if (this.every === 0) return;
    if (++this.hits < this.every) return;
    this.hits = 0;
    this.i = (this.i + 1) % this.cycle.length;
    if (this.i === 0) this.loops++;
  }
}

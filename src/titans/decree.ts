/**
 * THE DECREE (GOLIATH's): FF2's nova, re-expressed as a strike. A row of
 * bolts gathers over the king's crown, one LANE each across your pad, with
 * a gap two lanes wide; then they all fire at once, level with your head.
 * The only tell in the game that says "stand HERE": the gap. It's always
 * picked away from where you're standing, so you have to move to it (or
 * duck, or block your lane's bolt).
 *
 * Pure: no three.js, so tools/strike-check.mjs runs it under Node.
 */

export const DECREE = {
  /** Lanes across the pad, centre to centre (metres, pad x). */
  lanes: 8,
  spacing: 0.22,
  /** The gap's centre is picked at least this far from your head. */
  away: 0.35,
};

/** Every lane's centre x, left to right, symmetric about the pad's middle. */
export function laneXs(): number[] {
  const n = DECREE.lanes;
  return Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * DECREE.spacing);
}

export interface DecreePlan {
  /** The lanes that fire (x of each). */
  lanes: number[];
  /** The x at the middle of the gap: where to stand. */
  gap: number;
}

/**
 * Plan a decree for a head at `headX`: drop two neighbouring lanes, picking
 * the pair whose middle is at least DECREE.away from you when any is (the
 * farthest otherwise), and never the outermost pair, so the gap is always
 * on the pad with lanes either side of it.
 */
export function planDecree(headX: number, rand: () => number = Math.random): DecreePlan {
  const xs = laneXs();
  // Pairs (k, k+1), skipping the two at the ends.
  const pairs: number[] = [];
  for (let k = 1; k < xs.length - 2; k++) pairs.push(k);
  const mid = (k: number): number => (xs[k] + xs[k + 1]) / 2;
  let pool = pairs.filter((k) => Math.abs(mid(k) - headX) >= DECREE.away);
  if (pool.length === 0) {
    const far = Math.max(...pairs.map((k) => Math.abs(mid(k) - headX)));
    pool = pairs.filter((k) => Math.abs(mid(k) - headX) === far);
  }
  const k = pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
  return { lanes: xs.filter((_, i) => i !== k && i !== k + 1), gap: mid(k) };
}

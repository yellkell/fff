/**
 * Where and how big a titan stands in your room (DESIGN §3.3): STAGE.distance
 * in front of your standing spot, facing you, scaled down (never up) so its
 * head clears STAGE.maxHeight.
 */

import { STAGE } from '../config.js';

/** The uniform scale that stands a rig of this height in a room. */
export function stageScale(height: number): number {
  return Math.min(1, STAGE.maxHeight / height);
}

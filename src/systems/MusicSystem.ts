/**
 * Picks the music (audio/music.ts) from what you're doing, every frame:
 * the console's track at home, "Aim" in practice, a battle track in a titan
 * fight or a duel. When a titan (or a duel) falls to you the victory sting plays out over the
 * results before the console's track comes back; a fight you lost goes
 * quiet instead.
 */

import { createSystem } from '@iwsdk/core';
import { type MusicCue, musicCue, musicEnded, setMusicCue } from '../audio/music.js';
import { game } from '../game/state.js';
import { duelStats } from './DuelSystem.js';
import { titanStats } from './TitanSystem.js';

const STING_HOME = 6.5;

export class MusicSystem extends createSystem({}) {
  /** Seconds of quiet after a sting, before home comes back up. */
  private hold = 0;

  update(delta: number): void {
    let want: MusicCue;
    if (game.mode === 'practice') want = 'practice';
    else if (game.mode === 'titans') {
      want = titanStats.phase === 'falling' ? (titanStats.hp <= 0 ? 'victory' : 'silence') : 'titans';
    } else if (game.mode === 'duel') {
      // A duel's score is the titans' battle pool; the verdict gets the sting.
      const over = duelStats.phase === 'matchOver' || duelStats.phase === 'outro';
      want = over ? (duelStats.rounds[0] > duelStats.rounds[1] ? 'victory' : 'silence') : 'titans';
    } else want = 'home';

    // Coming home from a fight: the sting rings on over the results (up to
    // STING_HOME s, FF2's rule; the whole sting is ~33 s), or a lost fight
    // stays quiet a moment; then the console's track fades back up.
    const now = musicCue();
    if (want === 'home' && (now === 'victory' || now === 'silence')) {
      this.hold += delta;
      const wait = now === 'victory' ? (musicEnded() ? 0 : STING_HOME) : 1.5;
      if (this.hold < wait) return;
    }
    this.hold = 0;
    setMusicCue(want);
  }
}

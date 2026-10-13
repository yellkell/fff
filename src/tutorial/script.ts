/**
 * EMBER's lines: FIRE FIGHT 2's voiced tutorial (ff2 `docs/tutorial-ember.md`,
 * `src/tutorial/script.ts`), cut down to what's true in Flux. Each `id` is
 * the clip (`src/assets/tutor/<id>.mp3`) and `text` the caption under her.
 *
 * THE CAPTION IS A TRANSCRIPT OF THE TAKE, word for word, as in FF2. FF2's
 * script teaches a controller (hold the trigger, release it at the end of
 * the swing) and sends you to its locker, store and attachments; none of
 * that is in Flux, so those lines aren't here. Three takes were cut at a
 * pause to their Flux-true sentences (see the clips' README): e030, e040
 * and e084. What a hand has to DO is never put in her mouth: it goes on the
 * caption's cue line (`CUES`), so her words stay exactly what she says.
 */

export interface TutorLine {
  /** Asset stem: `src/assets/tutor/<id>.mp3`. Extra takes share the stem
   *  with a `_N` suffix (praise `e100.mp3` + `e100_2.mp3`); one is picked
   *  at random per play. */
  id: string;
  /** Caption text, shown on the plate under her while the line plays. */
  text: string;
}

export const LINES = {
  // Attention & setup.
  overHere: { id: 'e010', text: 'Over here.' },
  hello: {
    id: 'e011',
    text: "There you are. Hello, I'm Ember. Your guide, and statistically, your biggest fan.",
  },
  begin: {
    id: 'e012',
    text: "Clear yourself a little room, Clanker. Then press the button here, and we'll begin.",
  },

  // Light a ball.
  igniteDone: { id: 'e021', text: 'There it is. Well done.' },

  // Throw. (FF2's take, its trigger sentence cut out.)
  throwIt: { id: 'e030', text: "See this rust bucket? I'll mark the spot." },
  throwDone: { id: 'e031', text: 'Good job. He felt that.' },

  // Recall. (FF2's take, its trigger sentence cut off the front.)
  recall: { id: 'e040', text: 'Littering is a crime.' },
  recallDone: {
    id: 'e041',
    text: "Caught. Throw, recall, catch. That's the heartbeat of everything. Well done.",
  },

  // Block.
  block: {
    id: 'e050',
    text: "This one keeps you alive. A spinning ball is a shield. Spin one up, hold it close. He's going to throw at you.",
  },
  blockIncoming: { id: 'e051', text: 'Incoming. Punch it down!' },
  blockDone: { id: 'e052', text: 'Blocked. Well done. Again, a little faster this time.' },
  blockRetry: {
    id: 'e053',
    text: "You're fine. Get your fireball spinning around your hand, and punch the oncoming ball to block. Again.",
  },
  blockTwo: { id: 'e054', text: "Two for two. You're a natural, Clanker." },

  // Move.
  move: {
    id: 'e060',
    text: 'Blocking is good. Not being there is better. Movement is everything, Clanker. When I call a side, move. Whole body.',
  },
  moveLeft: { id: 'e061', text: 'Left.' },
  moveRight: { id: 'e062', text: 'Right.' },
  moveRetry: { id: 'e063', text: 'Bigger steps. Off the line. Again.' },

  // Graduation.
  grad: {
    id: 'e080',
    text: "That's everything I've got, and look at you now. Knock him down, and you're done. Make me proud, Rookie.",
  },
  fightHit: { id: 'e081', text: 'There it is.' },
  fightTaken: { id: 'e082', text: "Shake it off. You're iron, remember?" },
  fightLow: { id: 'e083', text: "It's done for. Finish it." },
  // (FF2's take, cut before it sends you to the locker and the store.)
  win: { id: 'e084', text: 'Down goes the rust bucket. Well done, well done, well done.' },
  lose: {
    id: 'e085',
    text: "Up you get. He's been at this for years. You, about ten minutes. Come back swinging. I'll be here.",
  },

  // Praise pool: repeat successes rotate through it, never the same twice.
  praiseGoodJob: { id: 'e100', text: 'Good job.' },
  praiseWellDone: { id: 'e101', text: 'Well done.' },
  praiseNice: { id: 'e102', text: 'Nice.' },
  praiseThatsIt: { id: 'e103', text: "That's it." },
  praisePerfect: { id: 'e104', text: 'Perfect.' },

  // A long wait, any beat.
  noRush: { id: 'e110', text: "No rush. Whenever you're ready." },
} as const satisfies Record<string, TutorLine>;

export type LineKey = keyof typeof LINES;

export const PRAISE_POOL: LineKey[] = ['praiseGoodJob', 'praiseWellDone', 'praiseNice', 'praiseThatsIt', 'praisePerfect'];

/**
 * What your hands do, per lesson: the cue line under her caption. Flux's
 * grammar (DESIGN §2), not FF2's trigger.
 */
export const CUES = {
  ignite: 'CLOSE A FIST (OR PINCH) TO LIGHT A BALL',
  throwIt: 'PUNCH AT HIM, OPENING YOUR HAND AS YOU GO',
  throwSoft: 'FASTER: PUNCH, AND OPEN AT THE END OF IT',
  recall: 'THROW IT, THEN CLOSE YOUR HAND WHILE IT FLIES',
  block: 'A BALL SPINNING ROUND YOUR HAND, IN ITS PATH · OR AN OPEN PALM',
  move: 'STEP INTO THE GREEN, WHOLE BODY',
  fight: 'KNOCK HIM DOWN',
} as const;

/** Seconds a line runs when its clip hasn't decoded: captions and pacing
 *  run off this, so the tutorial plays the same in silence. */
export function estimateLineSeconds(text: string): number {
  return 0.7 + text.split(/\s+/).length * 0.34;
}

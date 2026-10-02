/**
 * Every FIRE FIGHT FLUX tunable, in one place. Distances in metres, times in
 * seconds. The player stands at the origin facing −z; the floor is y = 0
 * (a local-floor reference space puts it on your real floor).
 */

/* ── the look ──────────────────────────────────────────────────────────── */

/** Neon on passthrough: emissive colours that read over any room, lit or
 *  dark. Nothing here is lit by a light; it is all its own glow. */
export const NEON = {
  cyan: 0x19f0ff,
  magenta: 0xff2bd6,
  violet: 0x8a5cff,
  lime: 0xb6ff2e,
  ember: 0xff7a1a,
  hot: 0xfff4e0,
  danger: 0xff2b4e,
};

/* ── the platform ──────────────────────────────────────────────────────── */

/**
 * FIRE FIGHT 2's octagon (1.72 × 1.5 m), with a TENTH CUT OFF THE BACK: the
 * front edge stays at z = −0.75 and the back comes in from +0.75 to +0.60,
 * so the pad is 1.35 m deep. You still stand at the origin. The back
 * chamfer shrinks with it (0.375 → 0.225) so the back keeps its shape.
 */
export const PLATFORM = {
  halfWidth: 0.86,
  frontDepth: 0.75,
  backDepth: 0.6,
  /** Half of the straight front/back edge. */
  edgeHalf: 0.375,
  frontChamfer: 0.375,
  backChamfer: 0.225,
};

/** The pad's outline, counter-clockwise from above, −z toward the fight. */
export const PLATFORM_VERTICES: ReadonlyArray<readonly [number, number]> = [
  [-PLATFORM.edgeHalf, -PLATFORM.frontDepth], // front-left
  [PLATFORM.edgeHalf, -PLATFORM.frontDepth], // front-right
  [PLATFORM.halfWidth, -PLATFORM.frontChamfer], // right-front chamfer
  [PLATFORM.halfWidth, PLATFORM.backChamfer], // right-back chamfer
  [PLATFORM.edgeHalf, PLATFORM.backDepth], // back-right
  [-PLATFORM.edgeHalf, PLATFORM.backDepth], // back-left
  [-PLATFORM.halfWidth, PLATFORM.backChamfer], // left-back chamfer
  [-PLATFORM.halfWidth, -PLATFORM.frontChamfer], // left-front chamfer
];

/**
 * How the platform outline is drawn (arena/platform.ts). WebGL lines are
 * one pixel wide whatever you ask for, which is a hairline in a headset, so
 * the rim is real geometry with width. Insets are measured in from the
 * outline; the glow fades out over `glowWidth` on each side of it.
 */
export const PLATFORM_RIM = {
  /** The bright tube itself, straddling the outline. */
  coreWidth: 0.035,
  /** The soft halo on each side of the tube. */
  glowWidth: 0.13,
  glowPeak: 0.55,
  /** A low lit curb standing on the outline, so the edge still reads when
   *  you look across the floor at a shallow angle. */
  lipHeight: 0.06,
  /** The second, magenta stripe just inside the rim. */
  innerInset: 0.07,
  innerWidth: 0.016,
  /** The front tick: a bar across the front edge, just inside it. */
  tickHalf: 0.14,
  tickWidth: 0.035,
  tickInset: 0.12,
};

/** The rim walls: they wake as your head nears an edge. */
export const BOUNDARY = {
  wallHeight: 2.2,
  warnDistance: 0.3,
};

/* ── hands ─────────────────────────────────────────────────────────────── */

/**
 * The hand-shape reader (input/handPose.ts). Curl is the mean distance from
 * the four fingertips to the wrist, normalised by the hand's own length
 * (wrist → middle knuckle), so it reads the same on any size of hand. A
 * pinch is thumb tip to index tip. Every threshold has a gap between its
 * "on" and "off" values so a hand hovering at the line can't flicker.
 */
export const HANDS = {
  /** Curl ratio under this = a fist; over `fistOff` = open again. */
  fistOn: 1.05,
  fistOff: 1.3,
  /** Thumb–index tip distance (m) under this = pinching; over `pinchOff` = let go. */
  pinchOn: 0.02,
  pinchOff: 0.045,
  /** A hand that loses tracking keeps its last shape this long, so a
   *  dropout mid-punch doesn't read as an open hand (a false throw). */
  dropoutHold: 0.15,
};

/* ── fireballs ─────────────────────────────────────────────────────────── */

/** Ported from FIRE FIGHT 2's FIREBALL, retuned for hands. */
export const FIREBALL = {
  radius: 0.09,
  /** Close a hand within this of your ball to light it. */
  nearHandRadius: 0.35,
  /** Where an idle ball hovers, relative to the palm (world up, toward the fight). */
  hoverOffset: [0, 0.07, -0.08] as const,
  hoverLerp: 14,
  orbitRadius: 0.17,
  orbitSpeedMin: 6,
  orbitSpeedMax: 13,
  orbitSpinUp: 1.2,
  /** A hand must be moving this fast (m/s) as it opens for the ball to fly. */
  minPunchSpeed: 1.1,
  /** The hand opens AFTER a punch peaks, so the throw takes the fastest
   *  velocity seen in this window before the release, not the velocity at it. */
  releaseWindow: 0.15,
  throwSpeedMin: 4.2,
  throwSpeedMax: 8.5,
  punchGain: 1.7,
  gravity: 1.1,
  lifetime: 3,
  returnSpeed: 9.5,
  catchRadius: 0.16,
  recallLockout: 0.5,
};

/* ── practice targets ──────────────────────────────────────────────────── */

export const TARGETS = {
  count: 3,
  radius: 0.22,
  /** Where they float: a band in front of the platform. */
  minZ: -4.2,
  maxZ: -2.6,
  spreadX: 1.6,
  minY: 0.9,
  maxY: 2.0,
  respawn: 0.8,
};

/* ── menus ─────────────────────────────────────────────────────────────── */

/**
 * Menus are poked with a fingertip (DESIGN §2): no rays, so every button is
 * within arm's reach. A button fires when a fingertip that came at it from
 * the front pushes `pressDepth` past its face, and can't fire again until
 * that finger pulls back out past `rearmDepth`. The face sinks up to
 * `travel` under the finger: the press you see stands in for the haptics
 * a bare hand doesn't have.
 */
export const MENU = {
  /** A fingertip this close in front of a face starts lighting it. */
  hoverDepth: 0.06,
  pressDepth: 0.012,
  rearmDepth: 0.008,
  travel: 0.02,
  /** How far outside a button's edge a fingertip still counts as on it. */
  edgeSlack: 0.008,
  /** No two presses closer than this, anywhere: one poke, one action. */
  cooldown: 0.3,
  /** Smoked glass behind every panel, so neon reads over a bright room. */
  glassColor: 0x07060d,
  glassOpacity: 0.72,
};

/** THE CONSOLE: the home menu, standing on the front of your pad. */
export const CONSOLE = {
  /** In front of your standing spot, inside the front tick. */
  distance: 0.42,
  /** Below your eyes, clamped so it works for anyone, sitting or standing. */
  belowEyes: 0.42,
  minY: 0.8,
  maxY: 1.45,
  width: 0.54,
  height: 0.33,
  /** Rising out of the floor / sinking back into it. */
  riseTime: 0.5,
};

/** THE WRIST PANEL: turn your left palm up and look at it. */
export const WRIST = {
  /** Palm-normal · world-up to open, and the looser value it must stay over. */
  openUp: 0.65,
  stayUp: 0.35,
  /** Angle (degrees) between your gaze and your palm to open / to stay open. */
  openGaze: 25,
  stayGaze: 40,
  /** Hold the pose this long to open it; lose it this long to close it. */
  openHold: 0.2,
  closeHold: 0.3,
  /** Where it floats: this far above the palm (to its centre). */
  lift: 0.13,
  width: 0.21,
  height: 0.15,
};

/* ── titans ────────────────────────────────────────────────────────────── */

/** Standing a titan in a room (DESIGN §3.3): in front of you, and scaled so
 *  its head clears an ordinary ceiling. It leans and lunges; it doesn't tower. */
export const STAGE = {
  distance: 2.2,
  maxHeight: 2.3,
};

/**
 * The neon finish (titans/neon.ts). Sizes are in STAGED metres, what you
 * see in the room, whatever the titan's own scale.
 */
export const TITAN_NEON = {
  /** The lit edge tube's radius, and its soft halo's. */
  edgeRadius: 0.0045,
  haloRadius: 0.014,
  haloOpacity: 0.22,
  /** How much white is mixed into the tube so it reads as the light source. */
  edgeWhite: 0.3,
  /** Faces meeting sharper than this get a lit edge (degrees). */
  creaseAngle: 30,
  /** Parts smaller than this get no edges (rivets, bolts, chain links):
   *  on a titan across the room they'd only be fizz. */
  minPart: 0.045,
  /** The dark glass body: the line colour at this brightness, this opaque.
   *  Near-opaque, so a titan blocks the room behind it like a solid thing. */
  bodyTint: 0.03,
  bodyOpacity: 0.9,
};

/** A titan fight (TitanSystem). Health is 0–1 on both sides. */
export const FIGHT = {
  /** The titan prints into your room from the floor up, and out again. */
  riseTime: 2.4,
  fallTime: 2.2,
  /** Seconds between one strike's recovery and the next windup. */
  gapMin: 0.8,
  gapMax: 1.5,
  /** The whole titan steps in behind a blow, this far at most (metres). */
  lungeMax: 0.85,
  /** The forearm telescopes this far at most (rig metres per unit scale). */
  telescope: 0.5,
  /** A blocked blow staggers the titan: no new windup for this long. */
  stagger: 1.2,
  /** Your head, as a sphere, for the judging. */
  headRadius: 0.11,
  /** An open palm facing the fist, this close to its path, blocks it. */
  palmReach: 0.09,
  palmFacing: 0.3,
  /** The eye beam's radius. It locks this far through its windup. */
  beamRadius: 0.035,
  beamLock: 0.62,
  /** A volley's bolts: how fast they fly, how big they are to judge, and
   *  how long a missed one flies on before it burns out. */
  boltSpeed: 4.2,
  boltRadius: 0.06,
  boltLife: 1.8,
  /** The mortar: shells lobbed from the pods to fall on where you stood,
   *  this long in the air, under this gravity (a gentle arc that clears an
   *  ordinary ceiling), and this big to judge. */
  shellTime: 1.05,
  shellGravity: 2.8,
  shellRadius: 0.09,
  /** The decree's bolts fly this fast. */
  decreeSpeed: 4,
  /** The sweeping beam scythes this far either side of where it locked. */
  sweepReach: 1.1,
  /** A weak-point hit freezes the titan this long: the blow lands. */
  hitStop: 0.08,
  /** Standing off the pad drains you, per second. */
  outsideDrain: 0.12,
  /** Idle life: a drift side to side, a breath. */
  sway: 0.14,
  bob: 0.025,
};

/* ── 1V1 ───────────────────────────────────────────────────────────────── */

/**
 * The duel (DESIGN §4), FIRE FIGHT 2's classic 1v1 with its rules: two pads
 * across a gap, two balls each, first to two rounds. The bot comes first;
 * the relay comes later and plugs into the same rival. Health is 0–1.
 */
export const DUEL = {
  /** Pad centre to pad centre (FF2's ARENA_GAP): the rival stands here, facing you. */
  gap: 3,
  roundTime: 60,
  /** First to this many rounds takes the match (FF2's quick match). */
  winTarget: 2,
  /** The rival materialises; then before every round, ROUND n and a 3-2-1. */
  introTime: 1.6,
  roundCard: 1,
  countdown: 3,
  /** The breather after a round, and the hold on the final verdict. */
  roundOverTime: 2.6,
  matchOverTime: 2.8,
  /** FF2's damage: 20 a hit, 25 on the head, out of 100. */
  bodyDamage: 0.2,
  headDamage: 0.25,
  /** A ball meeting a raised guard or another ball in the air: the extra
   *  contact reach on top of the two radii (FF2's deflectBonus). */
  deflectBonus: 0.05,
  /** Throws within ~25° of the rival are bent this much onto its head. */
  aimAssist: 0.4,
};

/**
 * A body for a duel: FF2's head-driven spine. Your hips are pinned under
 * your head (a little behind it, since your face sits forward of your
 * spine), so ducking and leaning swing the whole torso. Three spheres along
 * it are what a ball hits. The rival is built from the same numbers.
 */
export const BODY = {
  hipHeight: 0.95,
  /** Hips never closer than this below the head (a deep duck, or sitting). */
  hipBelowHead: 0.3,
  /** Fraction along hips → neck where the chest sphere sits. */
  chestAlong: 0.55,
  spineSetBack: 0.16,
  headRadius: 0.13,
  chestRadius: 0.2,
  pelvisRadius: 0.17,
};

/**
 * The bot's fixed numbers (FF2's BOT): body, the guard, the beats every
 * rank shares. What sharpens with rank is on BOT_LADDER.
 */
export const BOT = {
  headY: 1.45,
  headYMin: 1.0,
  headYMax: 1.62,
  /** Lateral roaming range on its pad (a row's `roam` scales it). */
  padHalfWidth: 0.7,
  headPitchMax: 0.32,
  headTurnSpeed: 8,
  blockHold: 0.55,
  blockReach: 0.5,
  decideEvery: 0.7,
  lowAimDrop: 0.62,
  dodgeBurst: 0.4,
  dodgeBurstGain: 1.6,
  feintHold: 0.5,
  doubleTapGap: 0.3,
  punishFuse: 0.12,
  headLagWindow: 0.6,
  /** Its glove, for the guard and the look. */
  gloveRadius: 0.065,
};

/**
 * THE BOT LADDER, FF2's verbatim: one brain per rung, ROOKIE to OVERLORD.
 * Flux has no XP yet, so you climb it by hand: NEXT BOT on the results face
 * takes you one rung up. What each number drives is in duel/brain.ts.
 *
 *  throwInterval / windup / throwSpeed / aimError : how it throws.
 *  aimLag / lead : rookies throw at where your head WAS, veterans at where
 *                  it's GOING.
 *  lowAimChance / readsHabits : how often it throws low, bent toward a ducker.
 *  reactDistance / reactDelay / defendChance / blockChance / wrongWayChance :
 *                  how it answers your ball.
 *  moveSpeed / duckSpeed / restless / roam : footwork.
 *  preDodge / punish / feint / doubleTap : the tricks the sharper rungs earn.
 *  recallDelay : seconds after a throw before it calls its ball back.
 */
export interface BotLadderRow {
  label: string;
  throwInterval: number;
  windup: number;
  throwSpeed: number;
  aimError: number;
  aimLag: number;
  lead: number;
  lowAimChance: number;
  readsHabits: number;
  reactDistance: number;
  reactDelay: number;
  defendChance: number;
  blockChance: number;
  wrongWayChance: number;
  moveSpeed: number;
  duckSpeed: number;
  restless: number;
  roam: number;
  preDodge: number;
  punish: number;
  feint: number;
  doubleTap: number;
  recallDelay: number;
}

export const BOT_LADDER: BotLadderRow[] = [
  { label: 'ROOKIE', throwInterval: 3.4, windup: 1.1, throwSpeed: 3.4, aimError: 0.36, aimLag: 0.4, lead: 0, lowAimChance: 0.2, readsHabits: 0, reactDistance: 1.0, reactDelay: 0.45, defendChance: 0.4, blockChance: 0.05, wrongWayChance: 0.3, moveSpeed: 0.9, duckSpeed: 1.4, restless: 0.5, roam: 0.35, preDodge: 0, punish: 0, feint: 0, doubleTap: 0, recallDelay: 2.0 },
  { label: 'SPARRER', throwInterval: 3.0, windup: 0.95, throwSpeed: 3.8, aimError: 0.3, aimLag: 0.3, lead: 0.1, lowAimChance: 0.25, readsHabits: 0.1, reactDistance: 1.2, reactDelay: 0.35, defendChance: 0.55, blockChance: 0.1, wrongWayChance: 0.22, moveSpeed: 1.1, duckSpeed: 1.7, restless: 0.7, roam: 0.45, preDodge: 0.1, punish: 0, feint: 0, doubleTap: 0, recallDelay: 1.8 },
  { label: 'CONTENDER', throwInterval: 2.5, windup: 0.8, throwSpeed: 4.2, aimError: 0.22, aimLag: 0.2, lead: 0.25, lowAimChance: 0.3, readsHabits: 0.25, reactDistance: 1.5, reactDelay: 0.25, defendChance: 0.7, blockChance: 0.2, wrongWayChance: 0.14, moveSpeed: 1.4, duckSpeed: 2.0, restless: 0.9, roam: 0.6, preDodge: 0.25, punish: 0.15, feint: 0, doubleTap: 0.05, recallDelay: 1.6 },
  { label: 'BRUISER', throwInterval: 2.1, windup: 0.7, throwSpeed: 4.65, aimError: 0.15, aimLag: 0.12, lead: 0.4, lowAimChance: 0.38, readsHabits: 0.4, reactDistance: 1.7, reactDelay: 0.16, defendChance: 0.8, blockChance: 0.3, wrongWayChance: 0.08, moveSpeed: 1.6, duckSpeed: 2.3, restless: 1.0, roam: 0.75, preDodge: 0.4, punish: 0.3, feint: 0.08, doubleTap: 0.12, recallDelay: 1.4 },
  { label: 'VETERAN', throwInterval: 1.85, windup: 0.62, throwSpeed: 4.9, aimError: 0.1, aimLag: 0.06, lead: 0.55, lowAimChance: 0.42, readsHabits: 0.55, reactDistance: 1.95, reactDelay: 0.1, defendChance: 0.88, blockChance: 0.36, wrongWayChance: 0.04, moveSpeed: 1.8, duckSpeed: 2.5, restless: 1.15, roam: 0.85, preDodge: 0.55, punish: 0.5, feint: 0.15, doubleTap: 0.22, recallDelay: 1.25 },
  { label: 'ACE', throwInterval: 1.65, windup: 0.55, throwSpeed: 5.15, aimError: 0.07, aimLag: 0.03, lead: 0.7, lowAimChance: 0.45, readsHabits: 0.7, reactDistance: 2.2, reactDelay: 0.06, defendChance: 0.93, blockChance: 0.42, wrongWayChance: 0.02, moveSpeed: 2.0, duckSpeed: 2.7, restless: 1.3, roam: 0.92, preDodge: 0.68, punish: 0.65, feint: 0.22, doubleTap: 0.32, recallDelay: 1.1 },
  { label: 'CHAMPION', throwInterval: 1.5, windup: 0.48, throwSpeed: 5.45, aimError: 0.05, aimLag: 0.01, lead: 0.82, lowAimChance: 0.45, readsHabits: 0.85, reactDistance: 2.45, reactDelay: 0.03, defendChance: 0.96, blockChance: 0.47, wrongWayChance: 0.01, moveSpeed: 2.15, duckSpeed: 2.85, restless: 1.45, roam: 0.97, preDodge: 0.78, punish: 0.8, feint: 0.3, doubleTap: 0.45, recallDelay: 1.0 },
  { label: 'OVERLORD', throwInterval: 1.35, windup: 0.42, throwSpeed: 5.8, aimError: 0.03, aimLag: 0, lead: 0.92, lowAimChance: 0.45, readsHabits: 1.0, reactDistance: 2.7, reactDelay: 0.02, defendChance: 0.98, blockChance: 0.5, wrongWayChance: 0, moveSpeed: 2.3, duckSpeed: 3.0, restless: 1.6, roam: 1.0, preDodge: 0.85, punish: 0.9, feint: 0.35, doubleTap: 0.55, recallDelay: 0.9 },
];

/** MERCY (FF2's): each round you trail by softens the lower rungs a little. */
export const BOT_MERCY = {
  perRound: 0.07,
  max: 0.2,
  /** Rungs from here up get the bot they asked for. */
  belowRung: 4,
};

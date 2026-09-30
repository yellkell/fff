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
  /** Where it floats: this far above the palm. */
  lift: 0.1,
  width: 0.2,
  height: 0.085,
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
  /** Standing off the pad drains you, per second. */
  outsideDrain: 0.12,
  /** Idle life: a drift side to side, a breath. */
  sway: 0.14,
  bob: 0.025,
};

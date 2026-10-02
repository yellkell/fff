# FIRE FIGHT FLUX — DESIGN

A cut-down FIRE FIGHT built for the glasses: **passthrough only, hands
only, bosses first.** No controllers, no opaque arenas. Titans stand in your
real room and swing at you. 1v1 stays in, as the second mode.

Lineage: the engine, fireball physics, titan rigs and weak-point scheme come
from FIRE FIGHT 2 (`yellkell/ff2`). Everything that assumed a controller, an
opaque world or a platform-floor telegraph gets rebuilt. Same stack:
`@iwsdk/core` 0.4.2, three 0.184, Vite 7, strict TS.

---

## 1 · Pillars

1. **Your room is the arena.** Immersive-AR every session. No skybox, no
   deck art. What we draw is neon light hanging in your real space.
2. **Your hands are the controller.** Every action is a hand shape, a
   motion or a poke. Nothing is hidden behind a button a hand can't press.
3. **The boss hits *you*.** Every attack starts at the boss's body and
   visibly travels to where your head and hands actually are: a fist, a
   thrown thing, a sweeping arm. Nothing lights up on the floor and then
   hurts you.
4. **Neon.** Dark glass, emissive tubes, additive glow. It reads against
   any room, lit or dark. *Over passthrough, alpha is what hides the
   room*, and additive blending still writes it: light that fades must
   fade its alpha too, or it fades to a black hole in the room (the spent
   sparks did, as black dots).

---

## 2 · Hands (replacing the controller)

FF2 has no hand-tracking code. Hands work there only because Quest reports
a pinch as the trigger button, so A/B/grip/thumbstick actions can't be
reached and throws rely on opening a pinch mid-punch. Flux reads the hand
joints directly.

- **Session:** `xr: { sessionMode: ImmersiveAR, features: { handTracking:
  { required: true } } }`.
- **Hand-shape classifier** (`src/input/handPose.ts`): from the `XRHand`
  joints, compute *curl* (fingertip-to-palm distance, fingers 2–5) and
  *pinch* (thumb-tip to index-tip). Use hysteresis on both, and debounce
  across tracking dropouts so a lost frame doesn't count as an open hand.
- **Fireball grammar:**
  | Hand | Action |
  | --- | --- |
  | Close a fist **or** pinch | Ball ignites and orbits the hand (FF2's Orbit) |
  | Punch and open the hand | Throw; speed and curl come from the swing |
  | Fist or pinch while the ball is away | Recall |
  | Orbiting or recalling ball in the path | Parry (unchanged from FF2) |
  | Open palm facing an incoming shot | Block (new; replaces "trigger held near the shot") |
- **Throw velocity:** FF2's `VelocityTracker` fed from the wrist/palm
  joint instead of the grip. Drop samples whose joint has no pose, and
  widen the release window, because the hand opens *after* the peak of the
  punch.
- **Menus:** poke. Buttons are neon plates you touch with your index tip.
  No rays, so every button is within arm's reach. See §2.1.
- **Replacing the A button:** turn your left palm up and look at it; a
  small wrist panel opens (§2.1).
- **Hands you see:** your real hands, in passthrough. We add a neon rim on
  the knuckles plus the orbiting ball. IWSDK's own hand mesh is hidden.
  FF2's steel gloves are gone.
- **Feedback without haptics:** every buzz FF2 had becomes a sound plus a
  light (ignite flare, catch snap, parry crack, hit flash on the rim).

### 2.1 Menus

- **Neon on smoked glass.** Every panel has a dark, see-through plate
  behind its neon, so text reads over a bright wall or window. Pure
  additive glow washes out there.
- **The poke.** A button fires when a fingertip that came at it *from the
  front* pushes 1.2 cm past its face. It can't fire again until that
  finger pulls back out. A finger that slides in from the side, already
  deep, fires nothing. No two presses within 0.3 s. The face brightens as
  you approach and sinks under your finger; a press flashes it white, and
  a locked button flashes red and says why.
- **The fingertip dot.** Your real hand is part of the passthrough image
  *behind* the scene, so a panel hides your finger. A bright dot drawn on
  top of everything marks each index tip near a button.
- **Hands on a menu don't fight.** A pointing hand has three fingers
  curled, which sits in the fist reader's grey zone. While a menu has
  your hands, a hand shape never lights, throws or recalls a ball.
- **THE CONSOLE** (home). It rises out of the floor at the front of your
  pad, ~42 cm in front of you at chest height, tilted to face you, and
  sinks away when a fight starts. Three cards: **TITANS**, **1V1**,
  **PRACTICE**. Modes not built yet stay on it, locked, so the game's
  shape is there from day one. Each card becomes a station in THE
  CONSTELLATION (§6): TITANS → the BOSS GATE, 1V1 → the DUEL RING.
- **THE WRIST PANEL.** Left palm up, looked at, held for 0.2 s: it opens
  above your palm, poked with your right hand. Two by two: **LEAVE** (back
  to the console; in a fight, a forfeit) and **RECENTRE** (turn and slide
  the world so the pad is under you, facing where you look), then
  **SOUND** and **MUSIC**. It draws over every other panel: it's always
  the nearest.
- **Later:** results after every fight (REMATCH · NEXT TITAN · HOME), a
  first-run hands check, settings.

### 2.2 Sound

Built (`src/audio/sfx.ts`). Every sound is synthesised live with WebAudio,
from FF2's building blocks (tone, noise, clank, swell, growl, servo) plus
two neon ones (a plucked synth note and an electric zap): no files.

- **Sound stands in for haptics.** Every press, catch, block and hit has
  one, next to its light.
- **Sound comes from where it happens.** Positioned sounds go through an
  HRTF panner, with the listener on your head. The titan's windup ticks
  from the fist that's about to swing, so you hear which side before you
  see it, and the beam charges from its eye. Your own hits play in your
  ears.
- **Tells are loud, not shrill.** The windup is a ratchet whose ticks
  speed up and climb over a low swell, so the blow lands where the ticks
  run out; the beam charge is a soft chord climbing its whole windup; the
  beam's lock is a sharp double blip: *move now*. (Both were detuned saw
  sirens at first: heard every two seconds, they grated.)
- **Your fireballs sound like fire**, as in FIRE FIGHT 2: its ignite (an
  igniter latch, the furnace catching, a sub thump), throw (a deep
  falling whoomp), recall (its rising mirror) and catch (a latch, a slap,
  a thud), verbatim. Where FF2 has none, they're flames too: a drop
  gutters down to a pilot light, a fizzle hisses out. In flight a ball
  ROARS (a looping flame roar with crackles, `hum(…, 'fire')`) so you can
  hear where it is; in your hand it's quiet, as in FF2. A ball dropped
  because the cameras lost your hand drops silently (mid-fight hands
  leave the cameras all the time).
  (They were neon for a while: zaps, then a soft hum. Neither was fire.)
- **The engine** in the titan's chest is kept low and pure (a triangle
  and its octave, darkly filtered): it barely ticks over until it
  lunges, then revs.
- **SOUND** on the wrist panel mutes it all; the choice is remembered.
- **The sound board** (`sounds.html`, in the Pages build) plays every
  sound on a tap; `check:sounds` renders each offline and holds it
  audible, unclipped and short.
- **Music** (`src/audio/music.ts`, cued by `MusicSystem`): *Overtime* at
  the console; FF2's *Aim* in practice; one of FF2's six battle tracks
  per titan fight, never the same twice running; FF2's victory sting as a
  titan falls to you, ringing on over the results for up to 6.5 s before
  the console's track fades back (a lost fight goes quiet instead). As in
  FF2, music plays through WebAudio, never an `<audio>` element (a Meta
  Browser media-session crash). Tracks decode at 24 kHz and only the one
  playing is kept (full-rate PCM can run a Quest tab out of memory), and
  each is **loudness-matched** as it decodes, so a hot master and a quiet
  one sit at the same level. **MUSIC** on the wrist panel mutes it.

---

## 3 · Bosses — the main mode

### 3.1 What's wrong in FF2

Almost every titan attack is a shader zone on your own platform. It fills
up, then a slab, blade or ring spawns *at you*. The titan mimes from ~3 m
away (6 m in raids) with fixed arm poses that never aim at you, and its
arms (~1.4 m on RUSTHOOK) physically can't reach you. Only two attacks come
from the boss: the **volley** (a real projectile from the shoulder pod) and
the **beam** (drawn from the head, but judged as a floor strip).

### 3.2 The fix: a strike, not a zone

One shared module, `strike.ts`, used by **both** FF2 and Flux. An attack
is a body action with a target:

```ts
interface Strike {
  limb: 'armL' | 'armR' | 'head' | 'pod' | 'body';
  path: 'jab' | 'hook' | 'overhand' | 'sweep' | 'hurl' | 'beam' | 'lunge';
  target: 'head' | 'handL' | 'handR' | 'chest';  // snapshotted at windup end
  windup: number;   // seconds; the sacred readable tell
  strike: number;   // seconds of travel
  reach: number;    // metres the limb or projectile can travel
}
```

- **Aimed arms:** a two-bone IK solve (`twoBone`, already in
  `ff2/src/rave/game/avatars.ts`) points the shoulder and elbow at the
  target. FF2's gesture tables still shape the windup silhouette.
- **Reach:** a telescoping forearm plus a **root lunge** (the whole titan
  steps in and recoils back). RUSTHOOK's hook can fly out on a chain.
  Slam becomes a fist coming *down on you*, not a block falling on a disc.
- **3D judging:** sweep the fist or projectile path against your live head
  sphere and hands, using the volley's existing law. A hand holding an
  orbiting ball, or an open palm, blocks; the head in the path is a hit.
  This replaces `zoneTouchesPlayer`'s 2D floor test.
- **Ground cue:** only a soft shadow under the incoming limb, so a dodge
  still reads. No full-platform decals.
- **Kept from FF2:** the titan rigs (`bosses.ts`), `armGuard.ts`, the lit
  weak-point hitboxes and `applyBossDamage`, the difficulty, enrage and
  stun knobs, and the grammar's scheduling laws (never the same move
  twice, damp repeated dodges, always threaten the last safe spot). The
  grammar's *output* changes from floor shapes to strikes.

### 3.3 Staging in a room

- The titan stands ~2.2 m in front of you; FF2 has it 3.2 m away. It is
  scaled so its head clears a ~2.4 m ceiling, and it leans and lunges
  instead of towering.
- Placement follows the guardian (`bounded-floor`). Later, scene mesh
  keeps the titan out of your sofa.
- **Roster order:** RUSTHOOK, PISTONKAISER, VULTURE, JUGGERNAUT, GOLIATH,
  re-skinned in neon (§3.4). GOOPLIATH comes later: its raymarch cost grows with
  reach, and its reach is exactly what we'd be raising.

### 3.4 The neon titans

Done (`src/titans/`). The rigs are FF2's `bosses.ts` geometry verbatim;
only the finish changed (`titans/neon.ts`, replacing FF2's skins):

- **Dark glass bodies.** Every plate is near-opaque, tinted a whisper of
  the titan's line colour, so it blocks the room behind it and reads as
  solid in a lit room as well as a dark one.
- **Lit edges.** Every crease sharper than 30° is a 9 mm tube with a soft
  additive halo, sized in *room* metres so all five match once staged.
  Parts under 4.5 cm (rivets, bolts, chain links) get none: from across a
  room they'd only fizz. Round parts get enough sides that only their rims
  light.
- **Two colours per titan.** A *line* colour for the machine and FF2's
  *accent* for the eye, core, weak points and trims:
  | Titan | Line | Accent |
  | --- | --- | --- |
  | RUSTHOOK | ember | cyan |
  | PISTONKAISER | white-hot steel | amber |
  | VULTURE | magenta | venom green |
  | JUGGERNAUT | deep blue | violet |
  | GOLIATH | cold white, gold trim | red |
- **Budget.** 120–170 draw calls and 15–40 k edge triangles per titan,
  platform included (`npm run check:titans` holds it under 400 calls).
  Edges are merged per moving part, not per plate.
- **Open:** VULTURE's wings rest spread, about 3 m across, until its
  entrance folds them. Check that against a real room.

### 3.5 RUSTHOOK, as built

The first fight is in (`src/systems/TitanSystem.ts`), on the Flux side
only: FF2's `delivery.ts` stays FF2's.

- **The strike** (`titans/strike.ts`): WINDUP → STRIKE → RECOVER. At the
  windup's end your head is snapshotted and the fist flies a path to it:
  the **jab** straight, the **hook** arcing in from its side, the
  **overhand** down from above, the **sweep** level through you and out
  the far side. The **beam** tracks you, locks 62% through its windup,
  then fires down the locked line.
- **The reach** (`titans/ik.ts`): a two-bone solve puts the fist on the
  point; past arm's length the forearm telescopes (up to 0.5 m per unit
  of rig scale, drawn as a lit piston) and the root lunges in (up to
  0.85 m, never onto your pad). A committed blow stops turning to follow
  you.
- **Judging:** swept frame to frame, *after* the pose, so the frame the
  fist arrives on is always judged at any frame rate. Hands first: a ball
  orbiting your hand, or an open palm facing into the fist's travel
  (dot > 0.3, within 9 cm of its path), blocks and staggers it for 1.2 s.
  Then your head (an 11 cm sphere): a hit.
- **Its weak points** are FF2's `'both'`: visor and chest core, blinking
  all fight. The core's hit sphere is about twice its drawn size, because a
  hand-thrown ball leaves an orbit up to 17 cm off your palm. Armour sits
  behind the core so it never steals a clean shot. 12 hits.
- **Your health** falls with each blow (jab 15%, hook 20%, overhand 25%,
  sweep 20%, beam 20%) and drains 12%/s while your head is off the pad.
  The platform rim goes red as it falls, and pulses under 30%.
- **In and out:** the titan prints in from the floor up under a scan
  ring (a clipping plane), and un-prints top-down when the fight ends.
- **The grammar:** never the same move twice running, weighted jab 3,
  hook 3, overhand 2, sweep 2, beam 2. FF2's other laws (damping repeated
  dodges, threatening the last safe spot) come with the gauntlet.
- **Open, to tune on a headset:** every windup and strike time, the
  damage, the gap between blows, how generous the palm block and the core
  are, and whether 2.2 m reads as *in your face* enough.

### 3.6 PISTONKAISER, as built

The second fight, and the first one the gauntlet's plumbing carries: the
fight system takes any titan with an entry in `titans/fights.ts`
(`game.titan` says which), and the results face's **NEXT TITAN** opens
whenever the next one in the roster has one. It moves the TITANS card on
too.

- **The piston** (FF2's march, as strikes): a chain of three straight
  blows from alternating arms. The first winds up for 1 s; each one after
  for a 0.5 s beat, aimed at your head as *that* windup ends. Every blow
  is judged on its own (10% each); block any one and the chain breaks
  and the titan staggers. A `StrikeDef` with `combo` and `beat` is a
  chain, so any titan can have one.
- **The drop-forge:** its overhand, 1.25 s windup, 30%.
- Also the jab, the sweep and the beam, with gaps of 0.6–1.2 s (RUSTHOOK:
  0.8–1.5). Weighted piston 4, overhand 3, jab 2, sweep 2, beam 2.
- **Weak points take turns** (FF2's `'alternate'`): only one is open,
  blinking; the shut one sits dim and steady and counts as armour (no
  aim assist toward it). The core opens first; every hit flips it. 14
  hits.
- **Open, to tune on a headset:** whether a half-second beat is
  dodgeable three times running, and whether the shut point reads as
  shut from the pad.

### 3.7 VULTURE, as built

The executioner fights from range first.

- **The volley** (FF2's one real projectile, now aimed at you): the wings
  flare wide and forward over a 1.3 s windup, their tips swelling with
  light under a quickening pulse; then three venom bolts leave the
  wingtips, alternating, 0.4 s apart, each at where your head is as it
  leaves, at 4.2 m/s. Each bolt is judged like a fist, swept frame to
  frame: a palm facing into its travel or an orbiting ball stops it (no
  stagger: it's a bolt, not the titan's arm); your head takes 10%. A
  volley on a titan with no wings throws from its shoulders.
- Its one eye fires the **beam** (weighted 3, the most so far), and its
  talons **sweep**, **hook** and **jab**. Gaps 0.6–1.1 s.
- **Weak points open for two hits** (FF2's `'double'`), the core first.
  16 hits.
- **Open, to tune on a headset:** the bolt speed and size, whether the
  flared wings fit a room, and whether a palm block on a bolt from the
  side feels fair.

### 3.8 Hits that land

`fx/impact.ts`: a pooled bloom (a glow that swells and fades round a
white-hot heart) and one or two shockwave rings that race out facing
you, drawn over the titan's glass so its own plates can't hide them, and
faded by alpha (pillar 4).

- **Weak point:** a big bloom and two rings in its accent, a 0.08 s
  hit-stop (the titan's clock nearly stops; yours doesn't), every lit
  edge on it flaring white, and a white trail on its health bar that
  holds a moment and then catches up. The killing blow: a bigger bloom
  at the core and three times the hit-stop.
- **Armour:** a small bloom and one ring in its line colour.
- **Blocks:** a white-hot bloom and two rings at your palm.
- **You're hit:** a red ring a little way out along the blow (not in
  your eyes), with the red flash round your head as before.

### 3.9 JUGGERNAUT, as built

The rolling fortress: artillery that can also grab you. Three answers,
three different moves: step for the mortar, duck for the sweep, block or
back off from the clap.

- **The mortar** (FF2's volley from the shoulder pods, lobbed): four
  shells, 0.45 s apart, from alternating pods, each launched (`lob` in
  `strike.ts`) to come down on where your head is as it leaves, 1.05 s
  later, under a gentle 2.8 m/s² (the arc tops out under 2.4 m, checked).
  Judged like a bolt; a palm facing into its fall stops it. One that
  misses bursts on your floor. 12% each.
- **The clap** (`limb: 'both'`): both arms thrown wide and level over a
  1.25 s windup, the windup's whine from both sides at once; then each
  fist arcs in from its own side to meet on your snapped head. Judged
  per fist; a block on either stops both and staggers it. Lands once,
  25%.
- **The sweeping beam:** the eye tracks you and locks as usual, but it
  locks your head's *height*. A faint level line shows its path across
  the pad; then it scythes from one side to the other (1.1 m either way)
  over 0.9 s. Stepping doesn't help: duck under it, or catch it on a palm
  (parried: it stops there, and the titan staggers). 20%.
- Also the overhand (30%) and the jab. Weighted mortar 4, clap 3, sweep 3,
  overhand 2, jab 2; gaps 0.7–1.3 s.
- **Weak points walk visor → core → low** (FF2's `'triple'`), one hit
  each: the low blow is the lamp on its belt. 18 hits.

### 3.10 GOLIATH, as built

The king, the last titan: he has learned it all, and teaches.

- **The decree** (`titans/decree.ts`, FF2's nova as a strike): over a
  1.8 s windup a row of bolts gathers over his crown, one at a time, one
  per lane across your pad (8 lanes, 0.22 m apart), with two neighbouring
  lanes left dark and a lime ring on your floor in the gap. Then they all
  fire at once, level with your head. The gap is planned when the windup
  starts, never within 0.35 m of where you stand, never the outermost
  pair, and leaves a 32 cm band a head fits through (all checked). Duck,
  stand in the gap, or block your lane's bolt. It can only hit you once,
  25%.
- Everything else he's learned: the clap, the piston, the overhand, a
  four-bolt volley from his pods, the sweeping beam and the beam. Weighted
  decree 2 and the rest 2 (the beam 1); gaps 0.6–1.1 s.
- **The crown** (FF2's): visor → left shoulder → core → right shoulder →
  low, one hit each, three times round: 15 hits. The shoulder lamps are
  bigger on the king, so they read as targets.
- **Enrage at half health** (`TitanFight.enrage`): he stops to roar, every
  lit edge burns 70% brighter and his weak points blink faster; then gaps
  of 0.4–0.85 s and decree 4, piston 3, clap 3, volley 3. The windups are
  untouched: escalation closes the gaps, never the tells.
- **The chain of office** (`rig.chain`): every link is DRAWN (its outline
  rides the geometry as `loops`, and the neon finish lays one lit oval per
  link instead of creasing a solid torus, whose every facet lit up and
  melted 19 links into one white-hot rope, ~17.5 k edge triangles of it).
  Flat ovals alternate with links turned edge-on, as a chain is drawn.
  It hangs from the line between its anchors, a damped pendulum
  (`swingChain`): it lags a lunge and swings out as he pulls up, jumps on
  a hit, a block or the enrage roar, and only ever swings out, resting
  against his chest.
- **Open, to tune on a headset:** whether the decree's row reads as
  lanes from the pad (it's 1.7 m away; the lime ring is the backup), and
  whether the enraged pace is fair.

### 3.11 Your health

FF2's arcade HUD shows YOUR health as one small bar low in front of you;
Flux does the same, in neon (`systems/VitalsSystem.ts`).

- **Where:** at the pad's front edge (z −0.85), 0.72 m below your eyes
  (clamped 0.65–1.1 m, so sitting works), tilted up at you: about 40°
  down, a glance. Every titan's low weak point sits near 25° down, so the
  bar never covers one. Placed as the titan prints in, and again on a
  recentre.
- **What:** YOU, then 18 skewed segments on smoked glass, cyan like your
  platform. A hit leaves a white trail of what you lost (it holds 0.5 s,
  then drains) and flashes the frame red; under 30% the whole bar goes red
  and pulses, faster as you near the floor. It rises with the titan and
  sinks as the fight ends.
- **With:** the platform rim still reddens as you go (§3.5), so your
  health reads at your feet and at a glance down, never as a number in
  your face.

---

## 4 · 1v1 — the second mode

- FF2's duel carries over: the host echoes match state, the victim rules on
  hits against itself, and each peer reports its own HP. The protocol
  subset is `pose`, `throw`, `recall`, `hit`, `deflect`, `clash`, `state`,
  `rematch`, `iam` and `gg`.
- An opponent's fireballs already leave their hands, so they read as
  attacks by nature.
- Networking starts on the plain WebSocket relay (FF2's
  `server/index.mjs`), so **no Firebase is needed to play**.

### 4.1 The bot, as built

1V1 against FF2's bot comes first (`systems/DuelSystem.ts`, `duel/`). The
relay plugs into the same rival when it comes: the rival is a puppet
(`duel/rival.ts`) that takes a head, two hands and a few flags a frame, so
a remote player's pose packets can drive it as the bot does now.

- **The stage:** a second pad, the same octagon in ember with a violet
  stripe, turned round 3 m (FF2's `ARENA_GAP`) from yours. The rival is
  the titans' finish on a body your size: dark glass, lit edges, an ember
  visor, gloves that burn white when they guard. It fades in and out; its
  health, the score and the round clock hang over its head, with the
  3-2-1 and the verdicts above them.
- **The rules** (FF2's quick match): first to two rounds, 60 s each, a
  3-2-1 and a bell before every round; at the bell's end the healthier
  fighter takes it, level is a draw. 20% a hit on the body, 25% on the
  head. Standing off your pad drains you, as against a titan.
- **The bodies** (`duel/body.ts`, FF2's head-driven spine): head, chest
  and pelvis spheres solved from the head alone, hips pinned under it and
  set back behind the face. Yours is judged against its balls, its against
  yours. Ducking and leaning swing the whole torso.
- **Your defence** is the titan fight's guard (`game/guard.ts`, now shared):
  an open palm facing into the ball, or a ball orbiting your hand, in its
  path; in a duel a ball flying home parries too (FF2's parry). Your ball
  meeting its ball in the air burns both out (FF2's clash).
- **Its defence:** it dodges (sidestep, duck or stand), or raises a guard
  that slaps your ball down, but only with its own ball home in that glove
  (your parry's law). Throws within ~25° of its head bend 40% onto it.
- **The brain** is FF2's `BotSystem` and `BOT_LADDER`, verbatim, for one bot
  (`duel/brain.ts`): cadence, wind-up, ball speed and aim slop; aim lag (a
  rookie throws at where your head was) against lead (a veteran throws at
  where it's going); low throws, more of them the more you duck; reaction
  range and delay; block or dodge, and a rookie's step the wrong way; and
  the tricks the sharper rungs earn (pre-dodge, punish, feint, double tap).
  Flux has no XP yet, so you climb the ladder by hand: **NEXT BOT** on the
  results face is a rung up. FF2's mercy stays: while you trail on rounds,
  the four lower rungs ease off a little.
- **Checks:** `check:duel` proves the ladder, mercy, the body, the aim (every
  rung's throw arrives within a centimetre of its mark) and the dodge;
  `check:smoke` plays the duel with the emulator's hands.
- **Open, to tune on a headset:** whether 3 m fits a real room (the rival's
  pad reaches 3.75 m out), whether the rookie's 3.4 m/s balls read as
  dodgeable without being dull, how generous the palm is against a ball
  rather than a fist, and whether the rival's lights read across a lit room.

---

## 5 · Platforms

- Same octagon as FF2, 1.72 m wide, **with a tenth cut off the back**:
  1.5 m → 1.35 m deep. The front edge stays at z = −0.75 and the back
  moves from +0.75 to **+0.60**. You still stand at the origin.
- The back chamfer shrinks from 0.375 to 0.225 so the back keeps its shape.
- Flux has its own `OCTAGON_BACK_DEPTH` / `OCTAGON_BACK_CHAMFER`. The
  FF2 code that assumes a symmetric pad is not ported: the boss target
  clamp at ±0.65, `zoneOnDeck`, the blockfall quadrants, and the fire-rail
  and tide-pool radii.
- In passthrough the platform is a **neon outline on your real floor**: a
  lit rim plus the Guardian-style edge walls that wake as your head nears
  them. Leaving still drains health, head-only, as in FF2.

---

## 6 · The social space — THE CONSTELLATION (passthrough)

There is no venue model. It's a **fixed constellation of neon objects**
laid out on your floor.

- **Same layout for everyone.** Every player gets the same set of objects
  in the same arrangement around their own floor origin: the BOSS GATE,
  the DUEL RING, the BOARD (leaderboards), the MIRROR (your look). Your room
  differs from mine; the constellation is identical.
- **Shared coordinates.** Positions go on the wire in *constellation*
  space, so if you stand by the BOSS GATE in your room, I see your neon
  avatar standing by the BOSS GATE in mine.
- **Moving between places:** poke a station's beacon and the constellation
  **slides** so that station comes to you. Your body doesn't move; the
  world does, which is the only safe "teleport" inside a real room. Other
  players move with it, since they're placed in constellation space.
- **Fitting the room:** the layout shrinks to fit the guardian. Later,
  spatial anchors keep it pinned to the same real spot between sessions.
- **Scale:** a small room of 8–12, with spatial voice.
- **Server:** the shape of FF2's pub server (`hello` / `join` / `leave` /
  pose in / 20 Hz snapshot out, voice on the same socket).

*(Open idea. This is the direction, not a spec.)*

---

## 7 · Our own backend

- **Firebase:** a new project, *not* FF2's (`flappy-ff9f6`). Nothing in
  the first milestones needs it. When boards and profiles arrive, the
  config comes from `VITE_FIREBASE_*` env vars (FF2 hardcodes it in six
  places), with anonymous auth and a deny-by-default ruleset.
- **Relay:** one small Node WebSocket server (duel matching + the
  constellation room), deployable to Render.
- **Not ported:** the bank/Stripe, Discord, TV cast, gazette, the rave and
  the pub.

---

## 8 · Build order

Steps 1–3 are done: hands, menus (§2.1), the neon titans (§3.4), and
RUSTHOOK's fight with the palm block (§3.5). Step 4 is built: all five
titans fight (§3.6, §3.7, §3.9, §3.10). Step 5 is half built: 1V1 against
the bot (§4.1). Next is tuning the titans and the duel on a headset, then
1V1 over the relay. See the README.

1. **Scaffold:** Vite + IWSDK in immersive-AR with hand tracking required,
   a neon platform outline with the back cut, and the desktop emulator for
   dev.
2. **Hands:** the pose classifier, then fist-or-pinch → orbit → punch-open
   → throw → recall, plus poke buttons. Tune against target plates.
3. **One boss:** port RUSTHOOK's rig and `strike.ts` from FF2, where it
   is built first (§9), then add the palm block.
4. **The gauntlet:** the other four titans, with the grammar laws
   re-expressed as strikes.
5. **1v1** over the relay, bot first.
6. **THE CONSTELLATION** and its room server.
7. **Our Firebase:** boards and profiles.

## 9 · FF2 changes (built first)

FF2 now has the first half of this, as `campaign/delivery.ts` on the
`claude/boss-strikes` branch. It is **visual only**: FF2's dodges are read
off the floor marks, so the zones, their timing and the hit rules are
untouched.

- **Thrown bolts:** as each zone comes due, a fire bolt leaves the striking
  fist and lobs onto the target's deck, landing on the beat inside the part
  that burns (never the safe gap). This covers seesaw, surge, nova, the
  raid decree, lanes, rails, gate and donut.
- **Lunge:** the whole chassis steps in behind every throw and every sweep,
  then settles back.
- **Scythe haft:** the sweep's blade is joined to the fist by a lit haft,
  so the cut is the end of the arm.
- **Arm swings:** they now fire as the bolt leaves the fist, not when it
  lands.
- **Not touched:**
  - the beam (it already fires from the visor);
  - the volley (a real projectile already);
  - the recital (conducted by design: the body never points at the answer);
  - the slam (out of every titan's rotation).
- **Checks:** `npm run check:delivery` (new) and `check:grammar` both pass.
  Both now step a frozen titan clock so they hold on a GPU-less runner.

**Flux adds the second half:** IK-aimed arms, reach, and 3D judging
against your real head and hands, since passthrough has no deck to read
floor marks from.

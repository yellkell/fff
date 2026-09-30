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
   any room, lit or dark.

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
  10 cm above your palm, poked with your right hand. **LEAVE** (back to
  the console) and **RECENTRE** (turn and slide the world so the pad is
  under you, facing where you look). Forfeit and mute join it when there
  is a fight and a sound to have.
- **Later:** results after every fight (REMATCH · NEXT TITAN · HOME), a
  first-run hands check, settings.

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
  re-skinned in neon. GOOPLIATH comes later: its raymarch cost grows with
  reach, and its reach is exactly what we'd be raising.

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

Steps 1 and 2 are done, and so are the console and wrist panel (§2.1;
see the README).

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

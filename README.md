# FIRE FIGHT FLUX

Fireball boxing for the glasses: **passthrough only, hands only, bosses
first**. A cut-down FIRE FIGHT ([`yellkell/ff2`](https://github.com/yellkell/ff2))
rebuilt for the headsets that ship without controllers. **Read
[`DESIGN.md`](DESIGN.md)** for the whole plan and build order.

## What's here now (build order steps 1–5, under way)

- **Passthrough, hands required.** The session is `immersive-ar` with hand
  tracking *required*. There are no controllers in this game.
- **The platform, a tenth cut off the back.** A thick neon rim on your real
  floor: FF2's 1.72 m octagon, 1.35 m deep instead of 1.5 (the back edge
  comes in from +0.75 to +0.60; the front and your standing spot don't
  move). Rim walls glow awake as your head nears an edge.
- **The hand-shape reader** (`src/input/handPose.ts`). It reads the 25
  WebXR joints every frame for a *fist* (fingertip-to-wrist distance over
  the hand's own length, so any hand size reads the same) and a *pinch*
  (thumb tip to index tip). Hysteresis stops a hand at the line from
  flickering, and a 150 ms dropout hold stops a punch that outruns the
  cameras from reading as an open hand. IWSDK's own hand model is hidden:
  in passthrough your real hands are already there.
- **Fireballs, played with bare hands** (`src/systems/FireballSystem.ts`):
  - close a **fist or pinch** near the ball to light it into orbit round
    your hand;
  - **punch and open** to throw it. The throw takes the fastest hand
    velocity in the last 0.15 s, because a hand opens *after* the punch
    peaks;
  - close again while it's away to **recall** it, and keep closed to catch
    it back into orbit.
- **Menus you poke** (DESIGN §2.1). Neon on smoked glass, pressed with a
  fingertip: the face sinks under your finger, a bright dot shows where
  your fingertip is even when the panel hides it, and a finger has to come
  at a button from the front to press it.
  - **THE CONSOLE** rises out of the floor at the front of your pad:
    TITANS, 1V1 and PRACTICE. It sinks away when you start.
  - **THE WRIST PANEL**: turn your left palm up and look at it. LEAVE
    goes back to the console; RECENTRE puts the pad under your feet,
    facing where you look.
- **Practice targets.** Neon rings in front of you that burst when a ball
  goes through them.

- **The five titans, in neon** (`src/titans/`). FF2's rigs, part for part
  (so its gestures and weak points port without renumbering), refinished
  for a real room: dark glass bodies that block the room like solid
  things, every crease a lit edge tube with a soft halo, and the eye, core
  and weak points left glowing in each titan's accent. Each stands 2.2 m
  off your pad, scaled so its head clears a 2.3 m ceiling. See them all in
  the **titan viewer**, `titans.html` (dev server or the Pages site), in a
  dark room or a lit one.

- **RUSTHOOK fights** (`src/systems/TitanSystem.ts`, DESIGN §3.5). Poke
  TITANS and it prints into your room from the floor up, 2.2 m off your
  pad, and swings at *you*:
  - five moves, each with a windup you learn to read: a **jab**, the crane
    **hook**, an **overhand**, a level **sweep**, and an **eye beam** that
    tracks you, locks, then fires;
  - its arms really reach (`titans/ik.ts`): the elbow bends, the forearm
    telescopes out on a lit piston, and the whole machine lunges in;
  - every blow flies at where your head was when the windup ended:
    **step off the line or duck**, or **block** with an open palm facing
    it (or a ball orbiting your hand). A blocked blow staggers it;
  - throw fireballs at its blinking **visor** and **chest core**; the rest
    of it is armour and just sparks. Twelve hits fell it;
  - you're hurt when a blow or the beam finds your head, or while you stand
    off your pad, and your **platform rim bleeds red** as you go;
  - when it falls (or you do) it un-prints, and the console comes back up
    on its **results** face: REMATCH, NEXT TITAN, HOME.

- **PISTONKAISER fights** (`src/titans/fights.ts`, DESIGN §3.6). NEXT
  TITAN after RUSTHOOK prints in the foundry press, and the TITANS card
  follows you to it:
  - its signature is the **piston**: three straight hammer-block punches
    from alternating arms on a half-second beat, each aimed at where your
    head is *then*, so you step left, right, left in time. Block any one
    of them and the chain breaks;
  - its overhand is a **drop-forge**, the heaviest blow so far, and it
    jabs, sweeps and fires its beam like RUSTHOOK, with shorter gaps;
  - its weak points **take turns**: only one blinks at a time (the core
    first), and every hit you land on it opens the other. A ball on the
    shut one just sparks off. Fourteen hits fell it.

- **VULTURE fights** (DESIGN §3.7), next after PISTONKAISER:
  - its signature is the **volley**: its wings flare wide and three venom
    bolts leave the wingtips a beat apart, each at where your head is as
    it leaves. Dodge them, or catch them on a palm or an orbiting ball;
  - its one eye fires the beam more than any titan before it, and its
    talons hook, scythe and jab;
  - its weak points stay open for **two** hits before they swap. Sixteen
    hits fell it.

- **JUGGERNAUT fights** (DESIGN §3.9), the rolling fortress, artillery
  that can also grab you:
  - the **mortar**: four shells lobbed from its shoulder pods, each coming
    down on where you stood as it left. Keep stepping;
  - the **clap**: both arms thrown wide, then swung in to meet on your
    head. Duck, step back, or block either fist;
  - the **sweeping beam**: its eye locks your head's *height*, then
    scythes level across the whole pad. Duck under it, or palm it;
  - and a heavy overhand and a jab. Its weak points walk **visor → core →
    the low blow** on its belt, one hit each. Eighteen hits.

- **GOLIATH fights** (DESIGN §3.10), the king, the last titan. He has
  learned it all (clap, piston, overhand, a volley from his pods, both
  beams) and has his own:
  - the **decree**: a row of bolts gathers over his crown, one per lane
    across your pad, with a gap two lanes wide and a lime ring on your
    floor marking it. Then they all fire at once. Stand in the gap, duck,
    or block your lane's bolt. The gap is never where you're standing;
  - his weak points walk the **crown**: visor, left shoulder, core, right
    shoulder, low, three times round (fifteen hits);
  - at half health he **enrages**: a roar, a hotter burn, shorter gaps
    and more decrees. His tells never get shorter;
  - his **chain of office** is drawn link by link in gold line (flat ovals
    and edge-on links, like a chain in a drawing) and hangs free: it lags
    behind his lunges, swings out as he pulls up, and jumps when he's hit
    or roars.

- **Your health** (`src/systems/VitalsSystem.ts`, FF2's arcade HUD in
  neon): a small segmented bar, YOU, low at the front of your pad and
  tilted up at you, so a glance down reads it (and it sits well below
  every titan's weak points). A hit leaves a white trail of what you lost
  and flashes its frame red; under 30% it all goes red and pulses. It rises
  with the titan and sinks when the fight's over.

- **Hits that land** (`src/fx/impact.ts`). Every hit flashes and throws a
  shockwave ring that faces you; a weak-point hit also freezes the titan
  for a beat, flares every lit edge on it white, and leaves a white trail
  on its health bar showing what you just took off. The killing blow goes
  up in light.

- **Sound** (`src/audio/sfx.ts`, DESIGN §2.2). Every sound synthesised
  live, no files: fireballs that sound like fire, as in FIRE FIGHT 2
  (a furnace catching, a deep whoomp away, a roar in flight), menus that tick and click, and a titan you can *hear* coming, its
  windup ticking faster and higher from the fist that's about to swing,
  the beam's chord climbing from its eye, a heartbeat when you're nearly
  done. Positioned sounds come from
  where they happen, in 3D round your head. Hear them all on the **sound
  board**, `sounds.html`.
- **Music** (`src/audio/music.ts`): *Overtime* at the console, and FIRE
  FIGHT 2's score for the rest (*Aim* in practice, a battle track in each
  titan fight, the victory sting when one falls to you). Every track is
  loudness-matched as it loads, so none jumps out over the fight.
- The wrist panel is now two by two: **LEAVE** and **RECENTRE**, then
  **SOUND** and **MUSIC**, each on and off, remembered.

- **Sparks that fade to clear.** Over passthrough, a frame's *alpha* is
  what hides your room, and additive light still writes it: a spark
  faded to black but still drawn was a black dot hanging in the room.
  Sparks and the platform's glow now fade their alpha with their light.

- **1V1, against the bot** (`src/systems/DuelSystem.ts`, DESIGN §4.1).
  Poke 1V1 and a neon boxer fades in on its own ember pad 3 m across from
  yours, with two fireballs of its own. FIRE FIGHT 2's classic duel:
  - first to **two rounds**, 60 s each, a 3-2-1 and a bell before every
    one; at the bell's end the healthier one takes it;
  - it winds a ball up round its glove (the tell), throws it at **you**
    (25% on your head, 20% on your body) and recalls it. **Step, duck,**
    put an **open palm** in its path, or knock it out of the air with a
    ball orbiting your hand or flying home;
  - your ball hurts it the same, on its head or body. It dodges, and it
    raises a **guard** that slaps your ball down. Meet its ball with yours
    in mid-air and both burn out;
  - its brain is FF2's **bot ladder**, ROOKIE to OVERLORD. A rookie throws
    slow at where you *were*; an overlord leads your head, punishes empty
    hands, feints and double-taps. **NEXT BOT** on the results face climbs
    a rung; a lower rung eases off while you trail on rounds.

All five titans fight, and 1V1 is in against the bot. Next up: tune both
on a headset, then 1V1 over the relay.

## Run it

```bash
npm install
npm run dev          # https://localhost:5173 — IWSDK's desktop emulator included
```

On a Quest, open the dev URL (or the Pages site) in the headset browser,
put the controllers down and press **Enter**. In the desktop emulator,
switch the input mode to hands.

## Checks

```bash
npm run typecheck && npm run build
npm run check:hands  # the hand-shape reader's laws, joint by joint (plain Node)
npm run check:strike # the titans' reach and strike paths, and the grammar (plain Node)
npm run check:duel   # the bot ladder and its mercy, the body a ball hits, the
                     # bot's aim, and the dodge (plain Node)
npm run check:smoke  # needs `npm run dev`: boots, enters onto the console,
                     # pokes its way through every menu, plays the fireball
                     # loop, and fights RUSTHOOK (hit, dodge, palm block,
                     # beam, a ball on its core, the win and the results),
                     # then PISTONKAISER from NEXT TITAN (the piston chain,
                     # weak points taking turns), VULTURE (the volley),
                     # JUGGERNAUT (mortar, clap, ducking the sweeping beam)
                     # and GOLIATH (the decree's gap, the enrage), then 1V1
                     # (its throw dodged, palmed and taken, your ball on it,
                     # the clash, its guard, three rounds to the results and
                     # up the ladder) with the emulator's hands
                     # (-- --shots DIR: a picture of each)
npm run check:titans # needs `npm run dev`: every titan builds in neon, fits
                     # the room and stays in the draw budget (-- --shots for pictures)
npm run check:sounds # needs `npm run dev`: every sound renders, audible and
                     # unclipped (-- --reel out.wav for all of them as one file)
```

CI runs all of it on every push and PR (`.github/workflows/checks.yml`).
Pushes to `main` deploy to GitHub Pages (`.github/workflows/deploy.yml`).

## Backend

There isn't one yet, on purpose: nothing so far needs it. Flux gets its own
Firebase project (not FF2's) when boards and profiles arrive, configured
from `VITE_FIREBASE_*` env vars.

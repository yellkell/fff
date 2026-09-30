# FIRE FIGHT FLUX

Fireball boxing for the glasses: **passthrough only, hands only, bosses
first**. A cut-down FIRE FIGHT ([`yellkell/ff2`](https://github.com/yellkell/ff2))
rebuilt for the headsets that ship without controllers. **Read
[`DESIGN.md`](DESIGN.md)** for the whole plan and build order.

## What's here now (build order steps 1–2)

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
    TITANS and 1V1 (locked until they're built) and PRACTICE. It sinks
    away when you start.
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
    on its **results** face: REMATCH, NEXT TITAN (locked), HOME.

- **Sound** (`src/audio/sfx.ts`, DESIGN §2.2). Every sound synthesised
  live, no files: fireballs that hum in your hands and whoomp away, menus
  that tick and click, and a titan you can *hear* coming, its windup
  whining from the fist that's about to swing, the beam charging from its
  eye, a heartbeat when you're nearly done. Positioned sounds come from
  where they happen, in 3D round your head. Hear them all on the **sound
  board**, `sounds.html`.
- **Music** (`src/audio/music.ts`): *Overtime* at the console, and FIRE
  FIGHT 2's score for the rest (*Aim* in practice, a battle track in each
  titan fight, the victory sting when one falls to you). Every track is
  loudness-matched as it loads, so none jumps out over the fight.
- The wrist panel is now two by two: **LEAVE** and **RECENTRE**, then
  **SOUND** and **MUSIC**, each on and off, remembered.

Next up: tune RUSTHOOK on a headset, then the other four titans.

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
npm run check:smoke  # needs `npm run dev`: boots, enters onto the console,
                     # pokes its way through every menu, plays the fireball
                     # loop, and fights RUSTHOOK (hit, dodge, palm block,
                     # beam, a ball on its core, the win and the results)
                     # with the emulator's hands
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

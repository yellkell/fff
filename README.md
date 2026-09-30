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
- **Practice targets.** Neon rings in front of you that burst when a ball
  goes through them.

Next up: the first titan, whose blows come from its own fist (DESIGN §3).

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
npm run check:smoke  # needs `npm run dev`: boots, enters, and plays the whole
                     # fireball loop with the emulator's hands
```

CI runs all of it on every push and PR (`.github/workflows/checks.yml`).
Pushes to `main` deploy to GitHub Pages (`.github/workflows/deploy.yml`).

## Backend

There isn't one yet, on purpose: nothing so far needs it. Flux gets its own
Firebase project (not FF2's) when boards and profiles arrive, configured
from `VITE_FIREBASE_*` env vars.

/**
 * FIRE FIGHT FLUX — boot. Passthrough only (immersive-ar), hands only
 * (hand tracking REQUIRED: a headset without it can't start a session, which
 * is the point: there are no controllers in this game).
 */

import { createSystem, launchXR, SessionMode, World } from '@iwsdk/core';
import { AmbientLight } from 'three';
import { buildPlatform } from './arena/platform.js';
import { audioState, isMuted, masterGain, sfxLog, unlockAudio } from './audio/sfx.js';
import { fx, Sparks } from './fx/neon.js';
import { game } from './game/state.js';
import { AudioSystem } from './systems/AudioSystem.js';
import { BoundarySystem } from './systems/BoundarySystem.js';
import { ConsoleSystem } from './systems/ConsoleSystem.js';
import { ballPoses, ballStates, FireballSystem, releaseInfo } from './systems/FireballSystem.js';
import { hands } from './input/hands.js';
import { HandSystem } from './systems/HandSystem.js';
import { PokeSystem } from './systems/PokeSystem.js';
import { TargetSystem } from './systems/TargetSystem.js';
import { titanDebug, titanStats, TitanSystem } from './systems/TitanSystem.js';
import { WristSystem } from './systems/WristSystem.js';
import { buttonPose, buttons } from './ui/poke.js';

const container = document.getElementById('scene-container') as HTMLDivElement;
const enter = document.getElementById('enter') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLParagraphElement;

/** Ticks the shared spark pool. */
class FxSystem extends createSystem({}) {
  update(delta: number): void {
    fx.sparks?.update(delta);
  }
}

World.create(container, {
  xr: {
    sessionMode: SessionMode.ImmersiveAR,
    offer: 'none',
    features: { handTracking: { required: true } },
  },
  features: { grabbing: false, locomotion: false, spatialUI: false },
  render: { defaultLighting: false, camera: { position: [0, 1.6, 0] } },
}).then(async (world) => {
  // Passthrough: nothing behind the scene but your room.
  world.scene.background = null;
  world.renderer.setClearAlpha(0);
  world.scene.add(new AmbientLight(0xffffff, 0.4));

  world.scene.add(buildPlatform());
  fx.sparks = new Sparks(world.scene);

  // Order: hands first (everything reads them); then the menus place their
  // panels and the poke system presses them; then what plays on the hands.
  world
    .registerSystem(HandSystem)
    .registerSystem(ConsoleSystem)
    .registerSystem(WristSystem)
    .registerSystem(PokeSystem)
    .registerSystem(TargetSystem)
    .registerSystem(TitanSystem)
    .registerSystem(FireballSystem)
    .registerSystem(BoundarySystem)
    .registerSystem(FxSystem)
    .registerSystem(AudioSystem);

  // The headless probes' window into the game (tools/*-check.mjs).
  (window as unknown as { __flux: unknown }).__flux = {
    hands: () => ({
      left: { tracked: hands.left.shape.tracked, closed: hands.left.shape.closed, fresh: hands.left.fresh, curl: hands.left.shape.last?.curl, pinch: hands.left.shape.last?.pinch, palm: hands.left.palm.toArray(), palmNormal: hands.left.palmNormal.toArray(), indexTip: hands.left.indexTip.toArray() },
      right: { tracked: hands.right.shape.tracked, closed: hands.right.shape.closed, fresh: hands.right.fresh, curl: hands.right.shape.last?.curl, pinch: hands.right.shape.last?.pinch, palm: hands.right.palm.toArray(), palmNormal: hands.right.palmNormal.toArray(), indexTip: hands.right.indexTip.toArray() },
    }),
    balls: ballStates,
    ballPoses,
    releaseInfo,
    mode: () => game.mode,
    titan: () => ({ ...titanStats, playerHp: game.playerHp, result: game.result }),
    titanDebug,
    sound: () => ({ state: audioState(), muted: isMuted(), gain: masterGain(), log: { ...sfxLog } }),
    wristOpen: () => game.wristOpen,
    buttons: () =>
      Object.fromEntries(buttons.map((b) => [b.id, { ...buttonPose(b), active: b.active, locked: b.locked, presses: b.presses, refusals: b.refusals }])),
    head: () => {
      const p = world.camera.getWorldPosition(world.camera.position.clone());
      const d = world.camera.getWorldDirection(world.camera.position.clone());
      return { pos: p.toArray(), dir: d.toArray() };
    },
  };

  const ar = (await navigator.xr?.isSessionSupported(SessionMode.ImmersiveAR).catch(() => false)) === true;
  if (!ar) {
    status.textContent = 'This needs a passthrough headset (immersive-ar).';
    return;
  }
  status.textContent = 'Put your controllers down. Hands only.';
  enter.disabled = false;
  enter.addEventListener('click', () => {
    enter.disabled = true;
    // The one gesture that's allowed to start sound.
    unlockAudio();
    launchXR(world, { sessionMode: SessionMode.ImmersiveAR });
    // Poll on a timer, not rAF: Quest suspends window rAF while presenting.
    const poll = window.setInterval(() => {
      if (!world.session) return;
      window.clearInterval(poll);
      document.body.classList.add('in-xr');
      world.session.addEventListener(
        'end',
        () => {
          document.body.classList.remove('in-xr');
          enter.disabled = false;
        },
        { once: true },
      );
    }, 50);
    window.setTimeout(() => {
      if (!world.session) enter.disabled = false;
    }, 4000);
  });
});

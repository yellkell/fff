/**
 * THE WRIST PANEL: what the A button was. Turn your LEFT palm up and look
 * at it; a small panel opens just above your palm, facing you. Poke it with
 * your right index finger. Turn the palm over, or look away, and it closes.
 *
 *   LEAVE     end what you're doing and go back to the console.
 *   RECENTRE  put the platform under your feet, facing where you look.
 *   SOUND     on or off (remembered).
 *
 * Opening takes the pose held for a moment, with a looser pose to stay
 * open, so a hand passing through palm-up on the way to a punch doesn't
 * flash it open. While it's open, your hands are on a menu: they can't
 * light, throw or recall a ball.
 */

import { createSystem } from '@iwsdk/core';
import { Group, Vector3 } from 'three';
import { NEON, WRIST } from '../config.js';
import { isMuted, setMuted, sfx } from '../audio/sfx.js';
import { recentre } from '../game/recentre.js';
import { game, setMode } from '../game/state.js';
import { hands } from '../input/hands.js';
import { frame, glass } from '../ui/kit.js';
import { addButton, PokeButton } from '../ui/poke.js';

const _head = new Vector3();
const _gaze = new Vector3();
const _to = new Vector3();
const _want = new Vector3();
const cos = (deg: number): number => Math.cos((deg * Math.PI) / 180);

export class WristSystem extends createSystem({}) {
  private readonly root = new Group();
  private leave!: PokeButton;
  private centre!: PokeButton;
  private sound!: PokeButton;
  private poseFor = 0;
  private lostFor = 0;
  private scale = 0;

  init(): void {
    const W = WRIST.width;
    const H = WRIST.height;
    this.root.name = 'wrist';
    this.root.add(glass(W, H, 0.012));
    this.root.add(frame(W, H, 0.003, NEON.violet, 0.012));

    const bw = (W - 0.03) / 3 - 0.004;
    const bh = H - 0.022;
    this.leave = addButton(
      new PokeButton({
        id: 'leave',
        width: bw,
        height: bh,
        label: 'LEAVE',
        sub: 'TO THE CONSOLE',
        accent: NEON.danger,
        hands: ['right'],
        onPress: () => setMode('home'),
      }),
    );
    this.centre = addButton(
      new PokeButton({
        id: 'recentre',
        width: bw,
        height: bh,
        label: 'RECENTRE',
        sub: 'PAD UNDER YOU',
        accent: NEON.cyan,
        hands: ['right'],
        onPress: () => recentre(this.player, this.camera),
      }),
    );
    this.sound = addButton(
      new PokeButton({
        id: 'sound',
        width: bw,
        height: bh,
        label: isMuted() ? 'SOUND OFF' : 'SOUND ON',
        sub: 'POKE TO SWITCH',
        accent: NEON.lime,
        hands: ['right'],
        onPress: () => {
          setMuted(!isMuted());
          this.sound.setText(isMuted() ? 'SOUND OFF' : 'SOUND ON', 'POKE TO SWITCH');
        },
      }),
    );
    const step = bw + 0.008;
    this.leave.root.position.set(-step, 0, 0.003);
    this.centre.root.position.set(0, 0, 0.003);
    this.sound.root.position.set(step, 0, 0.003);
    this.root.add(this.leave.root, this.centre.root, this.sound.root);
    this.root.visible = false;
    this.scene.add(this.root);
  }

  update(delta: number): void {
    const h = hands.left;
    this.camera.getWorldPosition(_head);
    this.camera.getWorldDirection(_gaze);
    _to.copy(h.palm).sub(_head).normalize();
    const up = h.palmNormal.y;
    const look = _gaze.dot(_to);
    const ok = h.shape.tracked && !h.shape.closed;
    const open = game.wristOpen;
    const holding = open
      ? ok && up > WRIST.stayUp && look > cos(WRIST.stayGaze)
      : ok && up > WRIST.openUp && look > cos(WRIST.openGaze);

    if (holding) {
      this.poseFor += delta;
      this.lostFor = 0;
    } else {
      this.lostFor += delta;
      this.poseFor = 0;
    }
    if (!open && this.poseFor >= WRIST.openHold) {
      game.wristOpen = true;
      sfx('wristOpen', h.palm);
      // Snap to the palm on opening; follow smoothly after.
      this.root.position.copy(h.palm).y += WRIST.lift;
    } else if (open && this.lostFor >= WRIST.closeHold) {
      game.wristOpen = false;
      sfx('wristClose', this.root.position);
    }

    this.scale = Math.min(1, Math.max(0, this.scale + (game.wristOpen ? delta : -delta) / 0.15));
    this.root.visible = this.scale > 0;
    if (!this.root.visible) {
      this.leave.active = this.centre.active = this.sound.active = false;
      return;
    }
    this.root.scale.setScalar(Math.max(0.001, this.scale));
    if (h.fresh) {
      _want.copy(h.palm).y += WRIST.lift;
      // Heavily smoothed: a panel jittering under your finger is unpokeable.
      this.root.position.lerp(_want, Math.min(1, delta * 12));
    }
    this.root.lookAt(_head);

    // Nothing to leave from the console itself.
    this.leave.setLocked(game.mode === 'home');
    this.leave.active = this.centre.active = this.sound.active = game.wristOpen && this.scale >= 1;
  }
}

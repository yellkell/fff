/**
 * Keeps the sound kit's listener on your head (audio/sfx.ts), so every
 * positioned sound comes from where it happens in your room; and while the
 * browser has the sound parked, keeps asking for it back.
 */

import { createSystem } from '@iwsdk/core';
import { Quaternion, Vector3 } from 'three';
import { audioState, setListener, wakeAudio } from '../audio/sfx.js';

const _pos = new Vector3();
const _q = new Quaternion();
const _fwd = new Vector3();
const _up = new Vector3();

export class AudioSystem extends createSystem({}) {
  private retry = 0;

  update(delta: number): void {
    this.retry -= delta;
    if (this.retry <= 0 && audioState() !== 'running') {
      this.retry = 0.5;
      wakeAudio();
    }
    this.camera.getWorldPosition(_pos);
    this.camera.getWorldQuaternion(_q);
    _fwd.set(0, 0, -1).applyQuaternion(_q);
    _up.set(0, 1, 0).applyQuaternion(_q);
    setListener(_pos, _fwd, _up);
  }
}

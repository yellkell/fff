/**
 * RECENTRE: move the world so your platform is under your feet and its
 * front faces where you're looking. It turns and slides the player rig
 * (the XR origin), not the platform, so everything placed in world space
 * stays put relative to the platform and you land on your standing spot.
 */

import { type Object3D, Vector3 } from 'three';
import { game } from './state.js';

const _head = new Vector3();
const _fwd = new Vector3();
const UP = new Vector3(0, 1, 0);

export function recentre(player: Object3D, camera: Object3D): void {
  camera.getWorldPosition(_head);
  camera.getWorldDirection(_fwd);
  // Yaw of your gaze, 0 when you face −z (toward the fight).
  const yaw = Math.atan2(-_fwd.x, -_fwd.z);
  // Slide your head over the origin, then turn about it.
  player.position.x -= _head.x;
  player.position.z -= _head.z;
  player.position.applyAxisAngle(UP, -yaw);
  player.rotation.y -= yaw;
  player.updateMatrixWorld(true);
  game.recentred++;
}

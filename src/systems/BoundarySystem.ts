/**
 * The rim walls: one neon panel standing on each edge of the platform,
 * invisible while you're well inside and glowing awake as your head nears
 * that edge (FIRE FIGHT 2's Guardian-style law, head only). No health
 * drain yet: there's no fight to lose. That arrives with the bosses.
 */

import { createSystem } from '@iwsdk/core';
import { AdditiveBlending, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import { BOUNDARY, NEON, PLATFORM_VERTICES } from '../config.js';

const _head = new Vector3();

interface Wall {
  mesh: Mesh;
  mat: MeshBasicMaterial;
  ax: number;
  az: number;
  /** Outward normal (x, z). */
  nx: number;
  nz: number;
}

export class BoundarySystem extends createSystem({}) {
  private walls: Wall[] = [];

  init(): void {
    const n = PLATFORM_VERTICES.length;
    for (let i = 0; i < n; i++) {
      const [ax, az] = PLATFORM_VERTICES[i];
      const [bx, bz] = PLATFORM_VERTICES[(i + 1) % n];
      const len = Math.hypot(bx - ax, bz - az);
      // Counter-clockwise from above with −z forward: outward is (dz, −dx).
      const nx = (bz - az) / len;
      const nz = -(bx - ax) / len;
      const mat = new MeshBasicMaterial({
        color: NEON.cyan,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
        depthWrite: false,
        side: DoubleSide,
      });
      const mesh = new Mesh(new PlaneGeometry(len, BOUNDARY.wallHeight), mat);
      mesh.position.set((ax + bx) / 2, BOUNDARY.wallHeight / 2, (az + bz) / 2);
      mesh.rotation.y = Math.atan2(nx, nz);
      mesh.visible = false;
      this.scene.add(mesh);
      this.walls.push({ mesh, mat, ax, az, nx, nz });
    }
  }

  update(): void {
    this.camera.getWorldPosition(_head);
    for (const w of this.walls) {
      // Signed distance past this edge (negative = inside).
      const d = (_head.x - w.ax) * w.nx + (_head.z - w.az) * w.nz;
      const k = Math.min(1, Math.max(0, 1 + d / BOUNDARY.warnDistance));
      w.mesh.visible = k > 0.01;
      w.mat.opacity = 0.35 * k * k;
      w.mat.color.setHex(d > 0 ? NEON.danger : NEON.cyan);
    }
  }
}

/**
 * A CHAMPIONSHIP BELT, in neon (game/career.ts says which). Drawn like the
 * titans: dark glass with every edge a lit tube and a soft halo.
 *
 *   the STRAP     a band in the belt's colour, bowed back at the ends as if
 *                 round a waist, a stitch line along it;
 *   the PLATE     an octagon of gold (or silver) in the middle, a ring
 *                 inside it, and a glowing stone at its heart;
 *   SIDE PLATES   four smaller ones, two either side, set into the strap.
 *
 * About 44 cm across at scale 1, facing +z. `setLevel` dims it to a ghost
 * (a belt you haven't won yet, on the rack) or tints it red (stripped).
 */

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  type Sprite,
} from 'three';
import { NEON } from '../config.js';
import type { Belt } from '../game/career.js';
import { glowSprite } from '../fx/neon.js';
import { tubes } from '../titans/neon.js';

const W = 0.44;
const STRAP_H = 0.07;
/** How far the ends bow back. */
const BOW = 0.07;
const PLATE_R = 0.072;
const LINE = 0.0018;
const HALO = 0.006;

/** The strap's surface at x (−W/2…W/2): how far back it bows. */
const bow = (x: number): number => -BOW * (2 * x / W) ** 2;

const RED = new Color(NEON.danger);

export class BeltModel {
  readonly root = new Group();
  readonly belt: Belt;
  private readonly lit: { mat: MeshBasicMaterial; base: Color; opacity: number }[] = [];
  private readonly gem: Sprite;
  private readonly dots: Sprite[] = [];
  private level = 1;

  constructor(belt: Belt) {
    this.belt = belt;
    this.root.name = `belt-${belt.id}`;

    // The strap: a bowed band of tinted glass, edged in its colour.
    const n = 24;
    const pos: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= n; i++) {
      const x = -W / 2 + (W * i) / n;
      pos.push(x, -STRAP_H / 2, bow(x), x, STRAP_H / 2, bow(x));
      if (i < n) idx.push(i * 2, i * 2 + 2, i * 2 + 1, i * 2 + 1, i * 2 + 2, i * 2 + 3);
    }
    const band = new BufferGeometry();
    band.setAttribute('position', new Float32BufferAttribute(pos, 3));
    band.setIndex(idx);
    this.root.add(this.glassMesh(band, belt.strap, 0.16));

    const strap: number[] = [];
    const stitch: number[] = [];
    for (let i = 0; i < n; i++) {
      const x0 = -W / 2 + (W * i) / n;
      const x1 = -W / 2 + (W * (i + 1)) / n;
      for (const y of [-STRAP_H / 2, STRAP_H / 2]) strap.push(x0, y, bow(x0), x1, y, bow(x1));
      // A dashed stitch just inside each edge.
      if (i % 2 === 0) for (const y of [-STRAP_H * 0.32, STRAP_H * 0.32]) stitch.push(x0, y, bow(x0) + 0.001, x1, y, bow(x1) + 0.001);
    }
    for (const x of [-W / 2, W / 2]) strap.push(x, -STRAP_H / 2, bow(x), x, STRAP_H / 2, bow(x));
    this.edges(strap, belt.strap, 1);
    this.edges(stitch, belt.strap, 0.5);

    // The centre plate: an octagon, a ring inside it, and the stone.
    const plate: number[] = [];
    const disc: number[] = [];
    const octagon = (r: number, z: number, into: number[]): void => {
      for (let k = 0; k < 8; k++) {
        const a0 = Math.PI / 8 + (k * Math.PI) / 4;
        const a1 = a0 + Math.PI / 4;
        into.push(Math.cos(a0) * r, Math.sin(a0) * r, z, Math.cos(a1) * r, Math.sin(a1) * r, z);
      }
    };
    octagon(PLATE_R, 0.012, plate);
    octagon(PLATE_R * 0.86, 0.014, plate);
    for (let k = 0; k < 16; k++) {
      const a0 = (k * Math.PI) / 8;
      const a1 = a0 + Math.PI / 8;
      disc.push(Math.cos(a0) * PLATE_R * 0.5, Math.sin(a0) * PLATE_R * 0.5, 0.016, Math.cos(a1) * PLATE_R * 0.5, Math.sin(a1) * PLATE_R * 0.5, 0.016);
    }
    this.edges(plate, belt.metal, 1);
    this.edges(disc, belt.metal, 0.8);
    const face = new BufferGeometry();
    const fp: number[] = [0, 0, 0.011];
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI / 8 + (k * Math.PI) / 4;
      fp.push(Math.cos(a) * PLATE_R, Math.sin(a) * PLATE_R, 0.011);
    }
    face.setAttribute('position', new Float32BufferAttribute(fp, 3));
    face.setIndex(Array.from({ length: 8 }, (_, k) => [0, k + 1, k + 2]).flat());
    this.root.add(this.glassMesh(face, belt.metal, 0.12));
    this.gem = glowSprite(belt.gem, PLATE_R * 1.1, 0.95);
    this.gem.position.z = 0.02;
    this.root.add(this.gem);

    // Side plates: four, two each side of the centre plate, the outer pair
    // a little smaller. Each sits ON the strap: inside its height, every
    // point bowed back with it (a flat plate stood up to 2 cm proud of the
    // curve at its outer edge), with a tinted face and its stone on that face.
    const side: number[] = [];
    const lift = 0.003;
    for (const sx of [-1, 1]) {
      for (const [at, hw, hh] of [
        [0.104, 0.026, 0.028],
        [0.166, 0.022, 0.025],
      ] as const) {
        const cx = sx * at;
        const c = 0.008;
        const corners: [number, number][] = [
          [cx - hw + c, hh], [cx + hw - c, hh], [cx + hw, hh - c], [cx + hw, -hh + c],
          [cx + hw - c, -hh], [cx - hw + c, -hh], [cx - hw, -hh + c], [cx - hw, hh - c],
        ];
        // The outline, its long edges cut short so they follow the bow.
        const ring: [number, number][] = [];
        for (let k = 0; k < corners.length; k++) {
          const [x0, y0] = corners[k];
          const [x1, y1] = corners[(k + 1) % corners.length];
          const steps = Math.abs(x1 - x0) > 0.01 ? 4 : 1;
          for (let j = 0; j < steps; j++) ring.push([x0 + ((x1 - x0) * j) / steps, y0 + ((y1 - y0) * j) / steps]);
        }
        const z = (x: number): number => bow(x) + lift;
        for (let k = 0; k < ring.length; k++) {
          const [x0, y0] = ring[k];
          const [x1, y1] = ring[(k + 1) % ring.length];
          side.push(x0, y0, z(x0), x1, y1, z(x1));
        }
        const fp = [cx, 0, z(cx)];
        for (const [x, y] of ring) fp.push(x, y, z(x));
        const face = new BufferGeometry();
        face.setAttribute('position', new Float32BufferAttribute(fp, 3));
        face.setIndex(ring.flatMap((_, k) => [0, k + 1, ((k + 1) % ring.length) + 1]));
        this.root.add(this.glassMesh(face, belt.metal, 0.1));
        const dot = glowSprite(belt.gem, hw * 0.75, 0.9);
        dot.position.set(cx, 0, z(cx) + 0.002);
        this.root.add(dot);
        this.dots.push(dot);
      }
    }
    this.edges(side, belt.metal, 0.85);
    this.setLevel(1);
  }

  /** 1 = won and lit; toward 0, a ghost on the rack; `stripped` tints it red. */
  setLevel(k: number, stripped = false): void {
    this.level = k;
    for (const l of this.lit) {
      l.mat.color.copy(l.base);
      if (stripped) l.mat.color.lerp(RED, 0.7);
      l.mat.opacity = l.opacity * (0.12 + 0.88 * k);
    }
    this.gem.visible = k > 0.5;
    for (const d of this.dots) d.visible = k > 0.5;
  }

  /** A pulse of extra light (an award, a defence), 0–1. */
  flare(k: number): void {
    for (const l of this.lit) l.mat.opacity = l.opacity * (0.12 + 0.88 * this.level) * (1 + 1.5 * k);
    this.gem.scale.setScalar(PLATE_R * 1.1 * (1 + k));
  }

  private glassMesh(g: BufferGeometry, color: number, tint: number): Mesh {
    const mat = new MeshBasicMaterial({
      color: new Color(color).multiplyScalar(tint),
      transparent: true,
      opacity: 0.85,
      side: DoubleSide,
      depthWrite: false,
    });
    this.lit.push({ mat, base: mat.color.clone(), opacity: mat.opacity });
    return new Mesh(g, mat);
  }

  private edges(segs: number[], color: number, strength: number): void {
    const core = new MeshBasicMaterial({ color, transparent: true, opacity: strength, toneMapped: false, depthWrite: false });
    const halo = new MeshBasicMaterial({ color, transparent: true, opacity: 0.22 * strength, blending: AdditiveBlending, depthWrite: false, toneMapped: false });
    this.root.add(new Mesh(tubes(segs, LINE), core), new Mesh(tubes(segs, HALO), halo));
    this.lit.push({ mat: core, base: core.color.clone(), opacity: core.opacity }, { mat: halo, base: halo.color.clone(), opacity: halo.opacity });
  }
}

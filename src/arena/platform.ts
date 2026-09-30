/**
 * Your platform, in passthrough: no slab, no deck art, just light on your
 * real floor. A thick neon rim traces the octagon (a tenth cut off the
 * back, see config PLATFORM): a bright tube with a soft halo either side and
 * a low lit curb standing on the edge. A magenta stripe runs just inside it,
 * a faint fill shows where it's safe to stand, and a bar marks the front
 * edge so you always know which way the fight is. The rim walls (see
 * BoundarySystem) stand on the same outline.
 *
 * Nothing here is a THREE.Line: WebGL draws those one pixel wide, which is a
 * hairline in a headset. Every stroke is a strip of triangles with width.
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
  PlaneGeometry,
  Shape,
  ShapeGeometry,
} from 'three';
import { NEON, PLATFORM, PLATFORM_RIM, PLATFORM_VERTICES } from '../config.js';

const LIFT = 0.004; // just off the floor, clear of z-fighting with nothing

/**
 * The outline pushed `d` metres inward (negative = outward). Corners are
 * mitred, so every edge of the result sits exactly `d` from the original.
 */
function inset(d: number): Array<[number, number]> {
  const v = PLATFORM_VERTICES;
  const n = v.length;
  return v.map(([x, z], i) => {
    const [px, pz] = v[(i + n - 1) % n];
    const [qx, qz] = v[(i + 1) % n];
    // Counter-clockwise from above with −z forward: inward is (−dz, dx).
    const l1 = Math.hypot(x - px, z - pz);
    const l2 = Math.hypot(qx - x, qz - z);
    const n1x = -(z - pz) / l1;
    const n1z = (x - px) / l1;
    const n2x = -(qz - z) / l2;
    const n2z = (qx - x) / l2;
    const mx = n1x + n2x;
    const mz = n1z + n2z;
    const ml = Math.hypot(mx, mz);
    // Along the corner's bisector, stretched so each edge moves by d.
    const s = d / ((mx / ml) * n1x + (mz / ml) * n1z);
    return [x + (mx / ml) * s, z + (mz / ml) * s];
  });
}

/** One loop of a band: the outline inset by `d`, at height `y`, lit `c`. */
interface Ring {
  d: number;
  y: number;
  c: Color;
}

/**
 * A closed band around the platform, stitched ring to ring. Vary `d` for a
 * ribbon on the floor, vary `y` for a curb standing on it. The light is
 * additive, so a black ring is simply no light: that's how the glow fades.
 */
function band(rings: Ring[]): Mesh {
  const n = PLATFORM_VERTICES.length;
  const pos: number[] = [];
  const col: number[] = [];
  for (const r of rings) {
    for (const [x, z] of inset(r.d)) {
      pos.push(x, r.y, z);
      col.push(r.c.r, r.c.g, r.c.b);
    }
  }
  const idx: number[] = [];
  for (let r = 0; r < rings.length - 1; r++) {
    for (let i = 0; i < n; i++) {
      const a = r * n + i;
      const b = r * n + ((i + 1) % n);
      const c = a + n;
      const d = b + n;
      idx.push(a, b, c, b, d, c);
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  return new Mesh(
    geo,
    new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
}

const lit = (hex: number, k: number): Color => new Color(hex).multiplyScalar(k);

export function buildPlatform(): Group {
  const g = new Group();
  g.name = 'platform';
  const R = PLATFORM_RIM;

  // The faint safe-ground fill.
  const shape = new Shape();
  PLATFORM_VERTICES.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, -z) : shape.lineTo(x, -z)));
  shape.closePath();
  const fill = new Mesh(
    new ShapeGeometry(shape),
    new MeshBasicMaterial({
      color: NEON.cyan,
      transparent: true,
      opacity: 0.06,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  // Shape space is x/y; lay it flat (y → −z, hence the −z above).
  fill.rotation.x = -Math.PI / 2;
  fill.position.y = LIFT * 0.5;
  g.add(fill);

  // The halo: brightest on the outline, easing to nothing either side.
  const halo: Ring[] = [];
  for (const t of [-1, -0.6, -0.3, 0, 0.3, 0.6, 1]) {
    halo.push({ d: t * R.glowWidth, y: LIFT, c: lit(NEON.cyan, R.glowPeak * (1 - Math.abs(t)) ** 2) });
  }
  g.add(band(halo));

  // The tube: solid, a touch whiter than the halo so it reads as the source.
  const core = new Color(NEON.cyan).lerp(new Color(NEON.hot), 0.35);
  g.add(
    band([
      { d: -R.coreWidth / 2, y: LIFT * 1.5, c: core },
      { d: R.coreWidth / 2, y: LIFT * 1.5, c: core },
    ]),
  );

  // The curb: lit at the floor, fading as it rises.
  g.add(
    band([
      { d: 0, y: 0, c: lit(NEON.cyan, 0.9) },
      { d: 0, y: R.lipHeight * 0.4, c: lit(NEON.cyan, 0.45) },
      { d: 0, y: R.lipHeight, c: lit(NEON.cyan, 0) },
    ]),
  );

  // The magenta stripe just inside.
  const m = lit(NEON.magenta, 0.7);
  g.add(
    band([
      { d: R.innerInset - R.innerWidth / 2, y: LIFT * 1.5, c: m },
      { d: R.innerInset + R.innerWidth / 2, y: LIFT * 1.5, c: m },
    ]),
  );

  // The front tick: a thick bright bar just inside the front edge.
  const tick = new Mesh(
    new PlaneGeometry(R.tickHalf * 2, R.tickWidth),
    new MeshBasicMaterial({
      color: NEON.hot,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  tick.rotation.x = -Math.PI / 2;
  tick.position.set(0, LIFT * 2, -PLATFORM.frontDepth + R.tickInset);
  g.add(tick);

  return g;
}

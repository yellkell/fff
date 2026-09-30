/**
 * Your platform, in passthrough: no slab, no deck art, just light on your
 * real floor. A double neon rim traces the octagon (a tenth cut off the
 * back, see config PLATFORM), a faint fill shows where it's safe to stand,
 * and a lit tick marks the front edge so you always know which way the
 * fight is. The rim walls (see BoundarySystem) stand on the same outline.
 */

import {
  AdditiveBlending,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Shape,
  ShapeGeometry,
} from 'three';
import { NEON, PLATFORM, PLATFORM_VERTICES } from '../config.js';

const LIFT = 0.004; // just off the floor, clear of z-fighting with nothing

function outline(inset: number, color: number, opacity: number): Line {
  const pts: number[] = [];
  for (const [x, z] of [...PLATFORM_VERTICES, PLATFORM_VERTICES[0]]) {
    // Pull each vertex toward the centre for the inner rim.
    const len = Math.hypot(x, z) || 1;
    const k = Math.max(0, len - inset) / len;
    pts.push(x * k, LIFT, z * k);
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return new Line(
    geo,
    new LineBasicMaterial({ color, transparent: true, opacity, blending: AdditiveBlending, depthWrite: false }),
  );
}

export function buildPlatform(): Group {
  const g = new Group();
  g.name = 'platform';

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

  g.add(outline(0, NEON.cyan, 0.95));
  g.add(outline(0.035, NEON.magenta, 0.55));

  // The front tick: a short bright bar on the front edge.
  const tick = new BufferGeometry();
  tick.setAttribute(
    'position',
    new Float32BufferAttribute([-0.12, LIFT, -PLATFORM.frontDepth + 0.05, 0.12, LIFT, -PLATFORM.frontDepth + 0.05], 3),
  );
  g.add(new Line(tick, new LineBasicMaterial({ color: NEON.hot, transparent: true, blending: AdditiveBlending })));

  return g;
}

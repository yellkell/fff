/**
 * THE NEON FINISH: what turns FF2's painted steel titans into light in your
 * room. It runs once over a finished rig, after every part is placed:
 *
 *  - every PLATE becomes dark glass: near-opaque, faintly tinted, so the
 *    titan blocks the room behind it and reads as a solid thing;
 *  - every crease of every plate becomes a LIT EDGE: a thin bright tube
 *    with a soft additive halo. Real geometry with real width, like the
 *    platform rim: WebGL lines are one pixel wide, a hairline in a headset;
 *  - every GLOW (eye, visor, core, weak points, trims) is left glowing,
 *    unlit and at full colour: the thing you aim at stays the brightest;
 *  - gold stays gold: GOLIATH's trim edges are lit gold, not the line colour.
 *
 * Draw calls: edges are merged into one tube mesh (plus its halo) per
 * moving part, not per plate. A part that moves on its own (a curling
 * digit, a pulsing eye) keeps its own edges.
 */

import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  EdgesGeometry,
  Float32BufferAttribute,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  type MeshStandardMaterial,
  type Object3D,
  Vector3,
} from 'three';
import { TITAN_NEON } from '../config.js';
import { GOLD, type TitanRig } from './rigs.js';
import type { TitanLook } from './roster.js';
import { stageScale } from './stage.js';

const GOLD_LINE = 0xffc84a;

/** What the finish did, for the checks. */
export interface NeonStats {
  plates: number;
  glows: number;
  edges: number;
  tubeTriangles: number;
  edgeMeshes: number;
}

interface Bucket {
  owner: Object3D;
  gold: boolean;
  segs: number[];
}

const _a = new Vector3();
const _b = new Vector3();
const _d = new Vector3();
const _u = new Vector3();
const _v = new Vector3();

/** Four-sided tubes along every segment (pairs of points in `segs`), ends
 *  pushed out by the radius so corners close. One indexed geometry. */
export function tubes(segs: ArrayLike<number>, r: number): BufferGeometry {
  const n = segs.length / 6;
  const pos = new Float32Array(n * 8 * 3);
  const idx = new Uint32Array(n * 24);
  for (let i = 0; i < n; i++) {
    _a.fromArray(segs as number[], i * 6);
    _b.fromArray(segs as number[], i * 6 + 3);
    _d.copy(_b).sub(_a).normalize();
    _a.addScaledVector(_d, -r);
    _b.addScaledVector(_d, r);
    // Any two directions across the segment.
    _u.set(Math.abs(_d.y) < 0.9 ? 0 : 1, Math.abs(_d.y) < 0.9 ? 1 : 0, 0).cross(_d).normalize();
    _v.copy(_d).cross(_u);
    for (let k = 0; k < 4; k++) {
      const t = (Math.PI / 2) * k + Math.PI / 4;
      const cx = Math.cos(t) * r;
      const cy = Math.sin(t) * r;
      for (let e = 0; e < 2; e++) {
        const base = e === 0 ? _a : _b;
        const o = (i * 8 + e * 4 + k) * 3;
        pos[o] = base.x + _u.x * cx + _v.x * cy;
        pos[o + 1] = base.y + _u.y * cx + _v.y * cy;
        pos[o + 2] = base.z + _u.z * cx + _v.z * cy;
      }
    }
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      const a0 = i * 8 + k;
      const a1 = i * 8 + k2;
      const b0 = a0 + 4;
      const b1 = a1 + 4;
      idx.set([a0, a1, b0, a1, b1, b0], i * 24 + k * 6);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setIndex(Array.from(idx));
  return g;
}

function isGlow(m: MeshStandardMaterial): boolean {
  // FF2's glowMat is the low-metal emissive one; steel (even gold steel,
  // which glows faintly) is high-metal.
  return m.metalness < 0.5 && m.emissiveIntensity > 0;
}

/** FF2's gold steel (GOLIATH's crown and trim). Only gold: a plate tinted
 *  with the titan's accent keeps the line colour, because the accent is
 *  for what you aim at. */
function isGold(m: MeshStandardMaterial): boolean {
  return m.metalness >= 0.5 && m.emissiveIntensity > 0 && m.emissive.getHex() === GOLD;
}

export function neonFinish(rig: TitanRig, look: TitanLook): NeonStats {
  // Sizes are in staged metres: undo the room scale so a tube is the same
  // width on every titan once it's standing in front of you.
  const k = stageScale(rig.height);
  const edgeR = TITAN_NEON.edgeRadius / k;
  const haloR = TITAN_NEON.haloRadius / k;
  const minPart = TITAN_NEON.minPart / k;

  const lineCol = new Color(look.line);
  const body = new MeshBasicMaterial({
    color: lineCol.clone().multiplyScalar(TITAN_NEON.bodyTint),
    transparent: true,
    opacity: TITAN_NEON.bodyOpacity,
    // Pushed back a hair, so the edge tubes on its surface always win.
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  // Parts that move on their own keep their own edges.
  const own = new Set<Object3D>([...rig.eyes, rig.core, rig.low, ...rig.shoulders]);
  for (const arm of rig.arms) for (const d of arm.digits) own.add(d.node);

  const stats: NeonStats = { plates: 0, glows: 0, edges: 0, tubeTriangles: 0, edgeMeshes: 0 };
  const buckets = new Map<string, Bucket>();
  const ids = new Map<Object3D, number>();
  const bucketFor = (owner: Object3D, gold: boolean): Bucket => {
    if (!ids.has(owner)) ids.set(owner, ids.size);
    const key = `${ids.get(owner)}:${gold}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { owner, gold, segs: [] }));
    return b;
  };

  const meshes: Mesh[] = [];
  rig.root.updateMatrixWorld(true);
  rig.root.traverse((o) => {
    if ((o as Mesh).isMesh) meshes.push(o as Mesh);
  });

  const _m = new Matrix4();
  for (const mesh of meshes) {
    const mat = mesh.material as MeshStandardMaterial;
    if (!mat.isMeshStandardMaterial) continue;
    if (isGlow(mat)) {
      // Unlit, full colour: black base so the room's light can't grey it.
      mat.color.set(0x000000);
      mat.toneMapped = false;
      stats.glows++;
      continue;
    }
    if (mat.transparent) continue; // stencilled lettering: leave as painted
    const gold = isGold(mat);
    stats.plates++;

    let geo = mesh.geometry;
    // Round parts read round: enough sides that only their rims crease.
    if (geo instanceof CylinderGeometry) {
      const p = geo.parameters;
      if (p.radialSegments >= 8 && p.radialSegments < 20) {
        const g2 = new CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 20, p.heightSegments, p.openEnded, p.thetaStart, p.thetaLength);
        geo.dispose();
        mesh.geometry = geo = g2;
      }
    }
    mesh.material = body;
    mat.dispose();

    // Drawn outlines (a chain's links): each one a lit oval in its own
    // plane, instead of the crease at every facet of a solid torus.
    const loops = geo.userData.loops as Array<{ x: number; y: number; z: number; rx: number; ry: number; rot: number }> | undefined;
    if (loops) {
      mesh.updateMatrix();
      const b = bucketFor(mesh.parent!, gold);
      const N = 14;
      for (const l of loops) {
        const c = Math.cos(l.rot);
        const sn = Math.sin(l.rot);
        const at = (i: number, out: Vector3): Vector3 => {
          const a = (i / N) * Math.PI * 2;
          const px = Math.cos(a) * l.rx;
          const py = Math.sin(a) * l.ry;
          return out.set(l.x + px * c - py * sn, l.y + px * sn + py * c, l.z).applyMatrix4(mesh.matrix);
        };
        for (let i = 0; i < N; i++) {
          at(i, _a);
          at(i + 1, _b);
          b.segs.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
          stats.edges++;
        }
      }
      // Drawn in light alone: the solid links' dark glass would hide the
      // outlines of the ones turned edge-on.
      mesh.visible = false;
      continue;
    }

    // The lit edges, unless the part is too small to carry them.
    let part = geo.userData.partSize as number | undefined;
    if (part === undefined) {
      geo.computeBoundingBox();
      const size = geo.boundingBox!.getSize(_d);
      part = Math.max(size.x, size.y, size.z);
    }
    if (part < minPart) continue;
    const edges = new EdgesGeometry(geo, TITAN_NEON.creaseAngle);
    const ownsSelf = own.has(mesh) || mesh.children.length > 0;
    const owner = ownsSelf ? mesh : mesh.parent!;
    mesh.updateMatrix();
    _m.copy(ownsSelf ? new Matrix4() : mesh.matrix);
    const p = edges.getAttribute('position');
    const b = bucketFor(owner, gold);
    for (let i = 0; i < p.count; i += 2) {
      _a.fromBufferAttribute(p, i).applyMatrix4(_m);
      _b.fromBufferAttribute(p, i + 1).applyMatrix4(_m);
      if (_a.distanceTo(_b) < edgeR * 2) continue;
      b.segs.push(_a.x, _a.y, _a.z, _b.x, _b.y, _b.z);
      stats.edges++;
    }
    edges.dispose();
  }

  // One tube mesh and one halo per bucket.
  const coreMat = (hex: number): MeshBasicMaterial =>
    new MeshBasicMaterial({ color: new Color(hex).lerp(new Color(0xffffff), TITAN_NEON.edgeWhite), toneMapped: false });
  const haloMat = (hex: number): MeshBasicMaterial =>
    new MeshBasicMaterial({
      color: hex,
      transparent: true,
      opacity: TITAN_NEON.haloOpacity,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
  const mats = {
    line: { core: coreMat(look.line), halo: haloMat(look.line) },
    gold: { core: coreMat(GOLD_LINE), halo: haloMat(GOLD_LINE) },
  };
  for (const b of buckets.values()) {
    if (b.segs.length === 0) continue;
    const m = b.gold ? mats.gold : mats.line;
    const core = new Mesh(tubes(b.segs, edgeR), m.core);
    const halo = new Mesh(tubes(b.segs, haloR), m.halo);
    core.name = 'neon-edges';
    halo.name = 'neon-halo';
    // Halos after the glass, so a body in front hides the glow behind it.
    halo.renderOrder = 2;
    b.owner.add(core, halo);
    stats.edgeMeshes += 2;
    stats.tubeTriangles += (b.segs.length / 6) * 8 * 2;
  }
  rig.root.userData.neon = stats;
  return stats;
}

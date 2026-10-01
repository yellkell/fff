/**
 * THE TITAN RIGS, from FIRE FIGHT 2 (`yellkell/ff2`, src/campaign/bosses.ts):
 * five boss machines, each with a silhouette you can name across a room.
 *
 *  I   RUSTHOOK      the scrapyard derelict: hunched, a crane HOOK for a hand.
 *  II  PISTONKAISER  the foundry press: smokestacks, HAMMER-BLOCK fists.
 *  III VULTURE       the executioner: hooded, one eye, wing pauldrons, talons.
 *  IV  JUGGERNAUT    the rolling fortress: squat, wide, an armour skirt.
 *  V   GOLIATH       the king: a five-spike crown and ceremonial gauntlets.
 *
 * The geometry and the animation contract (head, visor, chest core, pods,
 * two arms with shoulder, elbow, wrist and curling digits) are FF2's, part
 * for part, so its gestures and weak points port without renumbering.
 * What changed is the finish: FF2 wears painted, textured steel; Flux wears
 * NEON (titans/neon.ts): dark glass bodies with lit edges, for a real room.
 */

import {
  BoxGeometry,
  type BufferGeometry,
  CanvasTexture,
  CylinderGeometry,
  Euler,
  Group,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PlaneGeometry,
  Quaternion,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  type Object3D,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { neonFinish } from './neon.js';
import type { TitanLook, TitanStyle } from './roster.js';

// --- rig ---------------------------------------------------------------------

/** One finger, talon or hook that CURLS: a hinge and its open/closed
 *  pitch about that hinge's x. */
export interface TitanDigit {
  node: Object3D;
  open: number;
  closed: number;
}

export interface TitanArm {
  /** Shoulder pivot — rotate to wind up and strike. */
  pivot: Group;
  /** THE ELBOW: a real joint under the upper arm; negative x folds the
   *  forearm forward/up (the same sign the shoulder raises with). */
  elbow: Group;
  /** THE WRIST at the forearm's end: negative x bends the hand back (a
   *  palm held out), positive forward (a chop, a baton's flick). */
  wrist: Group;
  /** The gauntlet / hook / talon hanging off the wrist. */
  fist: Group;
  /** Whatever on the hand can close — talons, fingers — for the curl. */
  digits: TitanDigit[];
  /** Rest pose captured at build time so animation can ease home. */
  restX: number;
  restZ: number;
}

export interface TitanRig {
  root: Group;
  head: Group;
  /** The eye/visor glow — blinks while the HEAD is a live weak point. */
  visorMat: MeshStandardMaterial;
  /** The eye lamp meshes themselves — they SCALE-pulse with the head blink
   *  (like the core does) so the tell reads even where colour alone won't. */
  eyes: Mesh[];
  /** Beam charge flare: a glow orb over the eye, hidden until a laser cooks;
   *  CampaignSystem swells it with the charge so the wind-up reads. */
  eyeFx: Mesh;
  core: Mesh;
  /** The chest core glow — blinks while the CORE is a live weak point. */
  coreMat: MeshStandardMaterial;
  /** The LOW-BLOW emblem on the pelvis (JUGGERNAUT's third target). */
  low: Mesh;
  /** Its glow — blinks while the low blow is the live weak point. */
  lowMat: MeshStandardMaterial;
  /** VULTURE's wings (empty on every other chassis): shoulder group + wrist
   *  kink per side, so the entrance can spread them and settle to mantled. */
  wings: { group: Group; wrist: Group; side: number }[];
  /** GOLIATH's chain of office, hung from the line between its two
   *  anchors so it can swing forward and back (rotate x); null elsewhere. */
  chain: Group | null;
  /** Shoulder emblems [left, right] — GOLIATH's crown circuit stops. */
  shoulders: [Mesh, Mesh];
  /** Their glows — blink while that shoulder is the live weak point. */
  shoulderMats: [MeshStandardMaterial, MeshStandardMaterial];
  podMats: [MeshStandardMaterial, MeshStandardMaterial];
  arms: [TitanArm, TitanArm];
  /** Key world-frame heights (root at y=0): head centre and core centre. */
  headY: number;
  coreY: number;
  /** Full height, for the rise-from-the-pit intro. */
  height: number;
  dispose(): void;
}

/** FF2's per-style paint: chassis steel + dark trim. The neon finish
 *  replaces it (bodies are tinted from the line colour); it stays so this
 *  file's parts still diff cleanly against FF2's. */
const STYLE_PAINT: Record<TitanStyle, { chassis: number; trim: number }> = {
  hook: { chassis: 0x6b5236, trim: 0x3d3021 }, // oxidised rust-brown
  piston: { chassis: 0x5a606b, trim: 0x353a44 }, // foundry iron
  vulture: { chassis: 0x3b4333, trim: 0x262c21 }, // olive plumage steel
  fortress: { chassis: 0x433a52, trim: 0x2d2640 }, // bruised violet plate
  king: { chassis: 0x1c1d23, trim: 0x131419 }, // near-black royal plate
};

export const GOLD = 0xd9a832;

/** Many small copies of one shape (track links, chain links) as ONE mesh's
 *  geometry — a row of thirty parts costs one draw, not thirty. Each entry
 *  is a position and an optional rotation. */
function repeated(geo: BufferGeometry, at: Array<[number, number, number, number?, number?, number?]>): BufferGeometry {
  const m = new Matrix4();
  const q = new Quaternion();
  const one = new Vector3(1, 1, 1);
  const parts = at.map(([x, y, z, rx = 0, ry = 0, rz = 0]) => {
    m.compose(new Vector3(x, y, z), q.setFromEuler(new Euler(rx, ry, rz)), one);
    return geo.clone().applyMatrix4(m);
  });
  const merged = mergeGeometries(parts) ?? geo.clone();
  // The size of ONE copy, for the neon finish: a row of rivets is many
  // tiny parts, not one big one, and tiny parts get no lit edges.
  geo.computeBoundingBox();
  const size = geo.boundingBox!.getSize(new Vector3());
  merged.userData.partSize = Math.max(size.x, size.y, size.z);
  parts.forEach((g) => g.dispose());
  geo.dispose();
  return merged;
}

/** A stencilled word for a plate — off-white paint, sprayed and scuffed,
 *  on a transparent card the plate shows through. */
function stencil(text: string): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(232,226,210,0.92)';
  g.font = '900 128px Impact, "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 84);
  // The stencil's bridges and the wear: knock holes out of the paint.
  g.globalCompositeOperation = 'destination-out';
  g.fillRect(0, 78, 256, 7);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(0,0,0,${0.3 + Math.random() * 0.7})`;
    g.fillRect(Math.random() * 256, Math.random() * 160, 1 + Math.random() * 5, 1 + Math.random() * 3);
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}


function steelMat(color: number, emissive = 0, intensity = 0): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    metalness: 0.9,
    roughness: 0.34,
  });
}

function glowMat(color: number, intensity = 1.4): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    metalness: 0.2,
    roughness: 0.3,
  });
}

/**
 * Assemble a titan at `def.scale`. The root group sits at world (0,0,z) with
 * y=0 at the arena floor; CampaignSystem parents it to the scene, sinks it
 * for the intro rise, and drives the pivots/materials from there. All five
 * styles share one skeleton (head / chest+core / pods / two arm pivots) so
 * the animation contract never changes — everything AROUND the skeleton is
 * bespoke per machine.
 */
export function buildTitan(def: TitanLook): TitanRig {
  const s = def.scale;
  const accent = def.accent;
  const paint = STYLE_PAINT[def.style];
  const chassis = (e = 0, i = 0): MeshStandardMaterial => steelMat(paint.chassis, e, i);
  const dark = (): MeshStandardMaterial => steelMat(paint.trim);

  const root = new Group();
  root.name = `titan-${def.name.toLowerCase()}`;

  const squat = def.style === 'fortress';
  const hunched = def.style === 'hook';
  const hipY = 0.78 * s;
  const shoulderY = (squat ? 1.12 : 1.22) * s;
  const headY = (hunched ? 1.4 : squat ? 1.34 : 1.5) * s;

  // ── HEAD — bespoke per machine, the visor/eye glow shared ────────────────
  const head = new Group();
  const headR = 0.16 * s;
  const visorMat = glowMat(accent, 1.8);
  // Every eye lamp lands here so the head tell can SCALE-pulse them.
  const eyes: Mesh[] = [];

  switch (def.style) {
    case 'hook': {
      // A dented oil-drum head, tipped off-axis, with two big round lamp
      // EYES set proud of the drum — the blink tell has to read from across
      // the arena, and a thin slit never did.
      const drum = new Mesh(new CylinderGeometry(headR * 0.95, headR * 1.05, headR * 1.7, 10), chassis(accent, 0.05));
      drum.rotation.z = 0.12;
      head.add(drum);
      // A bent whip antenna — snapped in some forgotten bout, never fixed.
      const aerialLo = new Mesh(new CylinderGeometry(0.008 * s, 0.012 * s, headR * 0.9, 5), dark());
      aerialLo.position.set(headR * 0.55, headR * 1.05, headR * 0.2);
      aerialLo.rotation.z = -0.25;
      head.add(aerialLo);
      const aerialHi = new Mesh(new CylinderGeometry(0.006 * s, 0.008 * s, headR * 0.7, 5), dark());
      aerialHi.position.set(headR * 0.72, headR * 1.55, headR * 0.32);
      aerialHi.rotation.z = 1.15; // the kink — bent nearly flat
      aerialHi.rotation.x = 0.2;
      head.add(aerialHi);
      const dent = new Mesh(new BoxGeometry(headR * 1.4, 0.05 * s, headR * 0.9), dark());
      dent.position.set(headR * 0.2, headR * 0.75, 0);
      dent.rotation.z = -0.2;
      head.add(dent);
      for (const ex of [-1, 1]) {
        const socket = new Mesh(new CylinderGeometry(headR * 0.32, headR * 0.32, 0.03 * s, 10), dark());
        socket.rotation.x = Math.PI / 2;
        socket.position.set(ex * headR * 0.44, headR * 0.12 * ex * 0.5, -headR * 0.95); // crooked pair
        head.add(socket);
        const eye = new Mesh(new CylinderGeometry(headR * 0.24, headR * 0.24, 0.045 * s, 10), visorMat);
        eye.rotation.x = Math.PI / 2;
        eye.position.set(ex * headR * 0.44, headR * 0.12 * ex * 0.5, -headR * 1.03);
        head.add(eye);
        eyes.push(eye);
      }
      break;
    }
    case 'piston': {
      // An anvil: flat-topped block head with a heavy brow and two big
      // rectangular lamp EYES set proud of the face — the thin visor strip
      // it had before never read as a blink from across the arena.
      const anvil = new Mesh(new BoxGeometry(headR * 2.4, headR * 1.5, headR * 1.8), chassis(accent, 0.06));
      head.add(anvil);
      const horn = new Mesh(new BoxGeometry(headR * 0.9, headR * 0.9, headR * 0.8), dark());
      horn.position.set(headR * 1.5, headR * 0.1, 0);
      head.add(horn);
      // A furnace seam glowing along the anvil's base — the head runs HOT.
      const seam = new Mesh(new BoxGeometry(headR * 2.45, 0.02 * s, headR * 1.85), glowMat(accent, 0.8));
      seam.position.y = -headR * 0.68;
      head.add(seam);
      const brow = new Mesh(new BoxGeometry(headR * 2.5, 0.08 * s, headR * 0.5), dark());
      brow.position.set(0, headR * 0.5, -headR * 0.78);
      head.add(brow);
      for (const ex of [-1, 1]) {
        const socket = new Mesh(new BoxGeometry(headR * 0.9, headR * 0.52, 0.04 * s), dark());
        socket.position.set(ex * headR * 0.62, headR * 0.02, -headR * 0.92);
        head.add(socket);
        const eye = new Mesh(new BoxGeometry(headR * 0.64, headR * 0.34, 0.06 * s), visorMat);
        eye.position.set(ex * headR * 0.62, headR * 0.02, -headR * 0.99);
        head.add(eye);
        eyes.push(eye);
      }
      break;
    }
    case 'vulture': {
      // A hooded scavenger skull: narrow casque and ONE big round eye — the
      // source of the beam, so the tell reads at a glance. (No beak:
      // the old cone hung straight over the eye and hid the blink.)
      const hood = new Mesh(new CylinderGeometry(headR * 0.55, headR * 0.9, headR * 1.9, 8), chassis(accent, 0.06));
      hood.rotation.x = 0.28; // craned forward, watching you
      head.add(hood);
      // The half-beak: a short down-turned hook off the CHIN, well below the
      // eye so the blink stays clear — the executioner's profile in one cut.
      const beakRoot = new Mesh(new BoxGeometry(headR * 0.34, headR * 0.3, headR * 0.5), dark());
      beakRoot.position.set(0, -headR * 0.72, -headR * 0.85);
      beakRoot.rotation.x = 0.5;
      head.add(beakRoot);
      const beakTip = new Mesh(new CylinderGeometry(0.004 * s, headR * 0.16, headR * 0.55, 5), dark());
      beakTip.position.set(0, -headR * 1.0, -headR * 0.98);
      beakTip.rotation.x = Math.PI - 0.55; // point curls down-and-back
      head.add(beakTip);
      // The eye sits PROUD of the hood's rim — tucked inside the casque it
      // was invisible, and a blink nobody can see is no tell at all.
      const eye = new Mesh(new CylinderGeometry(headR * 0.42, headR * 0.42, 0.05 * s, 12), visorMat);
      eye.rotation.x = Math.PI / 2 + 0.28; // faces out along the craned hood
      eye.position.set(0, headR * 0.14, -headR * 1.12);
      head.add(eye);
      eyes.push(eye);
      const crest = new Mesh(new BoxGeometry(0.015 * s, headR * 0.9, headR * 1.4), dark());
      crest.position.y = headR * 1.0;
      crest.rotation.x = 0.28;
      head.add(crest);
      break;
    }
    case 'fortress': {
      // A low armoured dome, half-sunk — no neck, all bunker.
      const dome = new Mesh(new CylinderGeometry(headR * 1.15, headR * 1.3, headR * 1.1, 10), chassis(accent, 0.05));
      head.add(dome);
      const cap = new Mesh(new CylinderGeometry(headR * 0.6, headR * 1.1, headR * 0.55, 10), dark());
      cap.position.y = headR * 0.75;
      head.add(cap);
      // Periscope stub off the cap — the commander never opens the hatch.
      const scopeMast = new Mesh(new CylinderGeometry(headR * 0.12, headR * 0.12, headR * 0.6, 6), dark());
      scopeMast.position.set(headR * 0.45, headR * 1.2, headR * 0.1);
      head.add(scopeMast);
      const scopeHead = new Mesh(new BoxGeometry(headR * 0.3, headR * 0.22, headR * 0.42), dark());
      scopeHead.position.set(headR * 0.45, headR * 1.55, -headR * 0.02);
      head.add(scopeHead);
      const slot = new Mesh(new BoxGeometry(headR * 1.7, 0.03 * s, 0.03 * s), visorMat);
      slot.position.set(0, headR * 0.1, -headR * 1.05);
      head.add(slot);
      eyes.push(slot);
      // Bolt studs ringing the dome.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const bolt = new Mesh(new BoxGeometry(0.03 * s, 0.03 * s, 0.03 * s), dark());
        bolt.position.set(Math.cos(a) * headR * 1.15, -headR * 0.3, Math.sin(a) * headR * 1.15);
        head.add(bolt);
      }
      break;
    }
    case 'king': {
      // The royal helm: tall eight-sided casque, gold five-spike crown.
      const helm = new Mesh(new CylinderGeometry(headR * 0.85, headR * 1.0, headR * 2.1, 8), chassis(accent, 0.08));
      head.add(helm);
      const band = new Mesh(new CylinderGeometry(headR * 0.95, headR * 0.95, 0.04 * s, 8), steelMat(GOLD, GOLD, 0.35));
      band.position.y = headR * 0.9;
      head.add(band);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        const spike = new Mesh(new CylinderGeometry(0.005 * s, 0.024 * s, headR * 0.85, 4), steelMat(GOLD, GOLD, 0.4));
        spike.position.set(Math.cos(a) * headR * 0.78, headR * 1.35, Math.sin(a) * headR * 0.78);
        head.add(spike);
      }
      // A jewel set in the band under every spike, burning the king's colour.
      head.add(
        new Mesh(
          repeated(
            new SphereGeometry(0.019 * s, 10, 8),
            [0, 1, 2, 3, 4].map((i) => {
              const a = (i / 5) * Math.PI * 2;
              return [Math.cos(a) * headR * 0.97, headR * 0.9, Math.sin(a) * headR * 0.97] as [number, number, number];
            }),
          ),
          glowMat(accent, 1.3),
        ),
      );
      const visor = new Mesh(new BoxGeometry(headR * 1.5, 0.035 * s, 0.03 * s), visorMat);
      visor.position.set(0, 0.01 * s, -headR * 0.95);
      head.add(visor);
      eyes.push(visor);
      const jaw = new Mesh(new BoxGeometry(headR * 1.1, 0.05 * s, 0.06 * s), dark());
      jaw.position.set(0, -headR * 0.62, -headR * 0.72);
      head.add(jaw);
      // The war plume: a blade of royal fire rising through the crown's
      // circle — the king's colours flying over the helm.
      const plume = new Mesh(new BoxGeometry(0.02 * s, headR * 1.1, headR * 0.55), glowMat(accent, 1.1));
      plume.position.set(0, headR * 1.6, headR * 0.1);
      plume.rotation.x = -0.12; // swept back
      head.add(plume);
      break;
    }
  }
  // The beam CHARGE FLARE: a translucent glow orb mounted over the eye,
  // hidden until a laser cooks — CampaignSystem swells and throbs it with
  // the charge so the wind-up reads across the arena (the superheated eye
  // material alone never did).
  const eyeFxMat = glowMat(accent, 2.4);
  eyeFxMat.transparent = true;
  eyeFxMat.opacity = 0.5;
  eyeFxMat.depthWrite = false;
  const eyeFx = new Mesh(new SphereGeometry(headR * 0.55, 14, 10), eyeFxMat);
  eyeFx.visible = false;
  // Where each chassis mounts its eye/visor (head-local, in headR units).
  const EYE_ANCHOR: Record<TitanStyle, [number, number, number]> = {
    hook: [0, 0.06, -1.0],
    piston: [0, 0.02, -0.99],
    vulture: [0, 0.14, -1.12],
    fortress: [0, 0.1, -1.05],
    king: [0, 0.06, -0.95],
  };
  const [ax, ay, az] = EYE_ANCHOR[def.style];
  eyeFx.position.set(ax * headR, ay * headR, az * headR);
  head.add(eyeFx);

  head.position.set(0, headY, 0);
  root.add(head);

  // ── TORSO — shared frame, bespoke dressing ────────────────────────────────
  const chest = new Group();
  chest.position.y = shoulderY;
  // JUGGERNAUT carries extra beam: the fortress hull is built FAT — every
  // width below stretches by `wide`, so it reads as bulk, not scale.
  const wide = def.style === 'fortress' ? 1.22 : 1;
  const yokeW = (def.style === 'fortress' ? 0.86 : def.style === 'vulture' ? 0.56 : 0.62) * s;
  const yoke = new Mesh(new BoxGeometry(yokeW, 0.13 * s, 0.26 * s), chassis(accent, 0.05));
  yoke.position.y = 0.06 * s;
  chest.add(yoke);

  // Shoulders per style.
  const wings: TitanRig['wings'] = [];
  for (const side of [-1, 1]) {
    if (def.style === 'vulture') {
      // The WINGS — a real span, not pauldron trim: an inner spar out of the
      // shoulder, a wrist joint kinking the outer spar higher, and primaries
      // fanning off both, longest at the tip. Mantled up-and-back like a
      // raptor deciding whether you're worth the swoop.
      const wing = new Group();
      wing.position.set(side * 0.28 * s, 0.16 * s, 0.14 * s);
      wing.rotation.y = side * 0.35; // swept back off the shoulders
      wing.rotation.z = side * 0.5; // raised up-and-out
      chest.add(wing);
      const spar1 = new Mesh(new BoxGeometry(0.5 * s, 0.05 * s, 0.035 * s), chassis(accent, 0.04));
      spar1.position.x = side * 0.25 * s;
      wing.add(spar1);
      // Coverts: short overlapping plates shingled along the arm spar, the
      // way a real wing's small feathers cover the bones.
      wing.add(
        new Mesh(
          repeated(
            new BoxGeometry(0.075 * s, 0.1 * s, 0.014 * s),
            [0, 1, 2, 3].map((f) => [side * (0.07 + f * 0.1) * s, -0.02 * s, -0.022 * s, 0, 0, side * 0.35] as [number, number, number, number, number, number]),
          ),
          chassis(accent, 0.04),
        ),
      );
      for (let f = 0; f < 3; f++) {
        // Inner primaries hang off the arm spar, splaying slightly outward.
        const len = (0.3 + f * 0.06) * s;
        const rot = side * (0.08 + f * 0.1);
        const feather = new Mesh(new BoxGeometry(0.055 * s, len, 0.018 * s), dark());
        feather.position.set(side * (0.12 + f * 0.13) * s, -len / 2 + 0.02 * s, 0);
        feather.rotation.z = rot;
        wing.add(feather);
      }
      const wrist = new Group();
      wrist.position.x = side * 0.5 * s;
      wrist.rotation.z = side * 0.55; // the kink — outer wing reaches higher
      wing.add(wrist);
      wings.push({ group: wing, wrist, side });
      const joint = new Mesh(new CylinderGeometry(0.045 * s, 0.045 * s, 0.06 * s, 8), dark());
      joint.rotation.x = Math.PI / 2;
      wrist.add(joint);
      const spar2 = new Mesh(new BoxGeometry(0.44 * s, 0.04 * s, 0.03 * s), chassis(accent, 0.04));
      spar2.position.x = side * 0.22 * s;
      wrist.add(spar2);
      for (let f = 0; f < 4; f++) {
        // Outer primaries: the long blades, tipped in a dim ember of accent.
        const len = (0.42 + f * 0.09) * s;
        const rot = side * (0.12 + f * 0.11);
        const fx = side * (0.08 + f * 0.11) * s;
        const feather = new Mesh(new BoxGeometry(0.05 * s, len, 0.016 * s), dark());
        feather.position.set(fx, -len / 2 + 0.02 * s, 0);
        feather.rotation.z = rot;
        wrist.add(feather);
        const tip = new Mesh(new BoxGeometry(0.05 * s, 0.045 * s, 0.017 * s), glowMat(accent, 0.35));
        // Anchor the ember on the feather's far end: the blade pivots about
        // its centre, so the end lands at centre + R(rot)·(0, −len/2).
        tip.position.set(fx + Math.sin(rot) * (len / 2), -len / 2 + 0.02 * s - Math.cos(rot) * (len / 2) + 0.02 * s, 0);
        tip.rotation.z = rot;
        wrist.add(tip);
      }
    } else if (def.style === 'hook' && side === 1) {
      // RUSTHOOK's right shoulder is a bare stub — the armour fell off years ago.
      const stub = new Mesh(new BoxGeometry(0.14 * s, 0.1 * s, 0.2 * s), dark());
      stub.position.set(side * 0.34 * s, 0.08 * s, 0);
      chest.add(stub);
    } else {
      const padW = (def.style === 'fortress' ? 0.36 : 0.24) * s;
      const pad = new Mesh(new BoxGeometry(padW, 0.18 * s, 0.32 * s), dark());
      pad.position.set(side * 0.37 * wide * s, 0.08 * s, 0);
      pad.rotation.z = side * -0.22;
      chest.add(pad);
      const trimMat = def.style === 'king' ? steelMat(GOLD, GOLD, 0.35) : glowMat(accent, 0.5);
      const trim = new Mesh(new BoxGeometry(padW + 0.005 * s, 0.024 * s, 0.325 * s), trimMat);
      trim.position.set(side * 0.37 * wide * s, 0.175 * s, 0);
      trim.rotation.z = side * -0.22;
      chest.add(trim);
    }
  }

  // Trunk: slim for the vulture, slabbed for the fortress, wedge otherwise.
  const trunk = new Mesh(
    new CylinderGeometry((def.style === 'vulture' ? 0.2 : 0.26) * s, 0.14 * s, 0.55 * s, 8),
    chassis(accent, 0.04),
  );
  trunk.scale.z = 0.72;
  if (def.style === 'vulture') trunk.scale.x = 0.85;
  if (def.style === 'fortress') {
    trunk.scale.x = 1.35; // the hull barrels out
    trunk.scale.z = 0.85;
  }
  trunk.position.y = -0.2 * s;
  chest.add(trunk);

  if (def.style === 'fortress') {
    // Double-layered bolted front plates — the fortress doctrine made steel.
    for (const [w, h, z, y] of [
      [0.62, 0.3, -0.19, -0.02],
      [0.48, 0.24, -0.23, -0.3],
    ] as const) {
      const slab = new Mesh(new BoxGeometry(w * s, h * s, 0.04 * s), dark());
      slab.position.set(0, y * s, z * s);
      chest.add(slab);
    }
    // The hull's number, stencilled on the upper plate beside the core:
    // the fourth machine of the gauntlet, and it wants you to know it.
    const unit = new Mesh(
      new PlaneGeometry(0.15 * s, 0.094 * s),
      new MeshStandardMaterial({ map: stencil('IV'), transparent: true, roughness: 0.9, metalness: 0, depthWrite: false }),
    );
    unit.position.set(0.21 * s, 0.05 * s, -0.212 * s);
    unit.rotation.y = Math.PI; // the plate's front faces −z
    chest.add(unit);
  }
  if (def.style === 'hook') {
    // Exposed rib struts where the chest plate rusted away.
    for (const ry of [-0.08, -0.2, -0.32]) {
      const rib = new Mesh(new BoxGeometry(0.34 * s, 0.022 * s, 0.03 * s), dark());
      rib.position.set(0, ry * s, -0.16 * s);
      chest.add(rib);
    }
    // Mismatched salvage patches riveted on at whatever angle they fit —
    // nothing on this machine matches, that IS the machine.
    const patchMat = steelMat(0x6b5233); // brighter, newer rust — a fresh graft
    for (const [px, py, rot, w, h] of [
      [-0.18, -0.14, 0.3, 0.16, 0.12],
      [0.14, -0.3, -0.2, 0.13, 0.16],
    ] as const) {
      const patch = new Mesh(new BoxGeometry(w * s, h * s, 0.015 * s), patchMat);
      patch.position.set(px * s, py * s, -0.19 * s);
      patch.rotation.z = rot;
      chest.add(patch);
    }
    // A slack chain swinging from the bare shoulder stub: links faked with
    // alternating boxes, each a step further down-and-out.
    for (let i = 0; i < 4; i++) {
      const link = new Mesh(new BoxGeometry(0.035 * s, 0.05 * s, 0.02 * s), dark());
      link.position.set((0.36 + i * 0.025) * s, (0.0 - i * 0.055) * s, 0.06 * s);
      link.rotation.z = i % 2 ? 0.4 : 0.15;
      link.rotation.y = i % 2 ? 0.8 : 0.1;
      chest.add(link);
    }
    // An oil weep streaking down from the ribs.
    const weep = new Mesh(new BoxGeometry(0.05 * s, 0.28 * s, 0.008 * s), steelMat(0x14110c));
    weep.position.set(0.08 * s, -0.34 * s, -0.175 * s);
    chest.add(weep);
    // Every patch is riveted at its corners — crude, proud, uneven.
    const rivets: Array<[number, number, number]> = [];
    for (const [px, py, rot, w, h] of [
      [-0.18, -0.14, 0.3, 0.16, 0.12],
      [0.14, -0.3, -0.2, 0.13, 0.16],
    ] as const) {
      for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        const lx = cx * (w / 2 - 0.016);
        const ly = cy * (h / 2 - 0.016);
        rivets.push([(px + lx * Math.cos(rot) - ly * Math.sin(rot)) * s, (py + lx * Math.sin(rot) + ly * Math.cos(rot)) * s, -0.2 * s]);
      }
    }
    const rivetGeo = new CylinderGeometry(0.01 * s, 0.012 * s, 0.012 * s, 6);
    chest.add(new Mesh(repeated(rivetGeo, rivets.map(([x, y, z]) => [x, y, z, Math.PI / 2])), steelMat(0x8a7560)));
    // A SALVAGE PLATE off some yard machine, bolted over the left pauldron
    // at whatever angle it fit — its hazard stripes half scoured away.
    // (Flux: the stripes went with FF2's textures; the plate stays.)
    const salvage = new Mesh(new BoxGeometry(0.22 * s, 0.13 * s, 0.014 * s), steelMat(0xb9ab98));
    salvage.position.set(-0.38 * s, 0.07 * s, -0.168 * s);
    salvage.rotation.z = 0.38;
    chest.add(salvage);
    // A SEVERED CABLE hanging from the bare right stub, still live: its
    // frayed end spits the accent.
    const cable = new Mesh(new CylinderGeometry(0.011 * s, 0.011 * s, 0.26 * s, 6), dark());
    cable.position.set(0.4 * s, -0.06 * s, -0.07 * s);
    cable.rotation.z = 0.25;
    chest.add(cable);
    const spark = new Mesh(new SphereGeometry(0.02 * s, 10, 8), glowMat(accent, 2.2));
    spark.position.set(0.432 * s, -0.188 * s, -0.07 * s);
    chest.add(spark);
  }
  if (def.style === 'piston') {
    // Riveted slab chest plate.
    const plate = new Mesh(new BoxGeometry(0.42 * s, 0.34 * s, 0.035 * s), dark());
    plate.position.set(0, -0.1 * s, -0.185 * s);
    chest.add(plate);
    for (const [bx, by] of [[-0.17, 0.03], [0.17, 0.03], [-0.17, -0.23], [0.17, -0.23]] as const) {
      const bolt = new Mesh(new CylinderGeometry(0.018 * s, 0.018 * s, 0.02 * s, 6), chassis());
      bolt.rotation.x = Math.PI / 2;
      bolt.position.set(bx * s, by * s, -0.2 * s);
      chest.add(bolt);
    }
    // Furnace grate: ember light leaking between louvres low on the plate —
    // the fire this press runs on, visible through its own chest.
    for (const gy of [-0.3, -0.36] as const) {
      const glowLine = new Mesh(new BoxGeometry(0.3 * s, 0.018 * s, 0.01 * s), glowMat(accent, 0.7));
      glowLine.position.set(0, gy * s, -0.195 * s);
      chest.add(glowLine);
      const bar = new Mesh(new BoxGeometry(0.32 * s, 0.02 * s, 0.02 * s), dark());
      bar.position.set(0, (gy + 0.028) * s, -0.2 * s);
      chest.add(bar);
    }
    // A boiler gauge riveted beside the core, needle frozen in the red.
    const gauge = new Mesh(new CylinderGeometry(0.05 * s, 0.05 * s, 0.025 * s, 10), steelMat(0x555a63));
    gauge.rotation.x = Math.PI / 2;
    gauge.position.set(0.17 * s, -0.12 * s, -0.21 * s);
    chest.add(gauge);
    const needle = new Mesh(new BoxGeometry(0.008 * s, 0.036 * s, 0.008 * s), glowMat(accent, 1.0));
    needle.position.set(0.155 * s, -0.105 * s, -0.225 * s);
    needle.rotation.z = -0.7; // pinned hard right
    chest.add(needle);
  }
  let chain: Group | null = null;
  if (def.style === 'king') {
    // THE CHAIN OF OFFICE: heavy gold links slung shoulder to shoulder,
    // sagging across the chest above the core — worn, not bolted. It hangs
    // from the line between its anchors (the group's x axis), so it can
    // swing out and back as the king moves.
    //
    // In neon, every link is DRAWN, not creased: a solid torus has a crease
    // at every facet, and nineteen of them melted into one white-hot rope.
    // So each link carries its outline (`loops`) for the neon finish, and
    // like a chain drawn in a line, they alternate: a flat oval facing you,
    // then one turned edge-on (a thin sliver), then flat again.
    chain = new Group();
    chain.position.set(0, 0.11 * s, -0.272 * s);
    chest.add(chain);
    const links: Array<[number, number, number, number, number, number]> = [];
    const loops: Array<{ x: number; y: number; z: number; rx: number; ry: number; rot: number }> = [];
    const n = 17;
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const x = (-0.3 + t * 0.6) * s;
      const y = -Math.sin(t * Math.PI) * 0.09 * s;
      // The chain's own slope here, so each link lies along the sag.
      const slope = Math.atan2(-Math.cos(t * Math.PI) * 0.09 * Math.PI, 0.6);
      const flat = k % 2 === 0;
      const z = flat ? 0 : -0.006 * s;
      links.push([x, y, z, flat ? 0 : Math.PI / 2, 0, slope]);
      loops.push({ x, y, z, rx: 0.026 * s, ry: (flat ? 0.016 : 0.006) * s, rot: slope });
    }
    // Oval links, longer than they're tall, like a real chain's.
    const linkMesh = new Mesh(repeated(new TorusGeometry(0.02 * s, 0.0065 * s, 6, 14).scale(1, 0.6, 1), links), steelMat(GOLD, GOLD, 0.3));
    linkMesh.geometry.userData.loops = loops;
    chain.add(linkMesh);
    // A gold X braced behind the core — four arms on the true diagonals,
    // each running radially so the whole mark reads as one clean cross.
    for (const rot of [Math.PI / 4, (3 * Math.PI) / 4, -Math.PI / 4, (-3 * Math.PI) / 4]) {
      const strip = new Mesh(new BoxGeometry(0.14 * s, 0.018 * s, 0.012 * s), steelMat(GOLD, GOLD, 0.3));
      strip.position.set(Math.cos(rot) * 0.15 * s, -0.12 * s + Math.sin(rot) * 0.15 * s, -0.245 * s);
      strip.rotation.z = rot;
      chest.add(strip);
    }
  }
  if (def.style === 'vulture') {
    // Segmented vertebra neck craning the skull off the yoke — the head
    // floats on the shared skeleton, so these rings sell the connection.
    for (const [ny, nr] of [
      [0.14, 0.075],
      [0.22, 0.062],
    ] as const) {
      const ring = new Mesh(new CylinderGeometry(nr * s, (nr + 0.012) * s, 0.05 * s, 8), dark());
      ring.position.set(0, ny * s, -0.02 * s);
      chest.add(ring);
    }
    // THE RUFF: a collar of spiked feathers standing up behind the skull,
    // fanned wide and leaning back — the executioner's hood, raised.
    const ruff: Array<[number, number, number, number, number, number]> = [];
    const ruffTips: Array<[number, number, number, number, number, number]> = [];
    const quillLen = 0.3 * s;
    for (let i = -3; i <= 3; i++) {
      const rz = -i * 0.24;
      const x = i * 0.05 * s;
      // The quill is centred on its mount; its tip is half a length out.
      const cy = 0.2 * s + Math.cos(rz) * quillLen * 0.5 * Math.cos(0.4);
      const cz = 0.1 * s + quillLen * 0.5 * Math.sin(0.4);
      const cx = x - Math.sin(rz) * quillLen * 0.5;
      ruff.push([cx, cy, cz, -0.4, 0, rz]);
      ruffTips.push([x - Math.sin(rz) * quillLen, 0.2 * s + Math.cos(rz) * quillLen * Math.cos(0.4), 0.1 * s + quillLen * Math.sin(0.4), -0.4, 0, rz]);
    }
    chest.add(new Mesh(repeated(new BoxGeometry(0.05 * s, quillLen, 0.012 * s), ruff), dark()));
    chest.add(new Mesh(repeated(new BoxGeometry(0.044 * s, 0.035 * s, 0.013 * s), ruffTips), glowMat(accent, 0.35)));
    // The folded-wing cloak: long plates hanging down the BACK in a loose
    // fan — from behind it's all plumage, from the front all blade.
    for (let f = -2; f <= 2; f++) {
      const quill = new Mesh(new BoxGeometry(0.07 * s, (0.52 - Math.abs(f) * 0.07) * s, 0.018 * s), dark());
      quill.position.set(f * 0.085 * s, (-0.26 + Math.abs(f) * 0.04) * s, 0.16 * s);
      quill.rotation.z = f * 0.1;
      quill.rotation.x = -0.1; // flared just off the back
      chest.add(quill);
    }
    // The executioner keeps tallies: two scrap tags on a wire off the yoke.
    for (const [tx, ty, rot] of [
      [-0.2, -0.06, 0.15],
      [-0.16, -0.09, -0.3],
    ] as const) {
      const tag = new Mesh(new BoxGeometry(0.045 * s, 0.07 * s, 0.012 * s), steelMat(0x51584a));
      tag.position.set(tx * s, ty * s, -0.17 * s);
      tag.rotation.z = rot;
      chest.add(tag);
    }
  }

  // The CORE: a glowing octagonal heart set PROUD of the chest plate — the
  // weak point players hunt. Sits far enough forward that a ball reaches it
  // before the (invisible) body armour sphere can eat the throw.
  const coreMat = glowMat(accent, 0.25);
  const core = new Mesh(new CylinderGeometry(0.11 * s, 0.11 * s, 0.06 * s, 8), coreMat);
  core.rotation.x = Math.PI / 2;
  core.position.set(0, -0.12 * s, -0.26 * s);
  chest.add(core);
  for (const dy of [-1, 1]) {
    const louvre = new Mesh(new BoxGeometry(0.3 * s, 0.035 * s, 0.03 * s), dark());
    louvre.position.set(0, (-0.12 + dy * 0.11) * s, -0.25 * s);
    chest.add(louvre);
  }
  root.add(chest);

  // ── Launcher pods riding the shoulders (they glow — and fire — during a
  //    volley: the blockable fireballs leave from here) ──────────────────────
  const podMats: [MeshStandardMaterial, MeshStandardMaterial] = [glowMat(accent, 0.2), glowMat(accent, 0.2)];
  podMats.forEach((mat, i) => {
    const side = i === 0 ? -1 : 1;
    if (def.style === 'piston') {
      // Smokestack exhausts, tipped back, ember-hot at the mouth.
      const stack = new Mesh(new CylinderGeometry(0.05 * s, 0.065 * s, 0.42 * s, 8), dark());
      stack.rotation.x = 0.35;
      stack.position.set(side * 0.3 * s, shoulderY + 0.3 * s, 0.1 * s);
      root.add(stack);
      const mouth = new Mesh(new CylinderGeometry(0.052 * s, 0.045 * s, 0.05 * s, 8), mat);
      mouth.rotation.x = 0.35;
      mouth.position.set(side * 0.3 * s, shoulderY + 0.5 * s, 0.17 * s);
      root.add(mouth);
    } else {
      const housing = new Mesh(new BoxGeometry(0.13 * s, 0.12 * s, 0.2 * s), dark());
      housing.position.set(side * 0.37 * wide * s, shoulderY + 0.2 * s, 0.02 * s);
      root.add(housing);
      const muzzle = new Mesh(new CylinderGeometry(0.035 * s, 0.045 * s, 0.1 * s, 8), mat);
      muzzle.rotation.x = Math.PI / 2.6; // tipped up-and-forward, mortar style
      muzzle.position.set(side * 0.37 * wide * s, shoulderY + 0.27 * s, -0.04 * s);
      root.add(muzzle);
    }
  });

  // ── Shoulder emblems: octagonal lamps set proud of each pauldron. Dim on
  //    most machines; GOLIATH's crown circuit blinks them as ring stops. ────
  const shoulderMats: [MeshStandardMaterial, MeshStandardMaterial] = [glowMat(accent, 0.2), glowMat(accent, 0.2)];
  // The king's crown-circuit shoulder stops run larger than the other
  // machines' vestigial lamps — they're targets you must hunt, so they read.
  const lampR = (def.style === 'king' ? 0.09 : 0.06) * s;
  const makeShoulderLamp = (i: 0 | 1): Mesh => {
    const side = i === 0 ? -1 : 1;
    const lamp = new Mesh(new CylinderGeometry(lampR, lampR, 0.055 * s, 8), shoulderMats[i]);
    lamp.rotation.x = Math.PI / 2;
    lamp.position.set(side * 0.38 * wide * s, shoulderY + 0.13 * s, -0.13 * s);
    root.add(lamp);
    return lamp;
  };
  const shoulders: [Mesh, Mesh] = [makeShoulderLamp(0), makeShoulderLamp(1)];

  // ── Pelvis + hover skirt: no legs — floating hands and iron, on brand ────
  const pelvis = new Mesh(new BoxGeometry(0.28 * wide * s, 0.18 * s, 0.22 * s), chassis(accent, 0.03));
  pelvis.position.y = hipY - 0.28 * s;
  root.add(pelvis);
  // The LOW-BLOW emblem: an octagonal lamp set proud of the belt plate.
  // Dim on most machines; JUGGERNAUT's weak-point cycle blinks it live.
  const lowMat = glowMat(accent, 0.2);
  const low = new Mesh(new CylinderGeometry(0.07 * s, 0.07 * s, 0.05 * s, 8), lowMat);
  low.rotation.x = Math.PI / 2;
  low.position.set(0, hipY - 0.28 * s, -0.14 * s);
  root.add(low);
  if (def.style === 'fortress') {
    // The armour curtain: a ring of riveted skirt plates.
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const plate = new Mesh(new BoxGeometry(0.17 * s, 0.2 * s, 0.025 * s), dark());
      plate.position.set(Math.cos(a) * 0.24 * s, hipY - 0.42 * s, Math.sin(a) * 0.24 * s);
      plate.rotation.y = -a + Math.PI / 2;
      plate.rotation.x = 0.12;
      root.add(plate);
    }
    // TREAD PODS flanking the skirt — it hovers like everything else, but
    // the fortress never stopped being a tank: road wheels in an armoured
    // sponson either side, tracks moulded as ridged blocks.
    for (const side of [-1, 1]) {
      const sponson = new Mesh(new BoxGeometry(0.18 * s, 0.2 * s, 0.46 * s), dark());
      sponson.position.set(side * 0.38 * s, hipY - 0.44 * s, 0.02 * s);
      root.add(sponson);
      for (let wIdx = 0; wIdx < 3; wIdx++) {
        const wheel = new Mesh(new CylinderGeometry(0.065 * s, 0.065 * s, 0.05 * s, 10), steelMat(0x241f2e));
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(side * 0.46 * s, hipY - 0.5 * s, (-0.14 + wIdx * 0.15) * s);
        root.add(wheel);
      }
      const guard = new Mesh(new BoxGeometry(0.05 * s, 0.05 * s, 0.5 * s), chassis(accent, 0.03));
      guard.position.set(side * 0.44 * s, hipY - 0.32 * s, 0.02 * s);
      root.add(guard);
      // THE TRACK: a run of cleated links over the road wheels and under
      // them — the fortress never stopped being a tank.
      const links: Array<[number, number, number]> = [];
      for (let k = 0; k < 8; k++) {
        const z = (-0.21 + k * 0.06) * s;
        links.push([side * 0.46 * s, hipY - 0.425 * s, z], [side * 0.46 * s, hipY - 0.575 * s, z]);
      }
      root.add(new Mesh(repeated(new BoxGeometry(0.07 * s, 0.022 * s, 0.05 * s), links), steelMat(0x2c2636)));
    }
    // The glacis: a clean raked front plate behind the curtain, no glow, no
    // trim — dark bow armour whose only statement is its rake.
    const glacis = new Mesh(new BoxGeometry(0.5 * s, 0.22 * s, 0.03 * s), dark());
    glacis.position.set(0, hipY - 0.4 * s, -0.2 * s);
    glacis.rotation.x = -0.35;
    root.add(glacis);
  }
  if (def.style === 'vulture') {
    // Tail plumage: three quills raked down-and-back off the hips.
    for (let f = -1; f <= 1; f++) {
      const quill = new Mesh(new BoxGeometry(0.05 * s, 0.36 * s, 0.016 * s), dark());
      quill.position.set(f * 0.08 * s, hipY - 0.42 * s, 0.16 * s);
      quill.rotation.x = 0.55; // swept back like a diving bird's tail
      quill.rotation.z = f * 0.16;
      root.add(quill);
    }
  }
  if (def.style === 'king') {
    // The war cape: long near-black plates hanging from the shoulder line
    // down past the hips, each tipped in gold — royalty you can count in
    // silhouette alone.
    for (let f = -2; f <= 2; f++) {
      const drop = (0.78 - Math.abs(f) * 0.06) * s;
      const plate = new Mesh(new BoxGeometry(0.11 * s, drop, 0.02 * s), steelMat(0x101014));
      plate.position.set(f * 0.115 * s, shoulderY - drop / 2 + 0.04 * s, 0.2 * s);
      plate.rotation.x = -0.08;
      plate.rotation.z = f * 0.05;
      root.add(plate);
      const tip = new Mesh(new BoxGeometry(0.11 * s, 0.035 * s, 0.022 * s), steelMat(GOLD, GOLD, 0.3));
      tip.position.set(f * 0.115 * s, shoulderY - drop + 0.05 * s, 0.2 * s);
      tip.rotation.x = -0.08;
      tip.rotation.z = f * 0.05;
      root.add(tip);
    }
    // Gold fringe ringing the hover skirt — even the exhaust wears trim.
    const fringe = new Mesh(new CylinderGeometry(0.165 * s, 0.14 * s, 0.035 * s, 8), steelMat(GOLD, GOLD, 0.3));
    fringe.position.y = hipY - 0.36 * s;
    root.add(fringe);
  }
  if (def.style === 'fortress') {
    // No dangling exhaust funnel on the fortress — a tapered spout under
    // that hull read like a spinning top. Instead a wide, shallow hover
    // PLENUM tucked between the sponsons: a flat tank belly with its glow
    // recessed underneath, so the bulk sits on a cushion, not a point.
    const plenum = new Mesh(new CylinderGeometry(0.26 * s, 0.28 * s, 0.1 * s, 10), dark());
    plenum.position.y = hipY - 0.5 * s;
    root.add(plenum);
    const cushion = new Mesh(new CylinderGeometry(0.21 * s, 0.19 * s, 0.045 * s, 10), glowMat(accent, 1.2));
    cushion.position.y = hipY - 0.56 * s;
    root.add(cushion);
  } else {
    const skirt = new Mesh(new CylinderGeometry(0.16 * s, 0.05 * s, 0.28 * s, 8), dark());
    skirt.position.y = hipY - 0.48 * s;
    root.add(skirt);
    const skirtGlow = new Mesh(new CylinderGeometry(0.09 * s, 0.05 * s, 0.06 * s, 8), glowMat(accent, 1.2));
    skirtGlow.position.y = hipY - 0.6 * s;
    root.add(skirtGlow);
  }

  // ── ARMS: shoulder pivots carrying girder arms, real elbows and wrists,
  //    and bespoke hands whose digits curl ───────────────────────────────
  const buildHand = (side: -1 | 1): { hand: Group; digits: TitanDigit[] } => {
    const hand = new Group();
    const digits: TitanDigit[] = [];
    if (def.style === 'hook' && side === 1) {
      // The crane HOOK: a chain link, a shank, and the big open J-hook.
      const link = new Mesh(new CylinderGeometry(0.05 * s, 0.05 * s, 0.05 * s, 8), dark());
      link.rotation.x = Math.PI / 2;
      hand.add(link);
      const shank = new Mesh(new CylinderGeometry(0.03 * s, 0.035 * s, 0.16 * s, 8), steelMat(paint.chassis));
      shank.position.y = -0.1 * s;
      hand.add(shank);
      // Hook belly: a half-torus faked with three angled boxes (keeps the
      // low-poly robot-wars look), plus the up-turned point.
      const seg = (): Mesh => new Mesh(new BoxGeometry(0.06 * s, 0.14 * s, 0.06 * s), chassis(accent, 0.06));
      const a1 = seg();
      a1.position.set(0, -0.24 * s, 0);
      hand.add(a1);
      const a2 = seg();
      a2.position.set(-0.07 * s, -0.32 * s, 0);
      a2.rotation.z = 1.1;
      hand.add(a2);
      const a3 = seg();
      a3.position.set(-0.15 * s, -0.26 * s, 0);
      a3.rotation.z = 2.4;
      hand.add(a3);
      const point = new Mesh(new CylinderGeometry(0.004 * s, 0.045 * s, 0.14 * s, 6), dark());
      point.position.set(-0.17 * s, -0.16 * s, 0);
      hand.add(point);
      // The hook swings on its link: the wrist rolls it, nothing curls.
      return { hand, digits };
    }
    if (def.style === 'piston') {
      // The HAMMER-BLOCK: one massive rectangular drop-forge fist.
      const block = new Mesh(new BoxGeometry(0.3 * s, 0.26 * s, 0.3 * s), chassis(accent, 0.06));
      hand.add(block);
      const face = new Mesh(new BoxGeometry(0.31 * s, 0.08 * s, 0.31 * s), dark());
      face.position.y = -0.16 * s;
      hand.add(face);
      const ring = new Mesh(new BoxGeometry(0.32 * s, 0.03 * s, 0.32 * s), glowMat(accent, 0.9));
      ring.position.y = 0.1 * s;
      hand.add(ring);
      // Forge bolts studding the striking face's rim.
      for (const [bx, bz] of [[-0.12, -0.12], [0.12, -0.12], [-0.12, 0.12], [0.12, 0.12]] as const) {
        const bolt = new Mesh(new CylinderGeometry(0.025 * s, 0.025 * s, 0.03 * s, 6), steelMat(0x555a63));
        bolt.position.set(bx * s, -0.2 * s, bz * s);
        hand.add(bolt);
      }
      // Molten CRACKS across the block's face and flanks — the fist has hit
      // so much iron that its own is splitting, and the fire shows through.
      const crack = new BoxGeometry(0.075 * s, 0.009 * s, 0.006 * s);
      const cracks = new Mesh(
        repeated(crack, [
          [-0.05 * s, 0.02 * s, -0.152 * s, 0, 0, 0.5],
          [0.012 * s, -0.01 * s, -0.152 * s, 0, 0, -0.35],
          [0.07 * s, 0.03 * s, -0.152 * s, 0, 0, 0.9],
          [0.152 * s, -0.02 * s, 0.03 * s, 0, Math.PI / 2, 0.6],
          [-0.152 * s, 0.03 * s, -0.04 * s, 0, Math.PI / 2, -0.4],
        ]),
        glowMat(accent, 1.4),
      );
      hand.add(cracks);
      // A drop-forge has no fingers — the whole block is the fist.
      return { hand, digits };
    }
    if (def.style === 'vulture') {
      // Talons: three claw fingers curling from a slim wrist block — each on
      // its own hinge, so the hand really GRIPS and really SPREADS.
      const palm = new Mesh(new BoxGeometry(0.12 * s, 0.1 * s, 0.12 * s), chassis(accent, 0.05));
      hand.add(palm);
      for (let f = -1; f <= 1; f++) {
        const hinge = new Group();
        hinge.position.set(f * 0.05 * s, -0.04 * s, -0.03 * s);
        const claw = new Mesh(new CylinderGeometry(0.006 * s, 0.03 * s, 0.2 * s, 5), dark());
        claw.position.y = -0.1 * s;
        hinge.add(claw);
        hinge.rotation.x = -0.5;
        hand.add(hinge);
        digits.push({ node: hinge, open: -0.25, closed: -1.55 });
      }
      return { hand, digits };
    }
    // Fortress + king: the classic crane gauntlet (the king's wears gold cuffs).
    const block = new Mesh(new BoxGeometry(0.22 * s, 0.17 * s, 0.24 * s), chassis(accent, 0.06));
    hand.add(block);
    const plate = new Mesh(new BoxGeometry(0.23 * s, 0.06 * s, 0.09 * s), dark());
    plate.position.set(0, 0.075 * s, -0.1 * s);
    hand.add(plate);
    for (let i = 0; i < 4; i++) {
      const stud = new Mesh(new BoxGeometry(0.032 * s, 0.03 * s, 0.026 * s), glowMat(accent, 1.1));
      stud.position.set((-0.075 + i * 0.05) * s, 0.078 * s, -0.15 * s);
      hand.add(stud);
    }
    const cuffMat = def.style === 'king' ? steelMat(GOLD, GOLD, 0.35) : steelMat(paint.chassis);
    const cuff = new Mesh(new CylinderGeometry(0.085 * s, 0.11 * s, 0.11 * s, 8), cuffMat);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = 0.14 * s;
    hand.add(cuff);
    // FOUR FINGERS and a thumb on the gauntlet, each two segments on a
    // knuckle hinge along the block's front edge: open they lie straight
    // out, curled they fold under the palm into the fist every punch used
    // to fake. The thumb rides the inner side and folds across.
    for (let i = 0; i < 4; i++) {
      const knuckle = new Group();
      knuckle.position.set((-0.075 + i * 0.05) * s, -0.04 * s, -0.12 * s);
      const seg1 = new Mesh(new BoxGeometry(0.038 * s, 0.04 * s, 0.09 * s), chassis(accent, 0.04));
      seg1.position.z = -0.045 * s;
      knuckle.add(seg1);
      const joint = new Group();
      joint.position.z = -0.09 * s;
      const seg2 = new Mesh(new BoxGeometry(0.034 * s, 0.036 * s, 0.075 * s), dark());
      seg2.position.z = -0.037 * s;
      joint.add(seg2);
      joint.rotation.x = -0.35;
      knuckle.add(joint);
      hand.add(knuckle);
      // The second segment curls about twice as far as the knuckle — a
      // finger folds from the tip in.
      digits.push({ node: knuckle, open: 0.05, closed: -1.35 });
      digits.push({ node: joint, open: -0.1, closed: -1.7 });
    }
    const thumbHinge = new Group();
    thumbHinge.position.set(-side * 0.12 * s, -0.02 * s, -0.04 * s);
    const thumb = new Mesh(new BoxGeometry(0.036 * s, 0.038 * s, 0.085 * s), chassis(accent, 0.04));
    thumb.position.z = -0.04 * s;
    thumbHinge.add(thumb);
    thumbHinge.rotation.y = side * 0.5;
    hand.add(thumbHinge);
    digits.push({ node: thumbHinge, open: -0.1, closed: -1.2 });
    return { hand, digits };
  };

  const arms = [0, 1].map((i) => {
    const side = (i === 0 ? -1 : 1) as -1 | 1;
    // THE SHOULDER: the pivot carrying the upper arm.
    const pivot = new Group();
    pivot.position.set(side * (yokeW / 2 + 0.15 * s), shoulderY + 0.04 * s, 0);
    const upper = new Mesh(new BoxGeometry(0.11 * s, 0.5 * s, 0.13 * s), chassis(accent, 0.03));
    upper.position.y = -0.25 * s;
    pivot.add(upper);
    if (def.style === 'piston') {
      // The drive piston riding each girder arm: sleeve up top, bright rod
      // below — the press's whole anatomy on display. Parented to the pivot
      // so it swings with every hammer stroke.
      const sleeve = new Mesh(new CylinderGeometry(0.045 * s, 0.045 * s, 0.22 * s, 8), dark());
      sleeve.position.set(side * 0.02 * s, -0.13 * s, -0.1 * s);
      pivot.add(sleeve);
      const rod = new Mesh(new CylinderGeometry(0.02 * s, 0.02 * s, 0.24 * s, 6), steelMat(0x8d949f));
      rod.position.set(side * 0.02 * s, -0.36 * s, -0.1 * s);
      pivot.add(rod);
      // HEAT VENTS down the outside of each girder: the press runs so hot
      // the arms breathe fire through their louvres.
      const vent = new BoxGeometry(0.008 * s, 0.014 * s, 0.085 * s);
      const vents = new Mesh(repeated(vent, [0, 1, 2, 3].map((k) => [side * 0.056 * s, (-0.1 - k * 0.045) * s, 0] as [number, number, number])), glowMat(accent, 1.1));
      pivot.add(vents);
    }
    // THE ELBOW: a real joint at the upper arm's end. Its cap is the old
    // barrel; an accent lamp peeks out either side of it, so the fold reads
    // from across the pit.
    const elbow = new Group();
    elbow.position.y = -0.5 * s;
    pivot.add(elbow);
    const elbowCap = new Mesh(new CylinderGeometry(0.075 * s, 0.075 * s, 0.15 * s, 8), dark());
    elbowCap.rotation.z = Math.PI / 2;
    elbow.add(elbowCap);
    const elbowLamp = new Mesh(new CylinderGeometry(0.04 * s, 0.04 * s, 0.17 * s, 8), glowMat(accent, 0.8));
    elbowLamp.rotation.z = Math.PI / 2;
    elbow.add(elbowLamp);
    // THE FOREARM, with the ram that drives it: a rod on the front face
    // reading as the hydraulic that folds the joint.
    const fore = new Mesh(new BoxGeometry(0.095 * s, 0.42 * s, 0.11 * s), chassis(accent, 0.03));
    fore.position.y = -0.21 * s;
    elbow.add(fore);
    const ram = new Mesh(new CylinderGeometry(0.016 * s, 0.016 * s, 0.3 * s, 6), steelMat(0x8d949f));
    ram.position.set(0, -0.2 * s, -0.07 * s);
    elbow.add(ram);
    // THE WRIST at the forearm's end, its own barrel, the hand hung off it.
    const wrist = new Group();
    wrist.position.y = -0.42 * s;
    elbow.add(wrist);
    const wristCap = new Mesh(new CylinderGeometry(0.05 * s, 0.05 * s, 0.12 * s, 8), dark());
    wristCap.rotation.z = Math.PI / 2;
    wrist.add(wristCap);
    const { hand: fist, digits } = buildHand(side);
    fist.position.y = -0.1 * s;
    wrist.add(fist);
    // Rest pose: hanging slightly out and forward, guard-ish, the elbow a
    // little bent (gestures.ts ARM_REST), the hand loose.
    pivot.rotation.x = 0.18;
    pivot.rotation.z = side * 0.14;
    elbow.rotation.x = -0.35;
    for (const d of digits) d.node.rotation.x = d.open + (d.closed - d.open) * 0.3;
    root.add(pivot);
    return { pivot, elbow, wrist, fist, digits, restX: 0.18, restZ: side * 0.14 } satisfies TitanArm;
  }) as [TitanArm, TitanArm];

  const height = headY + 0.35 * s;

  const rig: TitanRig = {
    root,
    head,
    visorMat,
    eyes,
    eyeFx,
    core,
    coreMat,
    low,
    lowMat,
    wings,
    chain,
    shoulders,
    shoulderMats,
    podMats,
    arms,
    headY,
    coreY: shoulderY - 0.12 * s,
    height,
    dispose() {
      root.traverse((o) => {
        const m = o as Mesh;
        if (m.geometry) m.geometry.dispose();
        const mat = m.material as MeshStandardMaterial | MeshStandardMaterial[] | undefined;
        if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
        else mat?.dispose();
      });
      root.removeFromParent();
    },
  };
  neonFinish(rig, def);
  return rig;
}

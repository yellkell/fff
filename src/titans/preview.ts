/**
 * THE TITAN VIEWER (titans.html, dev only): each neon titan standing where
 * it will stand in your room, 2.2 m off the front of your pad, seen from
 * your standing spot. Drag to orbit.
 *
 * DARK ROOM / LIT ROOM swaps what's behind it, because passthrough can be
 * either: the neon has to read against a bright wall as well as a dark one.
 *
 * URL: ?titan=RUSTHOOK&room=lit&still (still = no idle motion, for checks).
 * Probes: window.__titans.
 */

import { AmbientLight, Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildPlatform } from '../arena/platform.js';
import { STAGE } from '../config.js';
import type { NeonStats } from './neon.js';
import { buildTitan, type TitanRig } from './rigs.js';
import { TITANS } from './roster.js';
import { stageScale } from './stage.js';

const q = new URLSearchParams(location.search);
const still = q.has('still');

const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
document.body.prepend(renderer.domElement);

const scene = new Scene();
scene.add(new AmbientLight(0xffffff, 0.4));
scene.add(buildPlatform());

const camera = new PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 50);
camera.position.set(0, 1.6, 0.3);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1.15, -STAGE.distance);
controls.update();

const ROOMS = { dark: new Color(0x07060d), lit: new Color(0xcfc9bf) };
let room: keyof typeof ROOMS = q.get('room') === 'lit' ? 'lit' : 'dark';

let rig: TitanRig | null = null;
let current = 0;

function show(i: number): void {
  rig?.dispose();
  current = (i + TITANS.length) % TITANS.length;
  rig = buildTitan(TITANS[current]);
  const k = stageScale(rig.height);
  rig.root.scale.setScalar(k);
  rig.root.position.set(0, 0, -STAGE.distance);
  // FF2's rigs face −z; turn it round to face your pad.
  rig.root.rotation.y = Math.PI;
  scene.add(rig.root);
  paint();
}

function setRoom(r: keyof typeof ROOMS): void {
  room = r;
  scene.background = ROOMS[r];
  paint();
}

const bar = document.getElementById('bar')!;
const info = document.getElementById('info')!;
function paint(): void {
  bar.replaceChildren(
    ...TITANS.map((t, i) => button(t.name, i === current, () => show(i))),
    button('DARK ROOM', room === 'dark', () => setRoom('dark')),
    button('LIT ROOM', room === 'lit', () => setRoom('lit')),
  );
  if (rig) {
    const n = rig.root.userData.neon as NeonStats;
    const k = stageScale(rig.height);
    info.textContent = `${TITANS[current].name} · ${(rig.height * k).toFixed(2)} m tall in the room (×${k.toFixed(2)}) · ${n.edges} lit edges · ${n.tubeTriangles} edge triangles · ${n.edgeMeshes} edge meshes`;
  }
}

function button(label: string, on: boolean, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.setAttribute('aria-pressed', String(on));
  b.onclick = onClick;
  return b;
}

addEventListener('keydown', (e) => {
  const n = Number(e.key);
  if (n >= 1 && n <= TITANS.length) show(n - 1);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

const start = TITANS.findIndex((t) => t.name === q.get('titan')?.toUpperCase());
setRoom(room);
show(Math.max(0, start));

// Idle: a breath, a slow look, and the weak points' blink, so the glows
// can be judged lit as well as resting.
renderer.setAnimationLoop((ms) => {
  const t = still ? 0 : ms / 1000;
  if (rig) {
    rig.head.rotation.y = Math.sin(t * 0.4) * 0.25;
    rig.arms.forEach((a, i) => {
      a.pivot.rotation.x = a.restX + Math.sin(t * 0.9 + i * Math.PI) * 0.12;
    });
    const blink = still ? 1 : 0.5 + 0.5 * Math.sin(t * 5);
    rig.coreMat.emissiveIntensity = 0.25 + 1.6 * blink;
    rig.visorMat.emissiveIntensity = 1.2 + 1.2 * blink;
  }
  renderer.render(scene, camera);
});

(window as unknown as { __titans: unknown }).__titans = {
  names: TITANS.map((t) => t.name),
  show,
  setRoom,
  stats: () => {
    if (!rig) return null;
    const k = stageScale(rig.height);
    return { name: TITANS[current].name, height: rig.height * k, scale: k, ...(rig.root.userData.neon as NeonStats) };
  },
  drawCalls: () => renderer.info.render.calls,
  /** Swing the camera round the titan to `deg` from straight on. */
  orbit: (deg: number) => {
    const r = Math.hypot(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
    const a = (deg * Math.PI) / 180;
    camera.position.set(controls.target.x + Math.sin(a) * r, camera.position.y, controls.target.z + Math.cos(a) * r);
    controls.update();
  },
};

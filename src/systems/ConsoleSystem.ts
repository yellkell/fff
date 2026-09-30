/**
 * THE CONSOLE: the home menu. A panel of neon on smoked glass that rises
 * out of the floor at the front of your pad, stands ~40 cm in front of you
 * at chest height, tilted to face you like a lectern, and sinks back into
 * the floor when a fight starts. Always the same spot, always in reach.
 *
 * Three cards, nothing else: TITANS, 1V1, PRACTICE. Each is a station in
 * THE CONSTELLATION later (DESIGN §6); the console is the solo version of
 * that room. Cards for modes that aren't built yet stay on the panel,
 * locked, and say so when poked, so the shape of the game is there from
 * day one.
 *
 * After a fight it comes back up on its RESULTS face: who won and how
 * fast, then REMATCH, NEXT TITAN (locked until the next one is built) and
 * HOME, same three places as the cards you just used.
 */

import { createSystem } from '@iwsdk/core';
import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import { CONSOLE, NEON } from '../config.js';
import { type FightResult, game, setMode } from '../game/state.js';
import { FONT, frame, glass, glowText, textPlane, type TextPlane } from '../ui/kit.js';
import { addButton, PokeButton } from '../ui/poke.js';

const _head = new Vector3();
const ease = (t: number): number => t * t * (3 - 2 * t);

const HINT = 'POKE A CARD';

export class ConsoleSystem extends createSystem({}) {
  private readonly root = new Group();
  private beam!: Mesh;
  private beamMat!: MeshBasicMaterial;
  private status!: TextPlane;
  private title!: TextPlane;
  private readonly cards: PokeButton[] = [];
  private readonly homeFace = new Group();
  private readonly resultFace = new Group();
  private shownResult: FightResult | null | undefined = undefined;
  private statusText = '';
  private statusHold = 0;
  private rise = 0;
  private targetY = 1.1;
  private placedFor = -1;

  init(): void {
    const W = CONSOLE.width;
    const H = CONSOLE.height;
    this.root.name = 'console';
    this.root.add(glass(W, H, 0.018));
    this.root.add(frame(W, H, 0.005, NEON.cyan, 0.018));

    this.title = textPlane(W * 0.9, 0.045);
    this.title.mesh.position.y = H / 2 - 0.038;
    this.root.add(this.title.mesh, this.homeFace, this.resultFace);

    this.status = textPlane(W * 0.9, 0.035);
    this.status.mesh.position.y = -H / 2 + 0.03;
    this.root.add(this.status.mesh);

    const cardW = 0.155;
    const cardH = 0.17;
    const gap = 0.02;
    const defs = [
      { id: 'titans', label: 'TITANS', sub: 'RUSTHOOK', accent: NEON.ember, locked: '' },
      { id: '1v1', label: '1V1', sub: 'BOT · QUICK MATCH', accent: NEON.magenta, locked: '1V1 COMES AFTER THE TITANS' },
      { id: 'practice', label: 'PRACTICE', sub: 'TARGET RINGS', accent: NEON.lime, locked: '' },
    ];
    defs.forEach((d, i) => {
      const b = addButton(
        new PokeButton({
          id: d.id,
          width: cardW,
          height: cardH,
          label: d.label,
          sub: d.sub,
          accent: d.accent,
          onPress: () => {
            if (d.id === 'practice') setMode('practice');
            if (d.id === 'titans') setMode('titans');
          },
        }),
      );
      if (d.locked) {
        b.setLocked(true);
        b.onLockedPress = () => this.setStatus(d.locked, 2.5);
      }
      b.root.position.set((i - 1) * (cardW + gap), -0.004, 0.004);
      this.homeFace.add(b.root);
      this.cards.push(b);
    });

    // The results face: the same three places.
    const results = [
      { id: 'rematch', label: 'REMATCH', sub: 'SAME TITAN', accent: NEON.ember, press: () => setMode('titans') },
      { id: 'next', label: 'NEXT TITAN', sub: 'PISTONKAISER', accent: NEON.magenta, press: () => undefined },
      { id: 'home', label: 'HOME', sub: 'BACK TO THE CARDS', accent: NEON.cyan, press: () => (game.result = null) },
    ];
    results.forEach((d, i) => {
      const b = addButton(new PokeButton({ id: d.id, width: cardW, height: cardH, label: d.label, sub: d.sub, accent: d.accent, onPress: d.press }));
      if (d.id === 'next') {
        b.setLocked(true);
        b.onLockedPress = () => this.setStatus('PISTONKAISER IS STILL BEING BUILT', 2.5);
      }
      b.root.position.set((i - 1) * (cardW + gap), -0.004, 0.004);
      this.resultFace.add(b.root);
      this.cards.push(b);
    });

    // The light it rises on: a sheet from the floor up to the panel.
    this.beamMat = new MeshBasicMaterial({
      color: NEON.cyan,
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    });
    this.beam = new Mesh(new PlaneGeometry(1, 1), this.beamMat);

    this.root.visible = false;
    this.scene.add(this.root);
    this.scene.add(this.beam);
  }

  update(delta: number): void {
    const up = game.mode === 'home';
    // Place it from your head as it starts to rise, and again on a recentre.
    if (up && (this.rise === 0 || this.placedFor !== game.recentred)) this.place();
    this.rise = Math.min(1, Math.max(0, this.rise + (up ? delta : -delta) / CONSOLE.riseTime));

    const e = ease(this.rise);
    this.root.visible = this.rise > 0;
    this.root.position.y = 0.02 + (this.targetY - 0.02) * e;
    this.root.scale.set(0.6 + 0.4 * e, Math.max(0.001, e), 1);
    for (const c of this.cards) c.active = up && this.rise >= 1;

    // The beam glows only while the console is moving.
    const moving = Math.sin(Math.PI * this.rise);
    this.beam.visible = moving > 0.01;
    this.beamMat.opacity = 0.35 * moving;
    const bottom = Math.max(0.02, this.root.position.y - (CONSOLE.height / 2) * e);
    this.beam.scale.set(CONSOLE.width * (0.6 + 0.4 * e), bottom, 1);
    this.beam.position.set(0, bottom / 2, -CONSOLE.distance);

    if (this.shownResult !== game.result) this.showFace(game.result);

    if (this.statusHold > 0) {
      this.statusHold -= delta;
      if (this.statusHold <= 0) this.setStatus(this.hint());
    }
  }

  /** Home cards, or the last fight's result. */
  private showFace(r: FightResult | null): void {
    this.shownResult = r;
    this.homeFace.visible = !r;
    this.resultFace.visible = !!r;
    const text = r ? `${r.titan} ${r.won ? 'FELLED' : 'WINS'}` : 'FIRE FIGHT FLUX';
    const color = r ? (r.won ? NEON.lime : NEON.danger) : NEON.magenta;
    this.title.draw((g, w, h) => {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${h * 0.62}px ${FONT}`;
      glowText(g, text, w / 2, h / 2, color);
    });
    this.setStatus(this.hint());
  }

  private hint(): string {
    const r = game.result;
    if (!r) return HINT;
    const m = Math.floor(r.time / 60);
    const sec = Math.floor(r.time % 60).toString().padStart(2, '0');
    return r.won ? `DOWN IN ${m}:${sec}` : 'YOUR PAD WENT RED · GO AGAIN';
  }

  private place(): void {
    this.camera.getWorldPosition(_head);
    this.targetY = Math.min(CONSOLE.maxY, Math.max(CONSOLE.minY, _head.y - CONSOLE.belowEyes));
    this.root.position.set(0, this.targetY, -CONSOLE.distance);
    // Face your standing spot at eye height: tilted back like a lectern.
    this.root.lookAt(0, _head.y, 0);
    this.placedFor = game.recentred;
  }

  private setStatus(text: string, hold = 0): void {
    this.statusHold = hold;
    if (text === this.statusText) return;
    this.statusText = text;
    const warn = hold > 0;
    this.status.draw((g, w, h) => {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `800 ${h * 0.5}px ${FONT}`;
      g.fillStyle = warn ? '#ff8aa0' : 'rgba(233,236,255,0.7)';
      g.fillText(text, w / 2, h / 2);
    });
  }
}

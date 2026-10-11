/**
 * THE CONSOLE: the home menu. A panel of neon on smoked glass that rises
 * out of the floor at the front of your pad, stands ~40 cm in front of you
 * at chest height, tilted to face you like a lectern, and sinks back into
 * the floor when a fight starts. Always the same spot, always in reach.
 *
 * Three cards, nothing else: TITANS, 1V1, PRACTICE. Each is a station in
 * THE CONSTELLATION later (DESIGN §6); the console is the solo version of
 * that room. A card for a mode that isn't built yet stays on the panel,
 * locked, and says so when poked, so the shape of the game is there from
 * day one.
 *
 * After a fight it comes back up on its RESULTS face: who won and how
 * fast, then REMATCH, NEXT and HOME, same three places as the cards you
 * just used. After a titan, NEXT FIGHT (the next bout of your career,
 * game/career.ts, open once you've won this one); after a duel, NEXT BOT,
 * a rung up the ladder.
 *
 * Over it, THE BELT RACK: every belt on your career, lit if it's yours, a
 * ghost if it isn't yet, red if it was stripped from you. Win one and it
 * comes off the rack, big, and is held up over the console before it goes
 * back; defend one and it does the same; lose a defence and it's stripped.
 */

import { createSystem } from '@iwsdk/core';
import { AdditiveBlending, DoubleSide, Group, Mesh, MeshBasicMaterial, PlaneGeometry, Vector3 } from 'three';
import { sfx } from '../audio/sfx.js';
import { BOT_LADDER, CONSOLE, NEON } from '../config.js';
import { fx } from '../fx/neon.js';
import { BELTS, type BeltId, beltOf, BOUTS, career } from '../game/career.js';
import { type FightResult, game, setMode } from '../game/state.js';
import { playable } from '../titans/fights.js';
import { TITANS } from '../titans/roster.js';
import { FONT, fitFont, frame, glass, glowText, textPlane, type TextPlane } from '../ui/kit.js';
import { BeltModel } from '../ui/belt.js';
import { addButton, PokeButton } from '../ui/poke.js';

const _head = new Vector3();
const _at = new Vector3();
const ease = (t: number): number => t * t * (3 - 2 * t);

const HINT = 'POKE A CARD';

/** The rack's belts, small, over the panel; and held up, big, above it. */
const RACK_SCALE = 0.26;
const SHOW_SCALE = 0.7;
/** An award: up off the rack, held up, back down (seconds). */
const AWARD = { up: 0.6, hold: 3.2, down: 0.6 };

/** Your next bout, as a card's second line. */
const boutLine = (i: number): string => {
  const b = BOUTS[i];
  return b ? `${b.short} · ${TITANS[b.titan]?.name ?? ''}` : '';
};

/** Set up the next titan fight: bout `i` of your career. */
function toBout(i: number): void {
  game.bout = i;
  game.titan = BOUTS[i]?.titan ?? 0;
  setMode('titans');
}

interface Slot {
  model: BeltModel;
  label: TextPlane;
  home: Vector3;
  labelText: string;
}

export class ConsoleSystem extends createSystem({}) {
  private readonly root = new Group();
  private beam!: Mesh;
  private beamMat!: MeshBasicMaterial;
  private status!: TextPlane;
  private title!: TextPlane;
  private readonly cards: PokeButton[] = [];
  private titansCard!: PokeButton;
  private duelCard!: PokeButton;
  private nextCard!: PokeButton;
  private rematchCard!: PokeButton;
  private readonly homeFace = new Group();
  private readonly resultFace = new Group();
  private shownResult: FightResult | null | undefined = undefined;
  private statusText = '';
  private statusHold = 0;
  private rise = 0;
  private targetY = 1.1;
  private placedFor = -1;
  private wasUp: boolean | null = null;
  private readonly slots = new Map<BeltId, Slot>();
  private award: { id: BeltId; kind: 'won' | 'kept' | 'lost'; t: number } | null = null;

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
      { id: 'titans', label: 'TITANS', sub: boutLine(career.next), accent: NEON.ember, locked: '' },
      { id: '1v1', label: '1V1', sub: `BOT · ${BOT_LADDER[0].label}`, accent: NEON.magenta, locked: '' },
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
            if (d.id === 'titans') toBout(career.next);
            if (d.id === '1v1') setMode('duel');
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
      if (d.id === 'titans') this.titansCard = b;
      if (d.id === '1v1') this.duelCard = b;
    });

    // The results face: the same three places.
    const results = [
      {
        id: 'rematch',
        label: 'REMATCH',
        sub: '',
        accent: NEON.ember,
        press: () => (game.result?.mode === 'duel' ? setMode('duel') : toBout(game.result?.bout ?? game.bout)),
      },
      {
        id: 'next',
        label: 'NEXT FIGHT',
        sub: '',
        accent: NEON.magenta,
        press: () => {
          if (game.result?.mode !== 'duel') return toBout(career.next);
          game.rung++;
          setMode('duel');
        },
      },
      { id: 'home', label: 'HOME', sub: 'BACK TO THE CARDS', accent: NEON.cyan, press: () => (game.result = null) },
    ];
    results.forEach((d, i) => {
      const b = addButton(new PokeButton({ id: d.id, width: cardW, height: cardH, label: d.label, sub: d.sub, accent: d.accent, onPress: d.press }));
      if (d.id === 'rematch') this.rematchCard = b;
      if (d.id === 'next') {
        this.nextCard = b;
        b.onLockedPress = () => {
          if (game.result?.mode === 'duel') return this.setStatus('THAT WAS THE TOP RUNG', 2.5);
          if (!game.result?.won) return this.setStatus('WIN THIS ONE FIRST', 2.5);
          this.setStatus(`${TITANS[BOUTS[career.next]?.titan]?.name ?? 'IT'} IS STILL BEING BUILT`, 2.5);
        };
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

    // The belt rack, along the top of the panel.
    BELTS.forEach((belt, i) => {
      const model = new BeltModel(belt);
      const home = new Vector3((i - (BELTS.length - 1) / 2) * 0.132, H / 2 + 0.047, 0.01);
      model.root.position.copy(home);
      model.root.scale.setScalar(RACK_SCALE);
      const label = textPlane(0.128, 0.017);
      label.mesh.position.set(home.x, H / 2 + 0.013, 0.006);
      this.root.add(model.root, label.mesh);
      this.slots.set(belt.id, { model, label, home, labelText: '' });
    });
    this.showRack();

    this.root.visible = false;
    this.scene.add(this.root);
    this.scene.add(this.beam);
  }

  update(delta: number): void {
    const up = game.mode === 'home';
    if (up !== this.wasUp) {
      this.wasUp = up;
      sfx(up ? 'consoleRise' : 'consoleSink', _head.set(0, this.targetY, -CONSOLE.distance));
    }
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
    this.stepAward(delta, this.rise >= 1);

    if (this.statusHold > 0) {
      this.statusHold -= delta;
      if (this.statusHold <= 0) this.setStatus(this.hint());
    }
  }

  /** Home cards, or the last fight's result. */
  private showFace(r: FightResult | null): void {
    this.shownResult = r;
    this.titansCard.setText('TITANS', boutLine(career.next));
    this.duelCard.setText('1V1', `BOT · ${BOT_LADDER[game.rung]?.label ?? BOT_LADDER[0].label}`);
    if (r?.mode === 'duel') {
      const next = BOT_LADDER[game.rung + 1];
      this.rematchCard.setText('REMATCH', 'SAME BOT');
      this.nextCard.setText('NEXT BOT', next?.label ?? 'TOP RUNG');
      this.nextCard.setLocked(!next);
    } else {
      const next = BOUTS[career.next];
      this.rematchCard.setText('REMATCH', boutLine(r?.bout ?? game.bout));
      this.nextCard.setText('NEXT FIGHT', boutLine(career.next));
      this.nextCard.setLocked(!r?.won || !playable(TITANS[next?.titan]?.name));
    }
    this.homeFace.visible = !r;
    this.resultFace.visible = !!r;
    // A belt won, kept or lost says so; and comes off the rack.
    const o = r?.mode === 'titans' ? r.outcome : undefined;
    const belt = o?.won ?? o?.kept ?? o?.lost ?? null;
    if (o && belt) this.award = { id: belt, kind: o.won ? 'won' : o.kept ? 'kept' : 'lost', t: 0 };
    let text = !r ? 'FIRE FIGHT FLUX' : r.mode === 'duel' ? (r.won ? `YOU BEAT ${r.titan}` : `${r.titan} WINS`) : `${r.titan} ${r.won ? 'FELLED' : 'WINS'}`;
    if (o?.won) text = beltOf(o.won).champion;
    else if (o?.kept) text = `${beltOf(o.kept).name} BELT RETAINED`;
    else if (o?.lost) text = `${beltOf(o.lost).name} BELT LOST`;
    const color = r ? (r.won ? NEON.lime : NEON.danger) : NEON.magenta;
    this.showRack();
    this.title.draw((g, w, h) => {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = `900 ${h * 0.62}px ${FONT}`;
      glowText(g, text, w / 2, h / 2, color);
    });
    this.setStatus(this.hint());
  }

  /** Every belt in its place: lit if yours, a ghost if not, red if stripped. */
  private showRack(): void {
    for (const belt of BELTS) {
      const s = this.slots.get(belt.id)!;
      if (this.award?.id === belt.id && this.award.kind !== 'lost') continue; // it's being held up
      const held = career.held.includes(belt.id);
      // Stripped: you've been past the bout that wins it, and don't hold it.
      const wonAt = BOUTS.findIndex((b) => b.wins === belt.id);
      const stripped = !held && career.next > wonAt;
      s.model.setLevel(held ? 1 : 0.1, stripped);
      const def = career.defences[belt.id] ?? 0;
      const text = `${belt.name}${def > 0 ? ` · ${def} DEF` : ''}`;
      if (text === s.labelText) continue;
      s.labelText = text;
      s.label.draw((g, w, h) => {
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        fitFont(g, text, 800, h * 0.62, w * 0.96);
        g.fillStyle = held ? 'rgba(233,236,255,0.85)' : stripped ? '#ff8aa0' : 'rgba(233,236,255,0.35)';
        g.fillText(text, w / 2, h / 2);
      });
    }
  }

  /** A belt won or kept comes off the rack, is held up big, and goes back;
   *  a belt lost flashes red as it's stripped. Waits for the console to be up. */
  private stepAward(delta: number, ready: boolean): void {
    const a = this.award;
    if (!a) return;
    // Off to a fight before it's done: it just goes back on the rack.
    if (game.mode !== 'home') return this.endAward();
    if (!ready) return;
    const s = this.slots.get(a.id)!;
    const m = s.model;
    if (a.t === 0) {
      m.root.getWorldPosition(_at);
      sfx(a.kind === 'lost' ? 'beltLost' : 'belt', _at);
      if (a.kind !== 'lost') fx.sparks?.burst(_at, 40, beltOf(a.id).gem, 1.4);
    }
    a.t += delta;
    const total = AWARD.up + AWARD.hold + AWARD.down;
    if (a.kind === 'lost') {
      // Stripped: a red flash, fading to its ghost.
      const k = Math.max(0, 1 - a.t / 1.5);
      m.setLevel(0.1 + 0.9 * k, true);
      m.flare(k * (0.5 + 0.5 * Math.sin(a.t * 20)));
      if (a.t >= 1.5) this.endAward();
      return;
    }
    const show = _at.set(0, CONSOLE.height / 2 + 0.17, 0.06);
    let u: number;
    if (a.t < AWARD.up) u = ease(a.t / AWARD.up);
    else if (a.t < AWARD.up + AWARD.hold) u = 1;
    else u = 1 - ease(Math.min(1, (a.t - AWARD.up - AWARD.hold) / AWARD.down));
    m.setLevel(1);
    m.root.position.lerpVectors(s.home, show, u);
    m.root.scale.setScalar(RACK_SCALE + (SHOW_SCALE - RACK_SCALE) * u);
    m.root.rotation.y = 0.35 * Math.sin(a.t * 1.6) * u;
    m.flare(u * (0.4 + 0.4 * Math.sin(a.t * 5) ** 2));
    if (a.t > AWARD.up && a.t - delta <= AWARD.up) {
      m.root.getWorldPosition(_head);
      fx.sparks?.burst(_head, 60, beltOf(a.id).metal, 2);
    }
    if (a.t >= total) this.endAward();
  }

  private endAward(): void {
    const s = this.slots.get(this.award!.id)!;
    s.model.root.position.copy(s.home);
    s.model.root.scale.setScalar(RACK_SCALE);
    s.model.root.rotation.set(0, 0, 0);
    s.model.flare(0);
    this.award = null;
    this.showRack();
  }

  private hint(): string {
    const r = game.result;
    if (!r) return HINT;
    const m = Math.floor(r.time / 60);
    const sec = Math.floor(r.time % 60).toString().padStart(2, '0');
    if (r.mode === 'duel') {
      const [mine, theirs] = r.rounds ?? [0, 0];
      return r.won ? `ROUNDS ${mine}–${theirs} IN ${m}:${sec}` : `ROUNDS ${mine}–${theirs} · GO AGAIN`;
    }
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

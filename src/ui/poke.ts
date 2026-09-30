/**
 * THE POKE BUTTON: a neon plate you press with a fingertip.
 *
 * A button is a local frame whose face sits at z = 0, facing +z. Each frame
 * PokeSystem carries each index fingertip into that frame and asks:
 *
 *   - is it over the face (inside the edges, plus a little slack)?
 *   - did it come at the face from the FRONT? A finger that slides in from
 *     the side or from behind, already deep, never fires a button;
 *   - has it pushed `pressDepth` past the face? Then the button fires once,
 *     and can't fire again until that finger pulls back out.
 *
 * What you see stands in for the haptics a bare hand doesn't have: the
 * frame brightens as a fingertip approaches, the face sinks under the
 * finger, and a press flashes it white (a locked button flashes red).
 */

import { type ColorRepresentation, Color, Group, type MeshBasicMaterial, Vector3 } from 'three';
import { NEON } from '../config.js';
import type { Side } from '../input/hands.js';
import { fitFont, frame, glass, glowText, textPlane, type TextPlane } from './kit.js';

export interface PokeButtonOpts {
  /** A stable name, for the headless probes. */
  id: string;
  width: number;
  height: number;
  label: string;
  sub?: string;
  accent: ColorRepresentation;
  /** Which fingertips may press it (default both). */
  hands?: readonly Side[];
  onPress: () => void;
}

const _white = new Color(NEON.hot);
const _danger = new Color(NEON.danger);

export class PokeButton {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly hands: readonly Side[];
  /** The button's frame: its face at z = 0, facing +z. Add this to a panel. */
  readonly root = new Group();
  /** The part that sinks under your finger. */
  private readonly cap = new Group();
  private readonly frameMat: MeshBasicMaterial;
  private readonly text: TextPlane;
  private readonly accent: Color;
  private label: string;
  private sub: string;
  private readonly onPress: () => void;

  /** False = drawn but asleep: no hover, no press (e.g. while it rises). */
  active = true;
  /** Drawn and hoverable, but a press only flashes red and says why. */
  locked = false;
  onLockedPress: (() => void) | null = null;

  /** 0–1 this frame: how close the nearest fingertip is. Set by PokeSystem. */
  hover = 0;
  /** Metres the face is pushed in this frame. Set by PokeSystem. */
  travel = 0;
  /** Times fired, and times a locked press was refused (probes). */
  presses = 0;
  refusals = 0;
  private flash = 0;
  private flashLocked = false;

  constructor(o: PokeButtonOpts) {
    this.id = o.id;
    this.width = o.width;
    this.height = o.height;
    this.hands = o.hands ?? ['left', 'right'];
    this.label = o.label;
    this.sub = o.sub ?? '';
    this.onPress = o.onPress;
    this.accent = new Color(o.accent);

    this.cap.add(glass(o.width, o.height, 0.01));
    const f = frame(o.width, o.height, 0.0035, o.accent, 0.01);
    this.frameMat = f.material as MeshBasicMaterial;
    this.cap.add(f);
    this.text = textPlane(o.width, o.height);
    this.cap.add(this.text.mesh);
    this.root.add(this.cap);
    this.redraw();
  }

  setText(label: string, sub = ''): void {
    if (label === this.label && sub === this.sub) return;
    this.label = label;
    this.sub = sub;
    this.redraw();
  }

  setLocked(locked: boolean): void {
    if (locked === this.locked) return;
    this.locked = locked;
    this.redraw();
  }

  /** Called by PokeSystem when a fingertip pushes through. */
  fire(): void {
    this.flash = 1;
    this.flashLocked = this.locked;
    if (this.locked) {
      this.refusals++;
      this.onLockedPress?.();
      return;
    }
    this.presses++;
    this.onPress();
  }

  /** Per-frame look, after PokeSystem has set hover and travel. */
  animate(delta: number): void {
    this.flash = Math.max(0, this.flash - delta * 4);
    this.cap.position.z = -this.travel;
    const base = this.locked ? 0.3 : 0.55;
    const k = base + (1 - base) * this.hover;
    const c = this.frameMat.color.copy(this.accent).multiplyScalar(k);
    if (this.flash > 0) c.lerp(this.flashLocked ? _danger : _white, this.flash);
  }

  private redraw(): void {
    const locked = this.locked;
    const accent = this.accent.getHex();
    this.text.draw((g, w, h) => {
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const hasSub = this.sub.length > 0;
      const big = h * (hasSub ? 0.3 : 0.42);
      fitFont(g, this.label, 900, big, w * 0.84);
      const y = hasSub ? h * 0.42 : h * 0.5;
      if (locked) {
        g.fillStyle = 'rgba(233,236,255,0.45)';
        g.fillText(this.label, w / 2, y);
      } else {
        glowText(g, this.label, w / 2, y, accent);
      }
      if (hasSub) {
        fitFont(g, this.sub, 700, Math.min(h * 0.12, big * 0.42), w * 0.86);
        g.fillStyle = locked ? 'rgba(233,236,255,0.4)' : 'rgba(233,236,255,0.8)';
        g.fillText(this.sub, w / 2, h * 0.72);
      }
    });
  }
}

/* ── the registry PokeSystem walks ─────────────────────────────────────── */

export const buttons: PokeButton[] = [];

export function addButton(b: PokeButton): PokeButton {
  buttons.push(b);
  return b;
}

/** Visible in the scene: the button and every ancestor. */
export function shown(o: { visible: boolean; parent: unknown }): boolean {
  let n: { visible: boolean; parent: unknown } | null = o;
  while (n) {
    if (!n.visible) return false;
    n = n.parent as typeof n | null;
  }
  return true;
}

/** World-space centre and facing of a button's face (probes). */
export function buttonPose(b: PokeButton): { centre: number[]; normal: number[]; across: number[] } {
  b.root.updateWorldMatrix(true, false);
  const c = new Vector3().setFromMatrixPosition(b.root.matrixWorld);
  const n = new Vector3(0, 0, 1).transformDirection(b.root.matrixWorld);
  const x = new Vector3(1, 0, 0).transformDirection(b.root.matrixWorld);
  return { centre: c.toArray(), normal: n.toArray(), across: x.toArray() };
}


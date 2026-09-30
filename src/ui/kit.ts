/**
 * The panel kit: neon on smoked glass. Every menu is built from three
 * layers, drawn back to front:
 *
 *   glass   a dark, see-through plate (normal blending) that dims the room
 *           behind it, so text still reads against a bright wall or window;
 *   frame   a neon border with real width (additive, never a 1px line);
 *   text    canvas-drawn labels on a transparent plane.
 *
 * All flat in the local xy plane, facing +z.
 */

import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  type ColorRepresentation,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SRGBColorSpace,
} from 'three';
import { MENU } from '../config.js';

/** Draw order within a panel: glass, then frame, then text on top. */
export const LAYER = { glass: 10, frame: 11, text: 12 };

function roundedRect(s: Shape, w: number, h: number, r: number): Shape {
  const x = -w / 2;
  const y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

export function glass(w: number, h: number, radius = 0.012): Mesh {
  const m = new Mesh(
    new ShapeGeometry(roundedRect(new Shape(), w, h, radius), 6),
    new MeshBasicMaterial({
      color: MENU.glassColor,
      transparent: true,
      opacity: MENU.glassOpacity,
      blending: NormalBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  m.renderOrder = LAYER.glass;
  return m;
}

/** A neon border `thick` metres wide, just inside a w × h rounded rect. */
export function frame(w: number, h: number, thick: number, color: ColorRepresentation, radius = 0.012): Mesh {
  const outer = roundedRect(new Shape(), w, h, radius);
  const inner = roundedRect(new Shape(), w - thick * 2, h - thick * 2, Math.max(0.001, radius - thick));
  outer.holes.push(inner);
  const m = new Mesh(
    new ShapeGeometry(outer, 6),
    new MeshBasicMaterial({
      color: new Color(color),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      side: DoubleSide,
    }),
  );
  m.position.z = 0.0008;
  m.renderOrder = LAYER.frame;
  return m;
}

/** Pixels per metre for canvas text: sharp at arm's length. */
const PPM = 2600;

export interface TextPlane {
  mesh: Mesh;
  /** Redraw: the callback gets a cleared context sized w × h in pixels. */
  draw(fn: (g: CanvasRenderingContext2D, w: number, h: number) => void): void;
}

export function textPlane(w: number, h: number): TextPlane {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * PPM);
  canvas.height = Math.round(h * PPM);
  const g = canvas.getContext('2d')!;
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  const mesh = new Mesh(
    new PlaneGeometry(w, h),
    new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }),
  );
  mesh.position.z = 0.0016;
  mesh.renderOrder = LAYER.text;
  return {
    mesh,
    draw(fn) {
      g.clearRect(0, 0, canvas.width, canvas.height);
      fn(g, canvas.width, canvas.height);
      tex.needsUpdate = true;
    },
  };
}

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** A CSS colour string for a hex number, for canvas drawing. */
export const css = (hex: number): string => `#${hex.toString(16).padStart(6, '0')}`;

/** Text with a neon bloom: a blurred pass in the colour, then a crisp core. */
export function glowText(g: CanvasRenderingContext2D, text: string, x: number, y: number, color: number, core = '#ffffff'): void {
  g.save();
  g.shadowColor = css(color);
  g.shadowBlur = g.canvas.height * 0.06;
  g.fillStyle = css(color);
  g.fillText(text, x, y);
  g.shadowBlur = 0;
  g.fillStyle = core;
  g.fillText(text, x, y);
  g.restore();
}

/** Set `weight size font`, shrunk until `text` fits in `maxW` pixels. */
export function fitFont(g: CanvasRenderingContext2D, text: string, weight: number, size: number, maxW: number): void {
  g.font = `${weight} ${size}px ${FONT}`;
  const w = g.measureText(text).width;
  if (w > maxW) g.font = `${weight} ${Math.floor((size * maxW) / w)}px ${FONT}`;
}

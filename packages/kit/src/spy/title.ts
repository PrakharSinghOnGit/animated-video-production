// Home-made cut-paper title letters (straight strokes + arcs, uneven edges, staggered baseline) and the diagonal split / shatter
// into strips. Adapted from LemoLab lemo-opuscar styles/spy-titles/demo/title.js (MIT); the letterforms here are new and not based on
// any real title logo. For ordinary numbers and words use glyph.ts (League Gothic); use this for a chapter or video title that splits.
import { hash } from "../paper/lib";
import type { G, Pt } from "../paper/engine";
import { piece, roughC, INKS } from "./engine";

const D = Math.PI / 180;
const rc = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0 + 0.6], [x1, y0 - 0.6], [x1 - 0.5, y1], [x0 + 0.5, y1 - 0.5]];
/** Elliptical arc band: outer radii (rx, ry), thickness w, angles in degrees (0 = right, 90 = down). */
function band(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, w: number, n = 18): Pt[] {
  const o: Pt[] = [], i: Pt[] = [];
  for (let k = 0; k <= n; k++) {
    const a = (a0 + ((a1 - a0) * k) / n) * D;
    o.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); i.push([cx + Math.cos(a) * (rx - w), cy + Math.sin(a) * (ry - w)]);
  }
  return o.concat(i.reverse());
}
const S = 21;
/** Letterforms, 100 units tall, origin top left. Each glyph is a union of strokes (filled non-zero as one piece). */
export const TITLE_GLYPHS: Record<string, { w: number; strokes: Pt[][] }> = {
  A: { w: 74, strokes: [[[0, 100], [22, 100], [49, 0], [25, 0]], [[52, 100], [74, 100], [49, 0], [25, 0]], rc(17, 60, 57, 78)] },
  B: { w: 66, strokes: [rc(0, 0, S, 100), rc(0, 0, 40, 18), rc(0, 41, 40, 59), rc(0, 82, 40, 100), band(34, 26, 32, 26, -90, 90, 17), band(34, 74, 32, 26, -90, 90, 17)] },
  C: { w: 70, strokes: [band(35, 50, 35, 50, 40, 320, S, 30)] },
  D: { w: 74, strokes: [rc(0, 0, S, 100), rc(0, 0, 42, 20), rc(0, 80, 42, 100), band(38, 50, 36, 50, -90, 90, S)] },
  E: { w: 58, strokes: [rc(0, 0, S, 100), rc(0, 0, 58, 20), rc(0, 40, 50, 60), rc(0, 80, 58, 100)] },
  F: { w: 54, strokes: [rc(0, 0, S, 100), rc(0, 0, 56, 20), rc(0, 40, 48, 60)] },
  G: { w: 72, strokes: [band(36, 50, 36, 50, 8, 325, S, 30), rc(42, 46, 72, 66)] },
  H: { w: 66, strokes: [rc(0, 0, S, 100), rc(45, 0, 66, 100), rc(0, 40, 66, 60)] },
  I: { w: 22, strokes: [rc(0, 0, 22, 100)] },
  J: { w: 46, strokes: [rc(25, 0, 46, 68), band(23, 68, 23, 32, 0, 165, S)] },
  K: { w: 68, strokes: [rc(0, 0, S, 100), [[18, 58], [45, 58], [66, 0], [42, 0]], [[22, 38], [48, 38], [68, 100], [44, 100]]] },
  L: { w: 56, strokes: [rc(0, 0, S, 100), rc(0, 80, 56, 100)] },
  M: { w: 90, strokes: [rc(0, 0, S, 100), rc(69, 0, 90, 100), [[0, 0], [24, 0], [57, 78], [45, 100]], [[90, 0], [66, 0], [33, 78], [45, 100]]] },
  N: { w: 66, strokes: [rc(0, 0, S, 100), rc(45, 0, 66, 100), [[0, 0], [22, 0], [66, 100], [44, 100]]] },
  O: { w: 72, strokes: [band(36, 50, 36, 50, 0, 360, S, 36)] },
  P: { w: 62, strokes: [rc(0, 0, S, 100), rc(0, 0, 38, 20), rc(0, 42, 38, 62), band(32, 31, 30, 31, -90, 90, 20)] },
  R: { w: 66, strokes: [rc(0, 0, S, 100), rc(0, 0, 38, 20), rc(0, 42, 38, 62), band(32, 31, 30, 31, -90, 90, 20), [[24, 60], [47, 60], [66, 100], [43, 100]]] },
  S: { w: 62, strokes: [band(31, 29, 29, 29, -30, -270, S, 26), band(31, 71, 29, 29, -90, 150, S, 26)] },
  T: { w: 66, strokes: [rc(0, 0, 66, 21), rc(22, 0, 44, 100)] },
  U: { w: 66, strokes: [rc(0, 0, S, 70), rc(45, 0, 66, 70), band(33, 67, 33, 33, 0, 180, S)] },
  V: { w: 74, strokes: [[[0, 0], [22, 0], [49, 100], [25, 100]], [[74, 0], [52, 0], [25, 100], [49, 100]]] },
  W: { w: 108, strokes: [[[0, 0], [19, 0], [37, 100], [18, 100]], [[35, 0], [54, 0], [37, 100], [18, 100]], [[54, 0], [73, 0], [90, 100], [71, 100]], [[89, 0], [108, 0], [90, 100], [71, 100]]] },
  X: { w: 72, strokes: [[[0, 0], [25, 0], [72, 100], [47, 100]], [[47, 0], [72, 0], [25, 100], [0, 100]]] },
  Y: { w: 70, strokes: [[[0, 0], [23, 0], [46, 50], [24, 50]], [[70, 0], [47, 0], [24, 50], [46, 50]], rc(24, 48, 46, 100)] },
  Z: { w: 60, strokes: [rc(0, 0, 60, 20), rc(0, 80, 60, 100), [[38, 20], [60, 20], [22, 80], [0, 80]]] },
};

export interface TitleLetter { ch: string; x: number; y: number; h: number; rot: number; seed: number; w: number }
/**
 * Layout (px, origin top left): '\n' starts a new line; letters get a small staggered baseline and rotation. Characters without
 * a cut glyph become a gap. Letters A-Z only (case-insensitive).
 */
export function titleLayout(str: string, H = 250, seed = 500): TitleLetter[] {
  const out: TitleLetter[] = [], k = H / 100, sp = 12 * k;
  str.toUpperCase().split("\n").forEach((line, li) => {
    let x = li * H * 0.3;
    [...line].forEach((ch, i) => {
      const G = TITLE_GLYPHS[ch];
      if (!G) { x += 40 * k; return; }
      const r = hash(seed + li * 40 + i * 3.7), r2 = hash(seed + li * 40 + i * 5.3 + 1);
      out.push({ ch, x, y: li * H * 1.12 + (r - 0.5) * 10 * k, h: H, rot: (r2 - 0.5) * 4 * D, seed: seed + li * 40 + i, w: G.w * k });
      x += G.w * k + sp;
    });
  });
  return out;
}
export function titleBox(str: string, H = 250, seed = 500): { w: number; h: number; L: TitleLetter[] } {
  const L = titleLayout(str, H, seed); let x1 = 0, y1 = 0;
  for (const l of L) { x1 = Math.max(x1, l.x + l.w); y1 = Math.max(y1, l.y + l.h); }
  return { w: x1, h: y1, L };
}

/** Draw one title letter (x, y = top left). */
export function drawGlyph(g: G, l: TitleLetter, col = INKS.noir.ink, opt: { gap?: number } = {}): void {
  const G = TITLE_GLYPHS[l.ch], k = l.h / 100;
  g.save(); g.translate(l.x + l.w / 2, l.y + l.h / 2); g.rotate(l.rot); g.translate(-l.w / 2, -l.h / 2);
  const all = G.strokes.map((p, j) => roughC(`tg${l.ch}${l.seed}${j}${l.h.toFixed(0)}`, () => p.map(([x, y]) => [x * k, y * k] as Pt), l.seed * 3 + j, 1.2 + l.h * 0.004, 8));
  piece(g, all, col, { gap: opt.gap, rule: "nonzero" });
  g.restore();
}

/** Direction of the cut: 30 deg from vertical, as in the opening blade cut. */
export const CUT_ANG = 30 * D;
export interface TitleOpts {
  col?: string;
  seed?: number;
  /** distance the two halves slide apart along the diagonal (0 = closed) */
  split?: number;
  /** shatter 0..1: the title breaks into `strips` diagonal strips that slide off alternately (overrides split) */
  shatter?: number;
  strips?: number;
  cutX?: number; cutY?: number;
  align?: "left" | "center";
  each?: (l: TitleLetter) => { hide?: boolean; dx?: number; dy?: number; rot?: number } | null | undefined;
}
/**
 * Whole title with (x, y) = top left (or top centre with align "center"). Returns the box. split / shatter slide the pieces apart
 * along the cut diagonal; both 0 = closed title.
 */
export function drawTitle(g: G, str: string, x: number, y: number, H: number, opt: TitleOpts = {}): { w: number; h: number } {
  const { L, w, h } = titleBox(str, H, opt.seed ?? 500);
  if (opt.align === "center") x -= w / 2;
  const cx = x + (opt.cutX ?? w * 0.5), cy = y + (opt.cutY ?? h * 0.55);
  const dir: Pt = [Math.sin(CUT_ANG), -Math.cos(CUT_ANG)], n: Pt = [dir[1], -dir[0]], big = 4000;
  const paint = () => {
    for (const l of L) {
      const e = opt.each?.(l); if (e?.hide) continue;
      drawGlyph(g, { ...l, x: x + l.x + (e?.dx ?? 0), y: y + l.y + (e?.dy ?? 0), rot: l.rot + (e?.rot ?? 0) }, opt.col);
    }
  };
  const slab = (a: number, b: number) => {                  // band between offsets a..b along the normal
    g.beginPath();
    g.moveTo(cx - dir[0] * big + n[0] * a, cy - dir[1] * big + n[1] * a); g.lineTo(cx + dir[0] * big + n[0] * a, cy + dir[1] * big + n[1] * a);
    g.lineTo(cx + dir[0] * big + n[0] * b, cy + dir[1] * big + n[1] * b); g.lineTo(cx - dir[0] * big + n[0] * b, cy - dir[1] * big + n[1] * b);
    g.closePath(); g.clip();
  };
  if ((opt.shatter ?? 0) > 0.001) {
    const N = opt.strips ?? 7, span = Math.hypot(w, h) * 1.15, bw = span / N, u = opt.shatter!;
    for (let i = 0; i < N; i++) {
      g.save(); slab(-span / 2 + i * bw - 0.5, -span / 2 + (i + 1) * bw + 0.5);
      const o = u * u * 900 * (0.6 + hash(i * 3.3) * 0.8) * (i % 2 ? 1 : -1);
      g.translate(dir[0] * o, dir[1] * o); paint(); g.restore();
    }
  } else if ((opt.split ?? 0) > 0.01) {
    for (const side of [-1, 1]) {
      g.save(); slab(side < 0 ? -big : 0, side < 0 ? 0 : big);
      g.translate((dir[0] * opt.split! * side) / 2, (dir[1] * opt.split! * side) / 2); paint(); g.restore();
    }
  } else paint();
  return { w, h };
}

// Faces for the Briefing puppets: a paper face plate with ink features (brows, eyes, nose, mouth), front and profile.
// The Agent wears one by default (brand-assets/mascot/AGENT.md); extras get one with `face: true` or an `expr`.
// Everything here is drawn inside a figure's silhouette layer, so the features merge into the cut-out and share its keyline.
import type { G, Pt } from "../paper/engine";
import { piece, smooth, ellP, circP, hash } from "./engine";

const R = Math;

/** Eye shapes: dot = calm; wide = rimmed eye with a pupil (shock, fear); lid = half-closed (sad, smug); squint = narrowed (anger, suspicion); happy = upturned arc; closed = a line (blink). */
export type EyeKind = "dot" | "wide" | "lid" | "squint" | "happy" | "closed";
/** Mouth shapes: flat, smile, grin (open, teeth), frown, o (gasp), grimace (clenched teeth), smirk (one-sided), wavy (unsure). */
export type MouthKind = "flat" | "smile" | "grin" | "frown" | "o" | "grimace" | "smirk" | "wavy";
export interface Expr {
  /** brow slope: -1 = angry (inner ends down) .. +1 = worried (inner ends up) */
  brow: number;
  /** brow height: -1 lowered .. +1 raised high */
  browY: number;
  eye: EyeKind;
  mouth: MouthKind;
  /** extra raise of the right brow (front) / the only brow (profile), for doubt or thinking */
  quirk?: number;
}
/** The expressions. Pick by name (`expr: "worried"`) or pass your own Expr; any field can be changed per frame. */
export const EXPR = {
  neutral: { brow: 0, browY: 0, eye: "dot", mouth: "flat" },
  happy: { brow: 0.15, browY: 0.35, eye: "happy", mouth: "grin" },
  smile: { brow: 0.1, browY: 0.15, eye: "dot", mouth: "smile" },
  smug: { brow: -0.35, browY: -0.1, eye: "lid", mouth: "smirk" },
  worried: { brow: 0.85, browY: 0.35, eye: "dot", mouth: "wavy" },
  scared: { brow: 1, browY: 0.9, eye: "wide", mouth: "grimace" },
  shocked: { brow: 0.25, browY: 1, eye: "wide", mouth: "o" },
  sad: { brow: 0.95, browY: 0.05, eye: "lid", mouth: "frown" },
  angry: { brow: -1, browY: -0.4, eye: "squint", mouth: "grimace" },
  thinking: { brow: 0, browY: 0.1, eye: "dot", mouth: "smirk", quirk: 0.8 },
  doubt: { brow: -0.2, browY: 0, eye: "lid", mouth: "flat", quirk: 1 },
} as const satisfies Record<string, Expr>;
export type ExprName = keyof typeof EXPR;
export const exprOf = (e: Expr | ExprName | undefined): Expr => (typeof e === "string" ? EXPR[e] ?? EXPR.neutral : e ?? EXPR.neutral);

/** Mix an expression into another (k = 0 → a, 1 → b): brows ease, eyes and mouth switch halfway. For a reaction that settles. */
export function mixExpr(a: Expr | ExprName, b: Expr | ExprName, k: number): Expr {
  const A = exprOf(a), B = exprOf(b), u = R.max(0, R.min(1, k));
  return { brow: A.brow + (B.brow - A.brow) * u, browY: A.browY + (B.browY - A.browY) * u, quirk: (A.quirk ?? 0) + ((B.quirk ?? 0) - (A.quirk ?? 0)) * u, eye: u < 0.5 ? A.eye : B.eye, mouth: u < 0.5 ? A.mouth : B.mouth };
}
/** Deterministic blink: 0 open .. 1 shut, a ~0.15 s blink every 2.5–5 s (seed = which figure). Pass as `blink` on the figure. */
export function blinkAt(t: number, seed = 1): number {
  let start = 0.6 + hash(seed * 13.1) * 2;
  for (let i = 0; i < 400 && start <= t; i++) {
    if (t - start < 0.16) { const u = (t - start) / 0.16; return u < 0.5 ? u * 2 : (1 - u) * 2; }
    start += 2.5 + hash(seed * 7.3 + i * 1.7) * 2.5;
  }
  return 0;
}
/** Where the eyes look: [-1..1, -1..1] (0,0 = at the camera in front view, ahead in profile). */
export type Look = [number, number];

/** Skin for a face and hands: the set's paper warmed toward its money colour, so it stays inside the chapter's inks. */
export function skinOf(paper: string, warm: string, k = 0.22): string {
  const h = (s: string) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
  const A = h(paper), B = h(warm);
  return "#" + A.map((v, i) => R.round(v + (B[i] - v) * k).toString(16).padStart(2, "0")).join("");
}

const F = { gap: 0, shadow: false } as const;
/** A tapered stroke as a filled polygon (cut-paper line): w0 → w1 along pts. */
export function band(pts: Pt[], w0: number, w1 = w0): Pt[] {
  const L: Pt[] = [], Rt: Pt[] = [], n = pts.length - 1;
  for (let i = 0; i <= n; i++) {
    const a = pts[R.max(0, i - 1)], b = pts[R.min(n, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = R.hypot(dx, dy) || 1;
    const w = (w0 + (w1 - w0) * (i / (n || 1))) / 2, nx = -dy / l * w, ny = dx / l * w;
    L.push([pts[i][0] + nx, pts[i][1] + ny]); Rt.push([pts[i][0] - nx, pts[i][1] - ny]);
  }
  return L.concat(Rt.reverse());
}
/** Quadratic curve sampled: from a to b bending through c. */
function curve(a: Pt, c: Pt, b: Pt, n = 10): Pt[] {
  const o: Pt[] = [];
  for (let i = 0; i <= n; i++) { const u = i / n, v = 1 - u; o.push([v * v * a[0] + 2 * v * u * c[0] + u * u * b[0], v * v * a[1] + 2 * v * u * c[1] + u * u * b[1]]); }
  return o;
}

/** One eye at (x, y), size r (the dot's radius is ~r/2). side = -1 left, 1 right (for the slant of lids). */
function eye(g: G, x: number, y: number, r: number, kind: EyeKind, look: Look, blink: number, side: number, ink: string, skin: string, brow: number): void {
  if (blink > 0.6 || kind === "closed") { piece(g, band(curve([x - r, y], [x, y + r * 0.35], [x + r, y]), r * 0.32, r * 0.32), ink, F); return; }
  const lx = look[0] * r * 0.38, ly = look[1] * r * 0.3;
  if (kind === "happy") { piece(g, band(curve([x - r, y + r * 0.2], [x, y - r * 0.75], [x + r, y + r * 0.2]), r * 0.34), ink, F); return; }
  if (kind === "wide") {
    piece(g, ellP(x, y, r * 1.05, r * 1.2, 24), ink, F);
    piece(g, ellP(x, y, r * 0.78, r * 0.93, 24), skinLight(skin), F);
    piece(g, circP(x + lx * 1.2, y + ly * 1.2, r * 0.36, 14), ink, F);
    return;
  }
  const open = kind === "squint" ? 0.42 : kind === "lid" ? 0.62 : 1;
  const k = (1 - blink) * open;
  piece(g, ellP(x + lx, y + ly + (1 - k) * r * 0.25, r * 0.52, r * 0.62 * R.max(0.25, k), 18), ink, F);
  if (kind === "lid" || kind === "squint") {                                   // the lid: a heavy line across the top of the eye
    const tilt = kind === "squint" ? -0.35 * side : (0.18 + R.max(0, brow) * 0.25) * side;
    const y0 = y - r * (kind === "squint" ? 0.15 : 0.05);
    piece(g, band([[x - r * 0.85, y0 - tilt * r], [x + r * 0.85, y0 + tilt * r]], r * 0.36), ink, F);
  }
}
/** Eye whites a touch lighter than the skin (they read on any ground through the ink rim). */
function skinLight(skin: string): string {
  return "#" + [1, 3, 5].map((i) => R.min(255, R.round(parseInt(skin.slice(i, i + 2), 16) * 1.06 + 8)).toString(16).padStart(2, "0")).join("");
}

function mouth(g: G, x: number, y: number, w: number, kind: MouthKind, ink: string, skin: string, dir = 1): void {
  const h = w * 0.5, t = R.max(1.8, w * 0.16);
  switch (kind) {
    case "flat": piece(g, band([[x - h, y], [x + h, y + 0.5]], t), ink, F); break;
    case "smile": piece(g, band(curve([x - h, y - h * 0.2], [x, y + h * 0.55], [x + h, y - h * 0.2]), t), ink, F); break;
    case "frown": piece(g, band(curve([x - h, y + h * 0.3], [x, y - h * 0.45], [x + h, y + h * 0.3]), t), ink, F); break;
    case "smirk": piece(g, band(curve([x - h * 0.8 * dir, y + h * 0.05], [x + h * 0.2 * dir, y + h * 0.15], [x + h * dir, y - h * 0.35]), t, t * 0.8), ink, F); break;
    case "wavy": piece(g, band([[x - h, y + 1], [x - h * 0.5, y - h * 0.18], [x, y + h * 0.12], [x + h * 0.5, y - h * 0.18], [x + h, y + 1]], t * 0.9), ink, F); break;
    case "o": piece(g, ellP(x, y + h * 0.15, h * 0.42, h * 0.58, 18), ink, F); break;
    case "grin": {
      const P = smooth([[x - h, y - h * 0.25], [x + h, y - h * 0.25], [x + h * 0.55, y + h * 0.55], [x, y + h * 0.7], [x - h * 0.55, y + h * 0.55]], 2);
      piece(g, P, ink, F);
      piece(g, [[x - h * 0.78, y - h * 0.12], [x + h * 0.78, y - h * 0.12], [x + h * 0.62, y + h * 0.1], [x - h * 0.62, y + h * 0.1]], skinLight(skin), F);   // top teeth
      break;
    }
    case "grimace": {
      piece(g, smooth([[x - h, y - h * 0.32], [x + h, y - h * 0.32], [x + h * 1.05, y + h * 0.3], [x - h * 1.05, y + h * 0.3]], 1), ink, F);
      piece(g, [[x - h * 0.82, y - h * 0.17], [x + h * 0.82, y - h * 0.17], [x + h * 0.86, y + h * 0.15], [x - h * 0.86, y + h * 0.15]], skinLight(skin), F);
      for (let i = -1; i <= 1; i++) piece(g, [[x + i * h * 0.42 - 0.6, y - h * 0.2], [x + i * h * 0.42 + 0.6, y - h * 0.2], [x + i * h * 0.42 + 0.6, y + h * 0.18], [x + i * h * 0.42 - 0.6, y + h * 0.18]], ink, F);
      piece(g, [[x - h * 0.86, y - 0.6], [x + h * 0.86, y - 0.6], [x + h * 0.86, y + 0.6], [x - h * 0.86, y + 0.6]], ink, F);
      break;
    }
  }
}

/**
 * Front face, local coords: chin at (0, 0), face centre (0, -40), ~62 wide. Draws the plate (ears, face) and features.
 * Call inside the head's transform, before the hat.
 */
export function faceFront(g: G, o: { expr: Expr; look: Look; blink: number; ink: string; skin: string }): void {
  const { expr: e, ink, skin } = o;
  piece(g, ellP(-31, -40, 6.5, 10, 14), skin, F); piece(g, ellP(31, -40, 6.5, 10, 14), skin, F);                    // ears
  piece(g, smooth([[-30, -66], [30, -66], [32, -40], [24, -14], [10, -1], [0, 1], [-10, -1], [-24, -14], [-32, -40]], 2), skin, F);
  piece(g, band([[-33, -45], [-32.5, -36]], 2), ink, F); piece(g, band([[33, -45], [32.5, -36]], 2), ink, F);          // ear notches, on the ears
  piece(g, [[-31, -66], [-24, -66], [-26, -50], [-30.5, -47]], ink, F); piece(g, [[31, -66], [24, -66], [26, -50], [30.5, -47]], ink, F);   // sideburns under the brim
  const by = -51 - e.browY * 4.5;
  for (const side of [-1, 1]) {
    const inner = side * 5, outer = side * 20, lift = side === 1 ? (e.quirk ?? 0) * 5 : 0;
    // worried: inner end up; angry: inner end down
    const yi = by - e.brow * 4 - lift, yo = by + e.brow * 1.5 - lift * 0.6;
    piece(g, band([[inner, yi], [(inner + outer) / 2, R.min(yi, yo) - 1.6], [outer, yo]], 4.2, 2.6), ink, F);
    eye(g, side * 12.5, -40, 7.2, e.eye, o.look, o.blink, side, ink, skin, e.brow);
  }
  piece(g, band([[1.5, -36], [-2.5, -26], [2, -24]], 2.4, 2), ink, F);                                                 // nose
  mouth(g, 0, -14, 19, e.mouth, ink, skin);
}

/**
 * Profile face (facing +x), in the side figure's head coords: the paper plate covers the front of the head polygon
 * (clipped, so it keeps the head's cut edge), then eye, brow, ear and mouth.
 */
export function faceSide(g: G, headPoly: Pt[], o: { expr: Expr; look: Look; blink: number; ink: string; skin: string }): void {
  const { expr: e, ink, skin } = o;
  g.save();
  g.beginPath(); g.moveTo(4, -64); g.lineTo(60, -64); g.lineTo(60, 12); g.lineTo(-2, 12); g.lineTo(-2, -20); g.closePath(); g.clip();
  piece(g, headPoly, skin, F);
  g.restore();
  piece(g, ellP(3, -38, 5.5, 8.5, 12), skin, F); piece(g, band([[3, -42], [5, -35]], 2), ink, F);                      // ear
  const lift = (e.quirk ?? 0) * 4, by = -57.5 - e.browY * 3.5 - lift;
  piece(g, band([[15, by + e.brow * 1.2], [21, by - 1.5], [28, by - e.brow * 3.2]], 2.4, 3.6), ink, F);              // brow: front end = inner end
  const look: Look = [R.max(0, o.look[0] * 0.5 + 0.5), o.look[1]];
  eye(g, 22.5, -49, 4.6, e.eye, look, o.blink, 1, ink, skin, e.brow);
  const m = e.mouth;
  // the mouth sits on the profile edge, opening toward +x
  if (m === "o") piece(g, ellP(31.5, -19, 2.4, 3.6, 12), ink, F);
  else if (m === "grin" || m === "grimace") {
    piece(g, [[24, -22], [33, -23], [32, -15], [25, -16]], ink, F);
    piece(g, [[26, -21], [32, -21.5], [31.5, -18.5], [26, -18.5]], skinLight(skin), F);
  } else {
    const c: Record<string, Pt[]> = {
      flat: [[24, -19], [31, -19]], smile: [[23, -21], [27, -18], [31, -20]], frown: [[23, -17.5], [27, -20], [31, -18]],
      smirk: [[24, -19], [28, -19], [31, -21.5]], wavy: [[23, -19], [26, -20.5], [28.5, -18.5], [31, -20]],
    };
    piece(g, band(c[m] ?? c.flat, 2.2, 1.8), ink, F);
  }
}

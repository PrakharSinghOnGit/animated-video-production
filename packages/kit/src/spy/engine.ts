// The Briefing paper-cut engine: four flat inks, scissor-rough edges (cut once in local space), cut slits and paper shadows,
// a paper-texture finish, and a silhouette merge layer. Adapted from LemoLab lemo-opuscar styles/spy-titles/demo/paper.js (MIT).
// See CREDITS.md. Differences: TypeScript, the 2D context is passed explicitly (no module-level "current g"), per-context state
// lives in a WeakMap, textures are generated once from a fixed seed (deterministic), palettes are ink sets (INKS).
import { hash, vnoise, clamp } from "../paper/lib";
import { W, H, frameCanvas, type G, type Pt } from "../paper/engine";

export { W, H, setFrameSize, isVertical, frameCanvas, applyCam, w2s, s2w, viewRect, type G, type Pt, type Cam, type Rect } from "../paper/engine";
export { frameRect, moveTime, SAFE } from "../paper/transitions";
export { clamp, lerp, seg, TAU, inOutCubic, inOutSine, outCubic, outBack, outExpo, hash, vnoise, mulberry } from "../paper/lib";
export { smooth as smoothstep } from "../paper/lib";

// ---------- inks ----------
/** One four-ink set. `ink`/`paper` are the dark and light stocks, `hot` and `warm` the two spot inks; `*D` are darker shadow-paper variants. */
export interface Inks {
  name: string;
  ink: string; paper: string; hot: string; warm: string;
  /** slightly lighter ink (for a second black layer) */
  inkL: string;
  paperD: string; hotD: string; warmD: string;
}
const hex = (s: string): [number, number, number] => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const toHex = (c: number[]) => "#" + c.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
const mulHex = (s: string, k: number) => toHex(hex(s).map((v) => v * k));
const mixHex = (a: string, b: string, k: number) => { const A = hex(a), B = hex(b); return toHex(A.map((v, i) => v + (B[i] - v) * k)); };
function inkSet(name: string, ink: string, paper: string, hot: string, warm: string): Inks {
  return { name, ink, paper, hot, warm, inkL: mixHex(ink, paper, 0.13), paperD: mulHex(paper, 0.92), hotD: mulHex(hot, 0.72), warmD: mulHex(warm, 0.78) };
}
/** Palettes. noir is the reference look (black, cream, signal red, mustard). Pick one per chapter and stay inside it. */
export const INKS = {
  noir: inkSet("noir", "#1b1714", "#efe4c9", "#d23a22", "#e2a52a"),
  teal: inkSet("teal", "#161a22", "#ece6d6", "#1f8a8a", "#f07a28"),
  cobalt: inkSet("cobalt", "#1b1714", "#f3d6cc", "#2a46b8", "#f0d23a"),
  plum: inkSet("plum", "#1f1720", "#efe0d0", "#c2304f", "#e8b04a"),
} as const satisfies Record<string, Inks>;
export type InkName = keyof typeof INKS;

/** Relative luminance 0..1 of a #rrggbb colour. */
export const luma = (s: string): number => { const [r, g, b] = hex(s); return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255; };

// ---------- per-context state ----------
export interface SpyState { bg: string; gap: number; shadow: boolean; shAlpha: number }
const states = new WeakMap<object, SpyState>();
const layers = new WeakSet<object>();
/** Per-context drawing state: `bg` = colour of the board showing through the cut gaps (the current ground). */
export function state(g: G): SpyState {
  let s = states.get(g);
  if (!s) { s = { bg: INKS.noir.paper, gap: 2.4, shadow: true, shAlpha: 0.3 }; states.set(g, s); }
  return s;
}
/** True when g is a silhouette layer (pieces merge into one contour instead of getting their own gap and shadow). */
export const isLayer = (g: G): boolean => layers.has(g);

/** Fill the whole frame with the ground colour (identity transform) and make it the colour seen in cut gaps. Call first in every frame. */
export function clear(g: G, col: string): void {
  const s = state(g); s.bg = col;
  s.gap = 2.4; s.shadow = true; s.shAlpha = 0.3;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none";
  g.fillStyle = col; g.fillRect(0, 0, W, H); g.restore();
}
/** Run fn with another board colour in the cut gaps (e.g. when pieces lie on a card of a different colour). */
export function withBg(g: G, col: string, fn: () => void): void {
  const s = state(g), old = s.bg; s.bg = col;
  try { fn(); } finally { s.bg = old; }
}

/** Scale of the current transform (slits and outlines keep their width in screen pixels). */
export function curScale(g: G): number { const m = g.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; }

// ---------- scissor-rough edge ----------
/**
 * Resample the contour and displace it: low-frequency wobble by arc length + an occasional small nick. Corners stay sharp.
 * Fixed seed gives the same cut edge every time.
 */
export function rough(pts: Pt[], seed = 1, amp = 1.3, step = 10, closed = true): Pt[] {
  const n = pts.length, out: Pt[] = [];
  let s = 0;
  const E = closed ? n : n - 1;
  for (let i = 0; i < E; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1e-6;
    const nx = -dy / L, ny = dx / L;
    const k = Math.max(1, Math.round(L / step));
    for (let j = 0; j < k; j++) {
      const u = j / k, ss = s + u * L;
      const w = j === 0 ? 0.25 : 1;                         // scissors are accurate at corners; the middle of an edge wobbles
      let o = (vnoise(ss / (step * 2.3) + seed * 17.13) * 2 - 1) * amp * w;
      o += (vnoise(ss / (step * 0.55) + seed * 5.7) * 2 - 1) * amp * 0.35 * w;
      if (hash(Math.floor(ss / (step * 3)) + seed * 91.7) > 0.965 && j > 0) o -= amp * 1.6;   // small nick
      out.push([a[0] + dx * u + nx * o, a[1] + dy * u + ny * o]);
    }
    s += L;
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}
const cache = new Map<string, Pt[]>();
/**
 * Cached rough(): cut once in local space, so the edge travels with the piece and never "boils". Keyed by the piece id
 * AND its geometry and cut settings: the cache is shared by every act on the page, so in the full render two acts that
 * both call a piece "house" used to get whichever house was drawn first (A05's house came out as A02's).
 */
export function roughC(key: string, fn: () => Pt[], seed?: number, amp?: number, step?: number): Pt[] {
  const pts = fn();
  let sig = `${key}|${seed}|${amp}|${step}|`;
  for (const p of pts) sig += `${Math.round(p[0] * 10)},${Math.round(p[1] * 10)};`;
  let r = cache.get(sig);
  if (!r) {
    if (cache.size > 50_000) cache.clear();
    r = rough(pts, seed, amp, step); cache.set(sig, r);
  }
  return r;
}
export function pathPoly(g: G, pts: Pt[]): void {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.closePath();
}

// ---------- pieces ----------
export interface PieceOpts {
  /** slit around the piece in screen px (0 = none, default 2.4) */
  gap?: number;
  /** colour of the slit (default: the current ground), null = no slit */
  gapCol?: string | null;
  shadow?: boolean;
  shA?: number; shB?: number; shX?: number; shY?: number;
  /** inside a silhouette layer: cut a transparent slit of this width all round */
  cut?: number;
  /** override the layer merge behaviour */
  force?: boolean;
  /** fill rule (default evenodd: extra contours are holes; use nonzero to union overlapping strokes) */
  rule?: CanvasFillRule;
}
/**
 * One paper piece. `polys` = one contour or several (evenodd: inner contours are cut out). Draws the slit in the ground colour,
 * then the piece with a soft paper shadow. In a silhouette layer pieces merge instead.
 */
export function piece(g: G, polys: Pt[] | Pt[][], col: string, opt: PieceOpts = {}): void {
  const P = (Array.isArray(polys[0][0]) ? polys : [polys]) as Pt[][];
  const sc = curScale(g), st = state(g), rule = opt.rule ?? "evenodd";
  g.beginPath(); for (const p of P) pathPoly(g, p);
  if (isLayer(g) && !opt.force) {
    if (opt.cut) { g.save(); g.globalCompositeOperation = "destination-out"; g.lineJoin = "round"; g.lineWidth = (opt.cut * 2) / sc; g.stroke(); g.restore(); }
    g.fillStyle = col; g.fill(rule); return;
  }
  const gap = opt.gap ?? st.gap;
  if (gap > 0 && opt.gapCol !== null) { g.lineJoin = "round"; g.lineWidth = (gap * 2) / sc; g.strokeStyle = opt.gapCol || st.bg; g.stroke(); }
  if (opt.shadow ?? st.shadow) {
    g.save();
    g.shadowColor = `rgba(20,12,6,${opt.shA ?? st.shAlpha})`; g.shadowBlur = opt.shB ?? 5;
    g.shadowOffsetX = opt.shX ?? 2.5; g.shadowOffsetY = opt.shY ?? 3.5;
    g.fillStyle = col; g.fill(rule); g.restore();
  } else { g.fillStyle = col; g.fill(rule); }
}

// ---------- shapes (local coords, edges not yet cut) ----------
export const rectP = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
export function circP(cx: number, cy: number, r: number, n = 0, a0 = 0): Pt[] {
  n = n || Math.max(18, Math.round(r * 0.9));
  const o: Pt[] = []; for (let i = 0; i < n; i++) { const a = a0 + (i / n) * Math.PI * 2; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o;
}
export function ellP(cx: number, cy: number, rx: number, ry: number, n = 40, rot = 0): Pt[] {
  const o: Pt[] = [], c = Math.cos(rot), s = Math.sin(rot);
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; o.push([cx + x * c - y * s, cy + x * s + y * c]); }
  return o;
}
export function arcP(cx: number, cy: number, r: number, a0: number, a1: number, n = 24): Pt[] {
  const o: Pt[] = []; for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; o.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return o;
}
/** Chaikin corner cutting: a smoothed polyline (paper cut-outs need curves too). */
export function smooth(pts: Pt[], it = 2, closed = true): Pt[] {
  for (let k = 0; k < it; k++) {
    const o: Pt[] = [], n = pts.length, E = closed ? n : n - 1;
    if (!closed) o.push(pts[0]);
    for (let i = 0; i < E; i++) {
      const a = pts[i], b = pts[(i + 1) % n];
      o.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    if (!closed) o.push(pts[n - 1]);
    pts = o;
  }
  return pts;
}
/** Translate, scale, rotate a contour. */
export function xf(pts: Pt[], x = 0, y = 0, s = 1, r = 0): Pt[] {
  const c = Math.cos(r), sn = Math.sin(r);
  return pts.map(([a, b]) => [x + (a * c - b * sn) * s, y + (a * sn + b * c) * s] as Pt);
}

// ---------- paper texture ----------
let tex: OffscreenCanvas | null = null, speck: OffscreenCanvas | null = null;
function makeTex(): void {
  tex = frameCanvas(null);
  const t = tex.getContext("2d")!, im = t.createImageData(W, H), d = im.data;
  let sd = 12345; const rnd = () => (sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0) / 4294967296;   // fixed-seed LCG: identical every run
  const lw = W / 8 + 2, low = new Float32Array(lw * (H / 8 + 2));
  for (let i = 0; i < low.length; i++) low[i] = rnd();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {                // low-frequency mottling + grain
    const gx = x / 8, gy = y / 8, ix = gx | 0, iy = gy | 0, fx = gx - ix, fy = gy - iy;
    const l = (low[iy * lw + ix] * (1 - fx) + low[iy * lw + ix + 1] * fx) * (1 - fy) + (low[(iy + 1) * lw + ix] * (1 - fx) + low[(iy + 1) * lw + ix + 1] * fx) * fy;
    const v = 255 - (l * 14 + rnd() * 12), i4 = (y * W + x) * 4;
    d[i4] = v; d[i4 + 1] = v - 1; d[i4 + 2] = v - 4; d[i4 + 3] = 255;
  }
  t.putImageData(im, 0, 0);
  t.globalAlpha = 0.06; t.strokeStyle = "#6b5a40"; t.lineWidth = 1;     // fibres
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * W, y = rnd() * H, a = rnd() * 6.28, l = 6 + rnd() * 22;
    t.beginPath(); t.moveTo(x, y); t.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); t.stroke();
  }
  speck = frameCanvas(null);                                                           // specks where the ink missed the paper (screen blend: visible on dark inks)
  const s2 = speck.getContext("2d")!; s2.fillStyle = "#000"; s2.fillRect(0, 0, W, H);
  for (let i = 0; i < 9000; i++) {
    const x = rnd() * W, y = rnd() * H, r = rnd() < 0.9 ? 0.6 + rnd() * 0.9 : 1.5 + rnd() * 1.5;
    s2.fillStyle = `rgba(120,108,88,${0.25 + rnd() * 0.5})`; s2.beginPath(); s2.arc(x, y, r, 0, 7); s2.fill();
  }
  for (let y = 0; y < H; y += 3) { s2.fillStyle = `rgba(90,80,64,${vnoise(y / 37) * 0.05})`; s2.fillRect(0, y, W, 3); }   // faint squeegee streaks
}
/** Paper texture multiplied over the finished frame. Static (screen-locked), generated once from a fixed seed. Call last. */
export function paperFinish(g: G, amt = 1): void {
  if (!tex || tex.width !== W || tex.height !== H) makeTex();
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = amt; g.globalCompositeOperation = "multiply"; g.drawImage(tex!, 0, 0);
  g.globalAlpha = 0.55 * amt; g.globalCompositeOperation = "screen"; g.drawImage(speck!, 0, 0);
  g.restore();
}

/** Plain canvas text for small labels (use drawLine for anything big). */
export function label(g: G, s: string, x: number, y: number, font: string, col: string, align: CanvasTextAlign = "left", ls = 0): void {
  g.save(); g.font = font; g.fillStyle = col; g.textAlign = align; g.textBaseline = "alphabetic";
  if (ls) (g as any).letterSpacing = ls + "px";
  g.fillText(s, x, y); g.restore();
}

// ---------- silhouette layer ----------
let LC: OffscreenCanvas | null = null, LT: OffscreenCanvas | null = null;
export interface SilOpts { outline?: number; outlineCol?: string; shadow?: boolean; shA?: number; alpha?: number }
/**
 * A puppet's pieces first merge into one outer contour in a layer (only the joint slits stay inside), then the whole is pasted
 * onto g: an outer slit in the ground colour (separating it from the set behind) + one paper shadow.
 * fn receives the LAYER context: draw with piece(L, ...) / slit(L, ...), using the same transform as g. Nested calls run fn(g) directly.
 */
export function silhouette(g: G, fn: (L: G) => void, opt: SilOpts = {}): void {
  if (isLayer(g)) { fn(g); return; }
  LC = frameCanvas(LC); LT = frameCanvas(LT);
  const L = LC.getContext("2d")! as unknown as G, T2 = LT!.getContext("2d")!;
  layers.add(L);
  L.setTransform(1, 0, 0, 1, 0, 0); L.globalAlpha = 1; L.globalCompositeOperation = "source-over"; L.clearRect(0, 0, W, H); L.setTransform(g.getTransform());
  const bg = state(g).bg;
  fn(L);
  const r = opt.outline ?? state(g).gap;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  if (r > 0) {
    T2.setTransform(1, 0, 0, 1, 0, 0); T2.globalCompositeOperation = "source-over"; T2.clearRect(0, 0, W, H); T2.drawImage(LC, 0, 0);
    T2.globalCompositeOperation = "source-in"; T2.fillStyle = opt.outlineCol || bg; T2.fillRect(0, 0, W, H); T2.globalCompositeOperation = "source-over";
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; g.drawImage(LT!, Math.cos(a) * r, Math.sin(a) * r); }
  }
  if (opt.shadow ?? true) { g.shadowColor = `rgba(20,12,6,${opt.shA ?? 0.32})`; g.shadowBlur = 5; g.shadowOffsetX = 3; g.shadowOffsetY = 4; }
  g.globalAlpha = opt.alpha ?? 1;
  g.drawImage(LC, 0, 0);
  g.restore();
}
/** Joint slit: a thin transparent cut in the layer L (x, y local; ang = slit direction; len local units; w screen px). */
export function slit(L: G, x: number, y: number, ang: number, len: number, w = 1.7): void {
  const sc = curScale(L);
  L.save(); L.translate(x, y); L.rotate(ang); L.globalCompositeOperation = "destination-out";
  L.fillStyle = "#000"; L.fillRect(-len / 2, -w / 2 / sc, len, w / sc); L.restore();
}
/** Cut an arbitrary polygon out of the layer. */
export function cutPoly(L: G, pts: Pt[]): void {
  L.save(); L.globalCompositeOperation = "destination-out"; L.beginPath(); pathPoly(L, pts); L.fillStyle = "#000"; L.fill(); L.restore();
}

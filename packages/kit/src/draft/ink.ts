/**
 * The three inks. The same geometry is drawn in whichever ink is on screen:
 * - PAPER: cream paper, 60 px blue grid; pencil lines (resampled, pushed off true by slow sine waves whose phase
 *   steps 8 times a second, stroked twice), paper tooth knocked out of the strokes, multiplied onto the paper;
 *   fills are diagonal hatching drawn one line at a time.
 * - BLUEPRINT: flat blue, white grid; clean white 3-4 px lines, hidden edges dashed and thinner; fine clean hatching.
 * - HOLOGRAM: black, cyan grid; cyan lines with a white core 30% of the width; fills are horizontal scan lines on an
 *   8 px pitch whose thickness follows how lit the surface is. No blur, no glow: light reads through line density.
 */
import { INK, GRID, W, H, TAU, clamp, mulberry, inkOf, type G, type Pt, type Ink, type InkName } from "./core";
import { resample, polyLength, truncate } from "./geom";
import { registerCache } from "../paper/engine";

/** Drawing clock: drawAct sets it for every sub-frame, so strokes boil without passing t around. */
export const inkClock = { t: 0 };
export const setInkTime = (t: number) => { inkClock.t = t; };

// ───────────────────────────── offscreen helpers ─────────────────────────────

const pool: OffscreenCanvas[] = [];
/** A cleared offscreen canvas the size of the frame (i = nesting slot). */
export function scratch(i: number): G {
  let c = pool[i];
  if (!c || c.width !== W || c.height !== H) { c = new OffscreenCanvas(W, H); pool[i] = c; }
  const g = c.getContext("2d")! as unknown as G;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none";
  g.clearRect(0, 0, W, H);
  return g;
}
export const canvasOf = (g: G) => g.canvas as unknown as CanvasImageSource;

let grainTile: OffscreenCanvas | null = null, toothTile: OffscreenCanvas | null = null;
registerCache(() => [...pool, grainTile, toothTile], () => { pool.length = 0; grainTile = toothTile = null; });
function tiles() {
  if (grainTile && toothTile) return;
  const S = 512, r = mulberry(7);
  grainTile = new OffscreenCanvas(S, S);
  const gg = grainTile.getContext("2d")!;
  gg.fillStyle = "#fff"; gg.fillRect(0, 0, S, S);
  for (let i = 0; i < 26000; i++) {           // fibres and speckle
    const x = r() * S, y = r() * S, v = 200 + Math.floor(r() * 50);
    gg.fillStyle = `rgb(${v},${v - 4},${v - 12})`;
    gg.globalAlpha = 0.18 + r() * 0.25;
    if (r() < 0.12) { gg.save(); gg.translate(x, y); gg.rotate(r() * TAU); gg.fillRect(0, 0, 4 + r() * 10, 0.7); gg.restore(); }
    else gg.fillRect(x, y, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  toothTile = new OffscreenCanvas(S, S);
  const tg = toothTile.getContext("2d")!;
  const r2 = mulberry(11);
  for (let i = 0; i < 9000; i++) { tg.globalAlpha = 0.25 + r2() * 0.6; tg.fillStyle = "#000"; tg.fillRect(r2() * S, r2() * S, 1 + r2() * 2.2, 1 + r2() * 1.6); }
}

// ───────────────────────────── background ─────────────────────────────

/** Fill the frame with the ink's ground, its grid and (paper) the grain. Screen space: the camera is locked. */
export function background(g: G, ink: InkName | Ink, o: { grid?: boolean; gridAlpha?: number } = {}): void {
  const k = inkOf(ink);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = k.bg; g.fillRect(0, 0, W, H);
  if (k.name === "paper") {
    tiles();
    g.globalCompositeOperation = "multiply";
    g.fillStyle = g.createPattern(grainTile as unknown as CanvasImageSource, "repeat")!;
    g.globalAlpha = 0.55; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "source-over";
  }
  if (o.grid !== false) grid(g, k, o.gridAlpha ?? 1);
  g.restore();
}

/** The 60 px grid, centred on the frame, every fifth line stronger. */
export function grid(g: G, ink: InkName | Ink, alpha = 1): void {
  const k = inkOf(ink), ox = (W / 2) % GRID, oy = (H / 2) % GRID;
  g.save();
  g.strokeStyle = k.grid; g.lineWidth = 1;
  const fifth = (v: number, o: number) => Math.round((v - o) / GRID) % 5 === 0;
  for (let pass = 0; pass < 2; pass++) {
    g.globalAlpha = k.gridA[pass] * alpha;
    g.beginPath();
    for (let x = ox; x <= W; x += GRID) if (fifth(x, W / 2) === (pass === 1)) { g.moveTo(Math.round(x) + 0.5, 0); g.lineTo(Math.round(x) + 0.5, H); }
    for (let y = oy; y <= H; y += GRID) if (fifth(y, H / 2) === (pass === 1)) { g.moveTo(0, Math.round(y) + 0.5); g.lineTo(W, Math.round(y) + 0.5); }
    g.stroke();
  }
  g.restore();
}

/**
 * Draws `fn` as ink on paper: on a layer, with paper tooth knocked out of the strokes, multiplied onto the frame.
 * Other inks draw directly. drawAct wraps the scene in this, so acts never call it.
 */
export function inkLayer(g: G, ink: InkName | Ink, fn: (h: G) => void, slot = 4): void {
  const k = inkOf(ink);
  if (k.name !== "paper") { fn(g); return; }
  tiles();
  const h = scratch(slot);
  h.setTransform(g.getTransform());
  fn(h);
  h.setTransform(1, 0, 0, 1, 0, 0);
  h.globalCompositeOperation = "destination-out";
  h.globalAlpha = 0.32;
  h.fillStyle = h.createPattern(toothTile as unknown as CanvasImageSource, "repeat")!;
  h.fillRect(0, 0, W, H);
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "multiply";
  g.drawImage(canvasOf(h), 0, 0);
  g.restore();
}

// ───────────────────────────── lines ─────────────────────────────

export interface LineOpts {
  ink: InkName | Ink;
  /** override colour (default the ink's line colour; use ink.accent for the stage's accent) */
  col?: string;
  /** width in px (paper 3, blueprint 3.5, hologram 4) */
  w?: number;
  closed?: boolean;
  /** hidden edge: dashed and thinner */
  hidden?: boolean;
  seed?: number;
  /** draw on: 0..1 of the length */
  progress?: number;
  alpha?: number;
  /** pencil wobble amplitude in px (paper; default 1.6) */
  wobble?: number;
}

function path(g: G, pts: Pt[]) {
  g.beginPath();
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
}

/** Pencil: points pushed off true by two slow sines along the length; the phase steps 8 times a second. */
function boil(pts: Pt[], seed: number, amp: number, closed: boolean): Pt[] {
  const L = polyLength(pts, closed);
  if (L < 1) return pts;
  const n = Math.max(2, Math.ceil(L / 7));
  const R = resample(pts, n, closed);
  if (closed) R.push(R[0]);
  const ph = Math.floor(inkClock.t * 8);
  const out: Pt[] = [];
  for (let i = 0; i < R.length; i++) {
    const a = R[Math.max(0, i - 1)], b = R[Math.min(R.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const nl = Math.hypot(nx, ny) || 1; nx /= nl; ny /= nl;
    const s = (i / (R.length - 1)) * L;
    const off = amp * (0.6 * Math.sin(s / 61 + seed * 1.7 + ph * 2.1) + 0.4 * Math.sin(s / 23 + seed * 3.1 + ph * 1.37));
    out.push([R[i][0] + nx * off, R[i][1] + ny * off]);
  }
  return out;
}

/** One line in the current ink. */
export function line(g: G, pts: Pt[], o: LineOpts): void {
  if (pts.length < 2) return;
  const k = inkOf(o.ink), closed = !!o.closed;
  let P = o.progress !== undefined && o.progress < 1 ? truncate(pts, clamp(o.progress), closed) : closed ? [...pts, pts[0]] : pts;
  if (P.length < 2) return;
  const col = o.col ?? k.line, alpha = o.alpha ?? 1, seed = o.seed ?? 1;
  g.save();
  g.lineCap = "round"; g.lineJoin = "round";
  if (k.name === "paper") {
    const w = o.w ?? 3, amp = o.wobble ?? 1.6;
    if (o.hidden) g.setLineDash([10, 9]);
    g.strokeStyle = col;
    g.globalAlpha = 0.9 * alpha * (o.hidden ? 0.6 : 1); g.lineWidth = o.hidden ? w * 0.6 : w;
    path(g, boil(P, seed, amp, false)); g.stroke();
    g.globalAlpha = 0.4 * alpha * (o.hidden ? 0.6 : 1); g.lineWidth = (o.hidden ? w * 0.6 : w) * 0.5;
    path(g, boil(P, seed + 9.3, amp * 1.9, false)); g.stroke();
  } else if (k.name === "blueprint") {
    const w = o.w ?? 3.5;
    g.strokeStyle = col;
    if (o.hidden) { g.setLineDash([12, 9]); g.lineWidth = w * 0.55; g.globalAlpha = 0.72 * alpha; }
    else { g.lineWidth = w; g.globalAlpha = alpha; }
    path(g, P); g.stroke();
  } else {
    const w = o.w ?? 4;
    if (o.hidden) { g.setLineDash([12, 9]); g.strokeStyle = col; g.lineWidth = w * 0.5; g.globalAlpha = 0.5 * alpha; path(g, P); g.stroke(); }
    else {
      g.strokeStyle = col; g.lineWidth = w; g.globalAlpha = alpha; path(g, P); g.stroke();
      g.strokeStyle = "#ffffff"; g.lineWidth = Math.max(1, w * 0.3); path(g, P); g.stroke();   // white core
    }
  }
  g.restore();
}

// ───────────────────────────── fills ─────────────────────────────

export type FillKind = "hatch" | "cross" | "scan" | "solid" | "none";
export interface FillOpts {
  ink: InkName | Ink;
  /** default: paper/blueprint hatch, hologram scan */
  kind?: FillKind;
  col?: string;
  /** hatch angle in radians (default 45 deg) */
  angle?: number;
  /** spacing between hatch lines px (paper 10, blueprint 7; scan pitch 8) */
  gap?: number;
  /** drawn on one line at a time: 0..1 */
  progress?: number;
  /** hologram: how lit the surface is 0..1 (scan line thickness) */
  light?: number;
  alpha?: number;
  seed?: number;
}

function clipTo(g: G, polys: Pt[][]) {
  g.beginPath();
  for (const p of polys) { if (p.length < 3) continue; g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); }
  g.clip("evenodd");
}
const bbox = (polys: Pt[][]) => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of polys) for (const [x, y] of p) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
};
const asPolys = (p: Pt[] | Pt[][]): Pt[][] => (p.length && Array.isArray(p[0][0]) ? (p as Pt[][]) : [p as Pt[]]);

/** Fill a shape (or [outer, holes...]) in the current ink. */
export function fill(g: G, shape: Pt[] | Pt[][], o: FillOpts): void {
  const polys = asPolys(shape);
  if (!polys.length || !polys[0].length) return;
  const k = inkOf(o.ink);
  const kind: FillKind = o.kind ?? (k.name === "hologram" ? "scan" : "hatch");
  if (kind === "none") return;
  const prog = clamp(o.progress ?? 1), alpha = o.alpha ?? 1;
  if (prog <= 0) return;
  g.save();
  clipTo(g, polys);
  const [x0, y0, x1, y1] = bbox(polys);
  if (kind === "solid") {
    g.globalAlpha = alpha; g.fillStyle = o.col ?? k.accent;
    // a solid fill also builds up: a hard-edged sweep from the left
    g.fillRect(x0 - 2, y0 - 2, (x1 - x0 + 4) * prog, y1 - y0 + 4);
    g.restore(); return;
  }
  if (kind === "scan" || k.name === "hologram") {
    const pitch = o.gap ?? 8, th = 1 + 5 * clamp(o.light ?? 0.6);
    g.fillStyle = o.col ?? k.line; g.globalAlpha = alpha;
    const yEnd = y0 + (y1 - y0) * prog;
    for (let y = Math.floor(y0 / pitch) * pitch; y < yEnd; y += pitch) g.fillRect(x0 - 2, y, x1 - x0 + 4, th);
    g.restore(); return;
  }
  const passes = kind === "cross" ? [o.angle ?? Math.PI / 4, (o.angle ?? Math.PI / 4) - Math.PI / 2] : [o.angle ?? Math.PI / 4];
  const gap = o.gap ?? (k.name === "paper" ? 10 : 7);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + gap;
  passes.forEach((ang, pi) => {
    const dx = Math.cos(ang), dy = Math.sin(ang), nx = -dy, ny = dx;
    const n = Math.ceil((2 * R) / gap);
    const shown = prog * n;
    for (let i = 0; i < n && i < shown; i++) {
      const off = -R + i * gap + (pi ? gap / 2 : 0);
      const a: Pt = [cx + nx * off - dx * R, cy + ny * off - dy * R], b: Pt = [cx + nx * off + dx * R, cy + ny * off + dy * R];
      const part = Math.min(1, shown - i);
      const pts: Pt[] = [a, [a[0] + (b[0] - a[0]) * part, a[1] + (b[1] - a[1]) * part]];
      if (k.name === "paper") line(g, pts, { ink: k, col: o.col ?? k.accent, w: 1.7, wobble: 0.9, seed: (o.seed ?? 3) + i * 0.37 + pi * 5, alpha: alpha * 0.8 });
      else { g.strokeStyle = o.col ?? k.line; g.globalAlpha = 0.7 * alpha; g.lineWidth = 1.3; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); g.stroke(); }
    }
  });
  g.restore();
}

/** Paint a shape with the ground colour (an opaque solid hides what is behind it). */
export function occlude(g: G, shape: Pt[] | Pt[][], ink: InkName | Ink): void {
  const k = inkOf(ink);
  // on paper the scene is multiplied onto the paper, so white is "nothing" (the paper shows through, lines below are hidden)
  g.save(); g.fillStyle = k.name === "paper" ? "#ffffff" : k.bg; g.globalAlpha = 1;
  g.beginPath();
  for (const p of asPolys(shape)) { if (p.length < 3) continue; g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); g.closePath(); }
  g.fill("evenodd"); g.restore();
}

/** Outline + fill in one call. */
export function shape(g: G, pts: Pt[] | Pt[][], o: LineOpts & { fill?: FillKind; fillProgress?: number; fillCol?: string; light?: number; gap?: number; opaque?: boolean }): void {
  const polys = asPolys(pts);
  if (o.opaque) occlude(g, polys, o.ink);
  if (o.fill && o.fill !== "none") fill(g, polys, { ink: o.ink, kind: o.fill, progress: o.fillProgress, col: o.fillCol, light: o.light, gap: o.gap, seed: o.seed });
  for (const p of polys) line(g, p, { ...o, closed: o.closed ?? true });
}

export { INK };

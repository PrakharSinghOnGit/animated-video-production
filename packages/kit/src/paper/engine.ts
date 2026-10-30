// The Ledger paper engine: canvas-2D drawing primitives in the Wealth Gap house style.
// Adapted from LemoLab lemo-opuscar styles/dataviz/demo/engine.js (MIT). See CREDITS.md.
// World units = sheet pixels at zoom 1. A 2D camera {x, y, zoom, roll, sx, sy} looks at the sheet.
// Everything here is deterministic: seeded noise only, no Math.random / Date.
import { clamp, lerp, hash, vnoise, mulberry, seg, outCubic, TAU } from "./lib";

export type G = CanvasRenderingContext2D;
export type Pt = [number, number];
export interface Cam { x: number; y: number; zoom: number; roll?: number; sx?: number; sy?: number }
export type Rect = [number, number, number, number];

/** Frame size in px: 1920x1080 for the long-form video, 1080x1920 for shorts. Live bindings: the canvas host sets them per
 *  composition (setFrameSize) before every draw, so read W/H inside functions, never cache them at module top level. */
export let W = 1920, H = 1080;
export function setFrameSize(w: number, h: number): void { W = w; H = h; }
/** True for a vertical (9:16) frame. */
export const isVertical = (): boolean => H > W;
/** An offscreen canvas of the current frame size, recreated when the size changed. */
export function frameCanvas(c: OffscreenCanvas | null): OffscreenCanvas {
  return c && c.width === W && c.height === H ? c : new OffscreenCanvas(W, H);
}

// ---------- palette (Ledger, STYLE.md section 3) ----------
export const P = {
  paper: "#F4EFE4", rule: "#DCD3C2", margin: "#E2B6AE",
  ink: "#2A2622", inkSoft: "#6E665C", lead: "#34312D",
  red: "#B0302A", green: "#2F6B4F", blue: "#2E5A84", ochre: "#C99A3B",
  kraft: "#C8A97E", sage: "#A7B89B", dusty: "#9DB1C6", blush: "#D9A79A", straw: "#E3CC8A",
  white: "#FFFDF8",           // cut-out border: the only white
  wood: "#E3C79C", woodDark: "#C9A774",   // pencil wood cone
  desk: "#8F7152", deskDark: "#7A5E42", deskLight: "#A38462",
  shadow: "rgba(60,40,24,1)",
} as const;
export const FONT = { type: "Fraunces", hand: "Caveat", mono: "IBM Plex Mono" } as const;

const mkCanvas = (w: number, h: number) => {
  const c = new OffscreenCanvas(w, h);
  return { c, g: c.getContext("2d") as unknown as G };
};

// ---------- camera ----------
export function applyCam(g: G, c: Cam): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.translate(W / 2 + (c.sx || 0), H / 2 + (c.sy || 0));
  g.rotate(c.roll || 0);
  g.scale(c.zoom, c.zoom);
  g.translate(-c.x, -c.y);
}
export function w2s(c: Cam, x: number, y: number): Pt {
  const dx = (x - c.x) * c.zoom, dy = (y - c.y) * c.zoom, r = c.roll || 0, cs = Math.cos(r), sn = Math.sin(r);
  return [W / 2 + (c.sx || 0) + dx * cs - dy * sn, H / 2 + (c.sy || 0) + dx * sn + dy * cs];
}
export function s2w(c: Cam, X: number, Y: number): Pt {
  const dx = X - W / 2 - (c.sx || 0), dy = Y - H / 2 - (c.sy || 0), r = -(c.roll || 0), cs = Math.cos(r), sn = Math.sin(r);
  return [c.x + (dx * cs - dy * sn) / c.zoom, c.y + (dx * sn + dy * cs) / c.zoom];
}
/** World-space bounding box [x0,y0,x1,y1] of the visible screen (plus pad px). */
export function viewRect(c: Cam, pad = 40): Rect {
  const pts = ([[-pad, -pad], [W + pad, -pad], [W + pad, H + pad], [-pad, H + pad]] as Pt[]).map(([a, b]) => s2w(c, a, b));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}

// ---------- paper ----------
let _tile: OffscreenCanvas | null = null, _grain: OffscreenCanvas | null = null, _wood: OffscreenCanvas | null = null;
export function paperTile(): OffscreenCanvas {
  if (_tile) return _tile;
  const S = 512, { c, g } = mkCanvas(S, S), R = mulberry(7);
  g.fillStyle = P.paper; g.fillRect(0, 0, S, S);
  const id = g.getImageData(0, 0, S, S), d = id.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {       // soft cloudy tone + fine tooth, tileable
    const u = (x / S) * 8, v = (y / S) * 8;
    const lo = Math.sin(u * 0.785 + Math.sin(v * 0.785) * 1.3) * 0.5 + Math.sin(v * 1.57 + 1.3) * 0.3;
    const n = (R() - 0.5) * 5 + lo * 2.2, i = (y * S + x) * 4;
    d[i] += n; d[i + 1] += n; d[i + 2] += n * 0.9;
  }
  g.putImageData(id, 0, 0);
  for (let k = 0; k < 900; k++) {                                   // fibres
    const x = R() * S, y = R() * S, a = R() * TAU, l = 3 + R() * 14;
    g.strokeStyle = R() < 0.5 ? "rgba(120,100,70,.07)" : "rgba(255,255,255,.35)"; g.lineWidth = 0.6 + R() * 0.6;
    g.beginPath(); g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
  return (_tile = c);
}
// graphite grain mask (used with destination-out)
function grainTile(): OffscreenCanvas {
  if (_grain) return _grain;
  const S = 256, { c, g } = mkCanvas(S, S), R = mulberry(11), id = g.createImageData(S, S);
  for (let i = 0; i < S * S; i++) { const r = R(); id.data[i * 4 + 3] = r < 0.16 ? 255 * (0.35 + R() * 0.65) : 0; }
  g.putImageData(id, 0, 0);
  return (_grain = c);
}
function woodTile(): OffscreenCanvas {
  if (_wood) return _wood;
  const S = 1024, PH = 220, rows = 2, { c, g } = mkCanvas(S, PH * rows), R = mulberry(23);
  for (let r = 0; r < rows; r++) {                                   // planks: tone shift + long wavy grain
    const y0 = r * PH, tone = [P.desk, P.deskLight][r % 2];
    g.fillStyle = tone; g.fillRect(0, y0, S, PH);
    for (let k = 0; k < 150; k++) {
      const y = y0 + R() * PH, x = R() * S, l = 160 + R() * 700, w = (R() - 0.5) * 6;
      g.strokeStyle = R() < 0.6 ? "rgba(50,30,15,.10)" : "rgba(255,230,190,.07)"; g.lineWidth = 0.6 + R() * 1.6;
      for (const sh of [-S, 0, S]) {
        g.beginPath(); g.moveTo(x + sh, y); g.quadraticCurveTo(x + sh + l * 0.5, y + w, x + sh + l, y + w * 0.3); g.stroke();
      }
    }
    g.fillStyle = "rgba(40,24,10,.42)"; g.fillRect(0, y0, S, 2.5);    // plank seam
    g.fillStyle = "rgba(255,230,190,.08)"; g.fillRect(0, y0 + 2.5, S, 2);
  }
  return (_wood = c);
}

/** Paper only (no rules), full frame. */
export function drawPaper(g: G, c: Cam): void {
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = P.paper; g.fillRect(0, 0, W, H);
  applyCam(g, c);
  const [x0, y0, x1, y1] = viewRect(c, 60);
  g.fillStyle = g.createPattern(paperTile(), "repeat")!; g.fillRect(x0, y0, x1 - x0, y1 - y0);
}

export interface LedgerOpts {
  rules?: number; margin?: number; x0?: number; x1?: number; y0?: number; y1?: number;
  step?: number; marginInset?: number; progress?: number;
}
function ledgerBody(g: G, r: Rect, o: LedgerOpts): void {
  const { rules = 1, margin = 1, step = 48, marginInset = 64, progress = 1 } = o;
  const [x0, y0, x1, y1] = r;
  if (x1 <= x0 || y1 <= y0) return;
  g.save();
  g.fillStyle = g.createPattern(paperTile(), "repeat")!; g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.beginPath(); g.rect(x0, y0, x1 - x0, y1 - y0); g.clip();
  const sx0 = o.x0 ?? x0, sx1 = o.x1 ?? x1, p = clamp(progress);
  if (rules > 0 && p > 0) {
    g.strokeStyle = P.rule; g.lineWidth = 1.5; g.globalAlpha *= rules;
    const xe = p >= 1 ? x1 : lerp(Math.max(x0, sx0), Math.min(x1, sx1), p);
    g.beginPath();
    for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) { g.moveTo(x0, y); g.lineTo(xe, y); }
    g.stroke(); g.globalAlpha /= rules;
  }
  const mx = sx0 + marginInset;
  if (margin > 0 && p > 0 && mx >= x0 && mx <= x1) {
    g.strokeStyle = P.margin; g.lineWidth = 2; g.globalAlpha *= margin;
    const ye = lerp(y0, y1, outCubic(p));
    g.beginPath(); g.moveTo(mx, y0); g.lineTo(mx, ye); g.stroke();
    g.beginPath(); g.moveTo(mx + 6, y0); g.lineTo(mx + 6, ye); g.stroke();
  }
  g.restore();
}
/**
 * Cream paper with pale horizontal rules every `step` (48) world px and a pale red double margin line
 * `marginInset` px inside x0 (the sheet's left edge). x0/x1/y0/y1 bound the sheet (default: whole view).
 * Applies the camera itself.
 */
export function drawLedger(g: G, cam: Cam, o: LedgerOpts = {}): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  applyCam(g, cam);
  const v = viewRect(cam, 60);
  const r: Rect = [Math.max(v[0], o.x0 ?? -Infinity), Math.max(v[1], o.y0 ?? -Infinity), Math.min(v[2], o.x1 ?? Infinity), Math.min(v[3], o.y1 ?? Infinity)];
  ledgerBody(g, r, o);
}
/** Darker warm wooden desk around the sheets, fixed in world space. Applies the camera itself. */
export function drawDesk(g: G, cam: Cam): void {
  g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = P.desk; g.fillRect(0, 0, W, H);
  applyCam(g, cam);
  const [x0, y0, x1, y1] = viewRect(cam, 60);
  g.fillStyle = g.createPattern(woodTile(), "repeat")!; g.fillRect(x0, y0, x1 - x0, y1 - y0);
}
/** A finite sheet of ledger paper lying on the desk, with a soft shadow (light from upper left). World space. */
export function sheet(g: G, x0: number, y0: number, x1: number, y1: number, o: LedgerOpts & { shadow?: number } = {}): void {
  const sh = o.shadow ?? 1;
  g.save();
  g.fillStyle = P.shadow;
  for (let k = 0; k < 7; k++) {                                      // soft shadow = stacked, growing, faint layers
    const e = k * 3.2;
    g.globalAlpha = 0.05 * sh;
    g.fillRect(x0 + 7 - e, y0 + 11 - e, x1 - x0 + e * 2, y1 - y0 + e * 2);
  }
  g.globalAlpha = 0.18 * sh; g.fillRect(x0 + 2, y0 + 3, x1 - x0 + 1, y1 - y0 + 1);
  g.restore();
  ledgerBody(g, [x0, y0, x1, y1], { ...o, x0, x1 });
  g.save(); g.strokeStyle = "rgba(90,70,40,.22)"; g.lineWidth = 1.5; g.strokeRect(x0, y0, x1 - x0, y1 - y0); g.restore();
}

// ---------- hand-drawn pencil stroke: the core "draw anything in this style" primitive ----------
export interface Resampled { pts: Pt[]; len: number[]; total: number }
export function resample(pts: Pt[], step = 3): Resampled {
  const out: Pt[] = [pts[0]], L = [0]; let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i], d = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) { acc += d / n; out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]); L.push(acc); }
  }
  return { pts: out, len: L, total: acc };
}
export interface StrokeOpts {
  color?: string; width?: number; progress?: number; seed?: number; wobble?: number; passes?: number;
  alpha?: number; grain?: number; taper?: boolean;
}
/** Pencil polyline: wobble, taper, graphite grain, write-on. Returns the tip position at `progress`. */
export function pencilStroke(g: G, pts: Pt[], o: StrokeOpts = {}): Pt {
  const { color = P.lead, width = 2, progress = 1, seed = 1, wobble = 0.6, passes = 2, alpha = 0.92, grain = 0.5, taper = true } = o;
  if (progress <= 0 || pts.length < 2) return pts[0];
  const R = resample(pts, 2.5), n = R.pts.length, end = R.total * clamp(progress);
  const P2: Pt[] = R.pts.map((p, i) => {                            // low-frequency wobble perpendicular to the path
    const a = R.pts[Math.max(0, i - 1)], b = R.pts[Math.min(n - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const w = (vnoise(R.len[i] * 0.02 + seed * 13.1) - 0.5) * 2 * wobble * width;
    return [p[0] - (dy / l) * w, p[1] + (dx / l) * w];
  });
  const a0 = g.globalAlpha;
  g.save(); g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = color;
  let tip = P2[0];
  for (let pass = 0; pass < passes; pass++) {
    const off = pass ? (hash(seed + pass) - 0.5) * width * 0.5 : 0;
    for (let i = 1; i < n; i++) {
      if (R.len[i - 1] > end) break;
      const f = R.len[i] / Math.max(1, R.total);
      const tp = taper ? Math.min(1, f * 8, (1 - f) * 8 + 0.35) : 1;
      const gr = 1 - grain * hash(i * 1.7 + seed * 31 + pass * 7);   // graphite: alpha breaks up along the stroke
      g.globalAlpha = a0 * alpha * gr * (pass ? 0.45 : 1);
      g.lineWidth = width * (0.75 + 0.25 * tp) * (pass ? 0.6 : 1);
      let [bx, by] = P2[i];
      if (R.len[i] > end) { const [ax, ay] = P2[i - 1], k = (end - R.len[i - 1]) / (R.len[i] - R.len[i - 1]); bx = ax + (bx - ax) * k; by = ay + (by - ay) * k; }
      g.beginPath(); g.moveTo(P2[i - 1][0] + off, P2[i - 1][1] + off); g.lineTo(bx + off, by + off); g.stroke();
      tip = [bx, by];
    }
  }
  g.restore();
  return tip;
}
// helpers to build paths
export const quadPath = (a: Pt, c: Pt, b: Pt, n = 24): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => { const t = i / n, u = 1 - t; return [u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]] as Pt; });
/** Curved annotation leader from a (text) to b (mark). */
export function leader(g: G, a: Pt, b: Pt, o: StrokeOpts & { bend?: number } = {}): Pt {
  const bend = o.bend ?? 0.22, mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, dx = b[0] - a[0], dy = b[1] - a[1];
  return pencilStroke(g, quadPath(a, [mx - dy * bend, my + dx * bend], b), { width: 1.4, wobble: 0.4, passes: 1, ...o });
}
/** An un-closed hand-drawn circle. */
export function ringPath(x: number, y: number, r: number, seed = 1, turns = 1.12, a0 = -2.2): Pt[] {
  const n = 48, out: Pt[] = [];
  for (let i = 0; i <= n; i++) { const t = i / n, a = a0 + t * turns * TAU, rr = r * (1 + 0.08 * Math.sin(t * 5 + seed) + t * 0.06); out.push([x + Math.cos(a) * rr * 1.08, y + Math.sin(a) * rr]); }
  return out;
}
/** Curly-ish underline bracket. */
export function bracketPath(x0: number, x1: number, y: number, h = 14): Pt[] {
  const m = (x0 + x1) / 2;
  return [[x0, y - h], ...quadPath([x0, y - h], [x0, y], [x0 + h, y], 6).slice(1), [m - h, y], ...quadPath([m - h, y], [m, y], [m, y + h], 6).slice(1),
    ...quadPath([m, y + h], [m, y], [m + h, y], 6).slice(1), [x1 - h, y], ...quadPath([x1 - h, y], [x1, y], [x1, y - h], 6).slice(1)];
}

// ---------- handwriting (Caveat) with graphite grain and write-on reveal ----------
interface TextImg { c: OffscreenCanvas; w: number; h: number; pad: number; base: number }
const _txt = new Map<string, TextImg>();
function textImage(text: string, size: number, color: string, weight: number, font: string, scale: number): TextImg {
  const key = [text, size, color, weight, font, scale].join("|");
  const hit = _txt.get(key); if (hit) return hit;
  const m = mkCanvas(8, 8).g; m.font = `${weight} ${size * scale}px "${font}"`;
  const w = Math.ceil(m.measureText(text).width + size * scale * 0.6), h = Math.ceil(size * scale * 1.7);
  const { c, g } = mkCanvas(w, h);
  g.font = m.font; g.fillStyle = color; g.textBaseline = "alphabetic";
  let x = size * scale * 0.3; const R = mulberry(text.length * 97 + size);
  for (const ch of text) {                                           // per-glyph jitter = hand
    g.save(); g.translate(x, h * 0.72 + (R() - 0.5) * size * scale * 0.05); g.rotate((R() - 0.5) * 0.06); g.fillText(ch, 0, 0); g.restore();
    x += g.measureText(ch).width;
  }
  g.globalCompositeOperation = "destination-out"; g.fillStyle = g.createPattern(grainTile(), "repeat")!; g.fillRect(0, 0, w, h);
  const r: TextImg = { c, w: w / scale, h: h / scale, pad: size * 0.3, base: (h * 0.72) / scale };
  if (_txt.size > 400) _txt.clear();
  _txt.set(key, r);
  return r;
}
export interface HandOpts { size?: number; color?: string; progress?: number; weight?: number; align?: "left" | "right" | "center"; font?: string; zoom?: number; alpha?: number }
/** Handwriting at baseline (x, y). progress 0..1 reveals left to right. Returns {tip, w, left}. */
export function handText(g: G, text: string, x: number, y: number, o: HandOpts = {}): { tip: Pt; w: number; left: number } {
  const { size = 30, color = P.lead, progress = 1, weight = 500, align = "left", font = FONT.hand, zoom = 1, alpha = 1 } = o;
  const sc = clamp(Math.ceil(zoom * 2) / 2, 1, 5), im = textImage(text, size, color, weight, font, sc);
  const tw = im.w - im.pad * 2, left = align === "right" ? x - tw : align === "center" ? x - tw / 2 : x;
  const X = left - im.pad, Y = y - im.base, pr = clamp(progress);
  if (pr > 0) {
    g.save(); g.globalAlpha *= alpha; g.beginPath(); g.rect(X, Y, im.pad + tw * pr + (pr >= 1 ? im.pad : 0), im.h); g.clip();
    g.drawImage(im.c, X, Y, im.w, im.h); g.restore();
  }
  const f = pr * tw, wig = Math.sin(f * 0.55) * 0.5 + Math.sin(f * 1.31 + 1) * 0.3;   // tip dances over x-height while writing
  return { tip: [left + f, y - size * (0.28 + 0.22 * wig)], w: tw, left };
}
export function measureHand(g: G, text: string, size = 30, weight = 500, font: string = FONT.hand): number {
  g.save(); g.font = `${weight} ${size}px "${font}"`; const w = g.measureText(text).width; g.restore(); return w;
}

// ---------- set type (printed elements) ----------
export interface TypeOpts { size?: number; font?: string; weight?: number; color?: string; align?: "left" | "right" | "center"; progress?: number; alpha?: number; rise?: number; track?: number }
/** Printed type, typeset letter by letter when progress < 1. Returns the text width. No wobble. */
export function setType(g: G, text: string, x: number, y: number, o: TypeOpts = {}): number {
  const { size = 20, font = FONT.mono, weight = 400, color = P.inkSoft, align = "left", progress = 1, alpha = 1, rise = 0, track = 0 } = o;
  g.save(); g.font = `${weight} ${size}px "${font}"`; g.fillStyle = color; g.textAlign = "left"; g.textBaseline = "alphabetic";
  if (track) (g as unknown as { letterSpacing: string }).letterSpacing = `${track}px`;
  const tw = g.measureText(text).width; let cx = align === "right" ? x - tw : align === "center" ? x - tw / 2 : x;
  const a0 = g.globalAlpha;
  if (progress >= 1 && !rise) { g.globalAlpha = a0 * alpha; g.fillText(text, cx, y); g.restore(); return tw; }
  const chars = [...text], n = chars.length;
  for (let i = 0; i < n; i++) {                                     // each glyph fades and settles
    const k = clamp(progress * (n + 4) - i, 0, 4) / 4;
    const cw = g.measureText(chars[i]).width;
    if (k > 0) { g.globalAlpha = a0 * alpha * k; g.fillText(chars[i], cx, y + (1 - k) * (rise || size * 0.25)); }
    cx += cw + track;
  }
  g.restore();
  return tw;
}

// ---------- data marks ----------
export interface DotOpts { fresh?: number; ring?: string; ringW?: number; alpha?: number; ripple?: number; accent?: string | null }
/** Data point with landing pop and ripple. fresh = seconds since landing (negative = not yet). */
export function dataDot(g: G, x: number, y: number, r: number, fill: string, o: DotOpts = {}): void {
  const { fresh = 9, ring = P.ink, ringW = 1.5, alpha = 1, ripple = 1, accent = null } = o;
  if (fresh < 0) return;
  const pop = fresh < 0.25 ? 1 + 0.55 * Math.sin(clamp(fresh / 0.25) * Math.PI) * (1 - (fresh / 0.25) * 0.4) : 1;
  const col = accent || fill, a0 = g.globalAlpha;
  g.save(); g.globalAlpha = a0 * alpha;
  if (ripple && fresh < 0.6) {                                       // landing ripple
    const k = fresh / 0.6; g.strokeStyle = col; g.globalAlpha = a0 * alpha * (1 - k) * 0.55; g.lineWidth = 1.2;
    g.beginPath(); g.arc(x, y, r * (1.2 + k * 2.4 * ripple), 0, TAU); g.stroke(); g.globalAlpha = a0 * alpha;
  }
  g.beginPath(); g.arc(x, y, r * pop, 0, TAU); g.fillStyle = col; g.fill();
  if (ringW > 0) { g.lineWidth = ringW; g.strokeStyle = ring; g.stroke(); }
  g.restore();
}
export function inkLine(g: G, pts: Pt[], o: { color?: string; width?: number; alpha?: number } = {}): void {
  const { color = P.ink, width = 2.5, alpha = 1 } = o;
  if (pts.length < 2) return;
  g.save(); g.globalAlpha *= alpha; g.strokeStyle = color; g.lineWidth = width; g.lineJoin = "round"; g.lineCap = "round";
  g.beginPath(); g.moveTo(...pts[0]); for (let i = 1; i < pts.length; i++) g.lineTo(...pts[i]); g.stroke(); g.restore();
}
/** Dot to bar morph. u 0..1. dot {x,y,r}, box {x0,x1,y0,y1}. */
export function morphMark(g: G, u: number, dot: { x: number; y: number; r: number }, box: { x0: number; x1: number; y0: number; y1: number }, fill: string): void {
  const e = u <= 0 ? 0 : u >= 1 ? 1 : u;
  const fall = e < 0.45 ? e / 0.45 : 1, grow = e < 0.3 ? 0 : (e - 0.3) / 0.7;
  const fe = fall * fall * (3 - 2 * fall), ge = 1 - Math.pow(1 - grow, 3);
  const cx = lerp(dot.x, (box.x0 + box.x1) / 2, ge), cy = lerp(dot.y, (box.y0 + box.y1) / 2, fe);
  const w = lerp(dot.r * 2, box.x1 - box.x0 + 0.6, ge), h = lerp(dot.r * 2, box.y1 - box.y0, ge);
  const rad = lerp(dot.r, 0, Math.min(1, ge * 1.5));
  g.save(); g.fillStyle = fill; g.beginPath(); g.roundRect(cx - w / 2, cy - h / 2, w, h, rad); g.fill();
  if (ge < 1) { g.globalAlpha *= 1 - ge; g.lineWidth = 1.5; g.strokeStyle = P.ink; g.stroke(); }
  g.restore();
}
/** Dashed pencil rectangle (the empty next cell); progress runs over the perimeter. */
export function dashedCell(g: G, x0: number, y0: number, x1: number, y1: number, o: { progress?: number; color?: string; width?: number; dash?: number; gap?: number } = {}): void {
  const { progress = 1, color = P.red, width = 1.6, dash = 9, gap = 7 } = o;
  const per: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], R = resample(per, 1.5), end = R.total * clamp(progress);
  const a0 = g.globalAlpha;
  g.save(); g.strokeStyle = color; g.lineWidth = width; g.lineCap = "round";
  for (let i = 1; i < R.pts.length; i++) {
    if (R.len[i] > end) break;
    if (R.len[i] % (dash + gap) < dash) { g.globalAlpha = a0 * 0.85 * (1 - 0.4 * hash(i)); g.beginPath(); g.moveTo(...R.pts[i - 1]); g.lineTo(...R.pts[i]); g.stroke(); }
  }
  g.restore();
}

// ---------- the black-and-red pencil (the only performer) ----------
// Screen-space. tip = screen point, s = scale (~ camera zoom), lift 0..1 (height above paper),
// flip 0..1 (black lead -> red lead), blur = extra defocus, ang = direction the body extends from the tip.
let _pc: OffscreenCanvas | null = null, _pb: OffscreenCanvas | null = null;
function pencilBody(g: G, end: "lead" | "red", axisScale: number): void {
  const Lg = 16, Lw = 58, Wd = 24, len = 560;
  g.save(); g.scale(axisScale, 1);
  const cA = end === "red" ? P.red : P.lead, cB = end === "red" ? P.lead : P.red;
  g.fillStyle = cA; g.fillRect(Lg + Lw - 2, -Wd / 2, len * 0.5, Wd);
  g.fillStyle = cB; g.fillRect(Lg + Lw - 2 + len * 0.5, -Wd / 2, len * 0.5, Wd);
  g.fillStyle = "rgba(255,255,255,.18)"; g.fillRect(Lg + Lw - 2, -Wd / 2 + 3, len, 5);
  g.fillStyle = "rgba(0,0,0,.16)"; g.fillRect(Lg + Lw - 2, Wd / 2 - 6, len, 6);
  g.fillStyle = P.wood; g.beginPath(); g.moveTo(Lg * 0.9, -3.2); g.lineTo(Lg + Lw, -Wd / 2);
  for (let i = 0; i <= 6; i++) g.lineTo(Lg + Lw + (i % 2 ? 5 : 0), -Wd / 2 + (Wd * i) / 6);
  g.lineTo(Lg * 0.9, 3.2); g.closePath(); g.fill();
  g.fillStyle = "rgba(150,110,60,.25)"; g.beginPath(); g.moveTo(Lg * 0.9, 1); g.lineTo(Lg + Lw, Wd / 2 - 2); g.lineTo(Lg + Lw, Wd / 2); g.lineTo(Lg * 0.9, 3.2); g.fill();
  g.fillStyle = end === "red" ? "#8E241F" : "#1F1D1A"; g.beginPath(); g.moveTo(0, 0); g.lineTo(Lg, -3.6); g.lineTo(Lg, 3.6); g.closePath(); g.fill();
  g.restore();
}
export interface PencilOpts { tip: Pt; s?: number; lift?: number; flip?: number; blur?: number; ang?: number; alpha?: number; focus?: number }
export function drawPencil(g: G, o: PencilOpts): void {
  const { tip, s = 1, lift = 0, flip = 0, blur = 0, ang = 0.62, alpha = 1, focus = 1 } = o;
  if (alpha <= 0) return;
  _pc = frameCanvas(_pc); _pb = frameCanvas(_pb);
  const pc = _pc, pb = _pb;
  const axisScale = Math.cos(clamp(flip) * Math.PI), end = axisScale >= 0 ? "lead" : "red", as = Math.max(0.04, Math.abs(axisScale));
  const lz = 1 + lift * 0.35;                                          // closer to camera = bigger
  const draw = (c: OffscreenCanvas, col: string | null) => {
    const q = c.getContext("2d") as unknown as G; q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(0, 0, W, H); q.globalCompositeOperation = "source-over";
    q.translate(tip[0], tip[1]); q.rotate(ang); q.scale(s * lz, s * lz);
    q.translate(180 * (1 - as), 0);                                    // pivot for the end-over-end flip
    pencilBody(q, end, as);
    if (col) { q.globalCompositeOperation = "source-in"; q.setTransform(1, 0, 0, 1, 0, 0); q.fillStyle = col; q.fillRect(0, 0, W, H); }
  };
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); const a0 = g.globalAlpha * alpha; g.globalAlpha = a0;
  draw(pb, P.shadow);                                                  // shadow away from the upper-left light
  const sh = 3 + lift * 70 * s, sb = 2 + lift * 16 + blur * 0.5;
  g.filter = `blur(${sb.toFixed(1)}px)`; g.globalAlpha = a0 * (0.2 - lift * 0.08);
  g.drawImage(pb, sh * 0.8, sh * 1.1); g.filter = "none"; g.globalAlpha = a0;
  draw(pc, null);
  const b = blur + lift * 2.5;
  if (b > 0.3 || focus < 1) {                                          // depth of field: sharp at the tip, soft toward the far end
    g.filter = `blur(${(b + 4).toFixed(1)}px)`; g.drawImage(pc, 0, 0); g.filter = "none";
    if (focus > 0) {
      const q = pb.getContext("2d") as unknown as G; q.setTransform(1, 0, 0, 1, 0, 0); q.clearRect(0, 0, W, H);
      q.filter = b > 0.3 ? `blur(${b.toFixed(1)}px)` : "none"; q.drawImage(pc, 0, 0); q.filter = "none";
      q.globalCompositeOperation = "destination-in";
      const gr = q.createLinearGradient(tip[0], tip[1], tip[0] + Math.cos(ang) * 260 * s, tip[1] + Math.sin(ang) * 260 * s);
      gr.addColorStop(0, `rgba(0,0,0,${focus})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      q.fillStyle = gr; q.fillRect(0, 0, W, H); q.globalCompositeOperation = "source-over";
      g.drawImage(pb, 0, 0);
    }
  } else g.drawImage(pc, 0, 0);
  g.restore();
}

// ---------- figure caption (the subtitle) ----------
export interface CaptionWord { w: string; t: number }
/** Figure caption in screen space: hairline rule, Fraunces 400, words appear on their spoken time (absolute seconds). */
export function caption(g: G, words: CaptionWord[], t: number, o: { x?: number; y?: number; size?: number; maxW?: number; kicker?: string; t0?: number; t1?: number; color?: string; rule?: boolean } = {}): void {
  const { x = 180, y = 985, size = 42, maxW = 1380, kicker = "", t0 = 0, t1 = 1e9, color = P.ink, rule = false } = o;
  if (t < t0 || t > t1 + 0.3) return;
  const out = t > t1 ? clamp((t - t1) / 0.3) : 0, inn = clamp((t - t0) / 0.2);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha *= (1 - out) * inn; g.translate(0, -out * 26);
  g.font = `400 ${size}px "${FONT.type}"`; g.textBaseline = "alphabetic";
  type L = CaptionWord & { ww: number };
  const lines: L[][] = [[]]; let lw = 0; const sp = g.measureText(" ").width;
  for (const wd of words) { const ww = g.measureText(wd.w).width; if (lw + ww > maxW && lines[lines.length - 1].length) { lines.push([]); lw = 0; } lines[lines.length - 1].push({ ...wd, ww }); lw += ww + sp; }
  const lh = size * 1.22, top = y - (lines.length - 1) * lh, ruleY = top - size * 1.05;
  const maxLine = Math.max(...lines.map((l) => l.reduce((a, b) => a + b.ww + sp, -sp)));
  g.strokeStyle = P.ink; g.lineWidth = 1; g.globalAlpha *= 0.9;
  if (rule) { g.beginPath(); g.moveTo(x, ruleY); g.lineTo(x + Math.max(260, maxLine) * clamp(inn * 1.2), ruleY); g.stroke(); }
  if (kicker) setType(g, kicker, x, ruleY - 10, { size: 18, color: P.inkSoft });
  g.fillStyle = color; g.font = `400 ${size}px "${FONT.type}"`;
  lines.forEach((l, li) => {
    let cx = x;
    for (const wd of l) {
      const k = clamp((t - wd.t) / 0.125);
      if (k > 0) { g.save(); g.globalAlpha *= k; g.fillText(wd.w, cx, top + li * lh + (1 - k) * 6); g.restore(); }
      cx += wd.ww + sp;
    }
  });
  g.restore();
}

// ---------- generic shapes in this style ----------
const pathTo = (g: G, path: Pt[]) => { g.beginPath(); g.moveTo(...path[0]); for (const p of path.slice(1)) g.lineTo(...p); g.closePath(); };
const bbox = (path: Pt[]): Rect => {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of path) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
};
/** Sample any path into n points and plot it as a dot-and-line series. */
export function plotShape(g: G, path: Pt[], o: { n?: number; r?: number; fill?: string; progress?: number; line?: boolean; t?: number; dt?: number } = {}): Pt[] {
  const { n = 24, r = 6, fill = P.ink, progress = 1, line = true, t = 9, dt = 0.04 } = o;
  const R = resample(path, 1), pts: Pt[] = [];
  for (let i = 0; i < n; i++) { const L = (R.total * i) / (n - 1); let j = 0; while (j < R.len.length - 1 && R.len[j] < L) j++; pts.push(R.pts[j]); }
  const m = Math.floor(clamp(progress) * n);
  if (line) inkLine(g, pts.slice(0, Math.max(1, m)), { width: 2 });
  pts.slice(0, m).forEach((p, i) => dataDot(g, p[0], p[1], r, fill, { fresh: t - i * dt }));
  return pts;
}
/** Any closed path as a pencil-annotated mark: flat fill + light graphite hatching + hand outline. */
export function inkShape(g: G, path: Pt[], o: { fill?: string | null; stroke?: string; hatch?: number; progress?: number; seed?: number; width?: number } = {}): Pt {
  const { fill = null, stroke = P.ink, hatch = 0.5, progress = 1, seed = 3, width = 1.6 } = o;
  if (fill && progress > 0) {
    g.save(); g.globalAlpha *= clamp(progress * 1.5); pathTo(g, path); g.fillStyle = fill; g.fill();
    if (hatch > 0) {
      g.clip(); const [x0, y0, x1, y1] = bbox(path);
      g.strokeStyle = "rgba(40,30,20,.12)"; g.lineWidth = 1;
      for (let x = x0 - (y1 - y0); x < x1; x += 7) { const ga = g.globalAlpha; g.globalAlpha = ga * hatch * (0.5 + 0.5 * hash(x + seed)); g.beginPath(); g.moveTo(x, y1); g.lineTo(x + (y1 - y0), y0); g.stroke(); g.globalAlpha = ga; }
    }
    g.restore();
  }
  return pencilStroke(g, [...path, path[0]], { color: stroke, width, progress, seed, passes: 2, wobble: 0.35 });
}
/** A trail of data dots behind a moving mark; sizes and alpha taper toward the tail. */
export function dotTrail(g: G, pts: Pt[], o: { color?: string; r0?: number; r1?: number; ring?: boolean } = {}): void {
  const { color = P.ink, r0 = 6, r1 = 1.5, ring = true } = o, n = pts.length;
  pts.forEach((p, i) => { const f = i / Math.max(1, n - 1); dataDot(g, p[0], p[1], lerp(r1, r0, f), color, { alpha: 0.25 + 0.75 * f, ring: ring ? P.ink : color, ringW: ring ? 1.2 : 0, ripple: 0 }); });
}

// ======================================================================
// NEW primitives (not in the original engine)
// ======================================================================

// ---------- path helpers ----------
export const rectPath = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
export const circlePath = (cx: number, cy: number, r: number, n = 56): Pt[] => Array.from({ length: n }, (_, i) => [cx + Math.cos((i / n) * TAU) * r, cy + Math.sin((i / n) * TAU) * r] as Pt);
export function roundRectPath(x0: number, y0: number, x1: number, y1: number, r: number, seg_ = 7): Pt[] {
  r = Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2);
  const out: Pt[] = [], corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= seg_; i++) { const a = a0 + (i / seg_) * (Math.PI / 2); out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  corner(x1 - r, y0 + r, -Math.PI / 2); corner(x1 - r, y1 - r, 0); corner(x0 + r, y1 - r, Math.PI / 2); corner(x0 + r, y0 + r, Math.PI);
  return out;
}
export const polyPath = (cx: number, cy: number, r: number, sides: number, rot = -Math.PI / 2): Pt[] =>
  Array.from({ length: sides }, (_, i) => [cx + Math.cos(rot + (i / sides) * TAU) * r, cy + Math.sin(rot + (i / sides) * TAU) * r] as Pt);

// ---------- cut-out ----------
export interface CutoutOpts { fill?: string; border?: number; lift?: number; progress?: number; seed?: number; shadow?: number }
/**
 * Flat-colour paper cut-out with a white border and a soft offset drop shadow (light upper left).
 * progress 0..1: dropped from a slight lift with a tiny settle. lift 0..1: persistent extra height (carried).
 * Draws inside the current world transform. Returns {cx, cy, dy, scale} so callers can put details on top.
 */
export function cutout(g: G, path: Pt[], o: CutoutOpts = {}): { cx: number; cy: number; dy: number; scale: number } {
  const { fill = P.kraft, border = 3, lift = 0, progress = 1, seed = 1, shadow = 1 } = o;
  const [bx0, by0, bx1, by1] = bbox(path), cx = (bx0 + bx1) / 2, cy = (by0 + by1) / 2;
  const p = clamp(progress);
  if (p <= 0) return { cx, cy, dy: 0, scale: 1 };
  const fall = seg(p, 0, 0.7), settle = seg(p, 0.7, 1);
  const hgt = (1 - fall * fall * (3 - 2 * fall)) * 0.8 + lift;              // 0 = on the paper
  const rebound = Math.sin(settle * Math.PI) * 0.012 * (1 - settle);
  const scale = 1 + hgt * 0.05 - rebound, rot = (hash(seed * 7.3) - 0.5) * 0.02 + (1 - fall) * (hash(seed * 3.1) - 0.5) * 0.05;
  const dy = -hgt * 10;
  const alpha = clamp(p * 6) * g.globalAlpha;
  g.save(); g.globalAlpha = alpha;
  g.translate(cx, cy + dy); g.rotate(rot); g.scale(scale, scale); g.translate(-cx, -cy);
  const off = 4 + hgt * 22, blur = 4 + hgt * 14, sa = (0.2 - hgt * 0.06) * shadow;
  g.fillStyle = P.shadow; g.strokeStyle = P.shadow; g.lineJoin = "round";
  for (let k = 0; k < 5; k++) {                                              // soft shadow: stacked growing layers
    const e = (k / 4) * blur;
    g.save(); g.translate(off * 0.8, off); g.globalAlpha = alpha * (sa / 5) ; pathTo(g, path);
    g.lineWidth = border * 2 + e * 2; g.stroke(); g.fill(); g.restore();
  }
  pathTo(g, path); g.strokeStyle = P.white; g.lineWidth = border * 2; g.lineJoin = "round"; g.stroke();   // white die-cut border
  g.fillStyle = fill; g.fill();
  g.save(); pathTo(g, path); g.clip();                                      // faint paper edge shading, lower right
  g.strokeStyle = "rgba(60,40,20,.16)"; g.lineWidth = 3; g.translate(-1.2, -1.6); pathTo(g, path); g.stroke(); g.restore();
  g.restore();
  return { cx, cy, dy, scale };
}

// ---------- halftone ----------
export interface HalftoneOpts { color?: string; cell?: number; angle?: number; coverage?: number; misreg?: Pt; progress?: number; alpha?: number }
/** Dot screen clipped to a path. Dot size follows coverage 0..1; progress sweeps the fill in left to right. */
export function halftone(g: G, path: Pt[], o: HalftoneOpts = {}): void {
  const { color = P.blue, cell = 9, angle = 0.26, coverage = 1, misreg = [1.5, 1] as Pt, progress = 1, alpha = 0.92 } = o;
  const p = clamp(progress);
  if (p <= 0 || coverage <= 0) return;
  const [x0, y0, x1, y1] = bbox(path), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rmax = Math.sqrt((coverage * cell * cell) / Math.PI), cs = Math.cos(angle), sn = Math.sin(angle);
  const half = Math.hypot(x1 - x0, y1 - y0) / 2 + cell, nOver = Math.ceil(half / cell);
  const edge = 0.18, span = x1 - x0 || 1;
  g.save(); pathTo(g, path); g.clip(); g.translate(misreg[0], misreg[1]);
  g.fillStyle = color; g.globalAlpha *= alpha;
  g.beginPath();
  for (let i = -nOver; i <= nOver; i++) for (let j = -nOver; j <= nOver; j++) {
    const lx = i * cell, ly = j * cell, x = cx + lx * cs - ly * sn, y = cy + lx * sn + ly * cs;
    if (x < x0 - cell || x > x1 + cell || y < y0 - cell || y > y1 + cell) continue;
    const u = (x - x0) / span, k = clamp((p * (1 + edge) - u) / edge);      // sweep wavefront: dots grow from nothing
    if (k <= 0) continue;
    const r = rmax * (0.92 + 0.16 * hash(i * 31.7 + j * 17.3)) * (k * k * (3 - 2 * k));
    g.moveTo(x + r, y); g.arc(x, y, r, 0, TAU);
  }
  g.fill();
  g.restore();
}

// ---------- rubber stamp ----------
const _stamp = new Map<string, { c: OffscreenCanvas; w: number; h: number }>();
function stampImage(text: string, size: number, color: string) {
  const key = `${text}|${size}|${color}`, hit = _stamp.get(key); if (hit) return hit;
  const SC = 2, probe = mkCanvas(8, 8).g; probe.font = `600 ${size * SC}px "${FONT.type}"`;
  probe.letterSpacing = `${size * SC * 0.08}px`;
  const tw = probe.measureText(text).width, padX = size * SC * 0.55, padY = size * SC * 0.34;
  const w = Math.ceil(tw + padX * 2), h = Math.ceil(size * SC * 0.85 + padY * 2), m = size * SC * 0.2;
  const { c, g } = mkCanvas(w + m * 2, h + m * 2);
  g.translate(m, m); g.strokeStyle = color; g.fillStyle = color; g.lineJoin = "round";
  const lw = size * SC * 0.075;
  g.lineWidth = lw; g.beginPath(); g.roundRect(0, 0, w, h, size * SC * 0.2); g.stroke();
  g.lineWidth = lw * 0.4; g.beginPath(); g.roundRect(lw * 1.9, lw * 1.9, w - lw * 3.8, h - lw * 3.8, size * SC * 0.12); g.stroke();
  g.font = `600 ${size * SC}px "${FONT.type}"`; g.textBaseline = "alphabetic"; g.textAlign = "center";
  g.letterSpacing = `${size * SC * 0.08}px`;
  g.fillText(text, w / 2 + size * SC * 0.04, h / 2 + size * SC * 0.3);
  // uneven ink: seeded low-frequency blotches plus fine specks knocked out
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = "destination-out";
  const R = mulberry(text.length * 131 + size), W2 = w + m * 2, H2 = h + m * 2;
  for (let k = 0; k < 14; k++) { g.fillStyle = `rgba(0,0,0,${0.1 + R() * 0.22})`; const rr = (14 + R() * 38) * SC * 0.5; g.beginPath(); g.ellipse(R() * W2, R() * H2, rr * (1 + R()), rr, R() * 3, 0, TAU); g.fill(); }
  for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(0,0,0,${0.35 + R() * 0.65})`; const rr = (0.4 + R() * 1.6) * SC; g.beginPath(); g.arc(R() * W2, R() * H2, rr, 0, TAU); g.fill(); }
  const r = { c, w: W2 / SC, h: H2 / SC };
  _stamp.set(key, r);
  return r;
}
/**
 * Rubber stamp (world space, centred on x,y). progress 0..1 is the slam: hidden at 0, lands ~25% with a 2-frame-style
 * scale overshoot (comes in big, dips under 1, settles). Red ink, uneven coverage, a slight rotation.
 */
export function stamp(g: G, text: string, x: number, y: number, o: { progress?: number; rot?: number; size?: number; color?: string } = {}): void {
  const { progress = 1, rot = -0.09, size = 64, color = P.red } = o;
  const p = clamp(progress);
  if (p <= 0) return;
  const im = stampImage(text, size, color);
  const land = seg(p, 0, 0.22), bounce = seg(p, 0.22, 0.55);
  let s = lerp(1.7, 1, outCubic(land));
  s *= 1 - 0.07 * Math.sin(bounce * Math.PI) * (1 - bounce * 0.3);
  const spread = p > 0.22 ? 1 + 0.02 * (1 - seg(p, 0.22, 0.6)) : 1;
  g.save(); g.globalAlpha *= clamp(p / 0.08) * (0.9 + 0.1 * land);
  g.translate(x, y); g.rotate(rot + (1 - land) * 0.05); g.scale(s * spread, s * spread);
  g.globalCompositeOperation = "multiply";
  g.drawImage(im.c, -im.w / 2, -im.h / 2, im.w, im.h);
  g.restore();
}

// ---------- ledger column ----------
export interface ColumnItem { label: string; value: string }
/**
 * A ledger column. (x, y) = left end and baseline of the first row. Labels are handwritten row by row, values set in
 * mono right-aligned at x + width, then a ruled double line, then the total. progress 0..1 runs the whole sequence.
 * Returns the pencil tip.
 */
export function columnTotal(g: G, items: ColumnItem[], x: number, y: number,
  o: { progress?: number; rowH?: number; total?: string; totalLabel?: string; totalColor?: string; width?: number; color?: string; size?: number } = {}): Pt {
  const { progress = 1, rowH = 48, total, totalLabel = "total", totalColor = P.red, width = 460, color = P.lead, size = 32 } = o;
  const n = items.length, slots = n + (total ? 2.2 : 0), p = clamp(progress) * slots;
  let tip: Pt = [x, y];
  items.forEach((it, i) => {
    const k = clamp(p - i);
    if (k <= 0) return;
    const by = y + i * rowH, wk = clamp(k / 0.75), vk = clamp((k - 0.45) / 0.55);
    const h = handText(g, it.label, x, by, { size, color, progress: wk });
    tip = h.tip;
    if (vk > 0) {
      const vw = setType(g, it.value, x + width, by - 2, { size: 26, font: FONT.mono, weight: 500, color: P.ink, align: "right", progress: vk });
      g.save(); g.fillStyle = P.rule; g.globalAlpha *= vk;                      // dotted leader label -> value
      for (let dx = x + h.w + 16; dx < x + width - vw - 12; dx += 9) g.fillRect(dx, by - 3, 2, 2);
      g.restore();
    }
  });
  if (total) {
    const ry = y + (n - 1) * rowH + rowH * 0.5, rk = clamp(p - n), tk = clamp(p - n - 0.5 - 0.2);
    if (rk > 0) {
      pencilStroke(g, [[x - 6, ry], [x + width + 6, ry]], { color: P.ink, width: 1.8, progress: clamp(rk / 0.6), seed: 5, wobble: 0.3, passes: 1 });
      pencilStroke(g, [[x - 6, ry + 7], [x + width + 6, ry + 7]], { color: P.ink, width: 1.8, progress: clamp((rk - 0.3) / 0.6), seed: 6, wobble: 0.3, passes: 1 });
    }
    if (tk > 0) {
      const ty = ry + rowH * 0.95, h = handText(g, totalLabel, x, ty, { size: size + 2, color: totalColor, progress: clamp(tk / 0.7), weight: 700 });
      tip = h.tip;
      setType(g, total, x + width, ty - 2, { size: 30, font: FONT.mono, weight: 500, color: totalColor, align: "right", progress: clamp((tk - 0.3) / 0.7) });
    }
  }
  return tip;
}

// ---------- camera path ----------
export interface CamKey { t: number; x: number; y: number; zoom: number; roll?: number; ease?: (t: number) => number }
/**
 * Keyframe camera. Between keys the move into key i+1 uses that key's `ease` (default inOutSine); zoom is
 * interpolated in log space so zooms feel even. Two keys with the same pose are a hold.
 */
export function camPath(keys: CamKey[]): (t: number) => Cam {
  const ks = [...keys].sort((a, b) => a.t - b.t);
  const sine = (u: number) => -(Math.cos(Math.PI * clamp(u)) - 1) / 2;
  return (t: number): Cam => {
    if (t <= ks[0].t) return { x: ks[0].x, y: ks[0].y, zoom: ks[0].zoom, roll: ks[0].roll || 0 };
    const last = ks[ks.length - 1];
    if (t >= last.t) return { x: last.x, y: last.y, zoom: last.zoom, roll: last.roll || 0 };
    let i = 0; while (t > ks[i + 1].t) i++;
    const a = ks[i], b = ks[i + 1], u = (b.ease ?? sine)(seg(t, a.t, b.t));
    return { x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), u)), roll: lerp(a.roll || 0, b.roll || 0, u) };
  };
}
/** Slow drift so the camera is never idle (amt ~ 0.02 = about 2% over 10 s). Adds drift to x/y/zoom/roll. */
export function breathe(cam: Cam, t: number, amt = 0.02): Cam {
  const k = amt / 0.02;
  return {
    ...cam,
    x: cam.x + (vnoise(t * 0.18 + 3.1) - 0.5) * 2 * (W * 0.02 * k) / cam.zoom,
    y: cam.y + (vnoise(t * 0.16 + 9.7) - 0.5) * 2 * (H * 0.02 * k) / cam.zoom,
    zoom: cam.zoom * (1 + (vnoise(t * 0.12 + 5.3) - 0.5) * 2 * amt * 0.5),
    roll: (cam.roll || 0) + (vnoise(t * 0.1 + 1.7) - 0.5) * 2 * 0.002 * k,
  };
}

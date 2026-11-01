/**
 * Polylines and morphing. Every shape is a list of points, so any shape can turn into any other:
 * resample both to the same count and interpolate (`morph`). Closed shapes are aligned so they don't twist.
 */
import { TAU, lerp, type Pt } from "./core";

export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function polyLength(pts: Pt[], closed = false): number {
  let L = 0;
  for (let i = 1; i < pts.length; i++) L += dist(pts[i - 1], pts[i]);
  if (closed && pts.length > 1) L += dist(pts[pts.length - 1], pts[0]);
  return L;
}

/** Exactly n points evenly spaced along the line (closed: around the loop, last point != first). */
export function resample(pts: Pt[], n: number, closed = false): Pt[] {
  if (pts.length === 0) return [];
  const src = closed ? [...pts, pts[0]] : pts;
  const cum = [0];
  for (let i = 1; i < src.length; i++) cum.push(cum[i - 1] + dist(src[i - 1], src[i]));
  const total = cum[cum.length - 1];
  if (total === 0) return Array.from({ length: n }, () => [src[0][0], src[0][1]] as Pt);
  const out: Pt[] = [];
  const count = closed ? n : Math.max(2, n);
  let j = 1;
  for (let k = 0; k < count; k++) {
    const d = closed ? (k / count) * total : (k / (count - 1)) * total;
    while (j < cum.length - 1 && cum[j] < d) j++;
    const a = src[j - 1], b = src[j], span = cum[j] - cum[j - 1] || 1, u = (d - cum[j - 1]) / span;
    out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u)]);
  }
  return out;
}

/** The first fraction u of a line (drawing it on). */
export function truncate(pts: Pt[], u: number, closed = false): Pt[] {
  if (u >= 1) return closed ? [...pts, pts[0]] : pts;
  if (u <= 0 || pts.length < 2) return [];
  const src = closed ? [...pts, pts[0]] : pts;
  const target = polyLength(src) * u;
  const out: Pt[] = [src[0]];
  let acc = 0;
  for (let i = 1; i < src.length; i++) {
    const d = dist(src[i - 1], src[i]);
    if (acc + d >= target) { const v = (target - acc) / (d || 1); out.push([lerp(src[i - 1][0], src[i][0], v), lerp(src[i - 1][1], src[i][1], v)]); break; }
    out.push(src[i]); acc += d;
  }
  return out;
}

// ───────────────────────────── shapes ─────────────────────────────

export const lineP = (x0: number, y0: number, x1: number, y1: number, n = 64): Pt[] =>
  Array.from({ length: n }, (_, i) => [lerp(x0, x1, i / (n - 1)), lerp(y0, y1, i / (n - 1))] as Pt);

export const circleP = (cx: number, cy: number, r: number, n = 160, a0 = -Math.PI / 2): Pt[] =>
  Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * TAU; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt; });

export const ellipseP = (cx: number, cy: number, rx: number, ry: number, n = 120, a0 = -Math.PI / 2): Pt[] =>
  Array.from({ length: n }, (_, i) => { const a = a0 + (i / n) * TAU; return [cx + rx * Math.cos(a), cy + ry * Math.sin(a)] as Pt; });

/** Regular polygon (sides >= 3), radius to the corners, `rot` radians; resampled to n points so it morphs. */
export function polygonP(cx: number, cy: number, r: number, sides: number, rot = -Math.PI / 2, n = 160): Pt[] {
  const c: Pt[] = Array.from({ length: sides }, (_, i) => { const a = rot + (i / sides) * TAU; return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Pt; });
  return resample(c, n, true);
}

export const rectP = (x: number, y: number, w: number, h: number, n = 0): Pt[] => {
  const c: Pt[] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];
  return n ? resample(c, n, true) : c;
};

/** Rounded rectangle, corner radius r. */
export function roundRectP(x: number, y: number, w: number, h: number, r: number, seg = 6): Pt[] {
  r = Math.min(r, w / 2, h / 2);
  const out: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= seg; i++) { const a = a0 + (i / seg) * (Math.PI / 2); out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  corner(x + w - r, y + r, -Math.PI / 2); corner(x + w - r, y + h - r, 0); corner(x + r, y + h - r, Math.PI / 2); corner(x + r, y + r, Math.PI);
  return out;
}

/** Cubic Bézier p0 -> p3 with handles p1, p2. */
export function bezierP(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 80): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1), m = 1 - t;
    const a = m * m * m, b = 3 * m * m * t, c = 3 * m * t * t, d = t * t * t;
    return [a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]] as Pt;
  });
}

/** Horizontal sine wave from x0 to x1 around y: amplitude, cycles, phase (radians). */
export const sineP = (x0: number, x1: number, y: number, amp: number, cycles: number, phase = 0, n = 160): Pt[] =>
  Array.from({ length: n }, (_, i) => { const u = i / (n - 1); return [lerp(x0, x1, u), y + amp * Math.sin(phase + u * cycles * TAU)] as Pt; });

/** Spur gear outline: teeth, pitch radius r, tooth depth d, rotation rot. */
export function gearP(cx: number, cy: number, teeth: number, r: number, d = r * 0.12, rot = 0): Pt[] {
  const out: Pt[] = [];
  const ro = r + d * 0.5, ri = r - d * 0.6, p = TAU / teeth;
  const at = (rr: number, a: number): Pt => [cx + rr * Math.cos(a), cy + rr * Math.sin(a)];
  for (let i = 0; i < teeth; i++) {
    const a = rot + i * p;
    out.push(at(ri, a), at(ro, a + 0.12 * p), at(ro, a + 0.42 * p), at(ri, a + 0.54 * p), at(ri, a + 0.77 * p));
  }
  return out;
}

// ───────────────────────────── transforms & morph ─────────────────────────────

export function xform(pts: Pt[], o: { x?: number; y?: number; s?: number; sx?: number; sy?: number; rot?: number; ox?: number; oy?: number }): Pt[] {
  const { x = 0, y = 0, rot = 0, ox = 0, oy = 0 } = o;
  const sx = (o.s ?? 1) * (o.sx ?? 1), sy = (o.s ?? 1) * (o.sy ?? 1);
  const c = Math.cos(rot), s = Math.sin(rot);
  return pts.map(([px, py]) => { const dx = (px - ox) * sx, dy = (py - oy) * sy; return [x + ox + dx * c - dy * s, y + oy + dx * s + dy * c] as Pt; });
}

export const centroid = (pts: Pt[]): Pt => {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / (pts.length || 1), y / (pts.length || 1)];
};

const alignCache = new Map<string, number>();
/** Rotation offset of b's start that best matches a (closed shapes), so a morph doesn't twist. */
function bestShift(a: Pt[], b: Pt[], key?: string): number {
  if (key && alignCache.has(key)) return alignCache.get(key)!;
  const n = a.length, step = Math.max(1, Math.floor(n / 64));
  let best = 0, bestD = Infinity;
  for (let s = 0; s < n; s += step) {
    let d = 0;
    for (let i = 0; i < n; i += step) { const p = a[i], q = b[(i + s) % n]; d += (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; }
    if (d < bestD) { bestD = d; best = s; }
  }
  if (key) alignCache.set(key, best);
  return best;
}

/**
 * Shape a turning into shape b, u 0..1. Both are resampled to n points; closed shapes are aligned (pass `key` to
 * cache the alignment for a pair that is morphed every frame). An open line into a closed shape works too: the line
 * curls (its points walk onto the outline).
 */
export function morph(a: Pt[], b: Pt[], u: number, o: { n?: number; closedA?: boolean; closedB?: boolean; key?: string } = {}): Pt[] {
  const n = o.n ?? 160;
  const A = resample(a, n, !!o.closedA), B0 = resample(b, n, !!o.closedB);
  const sh = o.closedA && o.closedB ? bestShift(A, B0, o.key) : 0;
  const B = sh ? B0.map((_, i) => B0[(i + sh) % n]) : B0;
  return A.map((p, i) => [lerp(p[0], B[i][0], u), lerp(p[1], B[i][1], u)] as Pt);
}

/** Points of a line inside a rect (for clipping checks / layout). */
export function bounds(pts: Pt[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1 - x0, y1 - y0];
}

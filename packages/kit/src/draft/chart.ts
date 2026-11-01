/**
 * Data in the Drafting style: bar charts, line graphs, rings, counters, dashboard panels, toggles, a cursor,
 * dimension lines and ruler ticks. All drawn in the current ink; numbers come from the plan's sourced data.
 * Scales stay honest: bars start at zero unless the axis says otherwise.
 */
import { TAU, clamp, lerp, spring, inkOf, type G, type Pt, type Ink, type InkName } from "./core";
import { line, fill, shape, occlude, type FillKind } from "./ink";
import { label, text } from "./type";
import { rectP, roundRectP, lineP, circleP } from "./geom";

type K = InkName | Ink;

/** Ruler ticks along a line from (x0, y) to (x1, y): `n` ticks, every fifth longer; `u` sweeps them in. */
export function ruler(g: G, x0: number, x1: number, y: number, o: { ink: K; n?: number; u?: number; up?: boolean; col?: string }): void {
  const k = inkOf(o.ink), n = o.n ?? 41, u = clamp(o.u ?? 1), dir = o.up === false ? 1 : -1;
  for (let i = 0; i < n; i++) {
    if (i / (n - 1) > u) break;
    const x = lerp(x0, x1, i / (n - 1)), len = i % 5 === 0 ? 18 : 9;
    line(g, [[x, y], [x, y + dir * len]], { ink: k, col: o.col ?? k.accent, w: 2, wobble: 0.5, seed: i });
  }
}

/** Dimension line (vertical) at x from y0 to y1 with end ticks and a live number label. */
export function dimension(g: G, x: number, y0: number, y1: number, o: { ink: K; text?: string; u?: number; col?: string }): void {
  const k = inkOf(o.ink), col = o.col ?? k.accent, u = clamp(o.u ?? 1);
  const ym = lerp(y0, y1, 0.5), a = lerp(ym, y0, u), b = lerp(ym, y1, u);
  line(g, [[x, a], [x, b]], { ink: k, col, w: 2 });
  for (const yy of [a, b]) line(g, [[x - 12, yy], [x + 12, yy]], { ink: k, col, w: 2 });
  if (o.text && u > 0.5) label(g, o.text, x + 22, ym + 9, { ink: k, col, size: 24, weight: 700 });
}

export interface BarsOpts {
  ink: K;
  /** values (any unit); `max` sets the scale (default the largest value) */
  values: number[];
  max?: number;
  /** chart area: left, baseline y, width, height */
  x: number; y: number; w: number; h: number;
  /** 0..1 growth of each bar (function of index) */
  grow?: (i: number) => number;
  /** fill per bar: solid / hatch / outline ("none") */
  fillOf?: (i: number) => FillKind;
  colOf?: (i: number) => string | undefined;
  gap?: number;
  baseline?: boolean;
}

/** Bars growing from a baseline. Returns each bar's top centre (for a line across the tops, labels, a cursor). */
export function bars(g: G, o: BarsOpts): Pt[] {
  const k = inkOf(o.ink), n = o.values.length, max = o.max ?? Math.max(...o.values, 1e-9);
  const slot = o.w / n, bw = slot * (1 - (o.gap ?? 0.3));
  const tops: Pt[] = [];
  if (o.baseline !== false) line(g, lineP(o.x - 10, o.y, o.x + o.w + 10, o.y), { ink: k, w: 2.5, seed: 5 });
  o.values.forEach((v, i) => {
    const gU = clamp(o.grow ? o.grow(i) : 1), h = (o.h * v / max) * gU;
    const x = o.x + i * slot + (slot - bw) / 2;
    tops.push([x + bw / 2, o.y - h]);
    if (h < 0.5) return;
    const r = rectP(x, o.y - h, bw, h);
    const fk = o.fillOf?.(i) ?? "hatch";
    shape(g, r, { ink: k, fill: fk, col: o.colOf?.(i), fillCol: o.colOf?.(i), w: 2, seed: i * 1.7, closed: true });
  });
  return tops;
}

/** A line graph through points (draw-on with `u`); dots at the points when `dots`. */
export function graph(g: G, pts: Pt[], o: { ink: K; u?: number; col?: string; dots?: boolean; w?: number }): void {
  const k = inkOf(o.ink);
  line(g, pts, { ink: k, col: o.col ?? k.accent, progress: o.u, w: o.w ?? 3, seed: 21 });
  if (o.dots) pts.forEach((p, i) => { if ((i + 0.5) / pts.length <= (o.u ?? 1)) shape(g, circleP(p[0], p[1], 6, 20), { ink: k, col: o.col ?? k.accent, fill: "solid", fillCol: o.col ?? k.accent, w: 2 }); });
}

/** Bars around a circle (a radial chart): baseline radius r, bars pointing outward; `bend` 0 = straight row, 1 = ring. */
export function ring(g: G, values: number[], o: { ink: K; cx: number; cy: number; r: number; len: number; max?: number; bend?: number; rot?: number; row?: { x: number; y: number; w: number }; fillOf?: (i: number) => FillKind; colOf?: (i: number) => string | undefined }): void {
  const k = inkOf(o.ink), n = values.length, max = o.max ?? Math.max(...values, 1e-9), bend = clamp(o.bend ?? 1);
  const row = o.row ?? { x: o.cx - (TAU * o.r) / 2, y: o.cy + o.r, w: TAU * o.r };
  values.forEach((v, i) => {
    const u = (i + 0.5) / n, L = (o.len * v) / max;
    const a = (o.rot ?? -Math.PI / 2) + u * TAU;
    const ringBase: Pt = [o.cx + o.r * Math.cos(a), o.cy + o.r * Math.sin(a)], ringTip: Pt = [o.cx + (o.r + L) * Math.cos(a), o.cy + (o.r + L) * Math.sin(a)];
    const rowBase: Pt = [row.x + u * row.w, row.y], rowTip: Pt = [row.x + u * row.w, row.y - L];
    const b: Pt = [lerp(rowBase[0], ringBase[0], bend), lerp(rowBase[1], ringBase[1], bend)], t: Pt = [lerp(rowTip[0], ringTip[0], bend), lerp(rowTip[1], ringTip[1], bend)];
    const col = o.colOf?.(i);
    line(g, [b, t], { ink: k, col, w: o.fillOf?.(i) === "solid" ? 7 : 3, seed: i });
  });
}

/** A number that rolls up from 0 to `value` between t0 and t0 + dur (spring), drawn big. */
export function counter(g: G, t: number, x: number, y: number, o: { ink: K; value: number; t0: number; size?: number; decimals?: number; prefix?: string; suffix?: string; align?: "left" | "center" | "right"; fill?: "auto" | "solid" | "hatch" | "scan" | "outline" }): void {
  const v = o.value * clamp(spring(t, o.t0, 14));
  const s = `${o.prefix ?? ""}${v.toLocaleString("en-US", { minimumFractionDigits: o.decimals ?? 0, maximumFractionDigits: o.decimals ?? 0 })}${o.suffix ?? ""}`;
  text(g, s, x, y, { size: o.size ?? 120, ink: o.ink, align: o.align, fill: o.fill ?? "solid" });
}

/** Dashboard panel: an outlined box with an optional title label in its top-left. `u` draws it on. */
export function panel(g: G, x: number, y: number, w: number, h: number, o: { ink: K; title?: string; u?: number; opaque?: boolean; r?: number }): void {
  const k = inkOf(o.ink), u = clamp(o.u ?? 1);
  const p = o.r ? roundRectP(x, y, w, h, o.r) : rectP(x, y, w, h);
  if (o.opaque) occlude(g, p, k);
  line(g, p, { ink: k, closed: true, progress: u, w: 2.5, seed: x * 0.01 + y * 0.001 });
  if (o.title && u > 0.7) label(g, o.title, x + 18, y + 36, { ink: k, size: 22, weight: 800, track: 0.16 });
}

/** On/off toggle (pill with a knob); `on` 0..1 slides the knob. */
export function toggle(g: G, x: number, y: number, o: { ink: K; on: number; label?: string; w?: number }): void {
  const k = inkOf(o.ink), w = o.w ?? 58, h = w * 0.48, on = clamp(o.on);
  if (o.label) label(g, o.label, x - 16, y + h / 2 + 8, { ink: k, size: 22, weight: 800, track: 0.16, align: "right" });
  line(g, roundRectP(x, y, w, h, h / 2), { ink: k, closed: true, w: 2.5 });
  const kx = lerp(x + h / 2, x + w - h / 2, on);
  shape(g, circleP(kx, y + h / 2, h * 0.32, 24), { ink: k, fill: on > 0.5 ? "solid" : "none", fillCol: k.accent, w: 2.5, col: on > 0.5 ? k.accent : undefined });
}

/** A two-way switch "A / B" with the active side in the accent colour. */
export function switch2(g: G, x: number, y: number, o: { ink: K; a: string; b: string; which: 0 | 1 }): void {
  const k = inkOf(o.ink);
  const wa = label(g, o.a, x, y, { ink: k, size: 22, weight: 800, track: 0.16, col: o.which === 0 ? k.accent : undefined });
  label(g, o.b, x + wa + 26, y, { ink: k, size: 22, weight: 800, track: 0.16, col: o.which === 1 ? k.accent : undefined });
}

/** Mouse cursor arrow at (x, y) (its tip); `press` 0..1 shrinks it for a click and draws a click ring. */
export function cursor(g: G, x: number, y: number, o: { ink: K; press?: number; s?: number }): void {
  const k = inkOf(o.ink), s = (o.s ?? 1) * (1 - 0.12 * clamp(o.press ?? 0));
  const arrow: Pt[] = [[0, 0], [0, 34], [9, 26], [16, 41], [22, 38], [15, 24], [27, 24]].map(([a, b]) => [x + a * s, y + b * s] as Pt);
  occlude(g, arrow, k);
  line(g, arrow, { ink: k, closed: true, w: 2.5, wobble: 0.4 });
  const p = clamp(o.press ?? 0);
  if (p > 0 && p < 1) line(g, circleP(x, y, 10 + 30 * p, 32), { ink: k, closed: true, col: k.accent, w: 2.5 * (1 - p) + 0.5, alpha: 1 - p });
}

/** Keyframe diamond (timeline marker): filled when `on`. */
export function diamond(g: G, x: number, y: number, o: { ink: K; on?: boolean; r?: number }): void {
  const k = inkOf(o.ink), r = o.r ?? 7;
  const d: Pt[] = [[x, y - r], [x + r, y], [x, y + r], [x - r, y]];
  shape(g, d, { ink: k, fill: o.on ? "solid" : "none", fillCol: k.line, w: 2 });
}

/** Small hatched swatch with a label (legends). */
export function legend(g: G, x: number, y: number, items: { text: string; fill: FillKind; col?: string }[], o: { ink: K }): void {
  let cx = x;
  for (const it of items) {
    fill(g, rectP(cx, y - 18, 22, 22), { ink: o.ink, kind: it.fill, col: it.col });
    line(g, rectP(cx, y - 18, 22, 22), { ink: o.ink, closed: true, w: 2 });
    cx += 34 + label(g, it.text, cx + 34, y, { ink: o.ink, size: 22, weight: 700, track: 0.14 }) + 30;
  }
}

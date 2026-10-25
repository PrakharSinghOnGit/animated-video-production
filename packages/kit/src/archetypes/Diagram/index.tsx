import React from "react";
import { useCurrentFrame } from "remotion";
import { z } from "zod";
import { COLOR_TOKENS, FONT_TOKENS, alpha } from "../../tokens";
import { ease, lerp, p, pulse } from "../../motion";
import { ArchetypeFrame, ColorNameSchema, FrameTextSchema, FRAME, colorOf, type ColorName } from "../ArchetypeFrame";
import { CueSchema, parseCue, type Cue } from "../cues";
import { registerArchetype } from "../registry";
import { useScene, type SceneContextValue } from "../../scene";

/**
 * Diagram: explains a mechanism. Labelled nodes (with simple built-in glyphs) are placed by a
 * declarative layout, connected by edges that draw on their spoken cue; animated edges carry
 * travelling dots (money moving). An optional emphasis track pulses one node and dims the rest.
 */

const ICON_NAMES = ["bank", "person", "company", "coin", "building", "chart", "globe"] as const;
type IconName = (typeof ICON_NAMES)[number];

const NodeSchema = z.object({
  id: z.string().max(24).optional().describe("Short unique key used by edges and emphasis; defaults to the label"),
  label: z.string().max(24).describe("Node name, 1-3 words, e.g. 'Central bank'"),
  sublabel: z.string().max(32).optional().describe("Optional second line, e.g. 'Sets the interest rate'"),
  icon: z.enum(ICON_NAMES).optional().describe("Glyph drawn on the node"),
  color: ColorNameSchema.optional().describe("Defaults to a rotating pastel"),
  at: CueSchema.optional().describe("When the node appears; defaults to a short stagger at scene start"),
  x: z.number().min(0).max(1).optional().describe("layout 'manual' only: horizontal centre, 0 (left) to 1 (right) of the body"),
  y: z.number().min(0).max(1).optional().describe("layout 'manual' only: vertical centre, 0 (top) to 1 (bottom) of the body"),
});

const EdgeSchema = z.object({
  from: z.string().describe("Node id (or label) the edge leaves"),
  to: z.string().describe("Node id (or label) the edge arrives at"),
  label: z.string().max(18).optional().describe("Short verb or thing moved, e.g. 'loan', 'interest', 'deposit'"),
  style: z.enum(["solid", "dashed"]).default("solid").describe("dashed = indirect or weaker relationship"),
  animated: z.boolean().default(false).describe("true = dots travel along the edge (money or goods moving)"),
  arrow: z.boolean().default(true),
  color: ColorNameSchema.optional().describe("Defaults to the colour of the source node"),
  at: CueSchema.optional().describe("When the edge draws; defaults to just after both of its nodes appear"),
});

export const DiagramSchema = FrameTextSchema.extend({
  layout: z
    .enum(["flow-lr", "hub", "cycle", "tree", "manual"])
    .default("flow-lr")
    .describe(
      "flow-lr: left-to-right chain in node order (wraps to 2 rows past 4-5 nodes). hub: node 1 in the centre, the rest around it. cycle: nodes on a ring in order. tree: node 1 is the root, children below. manual: use node x/y."
    ),
  nodes: z.array(NodeSchema).min(2).max(7),
  edges: z
    .array(EdgeSchema)
    .max(12)
    .optional()
    .describe(
      "Connections. If omitted: flow-lr chains nodes in order, hub links node 1 to every other, cycle links each to the next and back to the first, tree links parent to children."
    ),
  emphasis: z
    .array(z.object({ node: z.string().describe("Node id (or label)"), at: CueSchema }))
    .max(6)
    .optional()
    .describe("Spotlight a node from its cue until the next entry: it pulses, everything unrelated dims"),
  centerLabel: z.string().max(28).optional().describe("cycle layout only: text in the middle of the ring"),
});
export type DiagramProps = z.infer<typeof DiagramSchema>;

// ---------------------------------------------------------------------------
// Text metrics (estimates; Inter / Poppins average advance widths)
// ---------------------------------------------------------------------------

const LABEL_SIZE = 32;
const SUB_SIZE = 26;
const CHIP_SIZE = 26;
const PAD = 10;
const CHIP_MAX_W = 170;

function textWidth(s: string, size: number, f = 0.57): number {
  return s.length * size * f;
}
function wrapLines(s: string, size: number, width: number, f = 0.57): number {
  const words = s.split(/\s+/).filter(Boolean);
  let lines = 1;
  let cur = 0;
  for (const w of words) {
    const ww = textWidth(w, size, f);
    const next = cur === 0 ? ww : cur + size * 0.3 + ww;
    if (cur > 0 && next > width) {
      lines++;
      cur = ww;
    } else cur = next;
  }
  return lines;
}
function chipSize(label: string): { w: number; h: number } {
  const inner = Math.min(CHIP_MAX_W, textWidth(label, CHIP_SIZE, 0.58));
  const lines = wrapLines(label, CHIP_SIZE, CHIP_MAX_W, 0.58);
  return { w: inner + 32, h: lines * CHIP_SIZE * 1.2 + 16 };
}

// ---------------------------------------------------------------------------
// Layout (pure; exported for testing)
// ---------------------------------------------------------------------------

export interface LayoutInput {
  layout: "flow-lr" | "hub" | "cycle" | "tree" | "manual";
  labels: string[];
  subs: (string | undefined)[];
  hasIcon: boolean;
  edges: { from: number; to: number; label?: string }[];
  manual: { x?: number; y?: number }[];
  /** Type/card scale: few nodes get bigger cards. */
  scale: number;
  W: number;
  H: number;
}
export interface LayoutResult {
  pos: { cx: number; cy: number }[];
  cardW: number;
  cardH: number;
  compact: boolean;
  /** Type scale actually used. */
  scale: number;
  /** Ring centre, used to bow cycle edges outward. */
  center: { cx: number; cy: number };
}

function measureCard(inp: LayoutInput, cardW: number, compact: boolean): number {
  const k = inp.scale;
  const textW = compact ? cardW - 52 * k - 20 - 24 : cardW - 40;
  const labelLines = Math.max(...inp.labels.map((l) => wrapLines(l, LABEL_SIZE * k, textW, 0.6)));
  const subLines = inp.subs.some(Boolean)
    ? Math.max(...inp.subs.map((s) => (s ? wrapLines(s, SUB_SIZE * k, textW, 0.55) : 0)))
    : 0;
  const textH = labelLines * LABEL_SIZE * k * 1.18 + (subLines ? 6 + subLines * SUB_SIZE * k * 1.22 : 0);
  if (compact) return Math.round(Math.max(inp.hasIcon ? 56 * k : 0, textH) + 36);
  return Math.round(36 + (inp.hasIcon ? 60 * k + 12 : 0) + textH);
}

function vGapNeeded(inp: LayoutInput): number {
  const hs = inp.edges.filter((e) => e.label).map((e) => chipSize(e.label!).h);
  return hs.length ? Math.max(60, Math.max(...hs) + 24) : 56;
}

type Geo = { pos: { cx: number; cy: number }[]; cardW: number; cardHMax?: number };

function flowGeo(inp: LayoutInput, compact: boolean, cardHFn: (w: number) => number, sc = 1): Geo & { ok: boolean } {
  const n = inp.labels.length;
  const { W, H } = inp;
  const chips = inp.edges.filter((e) => e.label).map((e) => chipSize(e.label!).w);
  const gapMin = chips.length ? Math.max(...chips) + 40 : 96;
  const capW = (n <= 3 ? 380 : compact ? 340 : 300) * sc * inp.scale;
  const minW = (compact ? 250 : 210) * sc;
  let cols = n;
  let cardW = 0;
  let found = false;
  for (cols = n; cols >= Math.ceil(n / 2); cols--) {
    cardW = Math.min(capW, (W - 2 * PAD - (cols - 1) * gapMin) / cols);
    if (cardW >= minW) {
      found = true;
      break;
    }
  }
  if (!found) {
    cols = Math.ceil(n / 2);
    cardW = Math.max(minW - 30, Math.min(capW, (W - 2 * PAD - (cols - 1) * gapMin) / cols));
  }
  const rows = Math.ceil(n / cols);
  const cardH = cardHFn(cardW);
  const gap = cols > 1 ? Math.min(420, (W - 2 * PAD - cols * cardW) / (cols - 1)) : 0;
  const total = cols * cardW + (cols - 1) * gap;
  const x0 = (W - total) / 2;
  const rowStep = rows > 1 ? Math.min(H - cardH - 2 * PAD, cardH + 170) : 0;
  const pos = Array.from({ length: n }, (_, i) => {
    const r = Math.floor(i / cols);
    let c = i % cols;
    if (r % 2 === 1) c = cols - 1 - c; // snake so the wrap edge is a short vertical hop
    return { cx: x0 + cardW / 2 + c * (cardW + gap), cy: H / 2 + (r - (rows - 1) / 2) * rowStep };
  });
  const ok = rows === 1 || rowStep >= cardH + vGapNeeded(inp);
  return { pos, cardW, ok };
}

function hubGeo(inp: LayoutInput, compact: boolean, cardHFn: (w: number) => number, sc = 1): Geo & { ok: boolean } {
  const n = inp.labels.length;
  const { W, H } = inp;
  const k = n - 1;
  const cardW = (compact ? 320 : k >= 4 ? 240 : 270) * sc * Math.min(inp.scale, 1.1);
  const cardH = cardHFn(cardW);
  const rRight = Math.ceil(k / 2);
  const rLeft = k - rRight;
  const rMax = Math.max(rRight, 1);
  const maxDx = W / 2 - cardW / 2 - PAD;
  const dx = Math.min(maxDx, rMax > 1 ? 640 : 560);
  const step = rMax > 1 ? Math.min((H - cardH - 2 * PAD) / (rMax - 1), cardH + 90) : 0;
  const maxOff = ((rMax - 1) / 2) * step || 1;
  const pos = [{ cx: W / 2, cy: H / 2 }];
  const yOf = (j: number, rows: number) => H / 2 + (j - (rows - 1) / 2) * step;
  const xFactor = (y: number) => 1 - 0.1 * Math.min(1, Math.abs(y - H / 2) / maxOff);
  for (let j = 0; j < rRight; j++) {
    const y = yOf(j, rRight);
    pos.push({ cx: W / 2 + dx * xFactor(y), cy: y });
  }
  for (let j = rLeft - 1; j >= 0; j--) {
    const y = yOf(j, rLeft);
    pos.push({ cx: W / 2 - dx * xFactor(y), cy: y });
  }
  const ok = rMax === 1 || step >= cardH + 24;
  return { pos, cardW, ok };
}

function cycleGeo(inp: LayoutInput, compact: boolean, cardHFn: (w: number) => number, sc = 1): Geo & { ok: boolean } {
  const n = inp.labels.length;
  // Big rings read better as a two-row loop than as a cramped ellipse.
  if (n >= 6) return flowGeo(inp, compact, cardHFn, sc);
  const { W, H } = inp;
  const cardW = (n >= 6 ? 260 : 320) * sc * Math.min(inp.scale, 1.2);
  const cardH = cardHFn(cardW);
  const rx = W / 2 - cardW / 2 - PAD - 40;
  const ry = H / 2 - cardH / 2 - PAD;
  const pos = Array.from({ length: n }, (_, i) => {
    const a = n === 2 ? (i === 0 ? Math.PI : 0) : ((-90 + (360 * i) / n) * Math.PI) / 180;
    return { cx: W / 2 + Math.cos(a) * rx, cy: H / 2 + Math.sin(a) * ry };
  });
  return { pos, cardW, ok: ry >= cardH * 0.3 };
}

function treeGeo(inp: LayoutInput, compact: boolean, cardHFn: (w: number) => number, sc = 1): Geo & { ok: boolean } {
  const n = inp.labels.length;
  const { W, H } = inp;
  const children: number[][] = Array.from({ length: n }, () => []);
  const parent: number[] = Array(n).fill(-1);
  for (const e of inp.edges) {
    if (e.from !== e.to && parent[e.to] === -1 && e.to !== 0) {
      parent[e.to] = e.from;
      children[e.from].push(e.to);
    }
  }
  // Nodes without a parent hang off the root so everything is placed.
  for (let i = 1; i < n; i++) {
    if (parent[i] === -1) {
      parent[i] = 0;
      children[0].push(i);
    }
  }
  const depth = Array(n).fill(0);
  const xSlot = Array(n).fill(0);
  let leaf = 0;
  const visited = new Set<number>();
  const walk = (i: number, d: number) => {
    visited.add(i);
    depth[i] = d;
    const kids = children[i].filter((c) => !visited.has(c));
    if (kids.length === 0) {
      xSlot[i] = leaf++;
      return;
    }
    kids.forEach((c) => walk(c, d + 1));
    xSlot[i] = (xSlot[kids[0]] + xSlot[kids[kids.length - 1]]) / 2;
  };
  walk(0, 0);
  const levels = Math.max(...depth) + 1;
  const leaves = Math.max(leaf, 1);
  const slotW = (W - 2 * PAD) / leaves;
  const cardW = Math.min((compact ? 460 : 380) * sc * Math.min(inp.scale, 1.15), slotW - 36);
  const cardH = cardHFn(cardW);
  const step = levels > 1 ? Math.min((H - cardH - 2 * PAD) / (levels - 1), cardH + 150) : 0;
  const pos = Array.from({ length: n }, (_, i) => ({
    cx: PAD + (xSlot[i] + 0.5) * slotW,
    cy: H / 2 + (depth[i] - (levels - 1) / 2) * step,
  }));
  return { pos, cardW, ok: levels === 1 || (step >= cardH + vGapNeeded(inp) && cardW >= (compact ? 250 : 210) * sc) };
}

function manualGeo(inp: LayoutInput, compact: boolean, cardHFn: (w: number) => number, sc = 1): Geo & { ok: boolean } {
  const cardW = (compact ? 320 : 260) * sc;
  const cardH = cardHFn(cardW);
  const { W, H } = inp;
  const pos = inp.labels.map((_, i) => {
    const m = inp.manual[i] ?? {};
    const x = (m.x ?? (i + 0.5) / inp.labels.length) * W;
    const y = (m.y ?? 0.5) * H;
    return {
      cx: Math.max(cardW / 2 + PAD, Math.min(W - cardW / 2 - PAD, x)),
      cy: Math.max(cardH / 2 + PAD, Math.min(H - cardH / 2 - PAD, y)),
    };
  });
  return { pos, cardW, ok: true };
}

function overlapCount(pos: { cx: number; cy: number }[], w: number, h: number, W: number, H: number): number {
  let bad = 0;
  pos.forEach((a, i) => {
    if (a.cx - w / 2 < 0 || a.cx + w / 2 > W || a.cy - h / 2 < 0 || a.cy + h / 2 > H) bad++;
    pos.forEach((b, j) => {
      if (j > i && Math.abs(a.cx - b.cx) < w + 12 && Math.abs(a.cy - b.cy) < h + 12) bad++;
    });
  });
  return bad;
}

export function layoutDiagram(input: LayoutInput): LayoutResult {
  const fn = { "flow-lr": flowGeo, hub: hubGeo, cycle: cycleGeo, tree: treeGeo, manual: manualGeo }[input.layout];
  let best: LayoutResult | null = null;
  let bestBad = Infinity;
  // Prefer big type for sparse diagrams, then standard size. For each: roomy column cards,
  // then compact row cards, shrinking cards a little before giving up.
  const scales = input.scale > 1 ? [input.scale, 1] : [1];
  for (const k of scales) {
    const inp = { ...input, scale: k };
    for (const sc of [1, 0.9, 0.8]) {
      for (const compact of [false, true]) {
        const cardHFn = (w: number) => measureCard(inp, w, compact);
        const g = fn(inp, compact, cardHFn, sc);
        const cardH = cardHFn(g.cardW);
        const rects = g.pos.map((q) => ({ cx: q.cx, cy: q.cy, w: g.cardW, h: cardH }));
        const routed = routeEdges(inp.layout, rects, inp.edges.map((e) => ({ a: e.from, b: e.to, label: e.label })), { x: inp.W / 2, y: inp.H / 2 }, inp.W, inp.H);
        const bad =
          overlapCount(g.pos, g.cardW, cardH, inp.W, inp.H) + (g.ok ? 0 : 1) + routed.chips.filter((c) => c && !c.clear).length;
        if (bad <= bestBad) {
          bestBad = bad;
          best = { pos: g.pos, cardW: g.cardW, cardH, compact, scale: k, center: { cx: inp.W / 2, cy: inp.H / 2 } };
        }
        if (bad === 0) return best!;
      }
    }
  }
  return best!;
}

// ---------------------------------------------------------------------------
// Edge geometry
// ---------------------------------------------------------------------------

interface Pt {
  x: number;
  y: number;
}
interface Rect {
  cx: number;
  cy: number;
  w: number;
  h: number;
}
interface EdgePath {
  pts: Pt[];
  cum: number[];
  length: number;
  end: Pt;
  endDir: Pt;
}

function inside(pt: Pt, r: Rect, m: number): boolean {
  return Math.abs(pt.x - r.cx) < r.w / 2 + m && Math.abs(pt.y - r.cy) < r.h / 2 + m;
}

export function edgePath(a: Rect, b: Rect, bow: number, outward?: Pt): EdgePath {
  const dx = b.cx - a.cx;
  const dy = b.cy - a.cy;
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const mx = (a.cx + b.cx) / 2;
  const my = (a.cy + b.cy) / 2;
  if (outward && nx * (mx - outward.x) + ny * (my - outward.y) < 0) {
    nx = -nx;
    ny = -ny;
  }
  const cx = mx + nx * bow * 2;
  const cy = my + ny * bow * 2;
  const N = 120;
  const all: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const u = 1 - t;
    all.push({
      x: u * u * a.cx + 2 * u * t * cx + t * t * b.cx,
      y: u * u * a.cy + 2 * u * t * cy + t * t * b.cy,
    });
  }
  let i0 = 0;
  while (i0 < N && inside(all[i0], a, 8)) i0++;
  let i1 = N;
  while (i1 > i0 && inside(all[i1], b, 16)) i1--;
  const pts = all.slice(i0, Math.max(i1, i0 + 1) + 1);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  const end = pts[pts.length - 1];
  const prev = pts[Math.max(0, pts.length - 4)];
  const dl = Math.hypot(end.x - prev.x, end.y - prev.y) || 1;
  return { pts, cum, length: cum[cum.length - 1] || 1, end, endDir: { x: (end.x - prev.x) / dl, y: (end.y - prev.y) / dl } };
}

function pointAt(path: EdgePath, frac: number): Pt {
  if (path.pts.length < 2) return path.pts[0];
  const target = Math.max(0, Math.min(1, frac)) * path.length;
  let i = 1;
  while (i < path.cum.length - 1 && path.cum[i] < target) i++;
  const c0 = path.cum[i - 1];
  const c1 = path.cum[i];
  const t = c1 === c0 ? 0 : (target - c0) / (c1 - c0);
  const a = path.pts[i - 1];
  const b = path.pts[i];
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function rectsOverlap(a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }, m = 0) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 + m && Math.abs(a.y - b.y) < (a.h + b.h) / 2 + m;
}

/** Finds a spot for an edge label chip that avoids every node card, other chips and the body edge. */
export function placeChip(
  path: EdgePath,
  size: { w: number; h: number },
  nodes: Rect[],
  taken: { x: number; y: number; w: number; h: number }[],
  W: number,
  H: number
): Pt & { clear: boolean } {
  const fracs = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82];
  const offs = [0, size.h / 2 + 14, -(size.h / 2 + 14)];
  let fallback: Pt | null = null;
  for (const off of offs) {
    for (const f of fracs) {
      const c = pointAt(path, f);
      const c2 = pointAt(path, Math.min(1, f + 0.02));
      const dl = Math.hypot(c2.x - c.x, c2.y - c.y) || 1;
      const pt = { x: c.x + (-(c2.y - c.y) / dl) * off, y: c.y + ((c2.x - c.x) / dl) * off };
      const box = { x: pt.x, y: pt.y, w: size.w, h: size.h };
      const clear =
        pt.x - size.w / 2 >= 0 &&
        pt.x + size.w / 2 <= W &&
        pt.y - size.h / 2 >= 0 &&
        pt.y + size.h / 2 <= H &&
        !nodes.some((n) => rectsOverlap(box, { x: n.cx, y: n.cy, w: n.w, h: n.h }, 8)) &&
        !taken.some((t) => rectsOverlap(box, t, 8));
      if (!fallback) fallback = pt;
      if (clear) return { ...pt, clear: true };
    }
  }
  return { ...fallback!, clear: false };
}


/** Edge paths plus label chip placement for a laid-out diagram (shared by layout scoring and rendering). */
export function routeEdges(
  layoutName: string,
  rects: Rect[],
  edges: { a: number; b: number; label?: string }[],
  center: Pt,
  W: number,
  H: number
): { paths: EdgePath[]; chips: ({ at: Pt; size: { w: number; h: number }; clear: boolean } | null)[] } {
  const reversePair = (e: { a: number; b: number }) => edges.some((o) => o.a === e.b && o.b === e.a);
  const paths = edges.map((e) => {
    const A = rects[e.a];
    const B = rects[e.b];
    const dist = Math.hypot(B.cx - A.cx, B.cy - A.cy);
    if (layoutName === "cycle") return edgePath(A, B, Math.min(70, dist * 0.14), center);
    if (reversePair(e)) return edgePath(A, B, Math.min(46, dist * 0.1));
    return edgePath(A, B, 0);
  });
  const taken: { x: number; y: number; w: number; h: number }[] = [];
  const chips = edges.map((e, i) => {
    if (!e.label) return null;
    const size = chipSize(e.label);
    const at = placeChip(paths[i], size, rects, taken, W, H);
    taken.push({ x: at.x, y: at.y, w: size.w, h: size.h });
    return { at: { x: at.x, y: at.y }, size, clear: at.clear };
  });
  return { paths, chips };
}

// ---------------------------------------------------------------------------
// Icons: 64x64 line glyphs, one stroke weight, one visual language
// ---------------------------------------------------------------------------

const Icon: React.FC<{ name: IconName; color: string; size: number }> = ({ name, color, size }) => {
  const common = { fill: "none", stroke: color, strokeWidth: 3.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  let body: React.ReactNode;
  switch (name) {
    case "bank":
      body = (
        <g {...common}>
          <path d="M8 26 L32 10 L56 26 Z" />
          <path d="M16 31 V45 M28 31 V45 M36 31 V45 M48 31 V45" />
          <path d="M9 52 H55" />
        </g>
      );
      break;
    case "person":
      body = (
        <g {...common}>
          <circle cx="32" cy="21" r="9" />
          <path d="M13 54 C13 40 21 34 32 34 C43 34 51 40 51 54" />
        </g>
      );
      break;
    case "company":
      body = (
        <g {...common}>
          <rect x="9" y="22" width="46" height="31" rx="5" />
          <path d="M23 22 V15 H41 V22" />
          <path d="M9 37 H55" />
          <path d="M29 37 V42 H35 V37" />
        </g>
      );
      break;
    case "coin":
      body = (
        <g {...common}>
          <circle cx="32" cy="32" r="22" />
          <circle cx="32" cy="32" r="14.5" strokeWidth="2.4" />
          <path d="M32 24 V40 M27 28.5 C27 26 36 26 36 29.5 C36 33.5 27 31 27 35 C27 38.5 37 38.5 37 36" strokeWidth="3" />
        </g>
      );
      break;
    case "building":
      body = (
        <g {...common}>
          <rect x="16" y="8" width="32" height="46" rx="3" />
          <path d="M24 18 H28 M36 18 H40 M24 28 H28 M36 28 H40 M24 38 H28 M36 38 H40" />
          <path d="M28 54 V47 H36 V54" />
          <path d="M8 56 H56" />
        </g>
      );
      break;
    case "chart":
      body = (
        <g {...common}>
          <path d="M9 9 V54 H56" />
          <path d="M17 42 L28 30 L37 38 L52 18" />
          <path d="M43 18 H52 V27" />
        </g>
      );
      break;
    case "globe":
      body = (
        <g {...common}>
          <circle cx="32" cy="32" r="22" />
          <ellipse cx="32" cy="32" rx="10" ry="22" />
          <path d="M10 32 H54" />
          <path d="M14 20 Q32 25 50 20 M14 44 Q32 39 50 44" />
        </g>
      );
      break;
  }
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" style={{ display: "block", flexShrink: 0 }}>
      {body}
    </svg>
  );
};

// ---------------------------------------------------------------------------
// Cue helpers (non-hook, so arrays of cues can be resolved in one pass)
// ---------------------------------------------------------------------------

function cueFrame(s: SceneContextValue, cue: Cue | undefined, offsetSec = 0): number | undefined {
  if (cue === undefined) return undefined;
  const base =
    typeof cue === "number"
      ? s.voiceStart + s.sec(cue)
      : (() => {
          const { word, occurrence } = parseCue(cue);
          return s.word(word, occurrence).start;
        })();
  return base + s.sec(offsetSec);
}

const NODE_COLORS: ColorName[] = ["sky", "mint", "lav", "peach", "butter", "rose"];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Diagram: React.FC<DiagramProps> = (props) => {
  const frame = useCurrentFrame();
  const s = useScene();

  const hasHeader = Boolean(props.kicker || props.title);
  const bodyTop = hasHeader ? FRAME.bodyTopWithTitle : FRAME.top;
  const W = FRAME.width - 2 * FRAME.marginX;
  const H = FRAME.height - bodyTop - FRAME.bottom - (props.source ? 40 : 0);

  const nodes = props.nodes.map((n, i) => ({
    ...n,
    key: n.id ?? n.label,
    color: colorOf(n.color ?? NODE_COLORS[i % NODE_COLORS.length]),
  }));
  const indexOf = (k: string) => {
    const byKey = nodes.findIndex((n) => n.key === k);
    return byKey >= 0 ? byKey : nodes.findIndex((n) => n.label === k);
  };
  const n = nodes.length;
  const scale = n <= 3 ? 1.3 : n === 4 ? 1.2 : n === 5 ? 1.1 : 1;

  // Edges: explicit or layout default
  let rawEdges: z.infer<typeof EdgeSchema>[];
  if (props.edges) {
    rawEdges = props.edges;
  } else {
    const mk = (a: number, b: number) => EdgeSchema.parse({ from: nodes[a].key, to: nodes[b].key });
    const list: z.infer<typeof EdgeSchema>[] = [];
    if (props.layout === "hub") for (let i = 1; i < n; i++) list.push(mk(0, i));
    else if (props.layout === "tree") for (let i = 1; i < n; i++) list.push(mk(Math.floor((i - 1) / 2), i));
    else if (props.layout === "cycle") for (let i = 0; i < n; i++) list.push(mk(i, (i + 1) % n));
    else for (let i = 0; i < n - 1; i++) list.push(mk(i, i + 1));
    rawEdges = list;
  }
  const edges = rawEdges
    .map((e) => ({ ...e, a: indexOf(e.from), b: indexOf(e.to) }))
    .filter((e) => e.a >= 0 && e.b >= 0 && e.a !== e.b);

  const layout = layoutDiagram({
    layout: props.layout,
    labels: nodes.map((x) => x.label),
    subs: nodes.map((x) => x.sublabel),
    hasIcon: nodes.some((x) => x.icon),
    scale,
    edges: edges.map((e) => ({ from: e.a, to: e.b, label: e.label })),
    manual: nodes.map((x) => ({ x: x.x, y: x.y })),
    W,
    H,
  });
  const rects: Rect[] = layout.pos.map((q) => ({ cx: q.cx, cy: q.cy, w: layout.cardW, h: layout.cardH }));

  // Timing
  const nodeAt = nodes.map((nd, i) => cueFrame(s, nd.at) ?? s.voiceStart - s.sec(0.1) + s.sec(Math.min(i * 0.3, 1.8)));
  const nodeIn = nodes.map((_, i) => ease.outExpo(p(frame, nodeAt[i] - s.sec(0.06), nodeAt[i] + s.sec(0.5))));
  const edgeAt = edges.map((e) => cueFrame(s, e.at, -0.08) ?? Math.max(nodeAt[e.a], nodeAt[e.b]) + s.sec(0.2));
  const edgeDrawFrames = s.sec(0.75);

  // Emphasis (sorted by time)
  const emph = (props.emphasis ?? [])
    .map((e) => ({ idx: indexOf(e.node), at: cueFrame(s, e.at, -0.05) ?? 0 }))
    .filter((e) => e.idx >= 0)
    .sort((x, y) => x.at - y.at);
  let cur = -1;
  emph.forEach((e, i) => {
    if (frame >= e.at) cur = i;
  });
  const emphT = cur >= 0 ? ease.outExpo(p(frame, emph[cur].at, emph[cur].at + s.sec(0.45))) : 0;
  // A spotlight relaxes after a few seconds unless another one takes over.
  const hold = cur >= 0 && cur === emph.length - 1 ? 1 - ease.inOutCubic(p(frame, emph[cur].at + s.sec(2.6), emph[cur].at + s.sec(3.3))) : 1;
  const active = (cur < 0 ? 0 : cur === 0 ? emphT : 1) * hold;
  const focusOf = (idx: number) => {
    if (cur < 0) return 0;
    const now = emph[cur].idx === idx ? 1 : 0;
    const before = cur > 0 ? (emph[cur - 1].idx === idx ? 1 : 0) : 0;
    return lerp(before, now, emphT) * hold;
  };
  const focus = nodes.map((_, i) => focusOf(i));
  const pulseOf = (idx: number) =>
    emph.reduce((acc, e) => (e.idx === idx ? Math.max(acc, pulse(frame, e.at + s.sec(0.2), s.sec(0.45), 1)) : acc), 0);

  // Edge paths and chip placement
  const { paths, chips } = routeEdges(props.layout, rects, edges, { x: layout.center.cx, y: layout.center.cy }, W, H);

  const cardRadius = 26;
  const iconSize = Math.round((layout.compact ? 52 : 60) * layout.scale);

  return (
    <ArchetypeFrame kicker={props.kicker} title={props.title} source={props.source} accent={props.accent}>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H }}>
        {/* Ghost slots: the structure is visible before anything is spoken */}
        {rects.map((r, i) => (
          <div
            key={`ghost-${i}`}
            style={{
              position: "absolute",
              left: r.cx - r.w / 2,
              top: r.cy - r.h / 2,
              width: r.w,
              height: r.h,
              borderRadius: cardRadius,
              border: `2px dashed ${alpha(COLOR_TOKENS.text, 0.1)}`,
              opacity: 1 - nodeIn[i],
            }}
          />
        ))}

        {props.centerLabel && props.layout === "cycle" && (
          <div
            style={{
              position: "absolute",
              left: layout.center.cx - 280,
              width: 560,
              top: layout.center.cy - 60,
              height: 120,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              fontFamily: FONT_TOKENS.display,
              fontWeight: 700,
              fontSize: 44,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
              textWrap: "balance",
              color: alpha(COLOR_TOKENS.text, 0.9),
              opacity: ease.outExpo(p(frame, s.voiceStart, s.voiceStart + s.sec(0.7))),
            }}
          >
            {props.centerLabel}
          </div>
        )}

        {/* Edges */}
        <svg width={W} height={H} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
          {edges.map((e, i) => {
            const path = paths[i];
            const prog = ease.outCubic(p(frame, edgeAt[i], edgeAt[i] + edgeDrawFrames));
            if (prog <= 0) return null;
            const color = colorOf(e.color ?? nodes[e.a].color);
            const edgeFocus = Math.max(focus[e.a], focus[e.b]);
            const dim = active * (1 - edgeFocus);
            const op = (1 - 0.7 * dim) * Math.min(1, prog * 4);
            const d = path.pts.map((q, j) => `${j === 0 ? "M" : "L"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" ");
            const dashed = e.style === "dashed";
            const maskId = `dg-mask-${i}`;
            const arrowIn = ease.outBack(1.6)(p(frame, edgeAt[i] + edgeDrawFrames * 0.8, edgeAt[i] + edgeDrawFrames * 1.2));
            const ang = (Math.atan2(path.endDir.y, path.endDir.x) * 180) / Math.PI;
            const period = s.sec(1.7);
            const flowing = e.animated && prog > 0.98;
            return (
              <g key={`edge-${i}`} opacity={op}>
                {dashed && (
                  <mask id={maskId} maskUnits="userSpaceOnUse" x={-50} y={-50} width={W + 100} height={H + 100}>
                    <path d={d} pathLength={1} fill="none" stroke="white" strokeWidth={14} strokeDasharray={1} strokeDashoffset={1 - prog} />
                  </mask>
                )}
                {dashed ? (
                  <path
                    d={d}
                    fill="none"
                    stroke={alpha(color, 0.85)}
                    strokeWidth={4}
                    strokeLinecap="round"
                    strokeDasharray="2 13"
                    mask={`url(#${maskId})`}
                  />
                ) : (
                  <path
                    d={d}
                    pathLength={1}
                    fill="none"
                    stroke={alpha(color, 0.85)}
                    strokeWidth={4.5}
                    strokeLinecap="round"
                    strokeDasharray={1}
                    strokeDashoffset={1 - prog}
                  />
                )}
                {e.arrow && arrowIn > 0 && (
                  <g transform={`translate(${path.end.x} ${path.end.y}) rotate(${ang}) scale(${arrowIn})`}>
                    <path d="M0 0 L-17 -10 L-17 10 Z" fill={color} stroke={color} strokeWidth={3} strokeLinejoin="round" />
                  </g>
                )}
                {flowing &&
                  [0, 1, 2].map((k) => {
                    const u = (((frame - edgeAt[i] - edgeDrawFrames) / period + k / 3) % 1 + 1) % 1;
                    const pt = pointAt(path, u);
                    const fade = Math.min(1, u * 8, (1 - u) * 8);
                    return (
                      <g key={k} opacity={fade}>
                        <circle cx={pt.x} cy={pt.y} r={15} fill={alpha(color, 0.25)} />
                        <circle cx={pt.x} cy={pt.y} r={8} fill={color} />
                      </g>
                    );
                  })}
              </g>
            );
          })}
        </svg>

        {/* Edge labels */}
        {edges.map((e, i) => {
          const chip = chips[i];
          if (!chip) return null;
          const prog = ease.outExpo(p(frame, edgeAt[i] + edgeDrawFrames * 0.3, edgeAt[i] + edgeDrawFrames * 0.9));
          if (prog <= 0) return null;
          const color = colorOf(e.color ?? nodes[e.a].color);
          const dim = active * (1 - Math.max(focus[e.a], focus[e.b]));
          return (
            <div
              key={`chip-${i}`}
              style={{
                position: "absolute",
                left: chip.at.x - chip.size.w / 2,
                top: chip.at.y - chip.size.h / 2,
                width: chip.size.w,
                minHeight: chip.size.h,
                boxSizing: "border-box",
                padding: "8px 16px",
                borderRadius: 14,
                background: COLOR_TOKENS.bg,
                border: `2px solid ${alpha(color, 0.55)}`,
                fontFamily: FONT_TOKENS.body,
                fontWeight: 600,
                fontSize: CHIP_SIZE,
                lineHeight: 1.2,
                textAlign: "center",
                textWrap: "balance",
                color: COLOR_TOKENS.text,
                opacity: prog * (1 - 0.6 * dim),
                transform: `scale(${0.9 + 0.1 * prog})`,
              }}
            >
              {e.label}
            </div>
          );
        })}

        {/* Nodes */}
        {nodes.map((nd, i) => {
          const r = rects[i];
          const f = focus[i];
          const dimmed = active * (1 - f);
          const pop = nodeIn[i];
          const sc = lerp(0.82, 1, pop) * (1 + 0.06 * f + 0.035 * pulseOf(i));
          const color = nd.color;
          const iconEl = nd.icon ? <Icon name={nd.icon} color={color} size={iconSize} /> : null;
          return (
            <div
              key={`node-${i}`}
              style={{
                position: "absolute",
                left: r.cx - r.w / 2,
                top: r.cy - r.h / 2,
                width: r.w,
                height: r.h,
                boxSizing: "border-box",
                borderRadius: cardRadius,
                background: alpha(COLOR_TOKENS.surface, 0.96),
                border: `2.5px solid ${alpha(color, lerp(0.55, 1, f))}`,
                boxShadow: f > 0.01 ? `0 0 ${Math.round(46 * f)}px ${alpha(color, 0.38 * f)}` : undefined,
                display: "flex",
                flexDirection: layout.compact ? "row" : "column",
                alignItems: "center",
                justifyContent: "center",
                gap: layout.compact ? 20 : 10,
                padding: layout.compact ? "0 24px 0 20px" : "0 20px",
                textAlign: layout.compact ? "left" : "center",
                opacity: pop * (1 - 0.62 * dimmed),
                transform: `translateY(${(1 - pop) * 28}px) scale(${sc})`,
              }}
            >
              {iconEl}
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: FONT_TOKENS.display,
                    fontWeight: 600,
                    fontSize: LABEL_SIZE * layout.scale,
                    lineHeight: 1.18,
                    letterSpacing: "-0.02em",
                    textWrap: "balance",
                    color: COLOR_TOKENS.text,
                  }}
                >
                  {nd.label}
                </div>
                {nd.sublabel && (
                  <div
                    style={{
                      marginTop: 6,
                      fontFamily: FONT_TOKENS.body,
                      fontSize: SUB_SIZE * layout.scale,
                      lineHeight: 1.22,
                      textWrap: "balance",
                      color: COLOR_TOKENS.muted,
                    }}
                  >
                    {nd.sublabel}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </ArchetypeFrame>
  );
};

registerArchetype({
  name: "Diagram",
  useWhen: "Explaining how a mechanism works: who or what is connected to whom, and what flows between them (money, loans, interest, goods), as a chain, hub, ring or tree.",
  schema: DiagramSchema,
  component: Diagram,
  examples: [
    {
      narration:
        "When you deposit savings, the bank keeps a small reserve and lends the rest to a borrower, who pays interest back over time.",
      props: {
        kicker: "How banks work",
        title: "Your deposit becomes someone's loan",
        layout: "flow-lr",
        nodes: [
          { id: "saver", label: "Saver", sublabel: "Deposits savings", icon: "person", color: "sky", at: "deposit" },
          { id: "bank", label: "Bank", sublabel: "Keeps a reserve", icon: "bank", color: "butter", at: "bank" },
          { id: "borrower", label: "Borrower", sublabel: "Takes out a loan", icon: "company", color: "mint", at: "borrower" },
        ],
        edges: [
          { from: "saver", to: "bank", label: "deposit", animated: true, at: "savings" },
          { from: "bank", to: "borrower", label: "loan", animated: true, at: "lends" },
          { from: "borrower", to: "bank", label: "interest", style: "dashed", at: "interest" },
        ],
        emphasis: [{ node: "bank", at: "reserve" }],
        source: "Illustrative",
        accent: "butter",
      },
    },
    {
      narration:
        "A company takes in revenue from customers, then pays out wages to employees, interest to lenders, taxes to the government, and dividends to shareholders.",
      props: {
        kicker: "Follow the money",
        title: "Where a company's cash goes",
        layout: "hub",
        nodes: [
          { id: "company", label: "Company", icon: "company", color: "butter", at: "company" },
          { id: "customers", label: "Customers", icon: "person", color: "sky", at: "customers" },
          { id: "employees", label: "Employees", icon: "person", color: "mint", at: "employees" },
          { id: "lenders", label: "Lenders", icon: "bank", color: "lav", at: "lenders" },
          { id: "government", label: "Government", icon: "building", color: "peach", at: "government" },
          { id: "shareholders", label: "Shareholders", icon: "coin", color: "rose", at: "shareholders" },
        ],
        edges: [
          { from: "customers", to: "company", label: "revenue", animated: true, at: "revenue" },
          { from: "company", to: "employees", label: "wages", animated: true, at: "wages" },
          { from: "company", to: "lenders", label: "interest", animated: true, at: "interest" },
          { from: "company", to: "government", label: "taxes", animated: true, at: "taxes" },
          { from: "company", to: "shareholders", label: "dividends", animated: true, at: "dividends" },
        ],
        source: "Illustrative",
        accent: "butter",
      },
    },
    {
      narration:
        "Easy credit lets people borrow more, which pushes asset prices up, which raises collateral values and unlocks even more credit.",
      props: {
        kicker: "The credit loop",
        title: "A self-reinforcing cycle",
        layout: "cycle",
        centerLabel: "Credit feeds on itself",
        nodes: [
          { id: "credit", label: "Easy credit", icon: "bank", color: "butter", at: "easy" },
          { id: "borrowing", label: "More borrowing", icon: "person", color: "sky", at: "borrow" },
          { id: "prices", label: "Asset prices rise", icon: "chart", color: "mint", at: "asset" },
          { id: "collateral", label: "Higher collateral values", icon: "building", color: "lav", at: "collateral" },
        ],
        edges: [
          { from: "credit", to: "borrowing", animated: true, at: "borrow" },
          { from: "borrowing", to: "prices", animated: true, at: "pushes" },
          { from: "prices", to: "collateral", animated: true, at: "raises" },
          { from: "collateral", to: "credit", animated: true, at: "unlocks" },
        ],
        emphasis: [{ node: "collateral", at: "collateral" }],
        source: "Illustrative",
        accent: "lav",
      },
    },
    {
      narration:
        "When the central bank raises its policy rate, commercial banks charge more for loans, so households borrow less and businesses invest and hire less.",
      props: {
        kicker: "Monetary policy",
        title: "How a rate decision reaches you",
        layout: "tree",
        nodes: [
          { id: "cb", label: "Central bank", sublabel: "Raises the policy rate", icon: "bank", color: "butter", at: "central" },
          { id: "banks", label: "Commercial banks", sublabel: "Charge more for loans", icon: "building", color: "sky", at: "commercial" },
          { id: "households", label: "Households", sublabel: "Borrow less", icon: "person", color: "mint", at: "households" },
          { id: "businesses", label: "Businesses", sublabel: "Invest and hire less", icon: "company", color: "peach", at: "businesses" },
        ],
        edges: [
          { from: "cb", to: "banks", label: "higher rate", at: "raises" },
          { from: "banks", to: "households", at: "households" },
          { from: "banks", to: "businesses", at: "businesses" },
        ],
        source: "Illustrative",
        accent: "butter",
      },
    },
  ],
});

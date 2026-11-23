/// <reference path="./assets.d.ts" />
// Paper-cut letters: League Gothic (OFL) outlines via opentype.js, flattened to polylines and "re-cut" per letter
// (scissor edges, slight rotation, baseline jitter). Adapted from LemoLab lemo-opuscar styles/spy-titles/demo/glyph.js (MIT).
import { parse, type Font } from "opentype.js";
import gothicUrl from "./fonts/LeagueGothic-Regular.ttf";
import { hash, clamp, outBack } from "../paper/lib";
import type { G, Pt } from "../paper/engine";
import { rough, piece, curScale, state, type PieceOpts } from "./engine";
import { measure } from "../paper/measure";

let font: Font | null = null, loading: Promise<void> | null = null;
/** Fetch and parse the bundled League Gothic. Resolves immediately when already loaded. ensureSpyFonts() calls this. */
export function loadGothic(): Promise<void> {
  if (font) return Promise.resolve();
  // outside a browser (Bun scripts such as cues import act files), the import is a file path and fetch rejects it
  const bun = (globalThis as { Bun?: { file(p: string): { arrayBuffer(): Promise<ArrayBuffer> } } }).Bun;
  const bytes = typeof window === "undefined" && bun ? bun.file(gothicUrl).arrayBuffer() : fetch(gothicUrl).then((r) => r.arrayBuffer());
  loading ??= bytes.then((b) => { font = parse(b); });
  return loading;
}

function flatten(cmds: { type: string; x?: number; y?: number; x1?: number; y1?: number; x2?: number; y2?: number }[]): Pt[][] {
  const contours: Pt[][] = []; let cur: Pt[] = [], px = 0, py = 0;
  const n = 8;
  for (const c of cmds) {
    if (c.type === "M") { cur = [[c.x!, c.y!]]; contours.push(cur); px = c.x!; py = c.y!; }
    else if (c.type === "L") { cur.push([c.x!, c.y!]); px = c.x!; py = c.y!; }
    else if (c.type === "Q") {
      for (let i = 1; i <= n; i++) { const t = i / n, u = 1 - t; cur.push([u * u * px + 2 * u * t * c.x1! + t * t * c.x!, u * u * py + 2 * u * t * c.y1! + t * t * c.y!]); }
      px = c.x!; py = c.y!;
    } else if (c.type === "C") {
      for (let i = 1; i <= n; i++) {
        const t = i / n, u = 1 - t;
        cur.push([u * u * u * px + 3 * u * u * t * c.x1! + 3 * u * t * t * c.x2! + t * t * t * c.x!, u * u * u * py + 3 * u * u * t * c.y1! + 3 * u * t * t * c.y2! + t * t * t * c.y!]);
      }
      px = c.x!; py = c.y!;
    }
  }
  for (const k of contours) { const a = k[0], b = k[k.length - 1]; if (k.length > 2 && Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.01) k.pop(); }
  return contours;
}

export interface Letter {
  ch: string;
  /** pen x of this letter from the line start */
  x: number; w: number;
  /** contours in local coords, origin = baseline at the letter's pen position */
  polys: Pt[][];
  /** ink extent along x (local) */
  x0: number; x1: number;
  /** y of the top (negative = above the baseline) */
  top: number;
  /** index in the string (spaces count) */
  i: number;
}
export interface Layout { letters: Letter[]; width: number; size: number; str: string }

const gcache = new Map<string, Pt[][]>();
/** Letter outlines and cut edges, keyed by size: an act that animates a size (L("$", r * 1.05)) adds a key every frame, and
 * one render tab draws thousands of frames, so the cache is emptied when it gets big (it rebuilds in a few ms). Unbounded,
 * it filled the tab's memory and crashed a full render at the same frame every time. */
const GCACHE_MAX = 3000;
const gset = (k: string, v: Pt[][]) => { if (gcache.size >= GCACHE_MAX) gcache.clear(); gcache.set(k, v); };
/**
 * Lay out one line of League Gothic. size = em size in px (cap height is about 0.76 * size, so 200 gives ~150 px capitals).
 * `track` = extra letter spacing as a fraction of size (default 0.02). Needs ensureSpyFonts() to have resolved (SpyCanvas does that).
 */
export function layout(str: string, size: number, opt: { track?: number } = {}): Layout {
  if (!font) throw new Error("[spy] League Gothic not loaded yet: draw inside SpyCanvas (it awaits ensureSpyFonts)");
  const sc = size / font.unitsPerEm, track = (opt.track ?? 0.02) * size;
  let x = 0; const out: Letter[] = [];
  for (let i = 0; i < str.length; i++) {
    const ch = str[i], gl = font.charToGlyph(ch), adv = (gl.advanceWidth ?? 0) * sc;
    if (ch !== " ") {
      const key = ch + size.toFixed(1);
      let polys = gcache.get(key);
      if (!polys) { polys = flatten(gl.getPath(0, 0, size).commands as any); gset(key, polys); }
      const bb = gl.getBoundingBox();
      out.push({ ch, x, w: adv, polys, x0: bb.x1 * sc, x1: bb.x2 * sc, top: -bb.y2 * sc, i });
    }
    x += adv + track;
  }
  return { letters: out, width: x - track, size, str };
}

/** Cut one letter: seed = character + index gives a fixed cut edge (cached). */
export function cutLetter(L: Letter, seed: number, amp = 1.6): Pt[][] {
  const k = `cut${seed}${L.ch}${L.polys.length}${amp}${L.x1.toFixed(1)}`;
  let r = gcache.get(k);
  if (!r) { r = L.polys.map((p, j) => rough(p, seed * 7 + j * 13, amp, 9)); gset(k, r); }
  return r;
}

/** Per-letter adjustment returned by the `each` callback of drawLine. */
export interface LetterFx { dx?: number; dy?: number; rot?: number; s?: number; hide?: boolean; col?: string }
export interface LineOpts extends Pick<PieceOpts, "gap" | "gapCol" | "shadow" | "shA"> {
  col?: string;
  seed?: number;
  /** strength of the random rotation / baseline offset, in degrees (default 1; 0 = set straight) */
  jit?: number;
  /** edge noise amplitude in px (default scales with size: 1.6 from size 130 up, less below so thin strokes keep their shape) */
  amp?: number;
  /** x is the left edge (default), centre or right edge of the line */
  align?: "left" | "center" | "right";
  each?: (L: Letter, i: number) => LetterFx | null | undefined;
}
/**
 * Draw one line of cut-paper letters; (x, y) = baseline. Each letter is its own piece: edge noise, +-0.8 deg rotation at jit 1,
 * +-1.5 px baseline jitter at jit 1, slit and shadow. Use `each` to land letters one by one (see landEach).
 * Small on screen = finer cut: the slit, shadow and edge noise shrink with the letters' on-screen cap height (full at >= 120 px
 * caps, down to 30 % for tiny type), so counters (B, $, 0, %) stay open and small type doesn't go bold.
 */
export function drawLine(g: G, lay: Layout, x: number, y: number, opt: LineOpts = {}): void {
  const col = opt.col ?? "#000", seed = opt.seed ?? 1, jit = opt.jit ?? 1;
  if (opt.align === "center") x -= lay.width / 2; else if (opt.align === "right") x -= lay.width;
  const amp = opt.amp ?? Math.min(1.6, lay.size / 80), gap0 = opt.gap ?? state(g).gap, sc = curScale(g);
  let shown = 0;
  for (const L of lay.letters) {
    const e = opt.each ? opt.each(L, L.i) : null; if (e?.hide) continue;
    shown++;
    const r = ((hash(seed * 31 + L.i * 7.3) - 0.5) * jit * Math.PI / 180) * 2 + (e?.rot || 0);
    const dy = (hash(seed * 11 + L.i * 3.1) - 0.5) * jit * 3 + (e?.dy || 0);
    const mid = (L.x0 + L.x1) / 2, cx = x + L.x + mid + (e?.dx || 0);
    g.save(); g.translate(cx, y + dy); g.rotate(r); if (e?.s) g.scale(e.s, e.s); g.translate(-mid, 0);
    const k = 0.3 + 0.7 * clamp((lay.size * 0.76 * sc * (e?.s || 1)) / 120);       // on-screen cap height -> how much cut effect
    piece(g, cutLetter(L, seed + L.i, amp), e?.col ?? col, { gap: gap0 * k, gapCol: opt.gapCol, shadow: opt.shadow, shA: opt.shA, shB: 5 * k, shX: 2.5 * k, shY: 3.5 * k, rule: "nonzero" });
    g.restore();
  }
  if (shown === lay.letters.length && shown) measure(g, "type", lay.str, lay.size * 0.76, x + lay.width / 2, y - lay.size * 0.38, [x, y - lay.size * 0.76, x + lay.width, y + lay.size * 0.04], col);
}
/** Width in px of the inked line (use for centring and for framing rects). */
export const lineWidth = (lay: Layout): number => lay.width;
/** World rect [x0,y0,x1,y1] of a line drawn with drawLine at (x, y) with the same align. */
export function lineRect(lay: Layout, x: number, y: number, align: "left" | "center" | "right" = "left"): [number, number, number, number] {
  const x0 = align === "center" ? x - lay.width / 2 : align === "right" ? x - lay.width : x;
  const top = Math.min(0, ...lay.letters.map((l) => l.top));
  return [x0, y + top, x0 + lay.width, y + lay.size * 0.08];
}

/**
 * `each` factory: letters drop in one by one starting at t0 (stagger s apart), each landing in `dur` s with a small overshoot,
 * complete at t0 + (n-1)*stagger + dur. Spaces do not count. Pass the result as drawLine's `each`.
 */
export function landEach(t: number, t0: number, o: { stagger?: number; dur?: number; rise?: number; rot?: number; col?: string } = {}): (L: Letter, i: number) => LetterFx {
  const st = o.stagger ?? 0.07, dur = o.dur ?? 0.25, rise = o.rise ?? 220, rot = o.rot ?? 0.25;
  return (L) => {
    const k = clamp((t - (t0 + L.i * st)) / dur);
    if (k <= 0) return { hide: true };
    const e = outBack(k, 1.2);
    return { dy: -(1 - e) * rise, rot: (1 - e) * rot * (hash(L.i * 5.1) < 0.5 ? -1 : 1), col: o.col };
  };
}
/** Time at which landEach finishes for a line of n letters. */
export const landEnd = (t0: number, n: number, o: { stagger?: number; dur?: number } = {}): number => t0 + (n - 1) * (o.stagger ?? 0.07) + (o.dur ?? 0.25);


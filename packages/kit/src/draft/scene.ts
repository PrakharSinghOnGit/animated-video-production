/**
 * Acts in the Drafting style: the wrapper (background, paper tooth, motion blur, corner labels), the two ink changes
 * (a hard-edged shape flooding the frame; one horizontal scan line) and the chapter card.
 * The camera never moves: there is no camera here at all. Continuity between acts comes from the plan: an act
 * starts from the shape the previous act ended on (its `handoff`).
 */
import { W, H, clamp, expIn, expInOut, spring, inkOf, restRect, type G, type Pt, type InkName, type Ink } from "./core";
import { background, inkLayer, scratch, canvasOf, setInkTime, line } from "./ink";
import { label, text, fitSize, dropIn, capHeight } from "./type";
import { lineP } from "./geom";
import type { PaperCtx } from "../paper/CanvasHost";

export type DraftCtx = PaperCtx;

// ───────────────────────────── corner labels ─────────────────────────────

/** Top left "FIG. 07 — GEAR", bottom right a running counter ("SHEET 03 / 12"). Screen space, always on. */
export function corners(g: G, ink: InkName | Ink, fig: { n: number; name: string } | null, meta?: string): void {
  const k = inkOf(ink), [x0, y0, x1, y1] = restRect();
  if (fig) label(g, `FIG. ${String(fig.n).padStart(2, "0")} — ${fig.name.toUpperCase()}`, x0 - 72, y0 - 36, { ink: k, size: 22, weight: 700, track: 0.22 });
  if (meta) label(g, meta.toUpperCase(), x1 + 72, y1 + 52, { ink: k, size: 22, weight: 700, track: 0.22, align: "right" });
}

// ───────────────────────────── ink changes ─────────────────────────────

/**
 * One horizontal scan line sweeps the frame (down by default) and everything it passes is drawn in the new ink.
 * u 0..1 (use ~0.5 s with expInOut). The line itself is the new ink's line colour with a white core.
 */
export function scanWipe(g: G, u: number, from: (h: G) => void, to: (h: G) => void, o: { up?: boolean; ink?: InkName | Ink } = {}): void {
  u = clamp(u);
  if (u <= 0) { from(g); return; }
  if (u >= 1) { to(g); return; }
  const y = o.up ? H * (1 - u) : H * u;
  g.save(); from(g); g.restore();
  g.save();
  g.beginPath(); o.up ? g.rect(0, y, W, H - y) : g.rect(0, 0, W, y); g.clip();
  to(g);
  g.restore();
  const k = inkOf(o.ink ?? "hologram");
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = k.line; g.fillRect(0, y - 3, W, 6);
  g.fillStyle = "#ffffff"; g.fillRect(0, y - 1, W, 2);
  g.restore();
}

/**
 * A shape grows past the frame with a hard edge; inside it is the new ink. `shape(u)` returns the shape at
 * progress u (e.g. a hexagon cell scaling up). Default: a square from the centre.
 */
export function floodWipe(g: G, u: number, from: (h: G) => void, to: (h: G) => void, shape?: (u: number) => Pt[]): void {
  u = clamp(u);
  if (u <= 0) { from(g); return; }
  if (u >= 1) { to(g); return; }
  const s = shape ? shape(expIn(u)) : (() => { const r = Math.hypot(W, H) * 0.75 * expIn(u); return [[W / 2 - r, H / 2 - r], [W / 2 + r, H / 2 - r], [W / 2 + r, H / 2 + r], [W / 2 - r, H / 2 + r]] as Pt[]; })();
  g.save(); from(g); g.restore();
  g.save();
  g.beginPath(); g.moveTo(s[0][0], s[0][1]); for (const p of s.slice(1)) g.lineTo(p[0], p[1]); g.closePath(); g.clip();
  to(g);
  g.restore();
}

// ───────────────────────────── the act wrapper ─────────────────────────────

export const ACT_IN = 0.5;
export const ACT_OUT = 0.5;
export interface ActOpts {
  ink: InkName;
  dur?: number;
  /** how the act arrives: "none" (same ink, it continues the previous act's last shape), "scan", "scanUp", "flood" */
  open?: "none" | "scan" | "scanUp" | "flood";
  /** the previous act's ink (for open scan/flood) */
  from?: InkName;
  /** flood shape at progress u (hard edge) */
  floodShape?: (u: number) => Pt[];
  /**
   * How the act leaves (preferred for ink changes: this act owns the frame, so nothing vanishes):
   * "scan" / "scanUp" / "flood" over the last ACT_OUT seconds into the `to` ink, where `handoff(h, t)` draws the
   * shape the next act starts from, already in the next ink (e.g. the honeycomb in white line).
   */
  close?: "none" | "scan" | "scanUp" | "flood";
  to?: InkName;
  handoff?: (h: G, t: number) => void;
  /** FIG. label: act number in the video and its one-word name */
  fig?: { n: number; name: string };
  /** bottom-right counter text, e.g. "SHEET 03 / 12" */
  meta?: string | ((t: number) => string);
  /** motion blur sub-frames (1 = off). Default 3: each frame averages 3 moments inside half a frame. */
  blur?: number;
  /** screen-space extras drawn after the scene, sharp (no blur) */
  overlay?: (g: G, t: number) => void;
}

/**
 * Every Drafting act draws through this. `scene(h, t)` draws the act at time t (use this t, not ctx.t: the
 * wrapper calls it at several moments per frame for motion blur). The scene draws lines and fills only;
 * the ground, grid, paper tooth and corner labels are added here.
 */
export function drawAct(g: G, ctx: DraftCtx, o: ActOpts, scene: (h: G, t: number) => void): void {
  const fps = ctx.fps || 30, n = Math.max(1, Math.round(o.blur ?? 3));
  const one = (h: G, t: number, ink: InkName) => {
    setInkTime(t);
    background(h, ink);
    inkLayer(h, ink, (l) => scene(l, t));
  };
  const dur = o.dur ?? ctx.duration;
  const frameAt = (h: G, t: number) => {
    const open = o.open ?? "none", u = t / ACT_IN;
    const close = o.close ?? "none", v = (t - (dur - ACT_OUT)) / ACT_OUT;
    if (close !== "none" && o.to && v > 0) {
      const from = (q: G) => one(q, t, o.ink);
      const to = (q: G) => { setInkTime(t); background(q, o.to!); if (o.handoff) inkLayer(q, o.to!, (l) => o.handoff!(l, t)); };
      if (close === "flood") floodWipe(h, v, from, to, o.floodShape);
      else scanWipe(h, expInOut(v), from, to, { up: close === "scanUp", ink: o.to });
    } else if (open !== "none" && o.from && u < 1) {
      const from = (q: G) => { setInkTime(t); background(q, o.from!); };
      const to = (q: G) => one(q, t, o.ink);
      if (open === "flood") floodWipe(h, u, from, to, o.floodShape);
      else scanWipe(h, expInOut(u), from, to, { up: open === "scanUp", ink: o.ink });
    } else one(h, t, o.ink);
  };
  if (n === 1) frameAt(g, ctx.t);
  else {
    for (let i = 0; i < n; i++) {
      const t = ctx.t + ((i / (n - 1)) - 0.5) * (0.5 / fps);
      if (i === 0) { frameAt(g, t); continue; }
      const h = scratch(1);
      frameAt(h, t);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1 / (i + 1); g.drawImage(canvasOf(h), 0, 0); g.restore();
    }
  }
  setInkTime(ctx.t);
  const meta = typeof o.meta === "function" ? o.meta(ctx.t) : o.meta;
  corners(g, o.ink, o.fig ?? null, meta);
  o.overlay?.(g, ctx.t);
}

// ───────────────────────────── chapter card ─────────────────────────────

export interface ChapterCard {
  /** the rail the title was pressed into: draw the act's first line from here to continue it */
  rail: Pt[];
  /** 0..1: how far the press has gone (1 = the title is a line) */
  pressed: number;
}

/**
 * The silent pause before a chapter: "CHAPTER 02" small, the title big (dropping in letter by letter, filled by the
 * ink), a rail above it; at `pressAt` the rail drops and presses the letters flat into itself, leaving one line the
 * act continues from (returned `rail`). Draw inside drawAct's scene. t0 = card start; pressAt ~ first spoken word - 0.4.
 */
export function chapterCard(g: G, t: number, o: { ink: InkName; n: number; title: string; t0: number; pressAt: number }): ChapterCard {
  const k = inkOf(o.ink), [x0, , x1] = restRect();
  const size = Math.min(300, fitSize(o.title.toUpperCase(), (x1 - x0) * 0.86));
  const base = H / 2 + capHeight(size) / 2, top = base - capHeight(size);
  const press = clamp(expIn((t - o.pressAt) / 0.16));
  const railY0 = top - 56, railY = railY0 + (base + 24 - railY0) * press;
  const railW = (x1 - x0) * 0.92 * clamp(spring(t, o.t0, 18));
  const rail = lineP(W / 2 - railW / 2, railY, W / 2 + railW / 2, railY);
  if (press < 1) {
    label(g, `CHAPTER ${String(o.n).padStart(2, "0")}`, W / 2, top - 120, { ink: k, size: 26, weight: 700, track: 0.3, align: "center", alpha: 1 - press });
    text(g, o.title.toUpperCase(), W / 2, base, {
      size, ink: k, align: "center",
      letter: (i) => { const d = dropIn(t, o.t0 + 0.2, { stagger: 0.05, height: 140 })(i); return d.hide ? d : { ...d, sy: 1 - press * 0.98, dy: (d.dy ?? 0) + (capHeight(size) / 2) * press }; },
    });
  }
  line(g, rail, { ink: k, w: 4, seed: 2 });
  return { rail, pressed: press };
}

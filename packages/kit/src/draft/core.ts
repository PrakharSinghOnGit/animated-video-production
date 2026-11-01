/**
 * Drafting style core: palette, the three inks, easing and the frame border.
 * The look: one drawn line promoted through three inks (pencil on paper, wire on a blueprint, light on black),
 * a locked front-on camera, every shot made out of the previous one. See workflow/styles/drafting/STYLE.md.
 */
export { clamp, lerp, seg, TAU, hash, vnoise, mulberry } from "../paper/lib";
export { W, H, setFrameSize, isVertical } from "../paper/engine";
export type { G, Pt, Rect } from "../paper/engine";
import { clamp } from "../paper/lib";
import { W, H } from "../paper/engine";

/** The only colours of the style. */
export const PAL = {
  cream: "#EDE6D5",
  blue: "#1B3ED2",
  cyan: "#45F0DD",
  black: "#07080A",
  graphite: "#16161A",
  white: "#FFFFFF",
} as const;

export type InkName = "paper" | "blueprint" | "hologram";

export interface Ink {
  name: InkName;
  bg: string;
  /** structure lines and type */
  line: string;
  /** this stage's accent = the next stage's colour (blue pencil on paper, cyan on the blueprint, white on the hologram) */
  accent: string;
  grid: string;
  /** grid alpha for ordinary / every fifth line */
  gridA: [number, number];
  /** the colour labels are drawn in */
  label: string;
}

export const INK: Record<InkName, Ink> = {
  paper: { name: "paper", bg: PAL.cream, line: PAL.graphite, accent: PAL.blue, grid: PAL.blue, gridA: [0.13, 0.26], label: PAL.graphite },
  blueprint: { name: "blueprint", bg: PAL.blue, line: PAL.white, accent: PAL.cyan, grid: PAL.white, gridA: [0.12, 0.24], label: PAL.white },
  hologram: { name: "hologram", bg: PAL.black, line: PAL.cyan, accent: PAL.white, grid: PAL.cyan, gridA: [0.09, 0.18], label: PAL.cyan },
};
export const inkOf = (i: InkName | Ink): Ink => (typeof i === "string" ? INK[i] : i);
/** The next stage: paper -> blueprint -> hologram -> paper. */
export const nextInk = (i: InkName): InkName => (i === "paper" ? "blueprint" : i === "blueprint" ? "hologram" : "paper");

/** Grid pitch in px (every fifth line is stronger). */
export const GRID = 60;

/** Nothing at rest closer than this to the frame edges (things travelling through may cross it). */
export const BORDER = () => (W > H ? { x: 150, y: 90 } : { x: 80, y: 220 });
/** The rest area as [x0, y0, x1, y1]. */
export const restRect = (): [number, number, number, number] => { const b = BORDER(); return [b.x, b.y, W - b.x, H - b.y]; };

// ───────────────────────────── easing ─────────────────────────────

/**
 * Critically damped spring from 0 to 1 starting at t0 (seconds): 1 - (1 + w s) e^(-w s). Never overshoots.
 * w 12 (soft) .. 40 (snappy); at w = 24 it is ~95% there after 0.2 s. Moves start ~0.05 s before the word they land on.
 */
export function spring(t: number, t0: number, w = 24): number {
  const s = t - t0;
  if (s <= 0) return 0;
  return 1 - (1 + w * s) * Math.exp(-w * s);
}
/** Value moving from a to b with a spring that starts at t0. */
export const springTo = (a: number, b: number, t: number, t0: number, w = 24) => a + (b - a) * spring(t, t0, w);
/** Exponential ease-in / ease-out / in-out on u 0..1 (wipes, presses, exits). */
export const expIn = (u: number) => { u = clamp(u); return u <= 0 ? 0 : Math.pow(2, 10 * (u - 1)); };
export const expOut = (u: number) => { u = clamp(u); return u >= 1 ? 1 : 1 - Math.pow(2, -10 * u); };
export const expInOut = (u: number) => { u = clamp(u); return u < 0.5 ? expIn(u * 2) / 2 : 0.5 + expOut(u * 2 - 1) / 2; };
/** 0..1 between t0 and t1 with an exponential in-out (for a timed move of known length). */
export const move = (t: number, t0: number, t1: number) => expInOut((t - t0) / Math.max(1e-6, t1 - t0));
/** Steps of a stepped process: the phase changes `rate` times a second (pencil boil, stepped gears). */
export const stepTime = (t: number, rate: number) => Math.floor(t * rate) / rate;

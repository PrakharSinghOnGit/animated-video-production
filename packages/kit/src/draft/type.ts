/**
 * Type: Geist only. Big words in 900, filled by the ink (paper: pencil hatching cut to the letters with a doubled
 * outline; blueprint: solid white or clean outline; hologram: scan lines or solid cyan). Labels 600-800, 24-28 px,
 * tracked 0.14-0.3 em. Letters can move one by one (`letter` hook) for kinetic type.
 */
import { clamp, spring, inkOf, type G, type Ink, type InkName } from "./core";
import { DRAFT_FONT } from "./fonts";
import { scratch, canvasOf, fill, inkClock } from "./ink";
import { rectP } from "./geom";

export type TextFill = "auto" | "hatch" | "solid" | "outline" | "scan";
export interface LetterXf { dx?: number; dy?: number; s?: number; sx?: number; sy?: number; rot?: number; hide?: boolean; alpha?: number }
export interface TextOpts {
  size: number;
  weight?: number;
  ink: InkName | Ink;
  /** auto: paper hatch, blueprint solid, hologram scan */
  fill?: TextFill;
  col?: string;
  align?: "left" | "center" | "right";
  /** letter spacing in em */
  track?: number;
  /** per-letter transform (i = letter index); return hide to skip it */
  letter?: (i: number, ch: string) => LetterXf | null | undefined;
  /** hatch / scan fill drawn on 0..1 */
  progress?: number;
  /** hologram scan thickness 0..1 */
  light?: number;
  /** clip the word to this rect [x, y, w, h] (a slot between two rails) */
  clip?: [number, number, number, number];
}
export interface TextBox { x: number; y: number; width: number; size: number; letters: { ch: string; x: number; w: number }[] }

const font = (size: number, weight = 900) => `${weight} ${size}px "${DRAFT_FONT}"`;

let mctx: OffscreenCanvasRenderingContext2D | null = null;
function m(): OffscreenCanvasRenderingContext2D {
  if (!mctx) mctx = new OffscreenCanvas(8, 8).getContext("2d")!;
  return mctx;
}

/** Width and letter positions of a word (letter x relative to the word's left edge). */
export function measure(str: string, size: number, weight = 900, track = 0): { width: number; letters: { ch: string; x: number; w: number }[] } {
  const c = m();
  c.font = font(size, weight);
  const sp = track * size, letters: { ch: string; x: number; w: number }[] = [];
  let x = 0;
  for (const ch of [...str]) { const w = c.measureText(ch).width; letters.push({ ch, x, w }); x += w + sp; }
  return { width: Math.max(0, x - (letters.length ? sp : 0)), letters };
}

/** Font size that makes `str` exactly `width` px wide. */
export const fitSize = (str: string, width: number, weight = 900, track = 0) => {
  const w100 = measure(str, 100, weight, track).width || 1;
  return (100 * width) / w100;
};
/** Cap height of Geist at a size (for vertical layout). */
export const capHeight = (size: number) => size * 0.71;

/** One word or line. (x, y) = baseline anchor per `align`. Returns where the letters went. */
export function text(g: G, str: string, x: number, y: number, o: TextOpts): TextBox {
  const k = inkOf(o.ink), weight = o.weight ?? 900;
  const { width, letters } = measure(str, o.size, weight, o.track ?? 0);
  const left = o.align === "center" ? x - width / 2 : o.align === "right" ? x - width : x;
  const box: TextBox = { x: left, y, width, size: o.size, letters: letters.map((l) => ({ ...l, x: l.x + left })) };
  const mode: TextFill = !o.fill || o.fill === "auto" ? (k.name === "paper" ? "hatch" : k.name === "hologram" ? "scan" : "solid") : o.fill;
  const col = o.col ?? (mode === "hatch" ? k.accent : k.line);

  const drawLetters = (h: G, how: "fill" | "stroke") => {
    h.font = font(o.size, weight);
    h.textBaseline = "alphabetic";
    letters.forEach((l, i) => {
      const xf = o.letter?.(i, l.ch) ?? {};
      if (xf.hide || l.ch === " ") return;
      const cx = left + l.x + l.w / 2, cy = y - capHeight(o.size) / 2;
      h.save();
      h.globalAlpha *= xf.alpha ?? 1;
      h.translate(cx + (xf.dx ?? 0), cy + (xf.dy ?? 0));
      if (xf.rot) h.rotate(xf.rot);
      h.scale((xf.s ?? 1) * (xf.sx ?? 1), (xf.s ?? 1) * (xf.sy ?? 1));
      if (how === "fill") h.fillText(l.ch, -l.w / 2, capHeight(o.size) / 2);
      else h.strokeText(l.ch, -l.w / 2, capHeight(o.size) / 2);
      h.restore();
    });
  };

  g.save();
  if (o.clip) { g.beginPath(); g.rect(...o.clip); g.clip(); }
  if (mode === "solid") {
    g.fillStyle = col; drawLetters(g, "fill");
  } else if (mode === "outline") {
    g.strokeStyle = col; g.lineWidth = k.name === "blueprint" ? 3 : 2.5; g.lineJoin = "round"; drawLetters(g, "stroke");
  } else {
    // hatch / scan cut to the letter shapes: letters as a mask on a layer, the fill drawn "source-in"
    const h = scratch(5), f = scratch(6);
    h.setTransform(g.getTransform()); f.setTransform(g.getTransform());
    h.fillStyle = "#000"; drawLetters(h, "fill");
    // the fill is drawn on its own layer (many strokes), then cut to the letters in one composite
    const top = y - o.size, area = rectP(left - 20, top - 20, width + 40, o.size * 1.3 + 40);
    if (mode === "hatch") fill(f, area, { ink: k, kind: "hatch", col, gap: Math.max(6, o.size / 34), progress: o.progress, seed: 13 });
    else fill(f, area, { ink: k, kind: "scan", col, gap: Math.max(6, Math.round(o.size / 28)), light: o.light ?? 0.7, progress: o.progress });
    h.setTransform(1, 0, 0, 1, 0, 0);
    h.globalCompositeOperation = "source-in";
    h.drawImage(canvasOf(f), 0, 0);
    h.globalCompositeOperation = "source-over";
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(canvasOf(h), 0, 0); g.restore();
    if (mode === "hatch") {
      // doubled outline in graphite, slightly out of register, phase stepping with the pencil
      const ph = Math.floor(inkClock.t * 8) % 4;
      g.strokeStyle = k.line; g.lineJoin = "round";
      g.lineWidth = Math.max(1.2, o.size / 220); g.globalAlpha = 0.85; drawLetters(g, "stroke");
      g.translate(1.6 + (ph % 2) * 0.6, -1.2 + (ph > 1 ? 0.5 : 0)); g.globalAlpha = 0.4; drawLetters(g, "stroke");
    }
  }
  g.restore();
  return box;
}

/** Heaviest Geist weight `label` draws: 800+ clogs at label sizes. Big words (`text`) keep 900. */
export const LABEL_MAX_WEIGHT = 700;
/**
 * Small tracked label (500-700, default 600, 24-28 px). Gets a thin outline in the ink's paper colour (`halo` screen px,
 * default 3, 0 = none) so it stays readable where it crosses lines and fills.
 */
export function label(g: G, str: string, x: number, y: number, o: { ink: InkName | Ink; size?: number; weight?: number; track?: number; col?: string; align?: "left" | "center" | "right"; alpha?: number; halo?: number; haloCol?: string }): number {
  const k = inkOf(o.ink), size = o.size ?? 26, weight = Math.min(o.weight ?? 600, LABEL_MAX_WEIGHT), track = o.track ?? 0.2;
  const { width, letters } = measure(str, size, weight, track);
  const left = o.align === "center" ? x - width / 2 : o.align === "right" ? x - width : x;
  g.save();
  g.font = font(size, weight); g.globalAlpha = o.alpha ?? 1; g.textBaseline = "alphabetic";
  const halo = o.halo ?? 3;
  if (halo > 0) {
    const m = g.getTransform(), sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1;
    g.lineJoin = "round"; g.lineWidth = (halo * 2) / sc; g.strokeStyle = o.haloCol ?? k.bg;
    for (const l of letters) g.strokeText(l.ch, left + l.x, y);
  }
  g.fillStyle = o.col ?? k.label;
  for (const l of letters) g.fillText(l.ch, left + l.x, y);
  g.restore();
  return width;
}

// ───────────────────────────── letter animations ─────────────────────────────

/** Letters drop from above one every `stagger` s, landing with a spring (starts 0.05 s early so they land on t0). */
export const dropIn = (t: number, t0: number, o: { stagger?: number; height?: number; w?: number } = {}) => (i: number): LetterXf => {
  const s = spring(t, t0 - 0.05 + i * (o.stagger ?? 0.05), o.w ?? 28);
  return s <= 0 ? { hide: true } : { dy: -(o.height ?? 260) * (1 - s) };
};
/** Letters appear one by one at `cps` letters a second (type-on); `out` > 0 un-types from the end. */
export const typeOn = (t: number, t0: number, cps = 30, out?: number) => (i: number, _ch?: string, n = 999): LetterXf => {
  if (t < t0 + i / cps) return { hide: true };
  if (out !== undefined && t >= out + (n - i) / cps) return { hide: true };
  return {};
};
/** The whole word whips in sideways (dx px) over `dur` s with an exponential ease-out. */
export const whipIn = (t: number, t0: number, dx = -1400, dur = 0.2) => (): LetterXf => {
  const u = clamp((t - t0) / dur);
  return u <= 0 ? { hide: true } : { dx: dx * Math.pow(2, -10 * u) * (u < 1 ? 1 : 0) };
};
/** Letters rise through a baseline one by one (use with `clip` = the slot above the baseline). */
export const riseIn = (t: number, t0: number, o: { stagger?: number; depth?: number } = {}) => (i: number): LetterXf => {
  const s = spring(t, t0 - 0.05 + i * (o.stagger ?? 0.04), 30);
  return { dy: (o.depth ?? 200) * (1 - s) };
};

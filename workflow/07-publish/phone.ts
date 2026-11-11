/**
 * Publish: the phone-size check (free, no model). A thumbnail is judged where it is met: about 168 x 94 px in a list,
 * about 120 px in a notification (GUIDE.md 2.2; the sizes are third-party figures). This file shrinks each thumbnail to
 * those real sizes, measures the small image, reads its words back with the machine's text recognition, and rejects
 * what does not survive.
 *
 *   shrink()   the thumbnail at a real size (thumbnails/phone/<V>_168.png): what the checks and the critic look at
 *   measure()  pixel measures of the 168 px image: tone range, edge against a white and a dark page, the area under the
 *              duration badge, how much fine detail is lost, how big the largest shape is, how many shapes there are
 *   readWords() the words a text recogniser reads in the small image (macOS Vision; null when not available)
 *   judge()    errors (rejected) and warnings from the measures and the read
 *
 * Thresholds are calibrated on the channel's own thumbnails and on act frames used as thumbnails (wide scenes with
 * small labels, which must fail); see phone.test.ts. They catch what cannot be seen at phone size; they do not judge
 * whether the idea is worth a click (the critic and the blind viewer in review.ts do).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

export const PHONE_W = 168, PHONE_H = 94;
/** Real sizes rendered for every variant: list row / sidebar, notification. */
export const PHONE_SIZES = [168, 120] as const;
/** Working size for "what detail existed before the shrink": 4x the phone size. */
const BIG = 4;

/** The duration badge's corner (GUIDE.md 2.5): right 22% x bottom 18%. */
export const BADGE = { w: 0.22, h: 0.18 };

/**
 * Calibration (2026-11-11): the channel's 12 thumbnails measure tone 40-82, edge 2.4:1 or more on both pages, detail lost 0.03-0.30, badge
 * 0.01-0.13 (0.89 for the one with a figure's legs under the badge); 12 act frames (wide scenes, small parts) measure
 * detail lost 0.17-0.51, with every frame of small labelled parts above 0.33, tone 28 for dark figures on red, and edge 1.2-1.4 for cream or dark frames with no border.
 * Shape count and focal height did not separate the two groups, so they only warn.
 */
export const LIMITS = {
  /** L* spread (2nd to 98th percentile) of the 168 px image: under toneMin nothing separates from the ground. */
  toneMin: 30, toneWarn: 45,
  /** contrast ratio of the outer ring against the page; under this the thumbnail has no edge there. */
  edgeMin: 1.5,
  /** share of the strong edges that are gone at 168 px: above this, thin lines and small parts carry the picture. */
  detailLostWarn: 0.32, detailLostMax: 0.42,
  /** the largest shape's height as a share of the image (GUIDE.md 2.4: about 35%). */
  focalWarn: 0.35,
  /** separate shapes at 168 px (parts closer than 2 px count as one): above this it may read as clutter. */
  shapesWarn: 12,
  /** edge energy under the badge relative to the image's mean: above this, something sits there. */
  badgeWarn: 0.5,
} as const;

export interface PhoneMetrics {
  tone: number;
  edgeLight: number; edgeDark: number;
  detailLost: number;
  focalH: number; focalW: number;
  shapes: number;
  badge: number;
}

/** A PNG of `src` at `w` px wide (area filter: what a browser's downscale looks like). */
export function shrink(src: string, w: number, out: string): boolean {
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", src, "-vf", `scale=${w}:${Math.round((w * 9) / 16)}:flags=area`, "-frames:v", "1", out]);
  return r.status === 0 && fs.existsSync(out);
}

/** Raw RGB pixels of `src` scaled to w x h. */
export function rgb(src: string, w: number, h: number): Uint8Array | null {
  const r = spawnSync("ffmpeg", ["-v", "error", "-i", src, "-vf", `scale=${w}:${h}:flags=area`, "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"], { maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 && r.stdout.length === w * h * 3 ? new Uint8Array(r.stdout) : null;
}

const lin = (c: number) => { const v = c / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
/** Relative luminance (0..1) and L* (0..100) of an sRGB pixel. */
export const lum = (r: number, g: number, b: number) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const lstar = (y: number) => (y <= 0.008856 ? 903.3 * y : 116 * Math.cbrt(y) - 16);
/** WCAG contrast ratio of two luminances. */
export const ratio = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

/** L* plane of raw RGB. */
function plane(px: Uint8Array): Float32Array {
  const L = new Float32Array(px.length / 3);
  for (let i = 0; i < L.length; i++) L[i] = lstar(lum(px[i * 3], px[i * 3 + 1], px[i * 3 + 2]));
  return L;
}
/** Gradient magnitude per pixel (central differences), 0 at the border. */
function grad(L: Float32Array, w: number, h: number): Float32Array {
  const G = new Float32Array(w * h);
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    G[i] = Math.hypot(L[i + 1] - L[i - 1], L[i + w] - L[i - w]) / 2;
  }
  return G;
}

/** Outer band left out of the shape measures (the border band a thumbnail is told to draw, GUIDE.md 2.5b). */
const CROP = 3;
/** Width of the frame zone (inside the crop) whose dominant colours are taken as the ground. */
const FRAME = 8;
export interface Shape { n: number; x0: number; y0: number; x1: number; y1: number }
/**
 * The things drawn on the small image. The ground is whatever colours dominate the frame zone (a split or a horizon
 * gives two or three); every other pixel is figure, and touching figure pixels form one shape whatever their colours
 * (a character in three inks is one shape; a line of type is one shape per letter or per block).
 */
function shapesOf(px: Uint8Array, w: number, h: number): Shape[] {
  const key = (i: number) => (px[i * 3] >> 5) * 64 + (px[i * 3 + 1] >> 5) * 8 + (px[i * 3 + 2] >> 5);
  const inside = (x: number, y: number) => x >= CROP && y >= CROP && x < w - CROP && y < h - CROP;
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  let zone = 0;
  for (let y = CROP; y < h - CROP; y++) for (let x = CROP; x < w - CROP; x++) {
    if (x >= CROP + FRAME && x < w - CROP - FRAME && y >= CROP + FRAME && y < h - CROP - FRAME) continue;
    const i = y * w + x, k = key(i), c = bins.get(k) ?? { n: 0, r: 0, g: 0, b: 0 };
    c.n++; c.r += px[i * 3]; c.g += px[i * 3 + 1]; c.b += px[i * 3 + 2];
    bins.set(k, c); zone++;
  }
  const ground = [...bins.values()].filter((c) => c.n >= zone * 0.1).map((c) => [c.r / c.n, c.g / c.n, c.b / c.n]);
  const fig = new Uint8Array(w * h);
  for (let y = CROP; y < h - CROP; y++) for (let x = CROP; x < w - CROP; x++) {
    const i = y * w + x;
    fig[i] = ground.some((c) => Math.hypot(px[i * 3] - c[0], px[i * 3 + 1] - c[1], px[i * 3 + 2] - c[2]) < 48) ? 0 : 1;
  }
  // bridge gaps of up to 2 px (a slit cut in a figure, the space between two letters): parts that close read as one thing
  const raw = fig.slice();
  for (let y = CROP; y < h - CROP; y++) for (let x = CROP; x < w - CROP; x++) {
    if (raw[y * w + x]) continue;
    if ((inside(x - 1, y) && raw[y * w + x - 1]) || (inside(x + 1, y) && raw[y * w + x + 1]) || (inside(x, y - 1) && raw[(y - 1) * w + x]) || (inside(x, y + 1) && raw[(y + 1) * w + x])) fig[y * w + x] = 1;
  }
  const out: Shape[] = [], stack: number[] = [];
  for (let s = 0; s < w * h; s++) {
    if (!fig[s]) continue;
    const sh = { n: 0, x0: w, y0: h, x1: 0, y1: 0 };
    stack.push(s); fig[s] = 0;
    while (stack.length) {
      const i = stack.pop()!, x = i % w, y = (i - x) / w;
      sh.n++;
      if (x < sh.x0) sh.x0 = x; if (x > sh.x1) sh.x1 = x; if (y < sh.y0) sh.y0 = y; if (y > sh.y1) sh.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if ((dx || dy) && inside(nx, ny) && fig[ny * w + nx]) { fig[ny * w + nx] = 0; stack.push(ny * w + nx); }
      }
    }
    out.push(sh);
  }
  return out;
}

/** Measures from raw pixels: `small` is PHONE_W x PHONE_H, `big` is the same image at BIG times that size. */
export function measurePixels(small: Uint8Array, big: Uint8Array): PhoneMetrics {
  const w = PHONE_W, h = PHONE_H, L = plane(small);
  const inner: number[] = [];
  for (let y = CROP; y < h - CROP; y++) for (let x = CROP; x < w - CROP; x++) inner.push(L[y * w + x]);   // without the border band
  const sorted = Float32Array.from(inner).sort();
  const tone = sorted[Math.floor(sorted.length * 0.98)] - sorted[Math.floor(sorted.length * 0.02)];

  // the edge against the two pages: the outer ring (2 px), or the ring just inside it when the outer one matches the
  // page (an ink border on a dark page vanishes, and the ground inside it then is the edge)
  const ringLum = (from: number, to: number) => {
    let sum = 0, n = 0;
    for (let y = from; y < h - from; y++) for (let x = from; x < w - from; x++) {
      if (x >= to && x < w - to && y >= to && y < h - to) continue;
      const i = (y * w + x) * 3; sum += lum(small[i], small[i + 1], small[i + 2]); n++;
    }
    return sum / n;
  };
  const outer = ringLum(0, 2), inside = ringLum(3, 6), dark = lum(15, 15, 15);
  const edgeLight = Math.max(ratio(outer, 1), ratio(inside, 1)), edgeDark = Math.max(ratio(outer, dark), ratio(inside, dark));

  // strong edges before the shrink, and how much of them the shrink keeps (an edge's summed step is the same at any size,
  // so the per-row energy compares directly; a line thinner than a phone pixel averages into its ground and is lost)
  const bw = w * BIG, bh = h * BIG, GB = grad(plane(big), bw, bh), GS = grad(L, w, h);
  const STRONG = 6;
  let eb = 0, es = 0;
  for (let i = 0; i < GB.length; i++) if (GB[i] > STRONG) eb += GB[i];
  for (let i = 0; i < GS.length; i++) if (GS[i] > STRONG / 2) es += GS[i];
  const detailLost = eb > 0 ? Math.max(0, 1 - (es * BIG) / eb) : 0;

  // shapes: what is drawn on the ground
  const things = shapesOf(small, w, h).filter((s) => s.n >= Math.ceil(w * h * 0.0015));
  const big1 = things.reduce((a, s) => (!a || s.n > a.n ? s : a), null as (typeof things)[number] | null);

  // under the badge: edge energy there against the image's mean
  let bsum = 0, bn = 0, gsum = 0;
  let gn = 0;
  for (let y = CROP + 1; y < h - CROP - 1; y++) for (let x = CROP + 1; x < w - CROP - 1; x++) {
    const v = GS[y * w + x];
    gsum += v; gn++;
    if (x >= w * (1 - BADGE.w) && y >= h * (1 - BADGE.h)) { bsum += v; bn++; }
  }
  const mean = gsum / gn;
  return {
    tone: +tone.toFixed(1), edgeLight: +edgeLight.toFixed(2), edgeDark: +edgeDark.toFixed(2), detailLost: +detailLost.toFixed(3),
    focalH: big1 ? +((big1.y1 - big1.y0 + 1) / h).toFixed(3) : 0, focalW: big1 ? +((big1.x1 - big1.x0 + 1) / w).toFixed(3) : 0,
    shapes: things.length, badge: mean > 0 && bn ? +(bsum / bn / mean).toFixed(2) : 0,
  };
}

export function measure(src: string): PhoneMetrics | null {
  const small = rgb(src, PHONE_W, PHONE_H), big = rgb(src, PHONE_W * BIG, PHONE_H * BIG);
  return small && big ? measurePixels(small, big) : null;
}

// ───────────── reading the words back ─────────────

const OCR_SRC = path.join(import.meta.dir, "ocr.swift");
/** The compiled reader (macOS only), rebuilt when ocr.swift changes. Null when it cannot be built. */
function reader(): string | null {
  if (process.platform !== "darwin" || !fs.existsSync(OCR_SRC)) return null;
  const dir = path.join(os.homedir(), "Library/Caches/wealthgap");
  const bin = path.join(dir, "wg-ocr");
  try {
    if (fs.existsSync(bin) && fs.statSync(bin).mtimeMs >= fs.statSync(OCR_SRC).mtimeMs) return bin;
    fs.mkdirSync(dir, { recursive: true });
    const r = spawnSync("swiftc", ["-O", OCR_SRC, "-o", bin], { encoding: "utf-8" });
    return r.status === 0 && fs.existsSync(bin) ? bin : null;
  } catch { return null; }
}

/** The text lines a recogniser reads in each image (in file order), or null when no reader is available here. */
export function readWords(files: string[]): string[][] | null {
  const bin = reader();
  if (!bin || !files.length) return null;
  const r = spawnSync(bin, files, { encoding: "utf-8", timeout: 120_000 });
  if (r.status !== 0) return null;
  const rows = r.stdout.trim().split("\n").map((l) => { try { return JSON.parse(l); } catch { return null; } });
  if (rows.length !== files.length || rows.some((x) => !x)) return null;
  return rows.map((x) => (x.words ?? []).filter((w: any) => w.c >= 0.5).map((w: any) => String(w.t)));
}

const norm = (s: string) => s.toUpperCase().replace(/[^A-Z0-9%$?!+\-.]+/g, " ").trim();
/** Characters a condensed cut face makes a recogniser confuse; treated as the same when matching. */
const fold = (s: string) => s.replace(/[O0]/g, "0").replace(/[I1L|]/g, "1").replace(/[S5]/g, "5");
function distance(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
/**
 * Declared words that were not read back. A word counts as read when it appears among the read words, alone or joined
 * with its neighbours (a recogniser may split or join), allowing one wrong character in words of 5 or more.
 */
export function unreadWords(declared: string, read: string[]): string[] {
  const want = norm(declared).split(/\s+/).filter(Boolean);
  const got = read.flatMap((l) => norm(l).split(/\s+/)).filter(Boolean).map(fold);
  const joined = fold(got.join(""));
  return want.filter((w) => {
    const f = fold(w);
    if (got.includes(f) || (f.length >= 3 && joined.includes(f))) return false;
    return !(f.length >= 5 && got.some((g) => Math.abs(g.length - f.length) <= 1 && distance(g, f) <= 1));
  });
}

// ───────────── the verdict ─────────────

export interface PhoneResult { metrics: PhoneMetrics | null; read: string[] | null; unread: string[]; errors: string[]; warnings: string[] }

/** Errors reject the thumbnail; warnings are for the author and the creator to look at. */
export function judge(m: PhoneMetrics | null, text: string, read: string[] | null, readTiny: string[] | null = null): PhoneResult {
  const errors: string[] = [], warnings: string[] = [];
  let unread: string[] = [];
  if (!m) return { metrics: null, read, unread, errors: ["phone check: the image could not be measured"], warnings };
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  if (m.tone < LIMITS.toneMin) errors.push(`phone 168 px: flat (tone range ${m.tone} L*, needs ${LIMITS.toneMin}): nothing separates from the ground at this size`);
  else if (m.tone < LIMITS.toneWarn) warnings.push(`phone 168 px: low tone range (${m.tone} L*, aim ${LIMITS.toneWarn} or more): dark on a mid colour; check the focal object and the words in greyscale`);
  if (m.edgeLight < LIMITS.edgeMin) errors.push(`phone 168 px: no edge on a white page (ring contrast ${m.edgeLight}:1, needs ${LIMITS.edgeMin}:1): add a dark border or a darker ground`);
  if (m.edgeDark < LIMITS.edgeMin) errors.push(`phone 168 px: no edge on a dark page (ring contrast ${m.edgeDark}:1, needs ${LIMITS.edgeMin}:1): add a light border or a lighter ground`);
  if (m.detailLost > LIMITS.detailLostMax) errors.push(`phone 168 px: ${pct(m.detailLost)} of the drawing's edges are gone (max ${pct(LIMITS.detailLostMax)}): thin lines and small parts carry the picture; make it fewer, bigger, solid shapes`);
  else if (m.detailLost > LIMITS.detailLostWarn) warnings.push(`phone 168 px: ${pct(m.detailLost)} of the drawing's edges are gone: check that no thin line or small part carries the meaning`);
  if (m.focalH < LIMITS.focalWarn) warnings.push(`phone 168 px: the largest shape is ${pct(m.focalH)} of the height (aim ${pct(LIMITS.focalWarn)} or more): is there one dominant thing?`);
  if (m.shapes > LIMITS.shapesWarn) warnings.push(`phone 168 px: ${m.shapes} separate shapes: check it reads as one idea, not a diagram`);
  if (m.badge > LIMITS.badgeWarn) warnings.push(`phone 168 px: something sits under the duration badge (bottom-right detail ${m.badge}x the image's mean)`);
  if (text.trim()) {
    if (!read) warnings.push("phone 168 px: the words were not read back here (text recognition needs macOS with Xcode command line tools): check them by eye");
    else {
      unread = unreadWords(text, read);
      if (unread.length) errors.push(`phone 168 px: a text recogniser could not read ${unread.map((w) => `"${w}"`).join(", ")} (it read: ${read.length ? read.map((r) => `"${r}"`).join(", ") : "nothing"}): make the type bigger, looser or higher in contrast`);
      else if (readTiny) { const u = unreadWords(text, readTiny); if (u.length) warnings.push(`phone 120 px (notification size): ${u.map((w) => `"${w}"`).join(", ")} not read back`); }
    }
  }
  return { metrics: m, read, unread, errors, warnings };
}

// ───────────── the blind read (review.ts) ─────────────

/** What a viewer who saw only the 168 px image said (workflow/prompts/THUMBS_BLIND.md), plus the declared words they missed. */
export interface BlindRead { words: string[]; object: string; about: string; feeling?: string; unsure?: string; unread: string[] }
/** 07-publish/phone.blind.json: valid for a variant while its thumbnail file is the one that was read (`mtimes`). */
export interface BlindFile { at: string; agent: string; mtimes: Record<string, number>; variants: Record<string, BlindRead> }
export const BLIND_MARK = "phone 168 px, blind read:";
const unclear = (s: string | undefined) => !s || /^(unclear|unknown|nothing|n\/a|can'?t tell|cannot tell|not sure)\b/i.test(s.trim());
/** Errors from a blind read: declared words nobody could read, or a picture nobody could name. They reject the variant. */
export function blindProblems(b: BlindRead): string[] {
  const out: string[] = [];
  if (b.unread?.length) out.push(`${BLIND_MARK} a viewer who saw only the small image could not read ${b.unread.map((w) => `"${w}"`).join(", ")} (they read ${b.words?.length ? `"${b.words.join(" ")}"` : "no words"})`);
  if (unclear(b.object)) out.push(`${BLIND_MARK} a viewer who saw only the small image could not say what it shows`);
  return out;
}

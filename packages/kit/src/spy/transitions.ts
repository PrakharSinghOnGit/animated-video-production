// Chapter seams and act transitions in the Briefing style: iris, diagonal-strip ("shatter") and pixel wipes made of paper pieces,
// whip-pan act transitions with motion blur, a chapter pill and a chapter card. Never dissolves or fades.
// The wipe grammar is adapted from LemoLab's "Living Screencast" (lemo-opuscar, MIT). See CREDITS.md.
import { clamp, hash, outBack, outCubic, seg } from "../paper/lib";
import { SAFE } from "../paper/transitions";
import { W, H, INKS, clear, piece, rough, roughC, paperFinish, label, type G, type Cam, type Pt, type Inks } from "./engine";
import { camVelocity, motionBlur, scratchCanvas } from "./camera";
import { layout, drawLine, landEach } from "./glyph";
import { SPY_FONT } from "./fonts";

export type Draw = (g: G) => void;
/** A Draw that fills the frame with one ground colour (use as the "from"/"to" side of a wipe). */
export const fillScreen = (col: string): Draw => (g) => clear(g, col);

// ---------- wipes: u = 0 shows `from`, u = 1 shows `to` ----------
export const WIPE_T = 0.9;
const easeIO = (u: number) => { u = clamp(u); return u < 0.5 ? 4 * u * u * u : 1 - (-2 * u + 2) ** 3 / 2; };

/** Circle reveal: `to` grows inside an iris cut from paper with a scissor edge (+ optional coloured ring). Centre (x, y) screen px. */
export function irisWipe(g: G, u: number, from: Draw, to: Draw, o: { x?: number; y?: number; ring?: string } = {}): void {
  if (u <= 0) return from(g);
  if (u >= 1) return to(g);
  const cx = o.x ?? W / 2, cy = o.y ?? H / 2, R = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy)) * 1.02;
  const r = easeIO(u) * R, ring = rough(Array.from({ length: 110 }, (_, i) => [cx + Math.cos((i / 110) * 6.2832) * r, cy + Math.sin((i / 110) * 6.2832) * r] as Pt), 5, 2.2, 16);
  from(g); g.setTransform(1, 0, 0, 1, 0, 0);
  g.save(); g.beginPath(); g.moveTo(ring[0][0], ring[0][1]); for (let i = 1; i < ring.length; i++) g.lineTo(ring[i][0], ring[i][1]); g.closePath(); g.clip();
  to(g); g.restore(); g.setTransform(1, 0, 0, 1, 0, 0);
  if (o.ring) {
    const inner = ring.map(([x, y]) => [cx + (x - cx) * Math.max(0, 1 - 26 / Math.max(r, 30)), cy + (y - cy) * Math.max(0, 1 - 26 / Math.max(r, 30))] as Pt);
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1 - seg(u, 0.85, 1);
    piece(g, [ring.map(([x, y]) => [cx + (x - cx) * 1.0, cy + (y - cy) * 1.0] as Pt).reverse(), inner], o.ring, { gap: 0, shadow: false }); g.restore();
  }
}

/**
 * The spy "shatter": `from` is cut into diagonal paper strips that slide off alternately (each with a scissor edge and a shadow),
 * revealing `to`. angle in radians (default ~29 deg), n strips (default 9).
 */
export function stripWipe(g: G, u: number, from: Draw, to: Draw, o: { angle?: number; n?: number } = {}): void {
  if (u <= 0) return from(g);
  if (u >= 1) return to(g);
  const N = o.n ?? 9, ang = o.angle ?? 0.5, diag = Math.hypot(W, H), bw = diag / N, Lh = diag * 0.6, st = 0.07, travel = diag * 1.3;
  to(g);
  const A = scratchCanvas(1);
  from(A.g);
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < N; i++) {
    const k = easeIO(clamp((u - i * st * 0.8) / (1 - st * 0.8 * (N - 1)))) ** 1.6, ox = (i % 2 ? 1 : -1) * k * travel;
    const poly = roughC(`strip${N}${i}${Math.round(bw)}`, () => [[-Lh, -diag / 2 + i * bw - 0.5], [Lh, -diag / 2 + i * bw - 0.5], [Lh, -diag / 2 + (i + 1) * bw + 0.5], [-Lh, -diag / 2 + (i + 1) * bw + 0.5]], i * 3 + 1, 2.2, 22);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.translate(W / 2, H / 2); g.rotate(ang); g.translate(ox, 0); g.rotate(-ang); g.translate(-W / 2, -H / 2);   // the strip carries its piece of the image
    g.beginPath(); g.rect(0, 0, W, H); g.clip();                                                                    // nothing beyond the image's own edge
    g.setTransform(1, 0, 0, 1, 0, 0); g.translate(W / 2, H / 2); g.rotate(ang); g.translate(ox, 0);
    g.beginPath(); g.moveTo(poly[0][0], poly[0][1]); for (let j = 1; j < poly.length; j++) g.lineTo(poly[j][0], poly[j][1]); g.closePath();
    g.save(); g.shadowColor = "rgba(20,12,6,0.4)"; g.shadowBlur = 10; g.shadowOffsetX = 4; g.shadowOffsetY = 5; g.fillStyle = "#000"; g.fill(); g.restore();
    g.clip(); g.rotate(-ang); g.translate(-W / 2, -H / 2); g.drawImage(A.c, 0, 0);
    g.restore();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
}

/** Big square blocks of `to` grow from the bottom-left to the top-right (like the Living Screencast chapter wipe). size px (default 120). */
export function pixelWipe(g: G, u: number, from: Draw, to: Draw, o: { size?: number } = {}): void {
  if (u <= 0) return from(g);
  if (u >= 1) return to(g);
  const S = o.size ?? 120, cols = Math.ceil(W / S), rows = Math.ceil(H / S);
  from(g); g.setTransform(1, 0, 0, 1, 0, 0);
  g.save(); g.beginPath();
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const d = (c / cols) * 0.55 + ((rows - r) / rows) * 0.2 + hash(c * 13.1 + r * 7.7) * 0.12;
    const k = clamp((u * 1.4 - d) / 0.28);
    if (k <= 0) continue;
    const sz = S * k; g.rect(c * S + (S - sz) / 2, r * S + (S - sz) / 2, sz + 0.5, sz + 0.5);
  }
  g.clip(); to(g); g.restore(); g.setTransform(1, 0, 0, 1, 0, 0);
}

// ---------- act transitions ----------
/** Seconds of the whip-pan at the start and end of an act. */
export const ACT_IN = 0.6, ACT_OUT = 0.6;
/** Progress 0..1 of the act's whip-in (1 = settled; use it to hold the first beat until the whip has landed). */
export const actIn = (t: number): number => clamp(t / ACT_IN);
/** Progress 0..1 of the act's whip-out over its last ACT_OUT seconds (0 = not started). */
export const actOut = (t: number, dur: number): number => clamp((t - (dur - ACT_OUT)) / ACT_OUT);

/** Horizontal screen offset (px) of the whole frame during the act's whip in/out. dir 1: the act leaves to the left (camera pans right). */
export function actOffset(t: number, dur: number, dir: 1 | -1 = 1): number {
  const out = actOut(t, dur), inn = actIn(t);
  if (out > 0) return -dir * W * 1.15 * out ** 3;            // out: ease-in, leaves the shot at peak speed
  if (inn < 1) return dir * W * 1.15 * (1 - outCubic(inn)); // in: the mirror, arrives from the opposite side and settles
  return 0;
}
export type Seam = "whip" | "iris" | "strips" | "pixels" | "none";
export interface ActOpts {
  /** act length in seconds (ctx.duration) */
  dur: number;
  /** the act's ground colour (what scene() clears to) */
  ground: string;
  /** frames per second (ctx.fps) */
  fps?: number;
  /** the act's camera, so fast camera moves inside the act (focusCam, whip) get motion blur */
  cam?: (t: number) => Cam;
  /** direction of travel from act to act, default 1 (every act leaves left and the next arrives from the right) */
  dir?: 1 | -1;
  /** how the act starts / ends: whip-pan (default) with blur, or a wipe (chapter seam). */
  open?: Seam; close?: Seam;
  /** colour under the whip while the frame slides: previous ground at the start (`from`), next ground at the end (`to`). Default: this ground. */
  from?: string; to?: string;
  /** iris centre (screen) and ring colour */
  iris?: { x?: number; y?: number; ring?: string };
  /** drawn in screen space after the blur and before the paper finish: subtitles, chapter pill, spotlight */
  overlay?: Draw;
  /** apply the paper texture last (default true) */
  finish?: boolean;
}
const wipeFn = { iris: irisWipe, strips: stripWipe, pixels: pixelWipe } as const;

/**
 * Wrap an act so separate act compositions read as one move. scene(g) draws the whole frame (clear the ground, apply the camera,
 * draw the set, puppets, type). Act start: whip-pan in from the right with motion blur (first ACT_IN s) or a wipe over `from`
 * (WIPE_T s); act end: whip-pan out to the left (last ACT_OUT s) or a wipe to `to`. Then overlay(g), then the paper finish.
 */
export function drawAct(g: G, ctx: { t: number; fps?: number }, o: ActOpts, scene: Draw): void {
  const t = ctx.t, fps = o.fps ?? ctx.fps ?? 30, open = o.open ?? "whip", close = o.close ?? "whip", dir = o.dir ?? 1;
  const run: Draw = (h) => { h.save(); scene(h); h.restore(); h.setTransform(1, 0, 0, 1, 0, 0); };
  const wOpen = open !== "whip" && open !== "none" && t < WIPE_T, wClose = close !== "whip" && close !== "none" && t > o.dur - WIPE_T;
  if (wOpen || wClose) {
    const kind = wOpen ? open : close, f = wipeFn[kind as "iris"], u = wOpen ? t / WIPE_T : 1 - (t - (o.dur - WIPE_T)) / WIPE_T;
    const mine: Draw = run, other = fillScreen(wOpen ? o.from ?? o.ground : o.to ?? o.ground);
    const ex = kind === "iris" ? o.iris : undefined;
    if (wOpen) (f as any)(g, clamp(u), other, mine, ex ?? {}); else (f as any)(g, 1 - clamp(u), mine, other, ex ?? {});
  } else {
    const dx = (open === "whip" || close === "whip") ? actOffset(t, o.dur, dir) : 0;
    const cv = o.cam ? camVelocity(o.cam, t, fps) : ([0, 0] as Pt);
    const fv = (actOffset(t + 0.5 / fps, o.dur, dir) - actOffset(t - 0.5 / fps, o.dur, dir)) || 0;
    const v: Pt = [cv[0] + fv, cv[1]];
    if (dx === 0 && Math.hypot(v[0], v[1]) < 66) run(g);
    else {
      const A = scratchCanvas(0);
      run(A.g);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.shadowColor = "transparent";
      g.fillStyle = dx !== 0 && t < o.dur / 2 ? o.from ?? o.ground : dx !== 0 ? o.to ?? o.ground : o.ground; g.fillRect(0, 0, W, H); g.restore();
      motionBlur(g, A.c, v, { dx });
    }
  }
  o.overlay?.(g);
  if (o.finish ?? true) paperFinish(g);
}

// ---------- chapter pill and card ----------
/**
 * Small cut-paper tag, top-left, in screen space: a hot block with the number and a warm block with the title ("01 | TITLE").
 * progress 0..1 slides it in from the left (stays when 1; animate it back out yourself with 1 - x).
 */
export function chapterPill(g: G, n: number, title: string, progress: number, inks: Inks = INKS.noir): void {
  if (progress <= 0) return;
  const x0 = SAFE.x0, y0 = SAFE.y0, h = 56, num = String(n).padStart(2, "0"), t = title.toUpperCase();
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.font = `700 27px "${SPY_FONT.sans}"`; (g as any).letterSpacing = "3px";
  const tw = g.measureText(t).width, nw = g.measureText(num).width, a = 74, b = tw + 52;
  const slide = -(a + b + x0 + 40) * (1 - outBack(clamp(progress), 1.1));
  g.translate(slide, 0);
  piece(g, roughC(`pillA${a}`, () => [[x0, y0], [x0 + a, y0 - 1], [x0 + a, y0 + h], [x0, y0 + h + 1]] as Pt[], 61, 1.2, 12), inks.hot);
  piece(g, roughC(`pillB${Math.round(b)}`, () => [[x0 + a, y0 - 1], [x0 + a + b, y0 + 1], [x0 + a + b + 13, y0 + h / 2], [x0 + a + b, y0 + h - 1], [x0 + a, y0 + h]] as Pt[], 62, 1.2, 12), inks.warm);
  label(g, num, x0 + a / 2 - nw / 2, y0 + 38, `700 27px "${SPY_FONT.sans}"`, inks.paper, "left", 3);
  label(g, t, x0 + a + 26, y0 + 38, `700 27px "${SPY_FONT.sans}"`, inks.ink, "left", 3);
  g.restore();
}

/**
 * Full-frame chapter card for the silent pause before a chapter: the number and the title assembled from cut League Gothic letters
 * on an ink ground with hot diagonal strips. progress 0..1 over the pause (letters land 0 to ~0.65, then hold). Clears its own ground.
 */
export function chapterCard(g: G, n: number, title: string, progress: number, inks: Inks = INKS.noir): void {
  const tt = clamp(progress) * 2.2;
  clear(g, inks.ink);
  g.setTransform(1, 0, 0, 1, 0, 0);
  for (let i = 0; i < 3; i++) {                                   // the grid motif: three slanted hot strips, sliding in from the top
    const k = outCubic(seg(tt, i * 0.12, 0.7 + i * 0.12)), x = 1480 + i * 62, y = -420 * (1 - k);
    piece(g, roughC(`cc${i}`, () => [[x, 0], [x + 36, 0], [x - 170, 640], [x - 206, 640]] as Pt[], 90 + i, 1, 12).map(([px, py]) => [px, py + y] as Pt), i === 1 ? inks.warm : inks.hot, { gap: 0 });
  }
  const sub = layout("CHAPTER", 74, { track: 0.12 }), num = layout(String(n).padStart(2, "0"), 430);
  drawLine(g, sub, 150, 262, { col: inks.hot, seed: 3, jit: 0.8, each: landEach(tt, 0.05, { stagger: 0.04, dur: 0.2, rise: 80 }) });
  drawLine(g, num, 140, 640, { col: inks.warm, seed: 7, jit: 1, each: landEach(tt, 0.2, { stagger: 0.1, dur: 0.3, rise: 260 }) });
  const probe = layout(title.toUpperCase(), 100), size = Math.min(300, (1500 / Math.max(1, probe.width)) * 100);
  const lay = layout(title.toUpperCase(), size);
  drawLine(g, lay, 150, 930, { col: inks.paper, seed: 11, jit: 1, each: landEach(tt, 0.6, { stagger: 0.05, dur: 0.25, rise: 240 }) });
  const ruleK = outCubic(seg(tt, 1.2, 1.7));
  if (ruleK > 0) piece(g, roughC("ccRule", () => [[150, 968], [1770, 966], [1770, 976], [150, 978]] as Pt[], 4, 1, 14).map(([x, y]) => [150 + (x - 150) * ruleK, y] as Pt), inks.paperD, { gap: 0, shadow: false });
}


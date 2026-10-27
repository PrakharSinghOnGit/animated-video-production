// Subtitles in the Briefing style: a narrow scissor-cut paper strip at the bottom left, tilted about -1 degree, with a small cut
// bullet. Same chunking as paper's autoCaption (sentences, <= 12 words, timed from word starts).
import { captionChunks, activeChunk } from "../paper/transitions";
import { clamp, outCubic } from "../paper/lib";
import { INKS, luma, piece, roughC, withBg, type G, type Pt, type Inks } from "./engine";
import { SPY_FONT } from "./fonts";

const FONT = `600 44px "${SPY_FONT.sans}"`;
const LINE_H = 58, MAX_LINE = 1480, BOTTOM = 1052, X0 = 96;

function wrap(g: G, words: string[]): string[] {
  const lines: string[] = []; let cur = "";
  for (const w of words) {
    const next = cur ? cur + " " + w : w;
    if (cur && g.measureText(next).width > MAX_LINE) { lines.push(cur); cur = w; } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
/**
 * The subtitle for whatever is being said at ctx.t. `ground` = the act's ground colour: a light strip on dark grounds, a dark strip
 * on light ones. The strip never reaches above y = 900 (at most two lines). Slides in from the left in 0.18 s, out in 0.15 s.
 * Draw it in screen space after the scene (drawAct's overlay). `ctx.words` come from the PaperCtx.
 */
export function autoSubtitle(g: G, ctx: { t: number; words: { w: string; t: number; t1: number }[] }, o: { ground: string; inks?: Inks; maxWords?: number }): void {
  const chunks = captionChunks(ctx.words, o.maxWords ?? 12), i = activeChunk(chunks, ctx.t);
  if (i < 0) return;
  const c = chunks[i], t0 = c[0].t - 0.15;
  const end = i < chunks.length - 1 ? chunks[i + 1][0].t - 0.45 : c[c.length - 1].t + 1.2;
  if (ctx.t > end + 0.15) return;
  const inks = o.inks ?? INKS.noir, dark = luma(o.ground) < 0.4;
  const fill = dark ? inks.paper : inks.ink, txt = dark ? inks.ink : inks.paper;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.font = FONT;
  const lines = wrap(g, c.map((w) => w.w)), textW = Math.max(...lines.map((l) => g.measureText(l).width));
  const right = X0 + 40 + textW + 50, sw = right + 60, sh = lines.length * LINE_H + 34, top = BOTTOM - sh;
  const k = outCubic(clamp((ctx.t - t0) / 0.18)), kOut = clamp((ctx.t - end) / 0.15);
  const slide = -(X0 + sw + 40) * (1 - k) - (X0 + sw + 40) * kOut * kOut;
  g.translate(slide, 0); g.translate(right, BOTTOM); g.rotate((-1 * Math.PI) / 180); g.translate(-right, -BOTTOM);   // pivot on the right end: the tilt lowers the left end instead of lifting the right one above y 900
  const key = `sub${i}${Math.round(right)}${lines.length}`;
  const poly = roughC(key, () => [[-60, top], [right, top - 1], [right + 8, top + sh / 2], [right, BOTTOM + 1], [-60, BOTTOM]] as Pt[], 20 + (i % 7), 1.4, 12);
  withBg(g, o.ground, () => piece(g, poly, fill));
  const bx = X0 + 6, by = top + sh / 2 - 2;                                           // cut bullet: a small hot diamond
  withBg(g, fill, () => piece(g, roughC("subBullet", () => [[0, -13], [13, 0], [0, 13], [-13, 0]] as Pt[], 33, 0.6, 6).map(([x, y]) => [x + bx, y + by] as Pt), inks.hot, { gap: 0, shadow: false }));
  g.fillStyle = txt; g.textBaseline = "alphabetic"; g.textAlign = "left";
  lines.forEach((l, j) => g.fillText(l, X0 + 40, top + 17 + LINE_H * (j + 1) - 15));
  g.restore();
}

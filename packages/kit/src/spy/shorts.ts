/**
 * Shorts (9:16) helpers for the Briefing engine. Shorts are watched with the sound off as often as on, so unlike the
 * long-form video they carry kinetic captions: 1–3 spoken words at a time, cut League Gothic on a scissor-cut paper strip,
 * the word being spoken in the hot ink. Screen space: call inside drawAct's `overlay`.
 */
import { W, H, SAFE, piece, roughC, clamp, seg, outBack, hash, type G, type Pt, type Inks } from "./engine";
import { layout, drawLine } from "./glyph";

export interface CapWord { w: string; t: number; t1: number }

/** Caption chunks: at most `maxWords` words, broken at sentence/clause ends and at pauses longer than `gap` s. */
export function shortChunks(words: CapWord[], maxWords = 3, gap = 0.35): CapWord[][] {
  const out: CapWord[][] = [];
  let cur: CapWord[] = [];
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    if (cur.length >= maxWords || /[.!?,;:]["')\]]*$/.test(w.w) || (next && next.t - w.t1 > gap)) { out.push(cur); cur = []; }
  });
  if (cur.length) out.push(cur);
  return out;
}

/** Display form of a spoken word: upper case, no surrounding quotes or trailing commas/full stops (keeps "9.6", "$", "%", "?"). */
export const capText = (w: string): string => w.replace(/^[“"'‘(]+|[”"'’),.;:]+$/g, "").toUpperCase();

export interface ShortCaptionOpts {
  /** strip = paper, letters = ink, the spoken word = hot (the chapter's ink set) */
  inks: Inks;
  /** baseline in screen px (default: 74% of the frame height, inside the 9:16 safe area) */
  y?: number;
  /** em size in px (default 128: ~97 px capitals); shrinks to fit the safe width */
  size?: number;
  maxWords?: number;
  /** colour of the spoken word (default inks.hot) */
  active?: string;
  /** return true to hide the caption at time t (while a big impact number says the same thing) */
  hideAt?: (t: number) => boolean;
}

/**
 * Kinetic caption for the words being spoken at ctx.t. Each chunk stamps in (scale 1.25 → 1 with a small overshoot) just before
 * its first word and stays until the next chunk starts; the strip's cut and tilt change per chunk.
 */
export function shortCaption(g: G, ctx: { t: number; words: CapWord[] }, o: ShortCaptionOpts): void {
  const t = ctx.t, chunks = shortChunks(ctx.words, o.maxWords ?? 3);
  const i = chunks.findIndex((c, k) => t >= c[0].t - 0.08 && (k === chunks.length - 1 ? t < c[c.length - 1].t1 + 0.6 : t < chunks[k + 1][0].t - 0.08));
  if (i < 0 || o.hideAt?.(t)) return;
  const c = chunks[i], words = c.map((w) => capText(w.w)).filter(Boolean);
  if (!words.length) return;
  const maxW = SAFE.x1 - SAFE.x0 - 80;
  let size = o.size ?? 128;
  let lays = words.map((w) => layout(w, size)), space = size * 0.22;
  const total = () => lays.reduce((s, l) => s + l.width, 0) + space * (lays.length - 1);
  if (total() > maxW) { size = Math.max(56, size * (maxW / total())); lays = words.map((w) => layout(w, size)); space = size * 0.22; }
  const tw = total(), cx = (SAFE.x0 + SAFE.x1) / 2, y = o.y ?? Math.round(H * 0.74);
  const pop = outBack(clamp(seg(t, c[0].t - 0.08, c[0].t + 0.06)), 1.6), sc = 1.25 - 0.25 * pop;
  const tilt = (hash(i * 7.7) - 0.5) * 0.05;
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.translate(cx, y - size * 0.3); g.rotate(tilt); g.scale(sc, sc); g.translate(-cx, -(y - size * 0.3));
  // the strip: paper cut a little wider than the words, its edge cut once per chunk shape
  const padX = size * 0.28, top = y - size * 0.86, bot = y + size * 0.2, x0 = cx - tw / 2 - padX, x1 = cx + tw / 2 + padX;
  const strip = roughC(`shortCap${i}_${Math.round(tw)}_${Math.round(size)}`, () => [[0, 0], [x1 - x0, -6], [x1 - x0 + 8, bot - top], [-4, bot - top + 4]] as Pt[], 600 + i, 2.2, 22);
  piece(g, strip.map(([px, py]) => [px + x0, py + top] as Pt), o.inks.paper, { gapCol: o.inks.ink, shA: 0.45 });
  // the words, the one being spoken in the hot ink
  const now = c.reduce((k, w, j) => (t >= w.t - 0.05 ? j : k), 0);
  let x = cx - tw / 2;
  lays.forEach((lay, j) => {
    drawLine(g, lay, x, y, { col: j === now ? (o.active ?? o.inks.hot) : o.inks.ink, seed: 40 + i * 5 + j, jit: 0.6 });
    x += lay.width + space;
  });
  g.restore();
}

/** True when the frame is 9:16 (a short). */
export const vertical = (): boolean => H > W;

/**
 * Act transitions shared by every act, so the video reads as one continuous move:
 * each act opens on the desk with its sheet arriving from the right and the camera
 * descending onto it, and closes by lifting off and travelling on to the right.
 * The camera always travels right, so act → act is one pan along the desk.
 */
import { W, H, P, FONT, drawDesk, sheet, caption, camPath, setType, pencilStroke, type Cam, type Rect } from "./engine";
import { seg, lerp, inOutCubic } from "./lib";

export const ACT_IN = 0.9;
export const ACT_OUT = 0.9;

/** Camera that frames the whole sheet with some desk around it. */
export function deskView(rect: Rect): Cam {
  const [x0, y0, x1, y1] = rect;
  const zoom = Math.min(W / ((x1 - x0) * 1.3), H / ((y1 - y0) * 1.3));
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, zoom, roll: 0 };
}

function mix(a: Cam, b: Cam, u: number): Cam {
  return {
    x: lerp(a.x, b.x, u),
    y: lerp(a.y, b.y, u),
    zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), u)),
    roll: lerp(a.roll || 0, b.roll || 0, u),
  };
}

/**
 * Wrap the act's own camera path with the standard entry and exit.
 * `cam` is the act's camera at time t; `dur` the act length; `rect` the act's sheet.
 */
export function actCamera(cam: (t: number) => Cam, t: number, dur: number, rect: Rect): Cam {
  const desk = deskView(rect);
  const travel = (W / desk.zoom) * 0.75;
  const enter = { ...desk, x: desk.x - travel };
  const exit = { ...desk, x: desk.x + travel };
  if (t < ACT_IN) {
    const u = inOutCubic(seg(t, 0, ACT_IN));
    // first half: slide across the desk to the sheet; second half: descend into the act's first shot
    return u < 0.5 ? mix(enter, desk, u * 2) : mix(desk, cam(ACT_IN), (u - 0.5) * 2);
  }
  if (t > dur - ACT_OUT) {
    const u = inOutCubic(seg(t, dur - ACT_OUT, dur));
    return u < 0.5 ? mix(cam(dur - ACT_OUT), desk, u * 2) : mix(desk, exit, (u - 0.5) * 2);
  }
  return cam(t);
}

/** Desk + the act's sheet. Call first in every act's draw(), then draw the act on the sheet. */
export function drawActStage(g: CanvasRenderingContext2D, cam: Cam, rect: Rect): void {
  drawDesk(g, cam);
  sheet(g, rect[0], rect[1], rect[2], rect[3]);
}

/**
 * The figure caption for whatever is being said at t: sentences split into chunks of
 * ≤ 12 words, each shown from just before its first word until the next chunk starts.
 * Drawn on a cream paper slip so it stays readable over the desk during transitions.
 */
export function autoCaption(
  g: CanvasRenderingContext2D,
  ctx: { t: number; words: { w: string; t: number; t1: number }[] },
  o: { kicker?: string; maxWords?: number } = {}
): void {
  const maxWords = o.maxWords ?? 12;
  const chunks: { w: string; t: number }[][] = [];
  let cur: { w: string; t: number }[] = [];
  for (const w of ctx.words) {
    cur.push({ w: w.w, t: w.t });
    if (/[.!?]["')\]]*$/.test(w.w) || cur.length >= maxWords) { chunks.push(cur); cur = []; }
  }
  if (cur.length) chunks.push(cur);
  const i = chunks.findIndex((c, k) => ctx.t >= c[0].t - 0.15 && (k === chunks.length - 1 || ctx.t < chunks[k + 1][0].t - 0.15));
  if (i < 0) return;
  const c = chunks[i];
  const end = i < chunks.length - 1 ? chunks[i + 1][0].t - 0.45 : c[c.length - 1].t + 1.2;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.fillStyle = "rgba(70,50,30,0.10)"; g.fillRect(150, 913, 1500, 120);
  g.fillStyle = P.paper; g.globalAlpha = 0.96; g.fillRect(146, 908, 1500, 120);
  g.restore();
  caption(g, c, ctx.t, { x: 180, y: 990, size: 40, maxW: 1420, kicker: o.kicker ?? "", t0: c[0].t - 0.15, t1: end });
}

/**
 * Screen-space safe area: content must stay inside it. The bottom band (y > 890)
 * belongs to the caption slip.
 */
export const SAFE = { x0: 96, y0: 72, x1: W - 96, y1: 890 };

/**
 * Camera that fits a world-space rect inside the safe area. `fill` is how much of the
 * safe area the rect takes (0.85 leaves breathing room). Frame regions, never raw x/y/zoom:
 * whatever is drawn inside the rect is guaranteed to be on screen and large.
 */
export function frameRect(rect: Rect, fill = 0.85, roll = 0): Cam {
  const [x0, y0, x1, y1] = rect;
  const sw = SAFE.x1 - SAFE.x0, sh = SAFE.y1 - SAFE.y0;
  const zoom = fill * Math.min(sw / Math.max(1, x1 - x0), sh / Math.max(1, y1 - y0));
  const scx = (SAFE.x0 + SAFE.x1) / 2, scy = (SAFE.y0 + SAFE.y1) / 2;
  return { x: (x0 + x1) / 2 - (scx - W / 2) / zoom, y: (y0 + y1) / 2 - (scy - H / 2) / zoom, zoom, roll };
}

export interface ShotKey {
  t: number;
  /** world rect to frame (preferred) */
  rect?: Rect;
  fill?: number;
  /** or an explicit camera, for a punch-in or a deliberate crop */
  cam?: Cam;
  ease?: (t: number) => number;
}

/** Keyframed camera over framed regions: each key frames a rect (or holds an explicit cam). */
export function shots(keys: ShotKey[]): (t: number) => Cam {
  return camPath(
    keys.map((k) => {
      const c = k.cam ?? frameRect(k.rect!, k.fill ?? 0.85);
      return { t: k.t, x: c.x, y: c.y, zoom: c.zoom, roll: c.roll, ease: k.ease };
    })
  );
}

/**
 * Chapter card, drawn in world space at (x, y) = top-left of the title block, while the
 * narration pauses before a chapter: "CHAPTER 02" in mono, the title set large in Fraunces,
 * then a double rule ruled under it. Frame it with `frameRect(chapterRect(x, y, title))`.
 * progress 0..1 over the pause (typeset ~0–0.45, rule 0.45–0.8, then hold).
 */
export function chapterCard(g: CanvasRenderingContext2D, x: number, y: number, n: number, title: string, progress: number): void {
  const p = Math.max(0, Math.min(1, progress));
  setType(g, `CHAPTER ${String(n).padStart(2, "0")}`, x, y, { size: 30, font: FONT.mono, color: P.red, track: 6, progress: seg(p, 0, 0.2), rise: 8 });
  setType(g, title, x, y + 118, { size: 104, font: FONT.type, weight: 600, color: P.ink, progress: seg(p, 0.08, 0.45), rise: 18 });
  const w = Math.max(600, title.length * 52);
  pencilStroke(g, [[x, y + 168], [x + w, y + 168]], { color: P.ink, width: 2.4, progress: seg(p, 0.45, 0.7), seed: n * 7, wobble: 0.3 });
  pencilStroke(g, [[x, y + 182], [x + w, y + 182]], { color: P.ink, width: 1.4, progress: seg(p, 0.55, 0.8), seed: n * 7 + 1, wobble: 0.3 });
}

/** World rect around a chapter card at (x, y), for framing it with frameRect/shots. */
export function chapterRect(x: number, y: number, title: string): Rect {
  return [x - 80, y - 90, x + Math.max(600, title.length * 52) + 80, y + 260];
}

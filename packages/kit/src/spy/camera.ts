// Camera grammar adapted from LemoLab's "Living Screencast" (lemo-opuscar, MIT): a continuous camera that follows the action,
// smooth eased moves, push-ins with a spotlight freeze, whip-pans with directional motion blur. See CREDITS.md.
// Everything is a pure function of time.
import { breathe } from "../paper/engine";
import { frameRect, moveTime as moveTime1 } from "../paper/transitions";
import { clamp, lerp, inOutCubic, seg } from "../paper/lib";
import { W, H, frameCanvas, w2s, rough, type G, type Cam, type Rect, type Pt } from "./engine";

// ---------- focusCam: follow the action ----------
/** One action of the act: something cut, placed, assembled or acted in world rect `rect` from t0 to t1 (seconds). */
export interface Focus {
  t0: number; t1: number; rect: Rect;
  /** how much of the safe area the rect fills, default 0.85 */
  fill?: number;
  /** held camera roll for this action in radians, clamped to +-6 degrees (a strong diagonal on a hold). Default 0. */
  roll?: number;
}
/** Largest camera roll focusCam holds (STYLE.md: "a camera roll up to ~6 deg on a hold"). */
export const MAX_ROLL = (6 * Math.PI) / 180;
export interface FocusOpts {
  /** seconds the camera stays on an action after its t1 before it may leave (default 0.6) */
  hold?: number;
  /** default fill for actions without their own (0.85) */
  fill?: number;
  /** a move arrives this long before the next action starts, if there is room (default 0.25) */
  lead?: number;
  /** slow hand-held drift while holding, fraction (default 0.012; 0.02 = 2% over 10 s) */
  drift?: number;
  /** move-time multiplier (default 1 = 1.1–2.8 s moves). Shorts use ~0.45 (0.5–1.3 s): snappier, still eased and still never
   *  leaving unfinished work; actions closer than a (scaled) move still merge into one frame. */
  pace?: number;
  /** shorts: actions too close for a full move get a quicker move (down to 0.3 s, cutting into the hold) instead of merging into
   *  one wide frame; only overlapping actions still merge. Keeps every action framed tight at short-form tempo. */
  snap?: boolean;
  /**
   * Keep subjects large: two actions too close for a calm move are normally merged into one union frame, which can be so wide
   * that everything in it turns tiny. With `widest` (0..1, try 0.6) the merge is refused when the union frame would be zoomed
   * out past `widest` x the wider of the two actions; the camera then stays on the first action until it is finished and makes
   * a quick move (a whip with motion blur, at least 0.3 s) to the second. Overlapping actions still merge. Default: off.
   */
  widest?: number;
}
export interface FocusPlan {
  /** the actions after merging (actions too close for a move share one wider frame) */
  dwells: { t0: number; t1: number; leave: number; rect: Rect; cam: Cam; /** reached by a quick move (widest) */ quick?: boolean }[];
  moves: { start: number; end: number; from: Cam; to: Cam }[];
}
/** Shortest camera move (snap / widest), seconds. */
const QUICK = 0.3;
const union = (a: Rect, b: Rect): Rect => [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];

/**
 * Plan the camera. Guarantees by construction: (1) the camera frames an action's rect from the moment the move to it ends until
 * t1 + hold, so it never leaves while something is still being drawn there; (2) every move ends by the next action's t0 (it
 * starts earlier, never later); (3) every move takes at least moveTime() (1.1-2.8 s); (4) if two actions are too close for a
 * move (or overlap), they are merged into one union frame instead of rushing.
 */
export function planFocus(focus: Focus[], o: FocusOpts = {}): FocusPlan {
  const hold = o.hold ?? 0.6, lead = o.lead ?? 0.25, fill0 = o.fill ?? 0.85, pace = o.pace ?? 1;
  const moveTime = (a: Cam, b: Cam) => moveTime1(a, b) * pace;
  let acts = [...focus].sort((a, b) => a.t0 - b.t0).map((f) => ({ t0: f.t0, t1: Math.max(f.t0, f.t1), rect: f.rect, fill: f.fill ?? fill0, roll: clamp(f.roll ?? 0, -MAX_ROLL, MAX_ROLL), quick: false }));
  const cam = (a: { rect: Rect; fill: number; roll: number }) => frameRect(a.rect, a.fill, a.roll);
  // widest: would merging a and b zoom out too far? (only for actions that don't overlap and leave room for a quick move)
  const tooWide = (a: (typeof acts)[number], b: (typeof acts)[number]): boolean => {
    if (!o.widest || b.t0 - a.t1 < QUICK) return false;
    const u = frameRect(union(a.rect, b.rect), Math.min(a.fill, b.fill)).zoom;
    return u < o.widest * Math.min(cam(a).zoom, cam(b).zoom);
  };
  for (let again = true; again && acts.length > 1;) {
    again = false;
    for (let i = 0; i < acts.length - 1; i++) {
      const a = acts[i], b = acts[i + 1];
      if (o.snap ? b.t0 < a.t1 : b.t0 - (a.t1 + hold) < moveTime(cam(a), cam(b))) {
        if (!o.snap && tooWide(a, b)) { b.quick = true; continue; }
        acts.splice(i, 2, { t0: Math.min(a.t0, b.t0), t1: Math.max(a.t1, b.t1), rect: union(a.rect, b.rect), fill: Math.min(a.fill, b.fill), roll: a.roll, quick: a.quick });
        again = true; break;
      }
    }
  }
  const dwells = acts.map((a) => ({ t0: a.t0, t1: a.t1, leave: a.t1 + hold, rect: a.rect, cam: cam(a), quick: a.quick }));
  const moves: FocusPlan["moves"] = [];
  for (let i = 0; i < dwells.length - 1; i++) {
    const a = dwells[i], b = dwells[i + 1];
    let need = moveTime(a.cam, b.cam), start = Math.max(a.leave, b.t0 - need - lead);
    if ((o.snap || b.quick) && start + need > b.t0) { need = Math.max(QUICK, Math.min(need, b.t0 - a.t1)); start = b.t0 - need; }
    moves.push({ start, end: start + need, from: a.cam, to: b.cam });
  }
  return { dwells, moves };
}
const plans = new WeakMap<Focus[], Map<string, FocusPlan>>();
function planOf(focus: Focus[], o: FocusOpts): FocusPlan {
  let m = plans.get(focus); if (!m) { m = new Map(); plans.set(focus, m); }
  const k = JSON.stringify(o); let p = m.get(k); if (!p) { p = planFocus(focus, o); m.set(k, p); }
  return p;
}
const mix = (a: Cam, b: Cam, u: number): Cam => ({ x: lerp(a.x, b.x, u), y: lerp(a.y, b.y, u), zoom: Math.exp(lerp(Math.log(a.zoom), Math.log(b.zoom), u)), roll: lerp(a.roll || 0, b.roll || 0, u) });

/** Camera at time t for the act's actions (see planFocus for the guarantees). Pure function of t; drifts slowly while holding. */
export function focusCam(t: number, focus: Focus[], o: FocusOpts = {}): Cam {
  if (!focus.length) return { x: W / 2, y: H / 2, zoom: 1, roll: 0 };
  const p = planOf(focus, o);
  let c = p.dwells[0].cam;
  for (const m of p.moves) {
    if (t < m.start) break;
    c = t >= m.end ? m.to : mix(m.from, m.to, inOutCubic(seg(t, m.start, m.end)));
  }
  return breathe({ ...c, roll: c.roll || 0 }, t, o.drift ?? 0.012);
}
/** focusCam bound to its actions, as (t) => Cam (pass to drawAct's `cam` so whips get motion blur). */
export const focusCamFn = (focus: Focus[], o: FocusOpts = {}) => (t: number): Cam => focusCam(t, focus, o);

// ---------- rects from the things you draw ----------
/** Smallest rect around rects and points: `rectOf(lineRect(lay, x, y), figureRect(fx, FLOOR, 0.6), [coinX, coinY])`. */
export function rectOf(...items: (Rect | Pt)[]): Rect {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of items) {
    x0 = Math.min(x0, r[0]); y0 = Math.min(y0, r[1]);
    x1 = Math.max(x1, r.length === 4 ? r[2] : r[0]); y1 = Math.max(y1, r.length === 4 ? r[3] : r[1]);
  }
  return [x0, y0, x1, y1];
}
/** Grow a rect by px on every side (or px left/right and py top/bottom): air around a subject, room for something about to land. */
export const padRect = (r: Rect, px: number, py: number = px): Rect => [r[0] - px, r[1] - py, r[2] + px, r[3] + py];
/** World rect of a figureSide puppet standing with its feet at (x, y) at scale s (hat included). */
export const figureRect = (x: number, y: number, s: number): Rect => [x - 130 * s, y - 540 * s * 1.06, x + 130 * s, y];

// ---------- push-in + spotlight ----------
/** Push the camera from `cam` into world rect (fill 0.55 = the rect takes about half the safe area), eased. u 0..1. */
export function pushIn(cam: Cam, rect: Rect, u: number, fill = 0.55): Cam {
  return mix(cam, frameRect(rect, fill), inOutCubic(u));
}
/** World rect to screen bounding rect for a camera. */
export function rectToScreen(cam: Cam, rect: Rect): Rect {
  const a = w2s(cam, rect[0], rect[1]), b = w2s(cam, rect[2], rect[1]), c = w2s(cam, rect[2], rect[3]), d = w2s(cam, rect[0], rect[3]);
  const xs = [a[0], b[0], c[0], d[0]], ys = [a[1], b[1], c[1], d[1]];
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
/**
 * Spotlight freeze for the one number to remember: everything outside the (screen-space) rect is covered by a sheet of dark paper
 * with a scissor-cut window. Flat, no gradient. amount 0..1 (use ~0.7 for the freeze). Draw it after the scene, before the subtitle.
 * `{ shape: "round" }` cuts an ellipse instead of the rounded box (prefer it around type: a box around a number reads as a card).
 */
export function spotlight(g: G, rect: Rect, amount: number, color = "#1b1714", pad = 56, o: { shape?: "box" | "round" } = {}): void {
  if (amount <= 0.001) return;
  const [x0, y0, x1, y1] = [rect[0] - pad, rect[1] - pad, rect[2] + pad, rect[3] + pad], r = Math.min(70, (y1 - y0) / 3);
  const hole: Pt[] = [];
  if (o.shape === "round") {
    // a cut ellipse around the rect (a stage spotlight); the default rounded box can read as a card with text in it
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = ((x1 - x0) / 2) * 1.3, ry = Math.max(((y1 - y0) / 2) * 1.42, rx * 0.5);
    for (let i = 0; i < 72; i++) { const a = (i / 72) * Math.PI * 2; hole.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); }
  } else {
    const corner = (cx: number, cy: number, a0: number) => { for (let i = 0; i <= 6; i++) { const a = a0 + (i / 6) * (Math.PI / 2); hole.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    corner(x1 - r, y0 + r, -Math.PI / 2); corner(x1 - r, y1 - r, 0); corner(x0 + r, y1 - r, Math.PI / 2); corner(x0 + r, y0 + r, Math.PI);
  }
  const cut = rough(hole, 7, 2.2, 14);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.beginPath(); g.rect(0, 0, W, H); g.moveTo(cut[0][0], cut[0][1]); for (let i = 1; i < cut.length; i++) g.lineTo(cut[i][0], cut[i][1]); g.closePath();
  g.globalAlpha = clamp(amount) * 0.78; g.fillStyle = color; g.fill("evenodd"); g.restore();
}

// ---------- whip-pan + motion blur ----------
/** Fast-in/fast-out curve (ease-in-out quint): slow ends, very fast middle. */
export const whipEase = (u: number): number => { u = clamp(u); return u < 0.5 ? 16 * u ** 5 : 1 - (-2 * u + 2) ** 5 / 2; };
/** Camera interpolation a to b for a whip-pan, u 0..1 (zoom in log space). Pair with drawAct's blur or motionBlur. */
export function whip(a: Cam, b: Cam, u: number): Cam { return mix(a, b, whipEase(u)); }
/** Screen displacement of the scene in px per frame at time t, from a camera function (content moves opposite to the camera). */
export function camVelocity(cam: (t: number) => Cam, t: number, fps: number): Pt {
  const c0 = cam(t - 0.5 / fps), c1 = cam(t + 0.5 / fps), z = (c0.zoom + c1.zoom) / 2;
  return [-(c1.x - c0.x) * z, -(c1.y - c0.y) * z];
}
let scratch: OffscreenCanvas[] = [];
/** Reusable full-frame offscreen canvas (index 0 and 1 are used by drawAct and the wipes; never hold one across calls). */
export function scratchCanvas(i = 0): { c: OffscreenCanvas; g: G } {
  const c = (scratch[i] = frameCanvas(scratch[i] ?? null));
  const g = c.getContext("2d") as unknown as G;
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = "source-over"; g.filter = "none"; g.shadowColor = "transparent"; g.clearRect(0, 0, W, H);
  return { c, g };
}
/**
 * Draw `src` (a finished frame, offscreen) onto g with directional motion blur along `vel` (px per frame). Blur length is half the
 * displacement (a 180 degree shutter) minus a dead zone, so ordinary moves (< ~60 px/frame) stay perfectly sharp. (dx, dy) = where the
 * frame sits. Fill g with the backdrop colour first: the edges the blur uncovers show it.
 */
export function motionBlur(g: G, src: CanvasImageSource, vel: Pt, opt: { dx?: number; dy?: number; dead?: number; max?: number } = {}): void {
  const dx = opt.dx ?? 0, dy = opt.dy ?? 0, sp = Math.hypot(vel[0], vel[1]);
  const L = Math.min(opt.max ?? 260, Math.max(0, sp - (opt.dead ?? 60)) * 0.5);
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  if (L < 4) { g.drawImage(src, dx, dy); g.restore(); return; }
  const n = Math.round(clamp(L / 3, 6, 48)), ux = vel[0] / sp, uy = vel[1] / sp;
  for (let k = 0; k < n; k++) {                              // progressive averaging: sample k at alpha 1/(k+1) = the mean of all samples
    const o = (k / (n - 1) - 0.5) * L;
    g.globalAlpha = 1 / (k + 1); g.drawImage(src, dx + ux * o, dy + uy * o);
  }
  g.restore();
}

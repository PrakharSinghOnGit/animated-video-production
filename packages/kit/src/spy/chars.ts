// Silhouette puppet: a figure about 7 heads tall in a hat and coat, one accent-colour streamer (the tie). Limbs are separate paper
// pieces with cut slits at the joints, merged into one contour by silhouette(). Adapted from LemoLab lemo-opuscar
// styles/spy-titles/demo/chars.js (MIT, "THE AGENT"). See CREDITS.md. Origin = midpoint between the feet, y down, facing +x.
// Scale s = 1 is about 540 px tall.
import type { G, Pt } from "../paper/engine";
import { roughC, rough, smooth, piece, silhouette, slit, INKS, type SilOpts } from "./engine";

const R = Math;
/** Puppets are stepped to 12 fps ("on twos") while the camera stays on ones: pass the result in place of t when sampling poses. */
export const onTwos = (t: number, rate = 12): number => R.floor(t * rate + 1e-6) / rate;

function limbP(len: number, w0: number, w1: number, cap0 = 0.5, cap1 = 0.5): Pt[] {
  const a = w0 / 2, b = w1 / 2;
  return smooth([[-a, -a * cap0], [0, -a * cap0 * 1.6], [a, -a * cap0], [b * 1.05, len * 0.55], [b, len], [0, len + b * cap1 * 1.4], [-b, len], [-a * 1.05, len * 0.45]], 1);
}
const P = (key: string, fn: () => Pt[], seed: number, amp = 1.3, step = 9) => roughC(key, fn, seed, amp, step);
function part(g: G, poly: Pt[], col: string, tx: number, ty: number, rot: number): void { g.save(); g.translate(tx, ty); g.rotate(rot); piece(g, poly, col); g.restore(); }

const AG = { hipY: -282, thigh: 136, shin: 132, uarm: 112, farm: 96, shoulder: [2, -150] as Pt };
const jacket = (): Pt[] => [[-40, 46], [-30, -8], [-32, -96], [-30, -148], [-16, -170], [10, -178], [25, -170], [22, -152], [42, -128], [44, -92], [30, -26], [38, 22], [34, 40], [6, 36], [-12, 28], [-26, 50]];
const head = (): Pt[] => [[-12, 6], [-13, -12], [-22, -24], [-31, -46], [-26, -70], [-6, -82], [16, -78], [27, -64], [30, -52], [27, -47], [31, -43], [44, -33], [44, -30], [31, -28], [33, -23], [29, -20], [32, -16], [26, -7], [15, -2], [10, 6]];
const brim = (): Pt[] => [[-42, -63], [-22, -69], [14, -73], [44, -74], [55, -69], [48, -64], [18, -63], [-10, -61], [-34, -58]];
const crown = (): Pt[] => smooth([[-27, -70], [-25, -93], [-15, -104], [-2, -98], [9, -104], [22, -99], [29, -72]], 1);
const foot = (): Pt[] => [[-13, -8], [-15, 9], [44, 11], [56, 7], [44, -3], [16, -9]];
const hand = (): Pt[] => [[-7, -3], [8, -3], [8, 16], [2, 36], [-5, 21]];
const collar = (): Pt[] => [[16, -170], [27, -164], [22, -150]];

/** Streamer (tie) polyline: fly 0 = hangs on the chest, 1 = streams flat behind; ph = flutter phase. */
function tiePoly(fly: number, ph: number, len = 96 + R.abs(fly) * 18): { body: Pt[]; knot: Pt[] } {
  let x = 0, y = 0; const n = 10, Lf: Pt[] = [], Rt: Pt[] = [], base = 0.1 + fly * 1.45;
  for (let i = 0; i <= n; i++) {
    const u = i / n, w = i === n ? 0.5 : (7 - 2.2 * u) * (1 + 0.12 * R.sin(ph * 1.3 + u * 7));
    const a = base + R.sin(ph + u * 5.5) * (0.1 + R.abs(fly) * 0.5) * u, dx = -R.sin(a), dy = R.cos(a);
    if (i > 0) { x += (dx * len) / n; y += (dy * len) / n; }
    Lf.push([x + dy * w, y - dx * w]); Rt.push([x - dy * w, y + dx * w]);
  }
  return { body: Lf.concat(Rt.reverse()), knot: [[-6, -4], [6, -4], [4, 7], [-4, 7]] };
}

/** Joint angles in radians (0 = hanging straight down, + swings forward). th = thigh, kn = knee fold, ft = foot, sh = shoulder, el = elbow; F/B = near/far side. */
export interface Pose {
  lean?: number; bob?: number; head?: number;
  thF?: number; knF?: number; ftF?: number; thB?: number; knB?: number; ftB?: number;
  shF?: number; elF?: number; shB?: number; elB?: number;
  /** streamer: 0 hanging .. 1 flying flat behind; tph = flutter phase */
  tie?: number; tph?: number;
  eye?: "open" | "peek"; suck?: number; headFlip?: boolean;
}
export const POSE = {
  stand: { lean: 0, bob: 0, head: 0, thF: 0.04, knF: 0.02, ftF: 0, thB: -0.04, knB: 0.02, ftB: 0, shF: 0.05, elF: 0.12, shB: -0.04, elB: 0.1, tie: 0, tph: 0 },
  /** back against a wall, belly in */
  flatten: { lean: -0.03, bob: -6, head: -0.12, thF: 0.02, knF: 0, ftF: 0.55, thB: -0.02, knB: 0, ftB: 0.55, shF: -0.08, elF: -0.05, shB: -0.1, elB: -0.05, tie: -0.95, tph: 1.2, eye: "peek", suck: 1 },
  skid: { lean: -0.42, bob: 34, head: 0.2, thF: 1.05, knF: 0.05, ftF: -0.45, thB: 0.1, knB: 1.55, ftB: 0.2, shF: -1.4, elF: 0.4, shB: -1.9, elB: 0.5, tie: 0.1, tph: 1 },
  overShoulder: { lean: -0.05, bob: 0, head: 0, thF: 0.3, knF: 0.2, ftF: 0, thB: -0.2, knB: 0.35, ftB: 0, shF: 0.4, elF: 0.9, shB: -0.3, elB: 0.4, tie: 0.15, tph: 2, headFlip: true, eye: "open" },
  leap: { lean: 0.38, bob: -30, head: -0.15, thF: 1.3, knF: 1.25, ftF: 0.1, thB: -0.95, knB: 0.55, ftB: 0.5, shF: 1.95, elF: 0.35, shB: -1.25, elB: 0.45, tie: 1.05, tph: 3 },
  /** arm stretched up and forward (pointing at the chart, grabbing the coin) */
  reach: { lean: 0.15, bob: -40, head: -0.5, thF: 0.5, knF: 1.4, ftF: 0.2, thB: -0.4, knB: 1.2, ftB: 0.4, shF: 2.9, elF: 0.1, shB: 0.6, elB: 1.2, tie: 1.0, tph: 4, eye: "open" },
} as const satisfies Record<string, Pose>;

/** Run cycle: p in [0,1) = one full cycle (two steps). Sample with p = onTwos(t) * cyclesPerSecond. */
export function runPose(p: number, o: { lean?: number; tie?: number } = {}): Pose {
  const f = p * R.PI * 2;
  const leg = (q: number): [number, number, number] => {
    const s = R.sin(q);
    return [0.18 + 0.78 * s, 0.12 + 1.5 * R.pow(R.max(0, R.sin(q + 2.1)), 1.4) + 0.15 * R.max(0, -s), -0.05 + 0.7 * R.max(0, R.sin(q + 2.6))];
  };
  const [thF, knF, ftF] = leg(f), [thB, knB, ftB] = leg(f + R.PI);
  return {
    lean: o.lean ?? 0.3, bob: -14 * R.abs(R.cos(f)) + 6, head: -0.12, thF, knF, ftF, thB, knB, ftB,
    shF: 0.1 - 0.72 * R.sin(f), elF: 1.7 + 0.2 * R.sin(f), shB: 0.1 + 0.72 * R.sin(f), elB: 1.7 - 0.2 * R.sin(f),
    tie: o.tie ?? 0.72, tph: f * 1.3,
  };
}
/** Walk cycle: p in [0,1) = one full cycle (two steps, about 0.9 s). Ground speed is about 2 * stride per cycle; see walkSpeed. */
export function walkPose(p: number, o: { lean?: number } = {}): Pose {
  const f = p * R.PI * 2;
  const leg = (q: number): [number, number, number] => { const s = R.sin(q); return [0.02 + 0.42 * s, 0.1 + 0.7 * R.pow(R.max(0, R.sin(q + 1.7)), 2), -0.05 + 0.3 * R.max(0, R.sin(q + 2.4))]; };
  const [thF, knF, ftF] = leg(f), [thB, knB, ftB] = leg(f + R.PI);
  return { lean: o.lean ?? 0.06, bob: -6 * R.abs(R.cos(f)) + 3, head: 0, thF, knF, ftF, thB, knB, ftB, shF: 0.05 - 0.45 * R.sin(f), elF: 0.35, shB: 0.05 + 0.45 * R.sin(f), elB: 0.35, tie: 0.12, tph: f };
}
/** World px per cycle at scale s for walkPose (feet do not slide when the figure advances at this rate). */
export const walkStride = (s: number): number => 430 * s;

export interface FigureOpts {
  /** body ink (default noir ink) */
  col?: string;
  /** streamer colour: the one accent (default noir hot) */
  accent?: string;
  /** light accents: cuffs, collar, eye slit (default noir paper) */
  paper?: string;
  flip?: boolean;
  eye?: "open" | "peek";
  sil?: SilOpts;
}
/**
 * Draw the figure in profile, feet at (x, y), facing +x (flip faces -x). Returns the near wrist in screen/world coordinates
 * (same space as x, y) so a prop can be attached. Wrapped in silhouette().
 */
export function figureSide(g: G, x: number, y: number, s: number, pose: Pose, opt: FigureOpts = {}): { wrist: Pt } {
  let out: { wrist: Pt } = { wrist: [x, y] };
  silhouette(g, (L) => { out = figureRaw(L, x, y, s, pose, opt); }, opt.sil);
  return out;
}
function figureRaw(g: G, x: number, y: number, s: number, pose: Pose, opt: FigureOpts): { wrist: Pt } {
  const p = { ...POSE.stand, ...pose } as Required<Pick<Pose, "lean" | "bob" | "head" | "thF" | "knF" | "ftF" | "thB" | "knB" | "ftB" | "shF" | "elF" | "shB" | "elB" | "tie" | "tph">> & Pose;
  const ink = opt.col ?? INKS.noir.ink, accent = opt.accent ?? INKS.noir.hot, paper = opt.paper ?? INKS.noir.paper;
  g.save(); g.translate(x, y); g.scale(s * (opt.flip ? -1 : 1), s);
  const hip: Pt = [0, AG.hipY + p.bob], leanR = p.lean;
  const T = (px: number, py: number): Pt => [hip[0] + px * R.cos(leanR) - py * R.sin(leanR), hip[1] + px * R.sin(leanR) + py * R.cos(leanR)];
  const sh = T(AG.shoulder[0], AG.shoulder[1]), neck = T(12, -170);
  const legAt = (th: number, kn: number, ft: number, near: boolean) => {
    const knee: Pt = [hip[0] + R.sin(th) * AG.thigh, hip[1] + R.cos(th) * AG.thigh], sa = th - kn;
    const ank: Pt = [knee[0] + R.sin(sa) * AG.shin, knee[1] + R.cos(sa) * AG.shin];
    part(g, P("fgThigh", () => limbP(AG.thigh, 32, 21), 11), ink, hip[0], hip[1], -th);
    part(g, P("fgShin", () => limbP(AG.shin, 21, 14), 12), ink, knee[0], knee[1], -sa);
    part(g, P("fgFoot", foot, 13), ink, ank[0], ank[1], -sa + ft);
    slit(g, knee[0], knee[1], -sa, 30);
    if (near) slit(g, hip[0] + R.sin(th) * 44, hip[1] + R.cos(th) * 44, -th, 38);
  };
  const armAt = (shA: number, el: number, near: boolean): Pt => {
    const elb: Pt = [sh[0] + R.sin(shA) * AG.uarm, sh[1] + R.cos(shA) * AG.uarm], fa = shA + el;
    const wr: Pt = [elb[0] + R.sin(fa) * AG.farm, elb[1] + R.cos(fa) * AG.farm];
    part(g, P("fgUarm", () => limbP(AG.uarm, 26, 19), 21), ink, sh[0], sh[1], -shA);
    part(g, P("fgFarm", () => limbP(AG.farm, 19, 15), 22), ink, elb[0], elb[1], -fa);
    part(g, P("fgHand", hand, 24), ink, wr[0] + R.sin(fa) * 4, wr[1] + R.cos(fa) * 4, -fa);
    if (near) {
      part(g, P("fgCuff", () => [[-8, -2], [8, -2], [8, 3], [-8, 3]], 23, 0.5), paper, wr[0], wr[1], -fa);
      slit(g, sh[0] + R.sin(shA) * 10, sh[1] + R.cos(shA) * 10, -shA, 30);
    }
    slit(g, elb[0], elb[1], -fa, 24);
    return wr;
  };
  armAt(p.shB, p.elB, false);
  legAt(p.thB, p.knB, p.ftB, false);
  g.save(); g.translate(hip[0], hip[1]); g.rotate(leanR);                                   // torso (coat)
  if (p.suck) g.scale(0.86, 1);
  piece(g, P("fgJacket", jacket, 31), ink);
  piece(g, P("fgCollar", collar, 32, 0.5), paper, { gap: 0, shadow: false });
  g.restore();
  g.save(); g.translate(neck[0], neck[1]); g.rotate(p.head + leanR * 0.4); if (p.headFlip) g.scale(-1, 1);   // head + hat
  piece(g, P("fgHead", head, 41, 1.0, 7), ink);
  const e = p.eye ?? opt.eye;
  if (e) piece(g, e === "peek" ? [[16, -52], [26, -54], [25, -50], [16, -49]] : [[15, -53], [25, -55], [24, -49], [15, -48]], paper, { gap: 0, shadow: false });
  piece(g, P("fgBrim", brim, 42, 0.9, 7), ink);
  piece(g, P("fgCrown", crown, 43, 1.0, 7), ink);
  g.save(); g.translate(1, -71.5); g.rotate(-0.035); g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000"; g.fillRect(-27, -1.1, 56, 2.2); g.restore();   // hatband slit
  g.restore();
  legAt(p.thF, p.knF, p.ftF, true);
  const ta = T(27, -160);                                                                  // streamer
  g.save(); g.translate(ta[0], ta[1]); g.rotate(leanR * (1 - p.tie * 0.6));
  const tp = tiePoly(p.tie, p.tph);
  piece(g, rough(tp.body, 51, 0.6, 6), accent);
  piece(g, tp.knot, accent);
  g.restore();
  const wr = armAt(p.shF, p.elF, true);
  g.restore();
  const k = opt.flip ? -1 : 1;
  return { wrist: [x + wr[0] * s * k, y + wr[1] * s] };
}

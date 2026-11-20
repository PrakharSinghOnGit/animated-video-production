// The Briefing puppet seen from the front: same cut-paper build as figureSide (chars.ts), ~7 heads tall, hat and coat,
// one accent necktie, a paper face with an expression (face.ts). For moments that face the viewer: a reaction, a
// question to the camera, a reveal. Origin = midpoint between the feet, y down. s = 1 is about 540 px tall.
import type { G, Pt } from "../paper/engine";
import { measure } from "../paper/measure";
import { roughC, rough, smooth, piece, silhouette, slit, cutPoly, circP, ellP, INKS } from "./engine";
import { faceFront, exprOf, skinOf, band, type Expr, type ExprName, type Look } from "./face";
import type { FigureOpts } from "./chars";

const R = Math;
const P = (key: string, fn: () => Pt[], seed: number, amp = 1.1, step = 8) => roughC(key, fn, seed, amp, step);
const F = { gap: 0, shadow: false } as const;

/** Hand shapes: open (palm, fingers apart), fist, point (index finger out), palm (open, seen from the palm: offering). */
export type HandKind = "open" | "fist" | "point" | "palm";
/**
 * Front pose. Arms: sh = shoulder (0 = hanging, + = out to the side and up, π = straight up), el = elbow (+ = forearm
 * folds further out/up, − = folds in across the body). L/R are the figure's left/right as seen (screen left/right).
 */
export interface FrontPose {
  /** sideways tilt of the body (rad, + = toward screen right) */
  lean?: number;
  /** body up/down (px at s = 1; + = down, a crouch or slump) */
  bob?: number;
  /** head tilt (rad) */
  head?: number;
  /** head dropped forward (0..1): a slump, shame */
  nod?: number;
  shL?: number; elL?: number; shR?: number; elR?: number;
  /** upper arm length seen (1 = full, 0.5 = the elbow comes toward the camera): for a hand at the face or chest */
  fsL?: number; fsR?: number;
  handL?: HandKind; handR?: HandKind;
  /** feet apart (rad per leg) and knee bend (rad) */
  stance?: number; knee?: number;
  /** shoulders up toward the ears (0..1): fear, a shrug */
  hunch?: number;
  expr?: Expr | ExprName;
  look?: Look;
}
/** Ready-made front poses (any field can be changed by hand). */
export const FRONT = {
  stand: { shL: 0.12, elL: -0.1, shR: 0.12, elR: -0.1, handL: "open", handR: "open", stance: 0.06 },
  /** palms up, "who knows?" */
  shrug: { head: 0.12, shL: 0.35, elL: 1.95, shR: 0.35, elR: 1.95, handL: "palm", handR: "palm", hunch: 1, stance: 0.07 },
  /** hands up in fright or surrender */
  handsUp: { bob: 6, shL: 2.35, elL: 0.45, shR: 2.35, elR: 0.45, handL: "open", handR: "open", hunch: 0.8, stance: 0.12, knee: 0.08 },
  /** points off to screen right (at the chart, the number) */
  point: { lean: -0.03, shL: 0.12, elL: -0.15, shR: 1.5, elR: 0.05, handL: "open", handR: "point", stance: 0.08 },
  /** one hand held out, palm up: asking, offering, begging */
  offer: { lean: 0.05, head: 0.1, shL: 0.1, elL: -0.1, shR: 0.75, elR: -0.55, handL: "open", handR: "palm", stance: 0.06 },
  /** both fists up: a win */
  cheer: { bob: -4, shL: 2.75, elL: -0.25, shR: 2.75, elR: -0.25, handL: "fist", handR: "fist", stance: 0.14 },
  /** hand at the chin: thinking */
  chin: { head: -0.08, nod: 0.2, shL: 0.12, elL: -0.1, shR: 0.02, elR: -2.64, fsR: 0.8, handL: "open", handR: "fist", stance: 0.06 },
  /** both hands at the belly, holding something (a basket, a wallet): attach the prop between the wrists */
  clutch: { bob: 3, shL: 0.22, elL: -1.25, shR: 0.22, elR: -1.25, handL: "fist", handR: "fist", hunch: 0.4, stance: 0.07 },
  /** slumped, arms hanging, head down */
  slump: { bob: 10, nod: 1, head: 0.06, shL: 0.04, elL: 0, shR: 0.04, elR: 0, handL: "open", handR: "open", hunch: 0.3, stance: 0.05, knee: 0.06 },
} as const satisfies Record<string, FrontPose>;

const BASE = { lean: 0, bob: 0, head: 0, nod: 0, shL: 0.12, elL: -0.1, shR: 0.12, elR: -0.1, fsL: 1, fsR: 1, handL: "open", handR: "open", stance: 0.06, knee: 0, hunch: 0 } as const;
/** Blend two front poses (k = 0 → a, 1 → b): angles ease; hands and face switch halfway. */
export function mixFront(a: FrontPose, b: FrontPose, k: number): FrontPose {
  const A: any = { ...BASE, ...a }, B: any = { ...BASE, ...b }, u = R.max(0, R.min(1, k)), o: any = {};
  for (const key of Object.keys(A)) o[key] = typeof A[key] === "number" && typeof B[key] === "number" ? A[key] + (B[key] - A[key]) * u : u < 0.5 ? A[key] : B[key];
  o.expr = u < 0.5 ? a.expr : b.expr; o.look = u < 0.5 ? a.look : b.look;
  return o;
}

/** proportions: arms shorter than the profile puppet's (seen flat on, full-length arms read as antennae); the head is drawn 1.25× (HEAD) so a face reads at scene size */
const D = { hipY: -282, thigh: 136, shin: 130, uarm: 94, farm: 84, shX: 54, shY: -146 };
const HEAD = 1.25;
function limb(len: number, w0: number, w1: number): Pt[] {
  const a = w0 / 2, b = w1 / 2;
  return smooth([[-a, -a * 0.5], [0, -a * 0.8], [a, -a * 0.5], [b * 1.05, len * 0.55], [b, len], [0, len + b * 0.7], [-b, len], [-a * 1.05, len * 0.45]], 1);
}
const coat = (): Pt[] => [[-52, -152], [-61, -138], [-58, -96], [-50, -40], [-48, 0], [-52, 36], [-10, 40], [0, 32], [10, 40], [52, 36], [48, 0], [50, -40], [58, -96], [61, -138], [52, -152], [18, -162], [0, -154], [-18, -162]];
const shirt = (): Pt[] => [[-15, -161], [15, -161], [0, -96]];
const hands: Record<HandKind, () => Pt[][]> = {
  open: () => [smooth([[-9, -2], [9, -2], [11, 14], [8, 20], [-8, 20], [-11, 14]], 1), [[-9, 16], [-5, 16], [-5.5, 31], [-9, 30]], [[-3.5, 18], [0.5, 18], [0.5, 34], [-3.5, 34]], [[2, 18], [6, 18], [6.5, 32], [2.5, 32]], [[7, 15], [10.5, 14], [11.5, 27], [8, 28]], [[-10, 4], [-13, 3], [-20, 13], [-16, 16], [-10, 11]]],
  palm: () => [smooth([[-9, -2], [9, -2], [12, 12], [9, 19], [-9, 19], [-12, 12]], 1), [[-10, 15], [-6, 14], [-8, 28], [-11.5, 27]], [[-4.5, 17], [-0.5, 17], [-1.5, 32], [-5, 31.5]], [[1, 17], [5, 17], [5.5, 31], [1.5, 31.5]], [[6.5, 14], [10, 14], [12, 26], [8.5, 27]], [[10, 4], [13, 3], [21, 11], [17, 15], [10, 11]]],
  fist: () => [smooth([[-10, -2], [10, -2], [12, 10], [11, 22], [0, 25], [-11, 22], [-12, 10]], 1)],
  point: () => [smooth([[-10, -2], [10, -2], [12, 10], [11, 21], [0, 23], [-11, 21], [-12, 10]], 1), [[-2.5, 18], [2.5, 18], [2.8, 42], [0, 45], [-2.8, 42]]],
};
const shoe = (): Pt[] => [[-12, -9], [12, -9], [17, -2], [22, 6], [8, 10], [-14, 9], [-16, 2]];

/** Draw the figure facing the viewer, feet at (x, y). Returns both wrists and the head centre (screen/world space). */
export function figureFront(g: G, x: number, y: number, s: number, pose: FrontPose = FRONT.stand, opt: FigureOpts = {}): { wristL: Pt; wristR: Pt; head: Pt } {
  let out = { wristL: [x, y] as Pt, wristR: [x, y] as Pt, head: [x, y] as Pt };
  measure(g, "figure", opt.hero ? "the Agent" : "figure", 540 * s, x, y - 270 * s);
  silhouette(g, (L) => { out = frontRaw(L, x, y, s, pose, opt); }, opt.sil);
  return out;
}

function frontRaw(g: G, x: number, y: number, s: number, pose: FrontPose, opt: FigureOpts): { wristL: Pt; wristR: Pt; head: Pt } {
  const p: any = { ...BASE, ...pose };
  const ink = opt.col ?? INKS.noir.ink, accent = opt.accent ?? INKS.noir.hot, paper = opt.paper ?? INKS.noir.paper, warm = opt.warm ?? INKS.noir.warm;
  const skin = opt.skin ?? skinOf(paper, warm);
  const showFace = opt.face ?? (opt.hero || !!p.expr || !!opt.expr);
  g.save(); g.translate(x, y); g.scale(s * (opt.flip ? -1 : 1), s);
  const hip: Pt = [0, D.hipY + p.bob];
  // legs: from the hips, feet apart by stance, knees out by knee
  for (const side of [-1, 1]) {
    const th = p.stance * side, hx = 22 * side;
    const kx = hip[0] + hx + R.sin(th + p.knee * side) * D.thigh, ky = hip[1] + R.cos(th + p.knee * side) * D.thigh;
    const sa = th - p.knee * side * 0.6, ax = kx + R.sin(sa) * D.shin, ay = ky + R.cos(sa) * D.shin;
    g.save(); g.translate(hip[0] + hx, hip[1]); g.rotate(-(th + p.knee * side)); piece(g, P("ffThigh" + side, () => limb(D.thigh, 42, 33), 11 + side), ink); g.restore();
    g.save(); g.translate(kx, ky); g.rotate(-sa); piece(g, P("ffShin" + side, () => limb(D.shin, 33, 27), 13 + side), ink); g.restore();
    g.save(); g.translate(ax, ay + 6); g.scale(side, 1); piece(g, P("ffShoe", shoe, 15), ink); g.restore();
    slit(g, ax, ay - 2, 0, 18);                                                              // trouser hem
    slit(g, hip[0] + hx + R.sin(th) * 70, hip[1] + R.cos(th) * 70, -th + R.PI / 2, 22);       // trouser crease
  }
  // torso, tilted by lean around the hips
  g.save(); g.translate(hip[0], hip[1]); g.rotate(p.lean);
  const hunch = p.hunch * 8;
  piece(g, P("ffCoat", () => coat().map(([a, b]) => [a, b < -120 ? b - hunch * ((-120 - b) / 40) : b] as Pt), 31, 1.2, 9), ink);
  piece(g, shirt(), paper, F);
  // lapels: the coat's edges along the shirt, with a notch
  for (const side of [-1, 1]) {
    piece(g, [[side * 15, -161], [side * 24, -150], [side * 19, -138], [side * 26, -132], [side * 6, -100], [side * 2, -99]], ink, F);
    slit(g, side * 13, -128, side * 1.2, 30, 1.4);
  }
  piece(g, [[-15, -161], [-4, -153], [-11, -147]], paper, F); piece(g, [[15, -161], [4, -153], [11, -147]], paper, F);   // collar points
  piece(g, [[-5, -158], [5, -158], [3.6, -149], [-3.6, -149]], accent, F);                                                  // tie knot
  piece(g, rough([[-3.6, -149], [3.6, -149], [7.5, -112], [0, -102], [-7.5, -112]], 52, 0.4, 5), accent, F);                // tie blade
  if (opt.hero) {
    piece(g, circP(0, -126, 6.6, 18), ink, F);
    piece(g, circP(0, -126, 4.7, 16), warm, F);                                             // the coin tie clip
    piece(g, [[26, -116], [38, -118], [36, -110], [32, -112], [28, -109]], accent, F);      // pocket square
  }
  slit(g, 31, -106, 0, 16, 1.4);                                                            // breast pocket
  for (const by of [-86, -60]) cutPoly(g, circP(0, by, 2.4, 10));                           // buttons
  slit(g, -28, -34, 0.05, 24, 1.4); slit(g, 28, -34, -0.05, 24, 1.4);                       // pockets
  slit(g, 0, 8, R.PI / 2, 30, 1.5);                                                         // the coat's vent
  // head (before the arms, so a raised hand can pass in front of it)
  const nod = p.nod * 10;
  g.save(); g.translate(0, -158 - hunch * 0.6 + nod); g.rotate(p.head);
  piece(g, [[-9, -2], [9, -2], [8, 8], [-8, 8]], skin, F);                                   // neck
  g.translate(0, -2); g.scale(HEAD, HEAD);
  if (p.nod) g.scale(1, 1 - p.nod * 0.08);
  const e = exprOf(p.expr ?? opt.expr);
  const look: Look = p.look ?? opt.look ?? [0, p.nod ? 0.8 : 0];
  if (showFace) faceFront(g, { expr: e, look, blink: opt.blink ?? 0, ink, skin });
  else piece(g, smooth([[-30, -66], [30, -66], [32, -40], [24, -14], [10, -1], [0, 1], [-10, -1], [-24, -14], [-32, -40]], 2), ink, F);
  const hat = opt.hero ? "fedora" : opt.hat ?? "fedora";
  if (hat === "fedora") {
    piece(g, P("ffCrown", () => smooth([[-31, -66], [-28, -98], [-14, -108], [0, -101], [14, -108], [28, -98], [31, -66]], 1), 43, 0.8, 7), ink, F);
    piece(g, P("ffBrim", () => [[-64, -63], [-46, -71], [0, -74], [46, -71], [64, -63], [46, -58], [0, -56], [-46, -58]], 42, 0.7, 7), ink, F);
    g.save(); g.globalCompositeOperation = "destination-out"; g.fillStyle = "#000";
    if (opt.hero) for (let i = 0; i < 3; i++) { g.save(); g.translate(-9 + i * 9, -76); g.rotate(-0.5); g.fillRect(-1.4, -6, 2.8, 12); g.restore(); }   // the Agent: three slanted cuts
    else g.fillRect(-29, -77.5, 58, 2.2);
    g.restore();
  } else if (hat === "bowler") {
    piece(g, smooth([[-29, -64], [-28, -88], [-14, -103], [0, -106], [14, -103], [28, -88], [29, -64]], 2), ink, F);
    piece(g, [[-44, -61], [-30, -68], [30, -68], [44, -61], [30, -58], [-30, -58]], ink, F);
  } else piece(g, smooth([[-33, -44], [-34, -70], [-20, -84], [0, -88], [20, -84], [34, -70], [33, -44], [26, -58], [8, -66], [-12, -64], [-26, -56]], 1), ink, F);
  // brim shadow across the brow: the noir touch that keeps the hat on the head
  if (hat !== "none" && showFace) { g.save(); g.globalAlpha = 0.18; piece(g, [[-31, -57], [31, -57], [29, -52], [-29, -52]], ink, F); g.restore(); }
  g.restore();
  // arms, drawn over the coat
  const wrists: Pt[] = [];
  for (const side of [-1, 1]) {
    const shA = side < 0 ? p.shL : p.shR, el = side < 0 ? p.elL : p.elR, hk: HandKind = side < 0 ? p.handL : p.handR;
    const sh: Pt = [D.shX * side, D.shY - hunch];
    const ua = D.uarm * (side < 0 ? p.fsL : p.fsR);
    const eb: Pt = [sh[0] + R.sin(shA) * ua * side, sh[1] + R.cos(shA) * ua], fa = shA + el;
    const wr: Pt = [eb[0] + R.sin(fa) * D.farm * side, eb[1] + R.cos(fa) * D.farm];
    g.save(); g.translate(sh[0], sh[1]); g.rotate(-shA * side); g.scale(1, ua / D.uarm); piece(g, P("ffUarm", () => limb(D.uarm, 34, 27), 21), ink); g.restore();
    g.save(); g.translate(eb[0], eb[1]); g.rotate(-fa * side); piece(g, P("ffFarm", () => limb(D.farm, 27, 21), 22), ink); g.restore();
    slit(g, eb[0], eb[1], -fa * side, 22);
    g.save(); g.translate(wr[0], wr[1]); g.rotate(-fa * side);
    piece(g, [[-11, -3], [11, -3], [11, 3], [-11, 3]], paper, F);                             // cuff
    g.translate(0, 3); g.scale(side < 0 ? -1.15 : 1.15, 1.15);
    piece(g, hands[hk]().map((q) => rough(q, 60, 0.3, 4)), showFace ? skin : ink, { ...F, rule: "nonzero" });
    g.restore();
    wrists.push(wr);
  }
  g.restore();
  g.restore();
  const k = opt.flip ? -1 : 1, c = R.cos(p.lean), sn = R.sin(p.lean);
  const W = (q: Pt): Pt => { const rx = q[0] * c - q[1] * sn, ry = q[0] * sn + q[1] * c; return [x + (hip[0] + rx) * s * k, y + (hip[1] + ry) * s]; };
  return { wristL: W(wrists[0]), wristR: W(wrists[1]), head: W([0, -160 - 50 * HEAD]) };
}

/**
 * PENNY: The Wealth Gap's guide character for the Drafting style. A coin with a rim, two legs, noodle arms and a
 * face; she can turn edge-on like a real coin. The canonical spec (proportions, inks, poses, expressions, do/don't)
 * is brand-assets/mascot/CHARACTER.md; this file is the source of truth for the drawing. Never redraw her by hand
 * in an act: call `penny()`.
 *
 * Units: coin radius R = 50; origin = between the feet, y down. `s` = px per unit (2.5 = 250 px wide, the usual).
 */
import { TAU, clamp, lerp, inkOf, type G, type Pt, type Ink, type InkName } from "./core";
import { line, fill, occlude } from "./ink";
import { circleP, ellipseP, bezierP } from "./geom";

export const PENNY = {
  /** coin radius (units) */
  R: 50,
  /** rim inner radius / R */
  rim: 0.8,
  /** coin thickness seen edge-on (units) */
  thick: 13,
  legLen: 34,
  legGap: 16,
  armLen: 34,
  eyeR: 6.5,
  eyeGap: 15,
  /** run: steps per second, lean (radians) */
  steps: 6,
  lean: (7 * Math.PI) / 180,
  /** the three brand stripes on her forehead (echo the logo's three bars) */
  stripes: 3,
} as const;

export type PennyPose = "stand" | "run" | "walk" | "point" | "present" | "shrug" | "pencil" | "wave" | "sit";
export type PennyMood = "happy" | "neutral" | "surprised" | "worried" | "smug";
export interface PennyOpts {
  ink: InkName | Ink;
  /** px per unit (default 2.5: ~250 px wide) */
  s?: number;
  pose?: PennyPose;
  mood?: PennyMood;
  /** seconds, drives run/walk/wave cycles and blinks */
  t?: number;
  /** coin turn in radians (0 = facing us, PI/2 = edge-on) */
  turn?: number;
  /** pupils look direction, -1..1 each */
  look?: [number, number];
  /** pointing arm angle (radians, 0 = right, -PI/2 = up) */
  aim?: number;
  /** face left instead of right (mirrors arms and run direction) */
  flip?: boolean;
  /** force eyes shut (else blinks on her own clock when t is given) */
  blink?: boolean;
  /** 0..1 squash for landings / presses */
  squash?: number;
}
export interface PennyPts { center: Pt; top: Pt; hand: Pt; feet: Pt }

/** Deterministic blink: ~0.12 s every ~3.6 s, offset by seed. */
export const blinking = (t: number, seed = 0) => ((t + seed * 1.37) % 3.6) > 3.48;

export function penny(g: G, x: number, y: number, o: PennyOpts): PennyPts {
  const k = inkOf(o.ink), s = o.s ?? 2.5, t = o.t ?? 0, pose = o.pose ?? "stand", mood = o.mood ?? "happy";
  const dir = o.flip ? -1 : 1, R = PENNY.R, sq = clamp(o.squash ?? 0);
  const running = pose === "run" || pose === "walk";
  const rate = pose === "run" ? PENNY.steps / 2 : 1.6;                       // cycles per second (2 steps a cycle)
  const ph = running ? t * rate * TAU : 0;
  const bob = running ? Math.abs(Math.sin(ph)) * (pose === "run" ? 5 : 2.5) : 0;
  const lean = pose === "run" ? PENNY.lean * dir : 0;
  const turn = o.turn ?? 0, cosT = Math.cos(turn), sinT = Math.sin(turn);
  const rx = Math.max(R * Math.abs(cosT), 0.001), ry = R * (1 - sq * 0.25);
  const cy = -(PENNY.legLen + ry) + bob;

  const P = (px: number, py: number): Pt => {                              // local units -> screen, with lean
    const c = Math.cos(lean), sn = Math.sin(lean);
    return [x + (px * c - py * sn) * s, y + (px * sn + py * c) * s];
  };
  const poly = (pts: Pt[]) => pts.map(([a, b]) => P(a, b));
  const L = (pts: Pt[], w = 3, col?: string, closed = false, seed = 1) => line(g, poly(pts), { ink: k, w: w * (s / 2.5), col, closed, seed, wobble: 1.1 });

  // ── legs (behind the coin) ──
  const legSwing = (side: number) => (running ? Math.sin(ph + (side > 0 ? 0 : Math.PI)) * (pose === "run" ? 0.62 : 0.38) : pose === "sit" ? 1.3 * dir : 0);
  const legs: Pt[] = [];
  for (const side of [-1, 1]) {
    const hip: Pt = [side * PENNY.legGap * Math.max(0.35, Math.abs(cosT)), cy + ry * 0.86];
    const a = legSwing(side) * dir, len = PENNY.legLen * (1 - sq * 0.3);
    const foot: Pt = [hip[0] + Math.sin(a) * len, hip[1] + Math.cos(a) * len];
    L([hip, foot], 3.2, undefined, false, 4 + side);
    L(ellipseP(foot[0] + 5 * dir, foot[1] - 2, 8, 3.6, 14), 2.6, undefined, true, 7 + side);   // boot
    legs.push(foot);
  }

  // ── coin edge (visible when turned) ──
  const edgeOff = PENNY.thick * sinT * (turn >= 0 ? 1 : -1);
  if (Math.abs(sinT) > 0.05) {
    const back = ellipseP(edgeOff, cy, rx, ry, 64);
    occlude(g, poly(back), k);
    L(back, 2.6, undefined, true, 11);
    for (let i = 0; i < 18; i++) {                                         // reeded edge
      const a = -Math.PI / 2 + (i / 18) * TAU, ex = Math.cos(a) * rx, ey = Math.sin(a) * ry;
      if ((ex * Math.sign(edgeOff)) < 0) continue;
      L([[ex, cy + ey], [ex + edgeOff, cy + ey]], 1.6, undefined, false, 30 + i);
    }
  }
  // ── coin face ──
  const face = ellipseP(0, cy, rx, ry, 72);
  occlude(g, poly(face), k);
  const rimIn = ellipseP(0, cy, rx * PENNY.rim, ry * PENNY.rim, 64);
  fill(g, [poly(face), poly(rimIn)], { ink: k, kind: k.name === "hologram" ? "scan" : "hatch", gap: k.name === "paper" ? 9 * (s / 2.5) : 6, light: 0.55, seed: 3 });
  L(face, 3.2, undefined, true, 2);
  L(rimIn, 2.2, undefined, true, 5);

  // ── face features (squeezed with the turn) ──
  const fx = (u: number) => u * Math.abs(cosT) + (sinT * 6) * dir * 0;   // features follow the face's foreshortening
  if (Math.abs(cosT) > 0.25) {
    // brand stripes on the forehead, slanted like the logo's bars
    for (let i = 0; i < PENNY.stripes; i++) {
      const yy = cy - ry * 0.52 + i * 6.2, x0 = fx(-11 + i * 3.4), x1 = fx(13 + i * 3.4);
      L([[x0, yy], [x1, yy]], 2.6, k.accent, false, 40 + i);
    }
    const shut = o.blink ?? blinking(t);
    const lk = o.look ?? [0, 0], eyeR = PENNY.eyeR * (mood === "surprised" ? 1.25 : 1);
    for (const side of [-1, 1]) {
      const ex = fx(side * PENNY.eyeGap), ey = cy - 4;
      if (shut) L([[ex - eyeR, ey], [ex + eyeR, ey]], 3, undefined, false, 50 + side);
      else {
        const lid = mood === "smug" ? 0.45 : 0;
        const eye = ellipseP(ex, ey + lid * eyeR * 0.5, eyeR * Math.abs(cosT) ** 0.5, eyeR * (1 - lid * 0.55), 24);
        fill(g, poly(eye), { ink: k, kind: "solid", col: k.name === "hologram" ? "#ffffff" : k.line });
        L(eye, 2, k.name === "hologram" ? "#ffffff" : undefined, true, 52 + side);
        if (k.name !== "hologram") {                                        // highlight (looks)
          const hl = ellipseP(ex - 1.8 + lk[0] * 2.2, ey - 2 + lk[1] * 2, 1.7, 1.7, 10);
          fill(g, poly(hl), { ink: k, kind: "solid", col: k.bg });
        }
      }
      if (mood === "worried") L([[ex - 7, ey - 13 - side * 2], [ex + 7, ey - 13 + side * 2]], 2.4, undefined, false, 60 + side);
    }
    // mouth
    const my = cy + 15;
    if (mood === "surprised") L(ellipseP(0, my + 1, 4.5 * Math.abs(cosT), 5.5, 18), 2.6, undefined, true, 70);
    else if (mood === "worried") L(bezierP([fx(-10), my + 3], [fx(-4), my - 3], [fx(4), my + 5], [fx(10), my - 1], 14), 2.6, undefined, false, 71);
    else if (mood === "neutral") L([[fx(-8), my], [fx(8), my]], 2.6, undefined, false, 72);
    else if (mood === "smug") L(bezierP([fx(-9), my + 1], [fx(-2), my + 2], [fx(5), my + 1], [fx(11), my - 5], 14), 2.6, undefined, false, 73);
    else L(bezierP([fx(-11), my - 2], [fx(-5), my + 7], [fx(5), my + 7], [fx(11), my - 2], 16), 2.6, undefined, false, 74);
  }

  // ── arms ──
  const shoulderY = cy + 2;
  const arm = (side: number): Pt => {
    const sh: Pt = [side * rx * 0.98, shoulderY];
    let a: number;                                                          // hand direction (radians, screen)
    const sway = running ? Math.sin(ph + (side > 0 ? Math.PI : 0)) * 0.7 : 0;
    switch (pose) {
      case "point": a = side === dir ? (o.aim ?? (dir > 0 ? -0.35 : Math.PI + 0.35)) : (side > 0 ? 1.25 : Math.PI - 1.25); break;
      case "present": a = side > 0 ? -0.25 : Math.PI + 0.25; break;
      case "shrug": a = side > 0 ? -0.9 : Math.PI + 0.9; break;
      case "wave": a = side === dir ? (dir > 0 ? -1.2 : Math.PI + 1.2) + Math.sin(t * 9) * 0.35 : (side > 0 ? 1.2 : Math.PI - 1.2); break;
      case "pencil": a = side === dir ? (dir > 0 ? 0.12 : Math.PI - 0.12) : (side > 0 ? 1.2 : Math.PI - 1.2); break;
      default: a = (side > 0 ? 1.15 : Math.PI - 1.15) + sway * side;
    }
    const len = PENNY.armLen, hand: Pt = [sh[0] + Math.cos(a) * len, sh[1] + Math.sin(a) * len];
    const mid: Pt = [(sh[0] + hand[0]) / 2 + side * 6, (sh[1] + hand[1]) / 2 - 5];
    L(bezierP(sh, mid, mid, hand, 14), 3, undefined, false, 80 + side);
    L(circleP(hand[0], hand[1], 5, 14), 2.4, undefined, true, 84 + side);
    return hand;
  };
  arm(-dir);
  const hand = arm(dir);
  if (pose === "pencil") {                                                  // a drafting pencil held forward, like a pointer
    const a = dir > 0 ? -0.22 : Math.PI + 0.22, len = 50, w = 3.4;
    const ux = Math.cos(a), uy = Math.sin(a), nx = -uy * w, ny = ux * w;
    const at = (d: number, side: number): Pt => [hand[0] + ux * d + nx * side, hand[1] + uy * d + ny * side];
    const body: Pt[] = [at(-10, 1), at(len - 12, 1), at(len - 12, -1), at(-10, -1)];
    const cone: Pt[] = [at(len - 12, 1), at(len, 0), at(len - 12, -1)];
    const lead: Pt[] = [at(len - 4, 0.35), at(len, 0), at(len - 4, -0.35)];
    occlude(g, poly([...body, ...cone]), k);
    fill(g, poly(body), { ink: k, kind: k.name === "hologram" ? "scan" : "hatch", gap: 4, light: 0.5, seed: 92 });
    L(body, 2.2, undefined, true, 90);
    L(cone, 2.2, undefined, true, 91);
    fill(g, poly(lead), { ink: k, kind: "solid", col: k.line });
    L([at(-4, 1), at(-4, -1)], 1.8, undefined, false, 93);                 // ferrule band
  }
  return { center: P(0, cy), top: P(0, cy - ry), hand: P(hand[0], hand[1]), feet: P(0, 0) };
}

/** x position for a run that doesn't slide: units per second at the run rate. */
export const pennyRunSpeed = (s = 2.5) => 330 * (s / 2.5);
export const pennyLerp = lerp;

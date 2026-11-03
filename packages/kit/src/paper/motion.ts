// Elastic motion: springs that overshoot and settle, pops, thumps, impact bursts. All pure functions of t (seconds),
// so they are deterministic and safe on sub-frames. Shared by every style; each style draws bursts its own way.
import { clamp, hash, TAU } from "./lib";

export interface BounceOpts {
  /** angular frequency in rad/s: 14 loose .. 30 snappy (default 20) */
  w?: number;
  /** damping ratio 0..1: 0.25 wobbly, 0.4 one clear overshoot (default), 0.7 a small one, 1 none */
  damp?: number;
}
/**
 * Under-damped spring from 0 to 1 starting at t0: passes 1, swings back and settles. With the defaults it peaks ~1.25 at
 * ~0.17 s and is within 2% after ~0.5 s. Start it 0.1-0.15 s before the word so the overshoot peaks on it.
 */
export function bounce(t: number, t0: number, o: BounceOpts = {}): number {
  const s = t - t0;
  if (s <= 0) return 0;
  const w = o.w ?? 20, z = clamp(o.damp ?? 0.4, 0.05, 0.999), wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + ((z * w) / wd) * Math.sin(wd * s));
}
/** a -> b on a bounce that starts at t0. */
export const bounceTo = (a: number, b: number, t: number, t0: number, o?: BounceOpts): number => a + (b - a) * bounce(t, t0, o);

/** Rate of change of bounce (1/s), for squash and stretch. */
const bounceV = (t: number, t0: number, o?: BounceOpts) => (bounce(t + 0.004, t0, o) - bounce(t - 0.004, t0, o)) / 0.008;

export interface PopOpts extends BounceOpts {
  /** squash and stretch amount (default 0.18; 0 = uniform scale) */
  squash?: number;
}
/**
 * Pop in: scale 0 -> 1 with overshoot, stretched along the motion while growing and squashed on the rebound.
 * Use `sx`/`sy` around the object's anchor (its base for things that land, its centre for things that appear).
 */
export function pop(t: number, t0: number, o: PopOpts = {}): { s: number; sx: number; sy: number; done: boolean } {
  const s = bounce(t, t0, o), q = o.squash ?? 0.18;
  const v = clamp(bounceV(t, t0, o) / ((o.w ?? 20) * 0.6), -1, 1);
  return { s, sx: Math.max(0, s * (1 - q * v * 0.6)), sy: Math.max(0, s * (1 + q * v)), done: t - t0 > 0.6 };
}

/**
 * The squash of a landing at t0 (something hits the floor or the type slaps down): 1 before, a quick flatten (sy < 1,
 * sx > 1) that springs back with a small wobble over ~0.35 s. Multiply into the object's scale at its base.
 */
export function land(t: number, t0: number, amount = 0.22): { sx: number; sy: number } {
  const s = t - t0;
  if (s < 0 || s > 0.6) return { sx: 1, sy: 1 };
  const k = amount * Math.exp(-9 * s) * Math.cos(s * 26);
  return { sx: 1 + k * 0.7, sy: 1 - k };
}

export interface ThumpOpts {
  /** shake in px at the hit (default 12) */
  amp?: number;
  /** how long it rings, s (default 0.4) */
  dur?: number;
  /** scale punch at the hit (default 0.04 = 4%) */
  punch?: number;
  /** degrees of roll (default 0.6) */
  roll?: number;
  seed?: number;
}
/**
 * The weight of an impact at t0: a decaying shake (dx, dy in px), a scale punch (s) and a roll (rad). Add it to the camera
 * (`shake`) for a big hit, or to one object for a small one. Zero outside [t0, t0 + dur].
 */
export function thump(t: number, t0: number, o: ThumpOpts = {}): { dx: number; dy: number; s: number; rot: number } {
  const s = t - t0, dur = o.dur ?? 0.4;
  if (s < 0 || s > dur) return { dx: 0, dy: 0, s: 1, rot: 0 };
  const d = (1 - s / dur) ** 2, seed = o.seed ?? 1, amp = o.amp ?? 12;
  return {
    dx: amp * d * Math.sin(s * 61 + seed * 1.7) * 0.6,
    dy: amp * d * Math.cos(s * 47 + seed * 2.3),
    s: 1 + (o.punch ?? 0.04) * d * Math.cos(s * 30),
    rot: (((o.roll ?? 0.6) * Math.PI) / 180) * d * Math.sin(s * 38 + seed),
  };
}
/** A camera with the thumps of these hit times added (only the big hits: a stab, a slam, a crash; not every word). */
export function shake<C extends { x: number; y: number; zoom: number; roll?: number }>(cam: C, t: number, hits: number[], o: ThumpOpts = {}): C {
  let x = cam.x, y = cam.y, zoom = cam.zoom, roll = cam.roll ?? 0;
  hits.forEach((h, i) => {
    const k = thump(t, h, { ...o, seed: (o.seed ?? 1) + i });
    x += k.dx / cam.zoom; y += k.dy / cam.zoom; zoom *= k.s; roll += k.rot;
  });
  return { ...cam, x, y, zoom, roll };
}

/** A settle wobble after t0: rotation (rad) swinging ±deg and dying out over ~0.6 s. For a sign that lands, a door, a needle. */
export function wobble(t: number, t0: number, deg = 6, freq = 3.2): number {
  const s = t - t0;
  if (s < 0 || s > 1.5) return 0;
  return ((deg * Math.PI) / 180) * Math.exp(-5 * s) * Math.sin(s * freq * TAU);
}

/**
 * Idle life for something that is holding: a slow sway/bob in px (and a tiny scale), different per seed. Keeps a held frame
 * alive without new events. Typical: amp 4-10 px, period 2-4 s.
 */
export function idle(t: number, seed = 1, amp = 6, period = 3): { dx: number; dy: number; s: number; rot: number } {
  const p = (t / period) * TAU + seed * 2.1;
  return { dx: amp * 0.4 * Math.sin(p * 0.7 + seed), dy: amp * Math.sin(p), s: 1 + 0.008 * Math.sin(p + 1.3), rot: 0.006 * Math.sin(p * 0.5 + seed * 3) };
}

/** Times staggered after t0 for n items (a row popping in one after another). */
export const stagger = (t0: number, n: number, gap = 0.06): number[] => Array.from({ length: n }, (_, i) => t0 + i * gap);

export interface Particle { x: number; y: number; rot: number; size: number; life: number; i: number }
export interface BurstOpts {
  /** pieces (default 14) */
  n?: number;
  /** launch speed px/s (default 900) */
  speed?: number;
  /** launch direction in rad (default -PI/2 = up) and spread around it (default PI = a half circle) */
  dir?: number;
  spread?: number;
  /** px/s² (default 2600; 0 = floats) */
  gravity?: number;
  /** air drag 1/s (default 3.5) */
  drag?: number;
  /** piece size px (default 12) */
  size?: number;
  /** seconds a piece lives (default 0.7) */
  dur?: number;
  seed?: number;
}
/**
 * Impact burst at t0, relative to the impact point: pieces flung out, slowed by drag, pulled down by gravity, shrinking to
 * nothing (`life` 0 -> 1). Empty before t0 and after it ends. Draw each piece in the style's way (`scraps` in Briefing,
 * `specks` in Drafting).
 */
export function burst(t: number, t0: number, o: BurstOpts = {}): Particle[] {
  const s = t - t0, dur = o.dur ?? 0.7;
  if (s < 0 || s > dur) return [];
  const n = o.n ?? 14, seed = o.seed ?? 1, drag = o.drag ?? 3.5, grav = o.gravity ?? 2600, sp = o.spread ?? Math.PI;
  const out: Particle[] = [];
  for (let i = 0; i < n; i++) {
    const h1 = hash(seed * 13.1 + i * 7.7), h2 = hash(seed * 5.3 + i * 3.9), h3 = hash(seed * 2.2 + i * 11.3);
    const life = dur * (0.55 + 0.45 * h3), k = s / life;
    if (k >= 1) continue;
    const a = (o.dir ?? -Math.PI / 2) + (h1 - 0.5) * sp, v = (o.speed ?? 900) * (0.45 + 0.75 * h2);
    const travel = (1 - Math.exp(-drag * s)) / drag;
    out.push({
      x: Math.cos(a) * v * travel,
      y: Math.sin(a) * v * travel + 0.5 * grav * s * s * 0.35,
      rot: (h1 - 0.5) * 14 * s + h2 * TAU,
      size: (o.size ?? 12) * (0.6 + 0.8 * h3) * (1 - k * k),
      life: k, i,
    });
  }
  return out;
}

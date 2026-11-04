// Small deterministic helpers. Adapted from LemoLab lemo-opuscar core/lib.js (MIT). See CREDITS.md.
export const clamp = (x: number, a = 0, b = 1): number => Math.max(a, Math.min(b, x));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** 0..1 progress of t inside [t0, t1]. */
export const seg = (t: number, t0: number, t1: number): number => clamp((t - t0) / (t1 - t0));
export const TAU = Math.PI * 2;

export const inOutSine = (t: number): number => -(Math.cos(Math.PI * clamp(t)) - 1) / 2;
export const inOutCubic = (t: number): number => {
  t = clamp(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const outCubic = (t: number): number => 1 - Math.pow(1 - clamp(t), 3);
export const outBack = (t: number, s = 1.70158): number => {
  // exact ends: the formula gives ±2e-16 at 0 for some s, which passed "if (k > 0)" guards and drew at a 1e-16 scale
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  t = t - 1;
  return 1 + t * t * ((s + 1) * t + s);
};
export const outExpo = (t: number): number => (clamp(t) >= 1 ? 1 : 1 - Math.pow(2, -10 * clamp(t)));
export const smooth = (t: number): number => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};

/** Seeded PRNG (mulberry32). */
export function mulberry(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** Stateless hash 0..1. */
export const hash = (n: number): number => {
  n = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return n - Math.floor(n);
};
/** 1-D value noise 0..1. */
export const vnoise = (x: number): number => {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i), hash(i + 1), u);
};

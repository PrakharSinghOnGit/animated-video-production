/**
 * Polar Shape Library and Morphing Engine
 * Ported and adapted from shadow_market.py reference implementation.
 * Generates continuous deterministic 360-point polar coordinate arrays and SVG paths.
 */

export const NPT = 360;

// Precompute angles, cosines, and sines
export const THETA: number[] = [];
export const COS_THETA: number[] = [];
export const SIN_THETA: number[] = [];

for (let i = 0; i < NPT; i++) {
  const th = (i * 2 * Math.PI) / NPT;
  THETA.push(th);
  COS_THETA.push(Math.cos(th));
  SIN_THETA.push(Math.sin(th));
}

/**
 * Circular smoothing convolution (Hanning-like window)
 */
export function smooth(r: number[], k: number = 9): number[] {
  const n = r.length;
  const result: number[] = new Array(n);
  const weights: number[] = [];
  let weightSum = 0;

  for (let j = -k; j <= k; j++) {
    const w = 0.5 * (1 + Math.cos((j * Math.PI) / (k + 1)));
    weights.push(w);
    weightSum += w;
  }

  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = -k; j <= k; j++) {
      const idx = (i + j + n * 10) % n;
      const wIdx = j + k;
      sum += r[idx] * weights[wIdx];
    }
    result[i] = sum / weightSum;
  }

  return result;
}

/**
 * Linear interpolation between two polar shape arrays
 */
export function lerpShapes(a: number[], b: number[], m: number): number[] {
  const clampedM = Math.max(0, Math.min(1, m));
  const n = Math.min(a.length, b.length);
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = a[i] + (b[i] - a[i]) * clampedM;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Base Shape Generators
// ---------------------------------------------------------------------------

export const shapes = {
  circle(): number[] {
    const r = new Array(NPT);
    for (let i = 0; i < NPT; i++) r[i] = 1;
    return r;
  },

  squircle(n: number = 4): number[] {
    const r = new Array(NPT);
    for (let i = 0; i < NPT; i++) {
      const c = Math.abs(COS_THETA[i]);
      const s = Math.abs(SIN_THETA[i]);
      const denom = Math.pow(Math.pow(c, n) + Math.pow(s, n), 1 / n);
      r[i] = (1 / denom) / 1.07;
    }
    return r;
  },

  hexagon(): number[] {
    const r = new Array(NPT);
    const piOver3 = Math.PI / 3;
    const piOver6 = Math.PI / 6;
    const cosPiOver6 = Math.cos(piOver6);

    for (let i = 0; i < NPT; i++) {
      const shifted = THETA[i] - piOver6;
      const mod = ((shifted % piOver3) + piOver3) % piOver3;
      const ang = mod - piOver6;
      r[i] = (cosPiOver6 / Math.cos(ang)) / 0.93;
    }
    return smooth(r, 10);
  },

  blob(t: number, options?: { amp?: number; phase?: number; seed?: number }): number[] {
    const amp = options?.amp ?? 1.0;
    const phase = options?.phase ?? 0.0;
    const tt = t + phase;
    const r = new Array(NPT);

    for (let i = 0; i < NPT; i++) {
      const th = THETA[i];
      const h1 = 0.060 * Math.sin(2 * th + 0.9 * tt + 0.3);
      const h2 = 0.045 * Math.sin(3 * th - 1.3 * tt + 1.7);
      const h3 = 0.030 * Math.sin(5 * th + 1.9 * tt + 4.1);
      const h4 = 0.016 * Math.sin(7 * th - 2.3 * tt + 2.2);
      r[i] = 1 + amp * (h1 + h2 + h3 + h4);
    }
    return r;
  },

  star(points: number = 5, inner: number = 0.5): number[] {
    const r = new Array(NPT);
    for (let i = 0; i < NPT; i++) {
      const th = THETA[i];
      const wave = 0.5 + 0.5 * Math.cos(points * th);
      r[i] = inner + (1 - inner) * wave;
    }
    return smooth(r, 4);
  },

  lerp(a: number[], b: number[], m: number): number[] {
    return lerpShapes(a, b, m);
  },

  smooth(shape: number[], k: number = 9): number[] {
    return smooth(shape, k);
  },
};

/**
 * Converts polar radii array into an SVG Path `d` attribute string.
 */
export function polarToSvgPath(
  r: number[],
  cx: number = 0,
  cy: number = 0,
  baseRadius: number = 100,
  rotRad: number = 0
): string {
  const n = r.length;
  if (n === 0) return "";

  let d = "";
  for (let i = 0; i < n; i++) {
    const rad = r[i] * baseRadius;
    const angle = ((i * 2 * Math.PI) / n) + rotRad;
    const x = Number((cx + rad * Math.cos(angle)).toFixed(2));
    const y = Number((cy + rad * Math.sin(angle)).toFixed(2));
    if (i === 0) {
      d += `M ${x} ${y}`;
    } else {
      d += ` L ${x} ${y}`;
    }
  }
  d += " Z";
  return d;
}

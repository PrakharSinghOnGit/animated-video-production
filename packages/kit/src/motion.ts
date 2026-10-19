import { Easing } from "remotion";

/**
 * Named motion constants and easings.
 * Deterministic frame-driven motion primitives.
 */

// Core Easing Curves
export const EASINGS = {
  // Snappy modern exponential ease-out (the signature Vox/Polymatter curve)
  outExpo: Easing.bezier(0.16, 1, 0.3, 1),
  // Smooth cubic ease-out for chart grows and count-ups
  outCubic: Easing.out(Easing.cubic),
  // Quartic ease out
  out4: Easing.out(Easing.quad),
  // Eased entrance for elements leaving screen at half entrance duration
  inCubic: Easing.in(Easing.cubic),
  // Smooth in-out
  inOutCubic: Easing.inOut(Easing.cubic),
  // Gentle camera pan easing
  inOutSine: Easing.inOut(Easing.sin),
  // Smooth step
  smooth: Easing.inOut(Easing.cubic),
  // Linear for ambient continuous loops
  linear: Easing.linear,
} as const;

export const ease = {
  outExpo: EASINGS.outExpo,
  outCubic: EASINGS.outCubic,
  out4: EASINGS.out4,
  inCubic: EASINGS.inCubic,
  inOutCubic: EASINGS.inOutCubic,
  inOutSine: EASINGS.inOutSine,
  smooth: EASINGS.smooth,
  linear: EASINGS.linear,
  outBack: (overshoot = 1.4) => Easing.back(overshoot),
  bezier: (x1: number, y1: number, x2: number, y2: number) => Easing.bezier(x1, y1, x2, y2),
  spring: (x: number) => {
    // Normalised spring approximation (0..1 overshoots then settles at 1)
    const t = Math.max(0, Math.min(1, x));
    return 1 - Math.exp(-6 * t) * Math.cos(7 * t);
  },
};

// Frame Durations at 30 fps (legacy compatibility)
export const MOTION_DURATIONS = {
  enterHeroFrames: 22,
  enterSupportFrames: 14,
  exitHeroFrames: 11,
  exitSupportFrames: 7,
  lineDrawFrames: 45,
  barGrowFrames: 20,
  countUpMinFrames: 27,
  countUpMaxFrames: 42,
  transitionDefaultFrames: 10,
  transitionHeroFrames: 14,
} as const;

// Stagger Rules
export const STAGGER_RULES = {
  msPerItem: 85,
  framesPerItem: 3,
  maxStaggerMs: 600,
  maxStaggerFrames: 18,
} as const;

// Text Reading Hold Rules
export const HOLD_RULES = {
  minHoldMs: 500,
  perWordMs: 280,
} as const;

// Ambient Camera Push-in
export const CAMERA_RULES = {
  startScale: 1.0,
  endScale: 1.04,
  maxDriftPx: 40,
} as const;

// ---------------------------------------------------------------------------
// Kit Motion Functions
// ---------------------------------------------------------------------------

/**
 * Clamped 0..1 progress between frame a and frame b
 */
export function p(frame: number, a: number, b: number): number {
  if (a === b) return frame >= a ? 1 : 0;
  return Math.max(0, Math.min(1, (frame - a) / (b - a)));
}

/**
 * Linear interpolation
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Keyframed timeline value or vector lookup
 */
export type KeyframeStop = [number, number | number[], ((t: number) => number)?];

export function keys(frame: number, stops: KeyframeStop[]): any {
  if (!stops || stops.length === 0) return 0;
  if (stops.length === 1) return stops[0][1];

  const first = stops[0];
  const last = stops[stops.length - 1];

  if (frame <= first[0]) return first[1];
  if (frame >= last[0]) return last[1];

  for (let i = 0; i < stops.length - 1; i++) {
    const [f0, v0, easeFn] = stops[i];
    const [f1, v1] = stops[i + 1];

    if (frame >= f0 && frame <= f1) {
      let rawT = (frame - f0) / (f1 - f0);
      const t = easeFn ? easeFn(rawT) : rawT;

      if (Array.isArray(v0) && Array.isArray(v1)) {
        return v0.map((val, idx) => lerp(val, v1[idx] ?? val, t));
      }
      return lerp(v0 as number, v1 as number, t);
    }
  }

  return last[1];
}

/**
 * Short bumps/breath pulses on given frame centers
 */
export function pulse(frame: number, centers: number[], widthFrames: number, amp: number): number {
  let bump = 0;
  for (const c of centers) {
    const dist = Math.abs(frame - c);
    if (dist < widthFrames) {
      const prog = 1 - dist / widthFrames;
      bump = Math.max(bump, Math.sin(prog * Math.PI) * amp);
    }
  }
  return bump;
}

/**
 * Stagger helper
 */
export function stagger(index: number, baseFrame: number, staggerFrames: number = 3): number {
  return baseFrame + index * staggerFrames;
}

/**
 * Deterministic PRNG using Murmur-like hash of seed
 */
export function seeded(seed: number | string): number {
  const str = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  return (h % 1000000) / 1000000;
}

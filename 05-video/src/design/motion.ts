import { Easing } from "remotion";

/**
 * Named motion constants and easings.
 * Components import these constants; they do not invent ad-hoc animation timings.
 */

// Core Easing Curves
export const EASINGS = {
  // Snappy modern exponential ease-out (the signature Vox/Polymatter curve)
  outExpo: Easing.bezier(0.16, 1, 0.3, 1),
  // Smooth cubic ease-out for chart grows and count-ups
  outCubic: Easing.out(Easing.cubic),
  // Eased entrance for elements leaving screen at half entrance duration
  inCubic: Easing.in(Easing.cubic),
  // Gentle camera pan easing
  inOutSine: Easing.inOut(Easing.sin),
  // Linear for ambient continuous loops
  linear: Easing.linear,
} as const;

// Frame Durations at 30 fps
export const MOTION_DURATIONS = {
  // Hero entrance (large cards, big numbers, world map)
  enterHeroFrames: 22, // ~0.73s
  // Supporting entrance (labels, chips, source tag)
  enterSupportFrames: 14, // ~0.46s
  // Hero exit
  exitHeroFrames: 11, // ~0.36s (half entrance)
  // Supporting exit
  exitSupportFrames: 7, // ~0.23s
  // Chart drawing duration
  lineDrawFrames: 45, // ~1.5s
  barGrowFrames: 20, // ~0.66s
  // Count-up duration range
  countUpMinFrames: 27, // 0.9s
  countUpMaxFrames: 42, // 1.4s
  // Transition durations
  transitionDefaultFrames: 10,
  transitionHeroFrames: 14,
} as const;

// Stagger Rules
export const STAGGER_RULES = {
  msPerItem: 85,
  framesPerItem: 3, // at 30 fps
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

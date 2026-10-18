/**
 * Design Tokens for The Wealth Gap
 * Dark, premium, institutional finance aesthetic.
 * All components read tokens from here. Never hardcode colors or dimensions.
 */

export const COLOR_TOKENS = {
  bg: "#0B0F14", // Deep obsidian foundation
  surface: "#121923", // Card panels, data containers
  surface2: "#1A2431", // Elevated cards, chips, borders
  surfaceBorder: "rgba(255, 255, 255, 0.08)",
  text: "#F4F6F8", // Primary headline and key numeral color
  muted: "#8A97A6", // Secondary labels, citations, axis ticks
  accent: "#F5B83D", // The ONE highlight color (Imperial Gold)
  accent2: "#2EC4B6", // Secondary comparative series (Teal)
  positive: "#3DDC97", // Gains, surpluses, inflow only (Emerald)
  negative: "#FF5A5F", // Losses, deficits, debt, risks only (Coral Red)
  grid: "rgba(255, 255, 255, 0.06)", // Background coordinate grid
} as const;

export type ColorToken = keyof typeof COLOR_TOKENS;

export const FONT_TOKENS = {
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  mono: "'JetBrains Mono', 'SF Mono', Menlo, Consolas, monospace",
  weights: {
    regular: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extraBold: 800,
  },
} as const;

/**
 * Type scale at 1920x1080 baseline.
 * Scale dynamically using scaleFontSize(size, width).
 */
export const TYPE_SCALE_1080P = {
  heroNumber: 280, // Range: 260 - 340
  heroSuffix: 96,
  headline: 140, // Range: 130 - 150
  chapter: 90,
  subhead: 76, // Range: 70 - 84
  caption: 56, // Range: 52 - 58
  body: 48, // Range: 44 - 52
  label: 40,
  source: 32, // Hard minimum: 30 at 1920x1080
} as const;

export const SPACING_TOKENS = {
  xxs: 4,
  xs: 8,
  sm: 16,
  md: 24,
  lg: 32,
  xl: 48,
  xxl: 64,
  xxxl: 96,
  massive: 128,
} as const;

export const RADII_TOKENS = {
  sm: 6,
  md: 12,
  lg: 20,
  xl: 32,
  full: 9999,
} as const;

export const SHADOW_TOKENS = {
  sm: "0 2px 8px rgba(0, 0, 0, 0.4)",
  md: "0 8px 24px rgba(0, 0, 0, 0.5)",
  lg: "0 16px 48px rgba(0, 0, 0, 0.65)",
  glowAccent: "0 0 40px rgba(245, 184, 61, 0.25)",
  glowAccent2: "0 0 40px rgba(46, 196, 182, 0.25)",
} as const;

/**
 * Dynamically scales font sizes based on current video composition width relative to 1920px.
 */
export function scaleFontSize(baseSize: number, compositionWidth: number = 1920): number {
  return Math.max(24, Math.round(baseSize * (compositionWidth / 1920)));
}

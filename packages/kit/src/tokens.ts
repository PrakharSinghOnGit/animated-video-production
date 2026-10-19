/**
 * Design Tokens for The Wealth Gap & @wealthgap/kit
 * Dark obsidian (#101010) foundation with refined pastel accent set.
 * All components and scenes read tokens from here.
 */
import { FONTS } from "./fonts";
export { FONTS };

export const PASTEL_TOKENS = {
  lav: "#C7B8FF",
  mint: "#A8E6CF",
  peach: "#FFC9A8",
  sky: "#A8D8FF",
  butter: "#FFE8A3",
  rose: "#FFB3C7",
} as const;

export type PastelColor = keyof typeof PASTEL_TOKENS;

export const COLOR_TOKENS = {
  bg: "#101010", // Obsidian foundation
  surface: "#181818", // Card panels, data containers
  surface2: "#202020", // Elevated cards, chips, borders
  surfaceBorder: "rgba(255, 255, 255, 0.08)",
  text: "#F4F4F8", // Primary headline and key numeral color
  muted: "#8A8A94", // Secondary labels, citations, axis ticks
  accent: "#F5B83D", // Legacy gold highlight color
  accent2: "#2EC4B6", // Legacy teal secondary comparative series
  positive: "#3DDC97", // Gains, surpluses, inflow (Emerald)
  negative: "#FF5A5F", // Losses, deficits, debt, risks (Coral Red)
  grid: "rgba(255, 255, 255, 0.07)", // Background coordinate grid
  pastel: PASTEL_TOKENS,
} as const;

export type ColorToken = keyof typeof COLOR_TOKENS | PastelColor;

export const FONT_TOKENS = {
  display: "Poppins, -apple-system, BlinkMacSystemFont, sans-serif",
  sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  body: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
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
 */
export const TYPE_SCALE_1080P = {
  hero: 132,
  heroNumber: 280,
  heroSuffix: 96,
  title: 74,
  headline: 140,
  chapter: 90,
  subhead: 76,
  caption: 56,
  body: 48,
  label: 52,
  small: 30,
  source: 32,
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

export const tokens = {
  color: COLOR_TOKENS,
  font: {
    display: "Poppins",
    body: "Inter",
    mono: "JetBrains Mono",
  },
  type: {
    hero: 132,
    title: 74,
    label: 52,
    small: 30,
  },
  safe: {
    x: 80,
    y: 100,
  },
};

/**
 * Dynamically scales font sizes based on current video composition width relative to 1920px.
 */
export function scaleFontSize(baseSize: number, compositionWidth: number = 1920): number {
  return Math.max(24, Math.round(baseSize * (compositionWidth / 1920)));
}

// ---------------------------------------------------------------------------
// Color manipulation helpers
// ---------------------------------------------------------------------------

function parseHex(hex: string): [number, number, number] {
  const clean = hex.replace("#", "").trim();
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function resolveColorToken(color: string): string {
  if (color in PASTEL_TOKENS) {
    return PASTEL_TOKENS[color as PastelColor];
  }
  if (color in COLOR_TOKENS && typeof COLOR_TOKENS[color as keyof typeof COLOR_TOKENS] === "string") {
    return COLOR_TOKENS[color as keyof typeof COLOR_TOKENS] as string;
  }
  return color;
}

export function alpha(color: string, a: number): string {
  const resolved = resolveColorToken(color);
  if (resolved.startsWith("rgba")) {
    return resolved.replace(/[\d\.]+\)$/, `${a})`);
  }
  if (resolved.startsWith("rgb")) {
    return resolved.replace("rgb", "rgba").replace(")", `, ${a})`);
  }
  if (resolved.startsWith("#")) {
    const [r, g, b] = parseHex(resolved);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }
  return resolved;
}

export function lighten(color: string, t: number): string {
  const resolved = resolveColorToken(color);
  if (!resolved.startsWith("#")) return resolved;
  const [r, g, b] = parseHex(resolved);
  const lr = Math.round(r + (255 - r) * t);
  const lg = Math.round(g + (255 - g) * t);
  const lb = Math.round(b + (255 - b) * t);
  return `rgb(${lr}, ${lg}, ${lb})`;
}

export function darken(color: string, t: number): string {
  const resolved = resolveColorToken(color);
  if (!resolved.startsWith("#")) return resolved;
  const [r, g, b] = parseHex(resolved);
  const dr = Math.round(r * (1 - t));
  const dg = Math.round(g * (1 - t));
  const db = Math.round(b * (1 - t));
  return `rgb(${dr}, ${dg}, ${db})`;
}

export function mix(colorA: string, colorB: string, t: number): string {
  const resA = resolveColorToken(colorA);
  const resB = resolveColorToken(colorB);
  if (!resA.startsWith("#") || !resB.startsWith("#")) return resA;
  const [r1, g1, b1] = parseHex(resA);
  const [r2, g2, b2] = parseHex(resB);
  const mr = Math.round(r1 + (r2 - r1) * t);
  const mg = Math.round(g1 + (g2 - g1) * t);
  const mb = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${mr}, ${mg}, ${mb})`;
}

const pastelKeys = Object.keys(PASTEL_TOKENS) as PastelColor[];
export function pastelCycle(i: number): string {
  const key = pastelKeys[Math.abs(Math.floor(i)) % pastelKeys.length];
  return PASTEL_TOKENS[key];
}

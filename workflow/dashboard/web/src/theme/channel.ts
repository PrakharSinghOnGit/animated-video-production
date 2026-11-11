/**
 * The channel this dashboard belongs to: its name, logo and colours. To reuse the dashboard for another channel,
 * change this file (and brand-assets/Logo.png); every colour in the app is derived from the palette's seeds
 * (index.css), so nothing else needs editing.
 *
 * A palette is five seeds:
 *   brand     the accent: primary buttons, the current place (tab, step, nav), highlights, the first chart series
 *   positive  done / growth (green in most palettes)
 *   negative  failed / loss (red in most palettes)
 *   info      a calm second accent for charts and informational notes
 *   paper     the warm or cool tint of the light theme's background
 * Status colours that carry meaning across channels (running = amber) are fixed in index.css.
 */
export interface Palette { id: string; label: string; brand: string; positive: string; negative: string; info: string; paper: string }

export const CHANNEL = {
  name: "The Wealth Gap",
  short: "Wealth Gap",
  logo: "/brand/Logo.png",
  /** the palette a fresh browser starts with (Settings → Appearance can switch it per browser) */
  palette: "wealthgap",
};

/** The channel's own palette first; the others are presets to try a look or start a new channel from. */
export const PALETTES: Palette[] = [
  { id: "wealthgap", label: "Wealth Gap", brand: "#DC8420", positive: "#62966A", negative: "#BC4E52", info: "#6A8CAF", paper: "#F2EAE6" },
  { id: "harbor", label: "Harbor", brand: "#3A7BD5", positive: "#3E9C7A", negative: "#CF5560", info: "#C08A3E", paper: "#EDF1F6" },
  { id: "lagoon", label: "Lagoon", brand: "#1E9C8C", positive: "#6A9D4A", negative: "#C9553F", info: "#5C7FC4", paper: "#ECF3F1" },
  { id: "ember", label: "Ember", brand: "#D9534A", positive: "#4E9A6E", negative: "#B5413C", info: "#D19A2E", paper: "#F5ECE9" },
  { id: "brass", label: "Brass", brand: "#B8932B", positive: "#5E9A6B", negative: "#C0504D", info: "#5B86A6", paper: "#F3EFE4" },
];

export const paletteById = (id: string | null | undefined) => PALETTES.find((p) => p.id === id) ?? PALETTES.find((p) => p.id === CHANNEL.palette)!;

/** Set the seeds on <html>; index.css derives every token from them. index.html does the same before first paint. */
export function applyPalette(p: Palette) {
  const s = document.documentElement.style;
  s.setProperty("--seed-brand", p.brand);
  s.setProperty("--seed-positive", p.positive);
  s.setProperty("--seed-negative", p.negative);
  s.setProperty("--seed-info", p.info);
  s.setProperty("--seed-paper", p.paper);
}

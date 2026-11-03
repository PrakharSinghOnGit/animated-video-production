import { loadFont } from "@remotion/google-fonts/Geist";

/** The style's only typeface: Geist (900 for big words, 600-800 for labels). */
export const DRAFT_FONT = "Geist";

let promise: Promise<void> | null = null;
/** Loads Geist 600/700/800/900 and waits until canvas can use it. Cached. */
export function ensureDraftFonts(): Promise<void> {
  if (promise) return promise;
  const f = loadFont("normal", { weights: ["500", "600", "700", "800", "900"], subsets: ["latin"] });
  promise = f.waitUntilDone()
    .then(() => Promise.all(["500", "600", "700", "800", "900"].map((w) => document.fonts.load(`${w} 40px "${DRAFT_FONT}"`))))
    .then(() => document.fonts.ready)
    .then(() => undefined)
    .catch((err) => { console.warn("[draft] font loading failed:", (err as Error).message); throw err; });
  return promise;
}

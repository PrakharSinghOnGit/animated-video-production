import { loadFont as loadLeagueSpartan } from "@remotion/google-fonts/LeagueSpartan";
import { loadGothic } from "./glyph";
import { ensureBrand } from "./brand";

/** CSS family names used by the Briefing style. League Gothic is drawn from outlines (glyph.ts), not through CSS. */
export const SPY_FONT = { sans: "League Spartan", display: "League Gothic" } as const;

let promise: Promise<void> | null = null;

/** Loads League Gothic outlines (opentype.js) and League Spartan 600/700 and waits for document.fonts. Cached. */
export function ensureSpyFonts(): Promise<void> {
  if (promise) return promise;
  const spartan = loadLeagueSpartan("normal", { weights: ["600", "700"], subsets: ["latin"] });
  promise = Promise.all([loadGothic(), spartan.waitUntilDone(), ensureBrand()])
    .then(() => Promise.all([document.fonts.load('600 20px "League Spartan"'), document.fonts.load('700 20px "League Spartan"')]))
    .then(() => document.fonts.ready)
    .then(() => undefined)
    .catch((err) => { console.warn("[spy] font loading failed:", (err as Error).message); throw err; });
  return promise;
}

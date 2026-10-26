import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadCaveat } from "@remotion/google-fonts/Caveat";
import { loadFont as loadPlexMono } from "@remotion/google-fonts/IBMPlexMono";

let promise: Promise<void> | null = null;

/** Loads Fraunces (400, 600), Caveat (500, 700), IBM Plex Mono (400, 500) and waits for document.fonts. Cached. */
export function ensurePaperFonts(): Promise<void> {
  if (promise) return promise;
  const loads = [
    loadFraunces("normal", { weights: ["400", "600"], subsets: ["latin"] }),
    loadCaveat("normal", { weights: ["500", "700"], subsets: ["latin"] }),
    loadPlexMono("normal", { weights: ["400", "500"], subsets: ["latin"] }),
  ];
  promise = Promise.all(loads.map((l) => l.waitUntilDone()))
    .then(() =>
      Promise.all([
        document.fonts.load('400 20px "Fraunces"'), document.fonts.load('600 20px "Fraunces"'),
        document.fonts.load('500 20px "Caveat"'), document.fonts.load('700 20px "Caveat"'),
        document.fonts.load('400 20px "IBM Plex Mono"'), document.fonts.load('500 20px "IBM Plex Mono"'),
      ]),
    )
    .then(() => document.fonts.ready)
    .then(() => undefined)
    .catch((err) => { console.warn("[paper] font loading failed, using fallbacks:", (err as Error).message); });
  return promise;
}

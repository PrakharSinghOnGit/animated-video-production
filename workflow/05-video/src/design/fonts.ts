import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadJetBrainsMono } from "@remotion/google-fonts/JetBrainsMono";
import { delayRender, continueRender } from "remotion";
import { useEffect, useState } from "react";

let fontsLoadedPromise: Promise<void> | null = null;
let interFamily = "Inter";
let monoFamily = "JetBrains Mono";

/**
 * Initializes font loading for Inter and JetBrains Mono.
 * Safe to call multiple times (cached).
 */
export function ensureFontsLoaded(): Promise<void> {
  if (fontsLoadedPromise) return fontsLoadedPromise;

  const interRes = loadInter("normal", {
    weights: ["400", "500", "600", "700", "800"],
    subsets: ["latin"],
  });
  const monoRes = loadJetBrainsMono("normal", {
    weights: ["500", "700", "800"],
    subsets: ["latin"],
  });

  interFamily = interRes.fontFamily;
  monoFamily = monoRes.fontFamily;

  fontsLoadedPromise = Promise.all([
    interRes.waitUntilDone(),
    monoRes.waitUntilDone(),
  ]).then(() => undefined).catch((err) => {
    console.warn("Font loading warning (using system fallback):", err.message);
  });

  return fontsLoadedPromise;
}

/**
 * React hook to wait for fonts to load before rendering frames.
 * Calls delayRender() and continueRender().
 */
export function useFontsLoaded(): boolean {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const handle = delayRender("Loading Google Fonts");
    ensureFontsLoaded().finally(() => {
      setLoaded(true);
      continueRender(handle);
    });
  }, []);

  return loaded;
}

export const FONTS = {
  get sans() {
    return interFamily;
  },
  get mono() {
    return monoFamily;
  },
};

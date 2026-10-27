import React from "react";
import { CanvasHost } from "../paper/CanvasHost";
import type { PaperCtx } from "../paper/CanvasHost";
import type { G } from "./engine";
import { ensureSpyFonts } from "./fonts";

/** Same shape as the Ledger's PaperCtx: t, frame, fps, W, H, word(text, n), voiceStart, duration, words[]. */
export type SpyCtx = PaperCtx;

/** Canvas for a Briefing act: waits for League Gothic outlines and League Spartan before the first draw, then calls draw every frame. */
export const SpyCanvas: React.FC<{ draw: (g: G, ctx: SpyCtx) => void }> = ({ draw }) => (
  <CanvasHost draw={draw} ensureFonts={ensureSpyFonts} label="spy fonts" />
);

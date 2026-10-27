import React from "react";
import { type G } from "./engine";
import { ensurePaperFonts } from "./fonts";
import { CanvasHost, type PaperCtx } from "./CanvasHost";

export type { PaperCtx };

export const PaperCanvas: React.FC<{ draw: (g: G, ctx: PaperCtx) => void }> = ({ draw }) => (
  <CanvasHost draw={draw} ensureFonts={ensurePaperFonts} label="paper fonts" />
);

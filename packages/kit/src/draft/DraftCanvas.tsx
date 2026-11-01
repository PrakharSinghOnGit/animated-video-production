import React from "react";
import { CanvasHost } from "../paper/CanvasHost";
import type { G } from "./core";
import type { DraftCtx } from "./scene";
import { ensureDraftFonts } from "./fonts";

/** Canvas for a Drafting act: waits for Geist, then calls draw every frame. */
export const DraftCanvas: React.FC<{ draw: (g: G, ctx: DraftCtx) => void }> = ({ draw }) => (
  <CanvasHost draw={draw} ensureFonts={ensureDraftFonts} label="draft fonts" />
);

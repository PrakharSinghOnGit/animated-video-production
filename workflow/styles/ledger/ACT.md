# Ledger engine: act contract

## Read first
1. `packages/kit/src/paper/engine.ts`, `lib.ts`, `transitions.ts`, `pencil.ts` and `PaperCanvas.tsx`: the drawing engine (the only way you draw). Exported from `@wealthgap/kit` as the `paper` namespace.
2. `packages/kit/src/paper/preview/Root.tsx`: a worked example of a draw function.

## The file you write
`<scene file path below>`, a single TSX module:

```tsx
import React from "react";
import { paper } from "@wealthgap/kit";
const { PaperCanvas, shots, actCamera, drawActStage, autoCaption, pencilStroke, handText, P /* … */ } = paper;
type Ctx = paper.PaperCtx;

export const meta = { id: "A01", title: "…" };

// Foley for this act (act-relative seconds). word(text, n) = start of that spoken word.
export const events = (word: (text: string, occurrence?: number) => number) => [
  { t: word("trillions") - 0.25, type: "pencil_scratch", d: 0.8 },
  // types: pencil_tap pencil_scratch ruler_hiss paper_slide stamp_thud page_turn adding_clack pop whoosh
];

type Rect = [number, number, number, number];
const SHEET: Rect = [0, 0, 4200, 2400];            // this act's sheet in world units
// One region per beat (world rects). Everything a beat draws stays inside its region,
// and the camera frames regions, never raw coordinates. Regions may overlap or nest.
const R: Record<string, Rect> = {
  hook: [200, 300, 1700, 1150],
  // …
};

const draw = (g: CanvasRenderingContext2D, ctx: Ctx) => {
  // pure function of ctx.t: no state between frames, no Math.random, no Date
  const w = (s: string, n = 1) => ctx.word(s, n).t0;
  const shot = shots([
    { t: 0.9, rect: R.hook, fill: 0.9 },             // frame a region: guaranteed on screen and large
    { t: w("Wall") - 0.5, rect: R.hook, fill: 0.7 }, // a slow pull back = same region, smaller fill
    // { t, cam: {...} } only for a deliberate punch-in
  ]);
  const cam = actCamera(shot, ctx.t, ctx.duration, SHEET);
  drawActStage(g, cam, SHEET);   // desk + sheet; the camera is now applied (world space)
  // … the act, beat by beat …
  autoCaption(g, ctx);
};

export default function Act() {
  return <PaperCanvas draw={draw} />;
}
```

## Engine rules
- **Act transitions (same for every act, so the video flows):** always wrap your camera with `actCamera(shot, ctx.t, ctx.duration, SHEET)` and start every frame with `drawActStage`. It arrives along the desk and descends onto the sheet in the first 1.8 s, and lifts off and travels on in the last 1.6 s; your `shot` keys should start at t ≈ 1.8 and end at duration − 1.6. Don't put hits in those windows.
- **Chapter acts.** If the plan has `chapter`, the act opens on the chapter card during the narration pause (from 1.8 s to the first spoken word): put a region `R.chapter = chapterRect(x, y, title)` at the top-left of the sheet, draw `chapterCard(g, x, y, n, title, seg(t, 1.8, firstWord - 0.3))`, frame it with `shots`, then move to the first beat's region as the narration starts.
- **Pace (long-form, calm).** `shots` already stretches camera moves to at least `moveTime()` (1.1–2.8 s); key the camera with room for that. Use `paper.pencilPerformer(t, ops)` for the pencil (register every mark as an op), never your own pencil timing. Handwriting takes `writeTime(text)` (about 9 characters a second); a hit word should be complete at its start, so start writing that much earlier. No move, write-on or reveal shorter than 0.4 s except a deliberate punch-in.
- Call `autoCaption(g, ctx)` last in every frame (the figure caption on a paper slip). The safe area is `paper.SAFE`; the caption slip owns y > 890.

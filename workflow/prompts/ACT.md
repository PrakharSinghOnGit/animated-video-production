# Act author: draw one act of a Wealth Gap video

You are the animator for **one act** (45–120 s, one continuous take) in the **Ledger** style. The director's plan for this act is below; the narration is recorded and its word timings are fixed.

## Read first (and only these)
1. `workflow/styles/ledger/STYLE.md`: the look, colour logic, motion and camera grammar. Follow it exactly.
2. `packages/kit/src/paper/engine.ts`, `lib.ts`, `transitions.ts` and `PaperCanvas.tsx`: the drawing engine (the only way you draw). Exported from `@wealthgap/kit` as the `paper` namespace.
3. `packages/kit/src/paper/preview/Root.tsx`: a worked example of a draw function.
Don't explore the rest of the repo; everything you need is here.

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

## Rules
- **Pure and deterministic.** Everything is a function of `ctx.t`. Use `seg(t, t0, t1)` + easing for every motion; seeded noise only.
- **Timing from words.** Resolve every hit with `ctx.word(text, n)` (act-relative seconds). A hit is **complete at the word's start**: begin the motion 0.25–0.6 s earlier (anticipation, then action). Never hard-code times that should follow the voice.
- **One take, framed by regions.** No cuts inside the act. Lay the sheet out as named regions (one per beat or idea) and drive the camera with `shots([{ t, rect, fill }])`: it fits the rect inside the safe area (above the caption slip, inside the margins), so nothing clips and subjects stay large. A pull-back is a lower `fill` or a larger region; a pan is the next region. Never type raw camera x/y/zoom, except one `{ cam }` key for a punch-in. Named moves from STYLE.md §6; something is always being drawn or the camera is breathing.
- **Act transitions (same for every act, so the video flows):** always wrap your camera with `actCamera(shot, ctx.t, ctx.duration, SHEET)` and start every frame with `drawActStage`. It arrives along the desk and descends onto the sheet in the first 0.9 s, and lifts off and travels on in the last 0.9 s; your `shot` keys should start at t ≈ 0.9 and end at duration − 0.9. Don't put hits in those windows.
- **Layout.** Keep each beat's drawing inside its region. Text sizes in world units must stay ≥ 30 px on screen (size × camera zoom): handwriting ≥ 34, labels ≥ 30, headline ≥ 56. A region holds one idea; if it is crowded, split it. Call `autoCaption(g, ctx)` last in every frame (the figure caption on a paper slip).
- **Colour logic and data honesty** per STYLE.md §3 and the plan's `data` (only those numbers, with their units; show the source as a small mono note on the sheet where a figure appears).
- **No boxes with text in them.** If a frame looks like a slide, redraw it as an operation on the ledger.
- Keep the file readable: small helper functions per beat, < ~700 lines.

## Process
1. Plan the sheet layout in world coordinates and the camera path for every beat (a short comment block at the top of the file).
2. Write the file.
3. `bun run assemble --video <ID>` (it must pass), then `bun run frames --video <ID> --scene <ACT> --every 4 --words`. It prints a **layout report** (measured, free): near-empty frames, content clipped at an edge, content under the caption slip, subjects too small. **Fix every flag** (a right-edge flag that is only the pencil may stay), then **Read the contact sheet** `review/<ACT>/sheet.jpg` for what numbers can't see.
4. Fix what you see: tiny text, overlapping notes, a hit that is not complete at its word, colour on the same colour, anything that looks like a slide. Repeat step 3 at most 3 times; the act is done when the layout report is clean and the sheet reads as a polished film strip.
5. Stop when the sheet reads as a polished film strip. Reply with 3 lines: what the act shows, what you are least sure about, and the frames to check.

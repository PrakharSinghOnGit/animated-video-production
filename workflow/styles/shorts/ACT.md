# Shorts engine: act contract (9:16, one act)

## Read first
1. `packages/kit/src/spy/README.md`: the whole Briefing API (pieces, type, puppets, focusCam, drawAct, whips, spotlight). It is written
   for 1920×1080; in a short the same calls draw on a 1080×1920 canvas. `SAFE` is x 64..930, y 220..1440 here.
2. `packages/kit/src/spy/shorts.ts`: `shortCaption` (kinetic captions), `shortChunks`, `capText`.
3. `workflow/styles/briefing/ACT.md` § "Engine rules" for piece/inks/puppets/numbers rules (all apply), except what this file overrides.

## The file you write
`<scene file path below>`, a single TSX module, the whole short in one act:

```tsx
import React from "react";
import { spy } from "@wealthgap/kit";
const { SpyCanvas, INKS, SAFE, clear, applyCam, piece, roughC, rectP, layout, drawLine, landEach, landEnd, lineRect,
  figureSide, POSE, onTwos, focusCam, drawAct, shortCaption, seg /* … */ } = spy;
type Ctx = spy.SpyCtx;
type Rect = spy.Rect;

export const meta = { id: "A01", title: "…" };

// Foley (act-relative seconds), denser than long-form: one on every visual hit.
export const events = (word: (text: string, occurrence?: number) => number) => [
  { t: word("trillion") - 0.2, type: "card_slap" },
  // types: card_slap paper_slide paper_cut tear metal_click coin_drop tape_click whip stamp_thud pop cash_register typewriter
];

const K = INKS.noir;
// World layout: tall regions stacked vertically (world px; the camera frames them through focus actions).
const R: Record<string, Rect> = {
  hook: [0, 0, 1080, 1500],
  // …
};

const draw = (g: CanvasRenderingContext2D, ctx: Ctx) => {
  const t = ctx.t, w = (s: string, n = 1) => ctx.word(s, n);
  const focus = [
    { t0: 0, t1: w("trillion").t1 + 0.8, rect: R.hook },
    // …
  ];
  const cam = (s: number) => focusCam(s, focus, { pace: 0.45, hold: 0.3, snap: true });   // shorts: 0.5–1.3 s moves
  drawAct(g, ctx, {
    dur: ctx.duration, ground: K.hot, cam, open: "none", close: "none",
    overlay: (h) => shortCaption(h, ctx, { inks: K }),
  }, (h) => {
    clear(h, K.hot);
    applyCam(h, cam(t));
    // … the hook is already landing at t = 0 …
  });
};

export default function Act() {
  return <SpyCanvas draw={draw} />;
}
```

## Overrides for shorts
- **`open: "none"`, `close: "none"`**: no whip in or out. Frame 0 already shows the hook in motion (don't wait for `actIn`).
- **Loop**: from `ctx.duration - 0.5` return to the opening composition (same ground, same camera rect as t = 0, the hook's shape
  back in place) so the replay is seamless.
- **Captions**: exactly one `shortCaption(h, ctx, { inks })` in the overlay; pass `hideAt` for the moments a giant impact number
  shows the same word. Impact text and key action stay above y 1250 on screen.
- **Sizes on screen**: headline numbers ≥ 160 px cap height (layout size ≥ 210 at zoom 1), labels ≥ 40 px.
- **Camera pace**: always `focusCam(s, focus, { pace: 0.45, hold: 0.3, snap: true })` (moves 0.5–1.3 s; with `snap` a move between
  close actions shortens to as little as 0.3 s instead of merging them). Overlapping actions still merge into one wide frame:
  give each action its own window, and check that the sheet's tiles show one region filling the frame, not the whole world.
- **Pace**: a visual hit every 1.5–3 s; whips allowed every ~5 s; one stop-time or spotlight freeze at the payoff.
- **Never**: `brandEndCard`, `chapterCard`, `chapterPill`, `autoSubtitle`, module-level `W`/`H` (use `ctx.W`, `ctx.H`, `SAFE`).

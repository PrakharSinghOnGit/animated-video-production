# Briefing engine: act contract

## Read first
1. `packages/kit/src/spy/README.md`: the whole API, the frame skeleton and an example act. It is accurate; read source files only when you need a detail it doesn't give.
2. `packages/kit/src/spy/preview/Root.tsx`: a worked 20 s demo (number landing, walking puppet, focusCam, whip, spotlight, iris to a chapter card). Its `autoSubtitle` call is legacy: acts do not use it.

## The file you write
`<scene file path below>`, a single TSX module:

```tsx
import React from "react";
import { spy } from "@wealthgap/kit";
const { SpyCanvas, INKS, clear, applyCam, piece, roughC, rectP, layout, drawLine, landEach, landEnd, lineRect,
  figureSide, walkPose, POSE, onTwos, walkStride, focusCam, drawAct, chapterPill, actIn, seg /* … */ } = spy;
type Ctx = spy.SpyCtx;
type Rect = spy.Rect;

export const meta = { id: "A01", title: "…" };

// Foley for this act (act-relative seconds). word(text, n) = start of that spoken word.
export const events = (word: (text: string, occurrence?: number) => number) => [
  { t: word("trillions") - 0.3, type: "card_slap" },
  // types: card_slap paper_slide paper_cut tear metal_click coin_drop tape_click whip stamp_thud pop cash_register typewriter
];

const K = INKS.noir;             // this chapter's ink set
// World layout: one region per beat (world rects). The camera frames regions through focus actions.
const R: Record<string, Rect> = {
  hook: [0, 0, 1900, 1000],
  // …
};

const draw = (g: CanvasRenderingContext2D, ctx: Ctx) => {
  // pure function of ctx.t: no state between frames, no Math.random, no Date
  const t = ctx.t, w = (s: string, n = 1) => ctx.word(s, n);
  // One action per thing being built/acted: the camera arrives before t0 and stays until t1 (+ hold).
  const focus = [
    { t0: 0.6, t1: w("trillions").t1 + 1.5, rect: R.hook },
    // …
  ];
  const cam = (s: number) => focusCam(s, focus);
  drawAct(g, ctx, {
    dur: ctx.duration, ground: K.paper, cam,
  }, (h) => {
    clear(h, K.paper);
    applyCam(h, cam(t));
    // … the act, beat by beat, with piece / drawLine / figureSide …
  });
};

export default function Act() {
  return <SpyCanvas draw={draw} />;
}
```

## Engine rules
- **Every act uses `drawAct`** (whip in over the first 0.6 s, whip out over the last 0.6 s, blur, paper finish) and draws only screen-space extras (chapter pill, spotlight) in its `overlay`. **No subtitles**: on-screen words are impact text only (STYLE.md §4), as cut type in the scene. Don't put hits in those windows; the first beat holds until `actIn(t) === 1`. Pass `from`/`to` as the previous/next act's ground when it differs.
- **The camera is `focusCam` only.** List every action with its real `t0`/`t1` and a world rect; never key raw x/y/zoom (except `pushIn` toward a rect for the act's one spotlight moment). This is what guarantees the camera never leaves unfinished work, so be honest about `t1`: the end of a build, a walk or a landing, plus the time to read it.
- **Numbers are cut type** with `layout` + `drawLine` + `landEach`, complete before the spoken word (`landEnd`). Headline figures ≥ 90 px on screen; set labels via `label` ≥ 30 px on screen. Show a source note (small label) next to a figure from the plan's `data`.
- **Puppets** via `figureSide` sampled `onTwos(t)`; advance x by `walkStride` per walk cycle so feet don't slide. Identity by accent colour/hat, never faces. The figure that is the viewer's stand-in ("you", the saver, the trader) is **the Agent**: pass `hero: true` (three hatband cuts + gold coin tie clip, `brand-assets/mascot/AGENT.md`); other people stay plain extras. Never draw the signature by hand.
- **Inks**: one `INKS` set for the whole chapter; ground changes (paper → hot → ink) mark the act's turn. Warm = the money (on a black keyline); hot = danger/loss/the hero's accent. Never fill shapes directly: always `piece` (cut gap + shadow).
- **Chapter acts** (`chapter` in the plan): open with `open: "iris"` or `"strips"` from the previous chapter's ground, show `chapterCard(g, n, title, progress, inks)` during the narration pause (progress over 0.6 s → first spoken word − 0.3 s), then go to the first beat; `chapterPill` in the overlay for the rest of the chapter. In non-chapter acts of a chapter, keep the pill in the overlay too.
- **Brand end card** (only the act that contains the subscribe line; the brand appears nowhere else): call `brandEndCard(h, t, w("subscribe"))` as the last thing in `drawAct`'s overlay, and add events `paper_slide` at subscribe − 1.2, `card_slap` at − 0.7, `stamp_thud` at the word. If it is the video's last act, end it with `close: "none"` so the card holds.
- **Pace**: a whip is an event (≤ 1 per 20 s inside an act); otherwise let `focusCam` make calm moves. Stop-time (freeze everything for a beat on a stab) at most once per act, at the act's biggest reveal.

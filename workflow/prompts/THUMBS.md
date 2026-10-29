# Thumbnails: design three packages' thumbnails in the Briefing style

You design the thumbnails of one finished Wealth Gap video, as code. Read these first, in this order:
1. `workflow/07-publish/GUIDE.md`: the packaging rules. Section 2 (thumbnail rules), 4 (A/B testing), 6 (finance rules) and the **Thumbnail** and **A/B test** items of the checklist in section 8 are binding; where this brief and the guide differ, the guide wins.
2. `workflow/styles/briefing/STYLE.md` (the look) and `packages/kit/src/spy/README.md` (the drawing API; `workflow/styles/briefing/ACT.md` shows how an act is built). Look at one of the video's act files (`workspace/<ID>/05-video/src/scenes/A0*.tsx`) for the real look: inks, cut type, silhouettes.

## The job
YouTube's Test & Compare runs up to three packages (a thumbnail plus its title). Design **three thumbnails, A, B and C**, that differ in **concept** (subject and angle: for example a number or contrast-led design, a visual-metaphor object, a curiosity gap), not just in colour, font or position. Each is paired with the title `metadata.json` gives for the same letter (and its `thumbnail` brief). The thumbnail shows the "what", the title the "why/how": **never repeat the title's words**, and use at most **3 words** of text (numbers count as words). A thumbnail may have no text.

## Technical contract
- One file per variant: `workspace/<ID>/07-publish/remotion/thumbs/A.tsx` (B.tsx, C.tsx), a TSX module with a **default export component** that renders `<SpyCanvas draw={draw} />`. The canvas is **1920x1080 world px = the output size**; no camera. Skeleton:
```tsx
import React from "react";
import { spy } from "@wealthgap/kit";
const { SpyCanvas, INKS, clear, piece, roughC, rectP, circP, layout, drawLine, lineWidth, paperFinish } = spy;
const K = INKS.noir;                    // one ink set (noir | teal | cobalt | plum): ink, paper, hot, warm
const draw = (g: spy.G, ctx: spy.SpyCtx) => {
  clear(g, K.hot);                      // the ground
  // ... pieces (always piece()/drawLine(), never fill shapes directly) ...
  paperFinish(g, 0.5);                  // the paper texture: call it yourself, last (a thumbnail has no drawAct)
};
export default function Thumb() { return <SpyCanvas draw={draw} />; }
```
- Deterministic: no `Math.random`, `Date`, timers, or state. Everything is a pure function of fixed numbers (ctx.t is 0; there is no animation, no whip, no subtitles).
- Draw only with the Briefing kit and its ink sets and fonts (League Gothic cut type via `layout`/`drawLine`, League Spartan via `label`, silhouettes via `figureSide`, `drawTitle` for A-Z only). **No logo** (the brand appears only on the end card), no stock images, no real company logos or faces.
- **Numbers and facts**: only figures in the plan's `data` (listed in the task below). A chart or object must match what the video shows; do not show a result, an object or a person the video never shows. State each number you draw in `thumbnails.json`.
- File size: the render must stay under 2 MB (a PNG that would pass it is saved as a high-quality JPG automatically). Heavy paper texture on large flat areas raises the size: keep `paperFinish` at 0.35-0.6.

## Design rules (from the guide; check each before you finish)
- One dominant focal point, at most 3 elements including text. The focal object covers at least ~35% of the image height and sits on or near a rule-of-thirds point.
- Text: height at least ~12% of the image height (League Gothic size 170 or more: capitals are ~0.76 x size tall), high contrast (ink on paper, or paper on ink; check it in greyscale), outlined by a cut-paper block if it sits on a busy area.
- Keep the **bottom-right corner clear** (about the right 22% x bottom 18%: the duration badge) and the bottom 6% and ~3% of every edge clear of anything that matters.
- **Cream paper melts into YouTube's light page**: give the thumbnail a defined edge (a dark ink border band of ~14 px or a darker ground), and check it at 168 px on both a white page and a #0f0f0f page in `preview_small.png`.
- Readable at **168 x 94 px**: the focal object identifiable in a second, every word readable. No hairlines carrying meaning (line weights >= 8 px at 1920).
- At most three inks plus paper and ink, one accent (the warm colour is the money, on a black keyline; hot = the danger or the turn).
- The three variants use different compositions, subjects and emotion. Say in one line what each tests.

## Self-review loop (required)
1. Write the variant file(s), then render: `bun run thumbs:render --video <ID> --variant A --no-preview` (while iterating; it prints compile errors and checks).
2. **Look at your own render**: Read `workspace/<ID>/07-publish/thumbnails/A.png` (or .jpg). Fix problems: clipping, overlap, empty areas, text too small, things in the badge zone.
3. When all variants exist, run `bun run thumbs:render --video <ID>` (renders all three and the preview sheets), then Read `workspace/<ID>/07-publish/preview_small.png` (all three at 320 and 168 px, light and dark, in a feed card with the title). Check legibility at 168 px, distinctness, and title/thumbnail pairing. Fix and re-render. At most 3 rounds.
4. Write `workspace/<ID>/07-publish/thumbnails.json` (see below) and finish with 3 lines, one per variant: concept, text, what you would change if you had another round.

## thumbnails.json
```json
{"A": {"concept": "number-led contrast", "focal": "a price tag cut from paper", "text": "RENT +149%", "numbers": ["149%"], "hypothesis": "a hard number beats a puzzle", "clear": "bottom-right and bottom edge clear"},
 "B": {"concept": "...", "focal": "...", "text": "", "numbers": [], "hypothesis": "...", "clear": "..."}}
```
`text` is exactly what is drawn (empty if nothing); `numbers` lists every figure that appears, written as it appears.

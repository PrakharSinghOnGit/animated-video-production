# Thumbnails in the Briefing style: the kit, the file, the character

Read `workflow/styles/briefing/STYLE.md` (the look) and `packages/kit/src/spy/README.md` (the drawing API). Look at one of the video's act files (`workspace/<ID>/05-video/src/scenes/A0*.tsx`) for the real look: inks, cut type, silhouettes.

## The file
One file per variant: `workspace/<ID>/07-publish/remotion/thumbs/A.tsx` (B.tsx, C.tsx), a TSX module with a **default export component** that renders `<SpyCanvas draw={draw} />`. The canvas is **1920x1080 world px = the output size**; no camera. Skeleton:
```tsx
import React from "react";
import { spy } from "@wealthgap/kit";
const { SpyCanvas, INKS, clear, piece, roughC, rectP, circP, layout, drawLine, lineWidth, figureSide, POSE, paperFinish } = spy;
const K = INKS.noir;                    // one ink set (noir | teal | cobalt | plum): ink, paper, hot, warm
const draw = (g: spy.G, ctx: spy.SpyCtx) => {
  clear(g, K.hot);                      // the ground
  // ... pieces (always piece()/drawLine(), never fill shapes directly) ...
  paperFinish(g, 0.5);                  // the paper texture: call it yourself, last (a thumbnail has no drawAct)
};
export default function Thumb() { return <SpyCanvas draw={draw} />; }
```
- Deterministic: no `Math.random`, `Date`, timers, or state. Everything is a pure function of fixed numbers (ctx.t is 0; there is no animation, no whip, no subtitles).
- Draw only with the Briefing kit and its ink sets and fonts (League Gothic cut type via `layout`/`drawLine`, League Spartan via `label`, silhouettes via `figureSide`, `drawTitle` for A-Z only). **No channel logo** (the brand appears only on the end card), no stock images, no faces. A company's logo (`spy.logo`) only when the video is about that company and the plan's acts show it.
- File size: the render must stay under 2 MB (a PNG that would pass it is saved as a high-quality JPG automatically). Heavy paper texture on large flat areas raises the size: keep `paperFinish` at 0.35-0.6.

## Sizes that survive a phone
- Cut type: League Gothic capitals are ~0.76 x size tall. One or two words: size 300-420 (a quarter to a third of the height). Never under 230. Give letters room: the text recogniser in the phone check fails tight stacks of condensed type, and so do people. Two short lines need a clear gap between them (at least 0.25 x size).
- Type sits on a flat ground of the opposite tone (paper on ink, ink on paper, paper on hot) or on its own cut-paper block. Ink on hot is weak: avoid it for words.
- Line weights of 14 px or more at 1920 for anything that carries meaning. A dashed line, a chart of candles, a row of small tokens are gone at 168 px: draw one solid shape instead.
- Border: a band of ~16 px in a tone that differs from the ground, so the image has an edge on a white page and on a #0f0f0f page.

## The character: the Agent
`figureSide(g, x, y, s, pose, { hero: true, col, accent, paper, warm })` is the Agent, the viewer's stand-in ("you"). He has no face, so his **size and pose** carry the feeling:
- When the subject axis is `character`, he is the biggest thing in the frame: **s = 1.5 or more** (he is ~540 px tall at s = 1), cropped by the frame if needed (hat to waist is enough to read as him). At s = 0.6 he is a detail, not a subject.
- Pose is the expression: `POSE.reach` (grasping at something leaving), `POSE.skid` (stopping short), `POSE.flatten` (hiding), `POSE.leap` (falling or jumping), `POSE.overShoulder` (watched, looking back; `eye: "open"`). `POSE.stand` says nothing: use it only when what stands over him says it.
- One figure is "you". A second, larger, darker figure without `hero` is the other side. Never more than two figures.
- Give him one thing to react to, close to him and large: the price tag, the door, the bill. A person plus the thing that is happening to them is the scene.

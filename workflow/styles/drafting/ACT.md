# Drafting engine: act contract

## Read first
1. `packages/kit/src/draft/README.md`: the whole API and the frame skeleton. It is accurate; read source files only for a detail it doesn't give.
2. `packages/kit/src/draft/preview/Root.tsx`: a worked 20 s demo in three acts (title pressed into a line → pen-tool curve → ribbons → curl into shapes → honeycomb → flood into blueprint → cubes → gears → dashboard → scan into hologram → 3D bars → globe → end title with Penny). Copy its patterns, not its content.
3. `brand-assets/mascot/CHARACTER.md` if the act uses Penny.

## The file you write
`<scene file path below>`, a single TSX module:

```tsx
import React from "react";
import { draft } from "@wealthgap/kit";
const { DraftCanvas, drawAct, INK, PAL, spring, move, seg, lerp, clamp, bounce, pop, land, wobble, idle, stagger, specks, lineP, circleP, polygonP, morph, line, fill, shape,
  text, label, fitSize, dropIn, capHeight, cube, drawMesh, drawSolids, bars, counter, panel, penny /* … */ } = draft;
type Ctx = draft.DraftCtx;
type G = draft.G;
type Pt = draft.Pt;

export const meta = { id: "A01", title: "…" };

// Foley for this act (act-relative seconds). word(text, n) = start of that spoken word.
export const events = (word: (text: string, occurrence?: number) => number) => [
  { t: word("trillions") - 0.05, type: "tick" },
  // types: see "Sound" below
];

const INKNAME = "paper" as const;   // this act's ink (the plan's `sheet`)
const K = INK[INKNAME];

// One function per beat: (h, t, w) => void, each drawing its shapes as a function of t.
function beatLine(h: G, t: number, w: (s: string, n?: number) => { t0: number; t1: number }) {
  // …
}

const draw = (g: G, ctx: Ctx) => {
  const w = (s: string, n = 1) => ctx.word(s, n);
  drawAct(g, ctx, { ink: INKNAME, fig: { n: 1, name: "draft" }, meta: "SHEET 01 / 12" }, (h, t) => {
    // pure function of THIS t (sub-frames for motion blur): never ctx.t in here
    beatLine(h, t, w);
    // …
  });
};

export default function Act() {
  return <DraftCanvas draw={draw} />;
}
```

## Engine rules
- **Every act uses `drawAct`**; draw only lines, fills, type, 3D and Penny inside the scene. `fig` = `{n: act number in the video, name: one word for the act}`; `meta` = `SHEET nn / NN` (act n of N) or a running value that fits.
- **Locked camera.** No camera at all: compose in screen space inside `restRect()` (150 px side border, 90 px top/bottom). Things in motion may cross the border.
- **Made out of the previous shape.** Each beat starts from the shapes the previous beat ended with and transforms them (`morph`, press, unfold, extrude, tile, split). Keep the beat functions' end states and start states identical (same points, same positions) so the hand-over is seamless. The act's first frame is the plan's `transitionIn` shape (the previous act's last shape, or the chapter card).
- **Ink changes** happen at the end of the outgoing act: `close: "flood"` (paper → blueprint; `floodShape(u)` grows a shape from the scene, e.g. a hexagon cell, past the frame) or `close: "scan" | "scanUp"` (to/from hologram), with `to: <next ink>` and `handoff: (h, t) => …` drawing the next act's first shape in the next ink. Only when the plan says the next act changes ink. In the full video the seam is planned by the pipeline (`bun run seams`): one owner per cut, and the scan/flood reveals the neighbouring act's real first/last frame (`to`/`handoff` are the fallback for single-act previews). Don't also set `open` on the next act for the same change.
- **Chapter acts** (`chapter` in the plan): start with `chapterCard(h, t, {ink, n, title, t0: 0.2, pressAt: firstWord - 0.4})` during the narration pause; once `pressed === 1`, continue from the returned `rail` line (it becomes the act's first shape).
- **Hits land on the word**: start moves 0.05–0.3 s before `w(word).t0` (springs from `spring(t, t0 - 0.05)`); a number must be readable at its word.
- **Motion with weight** (STYLE.md §5): arrivals `bounce`/`pop` (squash and stretch, start 0.1–0.15 s before the word), impacts `land` + `specks(g, t, hit, x, y, {ink})` + `wobble`; held shapes `idle`; rows `stagger`. `spring` stays for exact moves (lines, rails, morphs).
- **Numbers are big type** (`text` ≥ 90 px; headline figures 160–400 px) or `counter` (rolls up, complete at its word). Labels via `label` ≥ 24 px (weight 500–700, default 600, outlined automatically). No source notes by default (the description lists them); one small label only for a figure that needs it to be believed, in clear space.
- **Always transforming**: something changes at least every 1.5 s; the pencil boil alone does not count except on a figure being read.
- **3D**: `drawMesh` for single wireframes (hidden edges dashed), `drawSolids` for solids that hide each other (bars on a floor, stacked cubes, a drum with words via `faceDraw`); turn objects, never the view.
- **Penny** (optional, ~half the acts): `penny(h, x, y, {ink: INKNAME, s ≤ 2.5, pose, mood, t})`; her mood follows the narration; at most one on screen; never text or speech bubbles on her.
- **Colour**: the ink's line colour for structure, its accent for the one thing that matters; no other colours, no gradients, no glows.
- **Logos and icons**: `logo(h, name, x, y, size, {ink: INKNAME, progress, fillProgress})` draws a company logo (`"tesla"`, `"hdfcbank"`) or a generic icon (`"mdi:bank"`, `"mdi:piggy-bank"`) in the ink, drawn on and hatched in. Search names with `bun run icons <words>` before using them (unknown names throw). Make it out of the previous shape: `morph` the last shape into `iconOutline(logoPolys(...))`, then the full logo. Use them where they carry meaning (the company the narration names), ≥ 120 px. A company with no logo: its name in `text`, never a drawn imitation.
- **Brand end card**: the act containing the subscribe line ends on the end title: `text(..., "THE WEALTH GAP", { fill: "scan" | "auto" })` with a rail and Penny waving, complete at `w("subscribe")`; events `sweep` at subscribe − 0.6, `click` at the word. If it is the video's last act, hold it to the end.

## Sound
Export `events(word)`: one small sound per visible action, quieter than the voice. Types: `tick` (a gear step, a ruler tick, a counter digit), `ratchet` (a ruler sweeping, a sort), `click` (cursor, toggle, a part snapping into place), `sweep` (a scan line or a flood), `press` (a rail pressing type flat), `whoosh` (a word whipping in), `step` (Penny's footsteps, one per step), `pop` (a shape landing, a cell filling), `typewriter` (letters typing on). The foley step maps them to the library; until the Drafting foley set exists, `card_slap paper_slide paper_cut metal_click coin_drop tape_click whip stamp_thud pop typewriter` are also accepted.

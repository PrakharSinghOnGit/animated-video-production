# Penny — The Wealth Gap's guide character

Penny is a coin who walks through the drawings with the viewer. She points at what matters, reacts to the numbers and stands in for the viewer when something surprising or unfair happens. She is the channel's own original character, designed for the Drafting style (2026-11-01).

**The drawing code is the source of truth:** `packages/kit/src/draft/mascot.ts` (`penny()`). Every appearance (videos, shorts, thumbnails) must call it; never redraw, trace or restyle her by hand or with an image model. The sheets in this folder are rendered from that code: `penny_sheet_paper.png`, `penny_sheet_blueprint.png`, `penny_sheet_hologram.png` (re-render: `bun run studio --style drafting`, compositions `PennyPaper` / `PennyBlueprint` / `PennyHologram`, or `bunx remotion still packages/kit/src/draft/preview/Root.tsx PennyPaper out.png --gl=angle`). If the code changes, re-render the sheets in the same commit.

## Construction (units; coin radius R = 50)

| Part | Spec |
|---|---|
| Body | a coin: circle radius 50; inner rim at 0.8 R (two concentric outlines); the band between them is filled by the ink (paper/blueprint hatching, hologram scan lines) |
| Thickness | 13 units, seen only when she turns (`turn`); the edge is reeded (18 ticks) |
| Face | two round eyes radius 6.5, 15 units either side of centre, 4 units above it; solid in the line colour with a small highlight (white on the hologram, no highlight); mouth 15 units below centre |
| Brand mark | three short slanted stripes on her forehead in the ink's accent colour (they echo the three bars of the channel logo). Always there when her face is visible |
| Arms | noodle arms from the coin's sides at centre height, 34 units long, small round hands (radius 5) |
| Legs | two straight legs 34 units long, 16 units apart, small oval boots pointing forward |
| Size on screen | `s = 2.5` px per unit → ~250 px wide (the default); never taller than ~25 % of the frame; `s ≥ 1.2` so her face reads |

## Inks (she is never a fourth colour)

| Ink | Outline | Band fill | Eyes | Stripes |
|---|---|---|---|---|
| paper | graphite pencil (boiling with the paper) | sparse blue hatching | graphite + cream highlight | blue |
| blueprint | white clean line | fine white hatching | white + blue highlight | cyan |
| hologram | cyan with white core | cyan scan lines | white | white |

## Poses and moods

- Poses: `stand`, `walk`, `run` (6 steps a second, leaning 7° into the run), `point` (aim with `aim`), `present` (both arms out), `shrug`, `pencil` (holds a drafting pencil forward like a pointer), `wave`, `sit`.
- Moods: `happy` (default smile), `neutral`, `surprised` (bigger eyes, O mouth), `worried` (tilted brows, wavy mouth), `smug` (half-lidded eyes, crooked smile).
- Turn: `turn` 0 = facing us, PI/2 = edge-on (a thin coin with a reeded edge; the face disappears). Turning edge-on is her signature move (to slip through a gap, to vanish, to flip like a coin toss).
- She blinks on her own clock when `t` is passed (~every 3.6 s).

## Personality

Curious, quick, a little cheeky; she is on the viewer's side. She is surprised by the big numbers, worried when the viewer is about to be the liquidity, smug when the trick is revealed. She never lectures.

## Rules

- At most one Penny on screen; in roughly half the acts, not all. She guides; the data stays the subject.
- No speech bubbles, no text on her, no props other than the pencil, no clothes or accessories, no colour fills of her own.
- She lives in the drawing: she stands on lines, rails, bar tops and floors, and runs along them; she does not float.
- Thumbnails may use her in the same three inks only, drawn by the same code.
- Don't change her proportions, eyes, stripes or the coin rim; a new pose or mood is added in `mascot.ts` (and the sheets re-rendered), not improvised in an act.

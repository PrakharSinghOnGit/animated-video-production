# Drafting — The Wealth Gap house style

> Money explained on a drafting table: one drawn line gets promoted three times (graphite on paper, wire on a blueprint, light on black) and never leaves the screen. Every shot is made out of the previous one: shapes, type and colour transform into the next idea. No cuts, no fades. The camera is locked like a drafting table; objects turn, the camera never moves.
> Reference for the grammar only (look, motion, transitions): a 30 s motion-design reel built from a published prompt (private notes in `reference/`, gitignored). Copy none of its storyboard, words or character: our acts come from our script, our guide is Penny.

## 1. Essence, and what it is not

- **One line, three inks.** Everything is geometry drawn in the ink on screen: a pencil line on paper becomes a white wire on the blueprint becomes cyan light on black. The same shape survives the change of ink.
- **Every shot is made out of the previous one.** A line bends into a curve, curls into a circle, becomes a hexagon, tiles into a honeycomb, extrudes into cubes, flattens into a gear, unfolds into a dashboard. The viewer never sees a new picture appear from nothing.
- **Data is the native subject.** Bars, rings, counters, dashboards, mechanisms (gears), surfaces (waves), the globe: finance is drawn as structures that build themselves while the narrator explains them.
- **Locked camera.** Front-on, still, like a drawing pinned to a table. Depth comes from objects turning in 3D (perspective may switch on), never from the camera.
- **Penny guides.** The channel's coin character appears now and then to point, present, react or run along a line. She is a guide, never the subject (§9, `brand-assets/mascot/CHARACTER.md`).

It is **not**: a slide deck (no boxes of bullet text), a flashy tech promo (no glows, particles, flares, shake, RGB split), a stock-footage explainer, a cartoon with backgrounds. This is a 10-minute explainer: precise, calm, always transforming.

## 2. Inks (materials & rendering)

| Ink | Ground | Lines | Fills | Accent (= next ink's colour) |
|---|---|---|---|---|
| **PAPER** | cream paper `#EDE6D5` with grain, 60 px blue grid at 13 % (every 5th at 26 %) | graphite pencil: pushed off true by slow sine waves whose phase steps 8×/s, stroked twice (full width 90 %, half width 40 % with more wobble), paper tooth knocked out, multiplied onto the paper | diagonal hatching drawn one line at a time; cross-hatching for emphasis; big type is hatching cut to the letters with a doubled outline | blue `#1B3ED2` |
| **BLUEPRINT** | flat blue `#1B3ED2`, the same grid in white | clean white 3–4 px; hidden edges dashed and thinner | fine clean hatching | cyan `#45F0DD` |
| **HOLOGRAM** | black `#07080A`, the grid in cyan | cyan with a white core 30 % of the width | horizontal scan lines on an 8 px pitch, thickness = how lit the surface is | white |

No blur halos, no glow: light reads through line density only. The kit (`packages/kit/src/draft/`) draws all of this; an act never re-implements it.

## 3. Colour logic

Six colours only: cream, blue, cyan, black, graphite, white. Each **chapter is one ink**, chosen by what the chapter does:

| Ink | Use it for |
|---|---|
| paper | the human story, the setup, the first sketch of an idea, the "what you think happens" |
| blueprint | how it actually works: mechanisms, plumbing, rules, structure, flows of money |
| hologram | the data reveal, the scale, the system seen whole, the future, the peak of the video |

Prefer the order paper → blueprint → hologram → paper (each accent is the next ink's colour, so it feels like promotion). A chapter may change ink once at its turn (one act), never more. The accent is rare: the one thing that matters in the frame (the bar that is "now", the number to remember, the line that is you).

## 4. Type & impact text

- **Geist only.** Weight 900 for big words and numbers (≥ 90 px on screen; headline figures 160–400 px); 500–700 for labels (default 600; never 800+, it clogs) at 24–28 px, tracked 0.14–0.3 em, uppercase, with a thin outline in the paper colour (`label` does it).
- **No running subtitles.** On-screen words are impact text staged in the drawing: a figure as big type, a key term between rails, a label on a part. YouTube captions come from `bun run srt`.
- Big type takes the ink's fill: hatched on paper, solid or clean outline on the blueprint, scan lines or solid cyan on the hologram.
- **Corner labels on every frame** (drawn by `drawAct`): top left `FIG. 07 — GEAR` (the act's number in the video and its one-word name), bottom right a counter (`SHEET 07 / 12`, or a running value that fits the act).
- Sources live in the video description, not on screen. A small source note only for a figure that needs it to be believed, and only where it overlaps nothing.

## 5. Motion

- **Elastic springs with weight.** Things arrive on springs that overshoot and settle (`bounce`, `pop` with squash and stretch); presses and slams land with a thump (`land` squash, `wobble`, a burst of pencil `specks`). `spring` (critically damped, no overshoot) is for precise moves: lines extending, rails, morphs between exact shapes. Exponential ease-in/out for wipes and exits (`expIn`, `expOut`, `move`).
- **Secondary motion.** After a hit, something reacts (a part jiggles, Penny flinches, a neighbouring bar dips); held shapes idle (`idle`) instead of freezing; rows pop in staggered (`stagger`).
- **Land on the word.** Every move that matters starts 0.05–0.3 s before its spoken word so it lands on it (`ctx.word`).
- **Always transforming.** Something changes at least every 1.5 s (the reel's 0.5 s rule is for a 30 s piece; a 10-minute explainer needs room to read). Holds longer than 1.5 s are allowed only for a figure the viewer must read, and the pencil boil keeps paper alive meanwhile.
- **Kinetic type** between rails: letters rise through a baseline, words whip in (1400 px in 0.2 s), rails clap shut on a word and reopen, letters drop in one by one, a rail presses a word flat into a line.
- Motion blur is automatic (sub-frames inside `drawAct`).

## 6. Camera

**Locked.** Front-on, no pan, zoom, roll or shake, ever. The director's `camera` field is always `"locked"`; describe instead how objects turn ("cube turns a quarter, perspective switches on"). Things travelling through the frame may cross the border; nothing rests within 150 px of the sides or 90 px of the top and bottom.

## 7. Transitions

- **Inside an act:** no cuts. Each beat transforms the previous beat's shapes (see §8).
- **Between acts of the same ink:** the next act starts from the exact shape the previous act ended on. The director names it in `transitionIn` ("continues from A04's three gears"), and the act authors match it.
- **Ink change** (the outgoing act performs it in its last 0.5 s, `close` + `handoff`): paper → blueprint by a shape from the scene that floods the frame with a hard edge (a hexagon cell, a bar, a circle); blueprint → hologram and hologram → paper by one horizontal scan line (a toggle "LIGHT" being clicked is a good motivation). The next act opens on the handoff shape in its own ink.
- **Chapter acts** open with `chapterCard` (CHAPTER 02 small, the title big in the chapter's ink, a rail above it); just before the first spoken word the rail presses the title flat into one line, and that line becomes the act's first shape.

## 8. Native moves (the vocabulary)

| Move | What it is | Good for |
|---|---|---|
| rail press | a rail drops and crushes type into one line | ending a title, "flattened", "wiped out" |
| rails clap | a word between two rails; they shut on it and reopen | a key term, a definition |
| pen-tool bend | a line gets Bézier handles (labelled) and bends into an S | trends, "the curve", growth |
| ribbon fan | copies of a line fan out, then travel as sine waves | volatility, cycles, many outcomes |
| curl & morph | line → circle → triangle → square → hexagon, hatching building inside | an idea taking shape, categories |
| tile | a shape copies itself into a honeycomb / grid; cells fill solid one by one | counts, shares of a whole, "1 in 5" |
| extrude | a flat shape gets depth (hexagon → cube corner-on), perspective switches on | "underneath", structure, going deeper |
| gear train | gears grow teeth and mesh, stepping on the spoken hits | mechanisms, cause → effect, compounding |
| unfold | a cube unfolds into a cross of six squares that become dashboard panels | revealing the system, "let's look inside" |
| dashboard | panels, bars, counters rolling up, a cursor clicking a switch | data, comparisons, live numbers |
| bars ↔ ring | a bar chart's baseline bends into a circle | cycles, a year round, shares |
| floor & columns | bars stand up on a floor, gain depth, sort into a staircase | ranking, inequality, growth |
| ridge waves | a line multiplies into rows going back; a wave runs across | markets moving, crowds, flows |
| globe | a wire globe; a ripple runs down it; halves twist | global scale, contagion, markets worldwide |
| drum type | a prism rolls one word per face | lists of three, "it's not X, it's Y" |
| orbit ring | a ring of type orbits a solid | the peak / thesis of the video |
| line of light | everything presses flat into one line of light, which fans into scan lines and leaves a word | endings, the final takeaway |
| Penny acts | Penny points, presents, shrugs, runs along a rail, sits on a bar | the viewer's stand-in, humour, transitions |

## 9. Penny

The guide character: a coin with a rim, legs, noodle arms, a face and three brand stripes on her forehead. Rules (full spec: `brand-assets/mascot/CHARACTER.md`):
- Draw her only with `penny()` from the kit; never redraw or restyle her. She is drawn in the ink on screen and is never a fourth colour.
- At most one Penny on screen, at most ~25 % of the frame height, in roughly half the acts. She reacts and guides; the data stays the subject.
- No speech bubbles and no text on her. Her mood follows the narration (happy, neutral, surprised, worried, smug).

## 10. Composition

Centred, symmetric, drafting-sheet compositions: one idea big in the middle (geometry 400–1500 px wide), small tracked labels and dimension lines around it. Leave the border clear. A frame holds one idea; the next idea is made from it.

## 11. Banned

Glitter or glowing particle effects (pencil specks on an impact are fine), glows, lens flares, camera moves of any kind (a short thump shake on the biggest hit is fine), RGB split, crossfades, generic gradients, rubbery bounce on everything (overshoot is for arrivals and impacts), holds over 1.5 s without a reason, stock footage, logos, real faces, boxes of bullet text, anything that looks like a template.

## 12. Data honesty

Only the plan's sourced numbers; bars start at zero unless the axis says otherwise; never stretch a scale for drama; an unsourced figure is not drawn (draw the empty slot).

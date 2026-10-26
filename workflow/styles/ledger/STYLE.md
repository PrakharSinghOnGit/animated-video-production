# Ledger — The Wealth Gap house style

> Money explained on a bookkeeper's desk: real numbers drawn mark by mark on cream ledger paper with a black-and-red pencil, paper cut-outs for the things money buys, rubber stamps for verdicts, halftone ink for the big areas. One long sheet per act; the camera travels across it and never cuts inside an act.
> Built on the grammar of LemoLab's *Data Storytelling* style (lemo-opuscar, MIT / CC BY 4.0: https://github.com/lemomo-ai/lemo-opuscar). References for grammar only: Hans Rosling's talks (one dot is a character), The Pudding (one idea at a time), Polymatter / Vox (long-form pacing). Copy none of their layouts, characters or type.

## 1. Essence, and what it is not

**The ledger is the film.** Every mark is a sourced number, every movement is a meaningful operation on the page: a mark lands, an axis grows, a column is totalled, a cut-out is placed, a stamp comes down. You change the framing, never the numbers.

**Accounting is the visual metaphor.** Black lead writes what is recorded (facts, values, history). Red lead writes losses, warnings, and the turn ("in the red"). A change of lead is a change of meaning, and it is rare.

It is **not**: a slide deck (no boxes with text in them, no title + bullet layouts), a dashboard (one idea at a time), a gradient tech keynote, or decoration. If a frame could be a PowerPoint slide, redraw it.

**Long-form, not an ad.** 8–10 minutes in 6–10 acts of 45–120 s. Stay on a view, let the viewer read it, build it up while the narrator explains, then move. Calmer than a product launch; the motion is in the drawing and the camera, not in constant flashing.

## 2. Materials & rendering

- **Paper**: warm cream with fixed-seed fibre noise and **faint ledger rules** (horizontal pale rules every 48 px, one pale red margin line at the left of each sheet) in world space. The rules give the camera something to move against.
- **Ink**: dark warm ink for set type, axes and series; pale warm grey for grid and zero lines.
- **Pencil marks**: graphite grain, low-frequency wobble, two passes, tapered ends. Everything hand-drawn is drawn on (progress 0→1), never faded in.
- **Handwriting** for notes and labels pinned to data: per-glyph jitter, written left→right while the pencil tip dances over the x-height. Leaders are curved and end in an **un-closed** ring around the mark.
- **Paper cut-outs** for objects and actors (a company, a share certificate, a house, a coin stack, a person): flat colour shapes with a **2–3 px white border**, a soft offset drop shadow (light from upper left) and a tiny lift when placed. They are props laid on the ledger, not illustrations painted into it.
- **Halftone ink** for large areas (a market's size, a map region, a stacked area): a dot screen in one spot ink, slightly misregistered (1–2 px) from its pencil outline.
- **Rubber stamps** for verdicts (SOLD, IPO, BANKRUPT, 10×): red ink, uneven coverage, a slight rotation, a slam with a 2-frame scale overshoot and a thud.
- **Grain**: added in ffmpeg at mux time (light), never drawn per frame.

## 3. Colour logic

| Token | Use |
|---|---|
| `paper` #F4EFE4 | the page |
| `rule` #DCD3C2, `margin` #E2B6AE | ledger rules, the red margin line |
| `ink` #2A2622, `inkSoft` #6E665C | set type, axes, series; secondary type |
| `lead` #34312D | black pencil (records) |
| `red` #B0302A | red pencil, stamps, losses, warnings |
| `green` #2F6B4F | gains, money in (one spot ink) |
| `blue` #2E5A84 | second series / comparison only (one spot ink) |
| `ochre` #C99A3B | highlights, gold, the one accent per act |
| cut-out fills | muted paper colours: `kraft` #C8A97E, `sage` #A7B89B, `dusty` #9DB1C6, `blush` #D9A79A, `straw` #E3CC8A |

- Colour encodes meaning, never decoration: green = money in / gains, red = money out / losses / warnings, blue = the comparison series, ochre = the one thing to look at.
- **At most two spot inks on a sheet** besides ink and red. Honesty beats drama: never stretch a scale to make a change look bigger.
- No gradients, no glows, no neon, no pure black, no pure white fills (cut-out borders are the only white).

## 4. Type

- **Set type** (printed elements, the act's headline written at the top of the sheet): Fraunces (OFL), weight 600 for headlines, 400 for running labels.
- **Hand** (notes, labels pinned to marks): Caveat (OFL), in the lead colour that matches its meaning.
- **Figures and ticks**: IBM Plex Mono (OFL). Numbers on screen are always digits with units ("$9.6T", "7%"), never spelled out.
- **Subtitles are the figure caption**: Fraunces 400, ink, left-aligned to the sheet, ≤ 2 lines, a hairline rule above. Words appear on their spoken timestamps.
- Every text holds ≥ (characters ÷ 15 + 1.5) s once fully drawn. Fewer words per screen beats faster screens.

## 5. Motion quality

- **The voice drives the beats, the music grid places them.** A visual hit is *complete* on its spoken word: the motion starts earlier (anticipation 3–6 frames, then action), so the number is readable as it is said. If a music beat lies within ±150 ms of the word, land on the beat.
- **Pencil acting**: lift before a mark, land with the shadow meeting the tip, small rebound. It hovers before a key mark, lingers on a fresh mark, and leaves the frame when the viewer should just look. Calm, never darting: hops ≥ 0.5 s, handwriting about 9 characters a second (the kit's `pencilPerformer` and `writeTime` enforce this).
- **Camera tempo**: moves take 1.1–2.8 s depending on distance and zoom (the kit's `shots` enforces a minimum); act entries and exits take ~1.8 s. A long-form explainer stays on a view and lets it be read.
- **Build, then hold.** A diagram is drawn while it is explained, then the camera holds on it while the narrator finishes. No idle element: if nothing is being drawn, the camera is breathing (slow drift, ≤ 2% over 10 s).
- **Rescale** reads as ratchet steps; **morphs** are staggered sweeps (bars into a unit grid, a map into a ranking).
- **No fades to blank, no dissolves, no hard cuts inside an act.** Transitions are page operations: a pull-back, a pan along the sheet, a column totalled into the next idea, a cut-out picked up and carried to the next spot.

## 6. Camera grammar

A 2D camera `{x, y, zoom, roll}` over one long sheet per act. Each act is one take.

| Move | Expresses | Use for |
|---|---|---|
| Extreme close-up on one mark, follow its leader | one fact, one life | a single company, a single investor |
| Full view first, then dive to one mark | the pattern before the case | a market, then one stock |
| Pull back as axes grow out of the marks | the unit arrives | naming the measure |
| Track the pencil, newest mark at ~60% width | progress through time | a price history, a timeline |
| Lateral pan to the next column of the ledger | the next step of the argument | "now the second reason…" |
| Punch-in over 2 frames + decaying shake | surprise | a crash, an outlier |
| Locked-off | the change is the movement | a morph, a slow read |
| Hold, then slow pull back | the part inside the whole | a verdict, context |

Subjects fill ≥ 1/3 of frame height at key moments. Leave the bottom 140 px for the caption.

**Between acts** (the only cuts allowed, and they are designed): the camera lifts off the sheet to show the desk, the finished sheet is slid aside or turned over, and the next sheet is pulled in; or a cut-out from the last act is carried onto the next sheet. Land the transition on a downbeat.

## 7. Sound palette

- **Foley** is paper, graphite and wood: pencil taps and scratches, a ruler hiss for axes, paper slide for a cut-out, a stamp thud, a page turn between acts, an adding-machine clack for a total. Every visible action has a sound, mixed light.
- **Music**: a calm, warm bed (soft keys or plucked strings, felt piano, upright bass, brushed percussion) at one tempo per act, 80–100 BPM. Avoid generic "epic piano and strings". Optionally sonify a series: pitch = value on a pentatonic scale.
- **Silence** before the turn of each act and before the biggest number of the video. The first sound after it is the most important one.
- **J- and L-cuts** across act transitions: the next act's music enters on the page turn.
- **Mix**: narration on top; music ducked ~−12 dB under speech; foley light; −14 LUFS, −1 dBTP.

## 8. Native moves (pick what each act needs)

- **One mark = one fact.** A single dot for one company's IPO; a single coin for one dollar.
- **Axes grow with the story.** The y axis arrives when the narrator first names the unit.
- **The column total.** Items are written down a ledger column; a ruled line; the total is written below in red or black.
- **Cut-out onto the ledger.** A paper object is laid on the page, then its value is written next to it.
- **Stamp the verdict.** The act's conclusion comes down as a stamp.
- **Breaking the frame.** A value too big for the chart tears the top of the plot; the torn edge stays.
- **Encoding morph.** Bars into a unit grid of people, a map into a ranking.
- **The empty next cell.** A dashed cell for the number nobody knows yet.

## 9. Pitfalls

- Never invent data to fill a chart. Every plotted number has a source in `research.json` / `sources.md`; when unknown, draw the empty cell.
- Notes collide with later data: pin notes in data space and keep a memory column on the sheet's left.
- Text on cut-outs is ink on a light fill; never colour on the same colour.
- Helpers that set `globalAlpha` must multiply the incoming alpha.
- A dense diagram drawn all at once is unreadable: draw it in the order the narrator names its parts.
- Hand-drawn wobble on set type looks broken: wobble only pencil and handwriting.

## 10. Engine

`packages/kit/src/paper/` is the style in code: paper and ledger rules, the camera, `pencilStroke`, `leader`, `ringPath`, `handText`, `setType`, `dataDot`, `inkShape`, `cutout`, `halftone`, `stamp`, `drawPencil`, `caption`. Acts draw onto `<PaperCanvas>` with a pure `draw(g, t)`.

## 11. Variation space

Each video picks its own structure, opening, ending, camera path and silences; acts must not repeat each other's opening move.

- Openings: **the finished ledger** (the whole page is shown, the film works backwards); **one object** (a cut-out share certificate alone on the page); **the question** (an empty plot with only the unit and a handwritten question).
- Endings: **one mark, close**; **the total** (the whole video's ledger column totalled); **the headline revised** (the pencil strikes a word of the opening title and writes the true one).

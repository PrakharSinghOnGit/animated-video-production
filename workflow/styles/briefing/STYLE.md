# Briefing — The Wealth Gap house style

> Money explained as a 1960s spy title sequence: a cut-paper world in four flat inks where the numbers are the architecture, silhouettes chase the money through it, and every brass stab lands a fact. It is filmed by a screen-recording camera: one continuous take that follows the action, eases into what matters, and whips to the next place.
> Built on two LemoLab styles (lemo-opuscar, MIT: https://github.com/lemomo-ai/lemo-opuscar): *60s Spy Title Sequence* for the look and the staging, *Living Screencast* for the camera and the transitions. References for grammar only: Saul Bass's titles (*North by Northwest*, *Anatomy of a Murder*), Kuntzel + Deygas for *Catch Me If You Can*, Screen Studio-style recordings. Copy none of their lettering, characters, shots or music.

## 1. Essence, and what it is not

- **Flat, opaque inks on paper.** Four inks per location, no gradients. Every shape has a hand-cut edge, a thin cut gap where it sits on another piece, and a small paper shadow.
- **The numbers are the set.** A figure the narrator says is not a label: it is giant cut-paper type that the scene is built from. People walk on its top edge, the money hides behind a digit, a bar chart is a row of letters growing taller.
- **Silhouettes act it out.** The people in the story (the investor, the founder, the saver) are profile cut-outs with a hat, a coat and one accent colour. They act in outline and timing; there are no faces.
- **The money is the object of the chase.** Whatever the act is about (a share, a dollar, a company) is drawn in the warm ink on a black keyline: the brightest thing in frame.
- **The camera is a screen recorder.** One continuous take per act that follows the action, pushes in to the thing that matters, holds while it is read, and whips to where the effect happens.

It is **not**: a slide deck (no boxes with text in them, no title + bullets), flat vector motion graphics (the edges are cut, the paper is physical), a spy parody (no gun barrels, gadgets or the famous theme), a fast advert. This is a 10-minute explainer: the staging is bold, the tempo is calm.

## 2. Materials & rendering

- **Scissor-cut edges**, cut once in each piece's own space and cached, so a moving piece keeps its edge (screen-space edges crawl).
- **Paper layering**: a ~2.4 px cut gap in the ground colour between pieces and a small paper shadow (offset a few px, blur ~5, alpha ~0.3).
- **Paper texture** multiplied over the whole frame, sparse ink voids on dark ink; film grain added at mux time.
- **Type** is League Gothic, glyph outlines re-cut per letter (edge noise, ±0.8° rotation, ±1.5 px baseline jitter). Small set labels are League Spartan.
- **Silhouette figures** (~7 heads tall): pieces merge into one outline with thin slits at the joints; identity by hat, coat cut, shoes and one accent that streams back when they move. Let the hat or accent stick out when a figure is behind a letter.
- **The Agent** is the channel's recurring hero: the same silhouette with three slanted cuts in his hatband (the logo's three bars) and a gold coin tie clip (`figureSide(..., { hero: true })`). He is the viewer's stand-in (the saver, the trader, "you"); everyone else in the story is an extra without the signature. At most one Agent on screen. Spec: `brand-assets/mascot/AGENT.md`.
  **He feels what the viewer feels.** He is not a walker crossing the frame: at the video's reveals (the bank keeps the spread, the price ran without him) he reacts with his body, since he has no face: recoils (lean back, `eye: "open"`), slumps (head down, shoulders drop), looks over his shoulder for the exit (`POSE.overShoulder`), reaches for what is being taken (`POSE.reach`), gets squeezed flat (`POSE.flatten`). Any `Pose` field can be set by hand for a new reaction. One clear reaction per reveal, timed on the reveal word, then he idles; not a reaction on every line.
- **Charts are paper too**: bars are cut strips (or letters) growing from a baseline, a line is a cut ribbon, a share of a whole is a cut circle with a wedge removed, a count is a grid of identical cut tokens. Scales stay honest: never stretch an axis to dramatise.

## 3. Colour logic

Each **chapter is a location** with its own four-ink set (the kit's `INKS`): ink, paper, a hot colour, a warm secondary, plus darker "shadow paper" variants for depth. Acts inside a chapter keep the set and change the dominant ground (paper → hot → ink) to mark the turn.

| Ink | Meaning |
|---|---|
| ground (one per scene) | the location |
| ink | figures, type, structure |
| hot | the hero's one accent, danger, losses, the turn ("in the red"). Rare. |
| warm | the money / the object everyone is after. Always on a black keyline. |
| shadow variants | background props (never black: black props read as letters) |

No gradients, no glows, no transparency fades, no fifth colour. Text is ink on a light ground or paper on a dark ground, never colour on the same colour.

## 4. Type & impact text

- **Numbers on screen are digits with units** ("$9.6T", "7%"), as large cut type, readable at thumbnail size. Hold every text ≥ (characters ÷ 15 + 1.5) s once landed.
- **Set labels** (a short name; a source note only when a figure needs one) in League Spartan **500–600** (never 700+: heavy Spartan clogs into a blob at label size), small but ≥ 30 px on screen when it is meant to be read, with a thin outline in the ground colour (`label` does both). A source note sits beside the figure it supports. Labels seen from far out (a wide establishing shot) need not be readable.
- **No running subtitles.** The narration is never transcribed on screen; viewers get closed captions from the `.srt` (`bun run srt`). On-screen words are **impact text** only: the figure, the term being defined, the name, the one phrase the line hangs on ("IPO", "$9.6T", "PAID LAST"), cut as type and staged as part of the set, landing on its spoken word. Usually 1–4 words, rarely more than one impact text per sentence; most sentences have none. The full frame is the stage (no reserved subtitle band).
- **Brand**: the channel logo appears once, on the end card at the spoken subscribe line (`brandEndCard`): a brand-black card slides over the set, the logo's three bars run across the frame, the tagline, a red SUBSCRIBE tag stamped on the word. No watermark or logo anywhere else in the film.
- **Chapter pill**: a small cut-paper tag top-left ("02 · Who owns it") for the length of a chapter.

## 5. Motion quality

- **The voice drives the beats, the music grid places them.** A visual hit is complete on its spoken word: anticipation starts 0.25–0.6 s earlier. If a music beat lies within ±150 ms of the word, land on the beat.
- **Puppets on twos** (figures, hands, letters landing, props: poses stepped at 12 fps); **camera and slides on ones** (a stepped camera judders).
- **Elastic, with weight.** Things arrive on a spring that overshoots and settles (`bounce`, `pop`), and land with a thump: a squash on contact (`land`), a settle wobble (`wobble`), a puff of paper scraps (`scraps`), and for the act's biggest hits a short camera shake (`shake`). Type lands letter by letter with a squash; strips slide in along a diagonal and bounce on the beat. Plain ease-in/out is for camera moves and slow drifts only.
- **More happening.** A beat is rarely one thing: secondary motion follows the main hit (the floor shakes when a figure lands, coins jump, a sign swings), held things idle (`idle`: a slow bob or sway), and a row of items pops in staggered (`stagger`), not all at once.
- **Stop-time**: once or twice per video, at the biggest reveal, the whole picture freezes for a beat in silence, then resumes.
- **Calm long-form tempo.** One idea at a time; build it while it is explained, then hold while the narrator finishes. Walks are one step per beat at 80–110 BPM, not a sprint. Moves of the set take at least 0.4 s; pops, thumps and scrap bursts are quick by nature and may be shorter.

## 6. Camera grammar (the screencast camera)

One continuous take per act, driven by **actions**: each thing that gets cut, placed, assembled or acted is an action with a world rect and a time window. The camera frames the active action, **arrives before it starts and never leaves before it is finished** (plus a short hold), and drifts slowly while holding. Moves are eased and take 1.1–2.8 s depending on distance and zoom; if two actions are too close for a calm move, frame both together.

| Move | Expresses | Use for |
|---|---|---|
| Wide on a full line of type, then truck in | read it, then act | a figure the scene is built from |
| Push-in + spotlight (a cut round window, not a box), held | the one thing to remember | the key number of the act |
| Whip-pan with motion blur, one screen direction | cause here, effect there | money moving; "meanwhile"; act to act |
| Lateral tracking with a walking figure | progress, a journey | a timeline, a career, compounding |
| Vertical pan down a column of type | descent, a list | a ranking, a balance sheet |
| Locked single shape on a flat ground | mystery, an icon | a cold open, a question |
| Silhouette against a giant circle | the hero moment | a payoff, a win |
| Diagonal split into a grid | many at once | thousands of shareholders, diversification |
| Push into a letter until it fills frame | a letter becomes a place | entering a company, a market |

Framing: strong diagonals (a camera roll up to ~6° on a hold), big flat grounds that carry a set (huge type, a sheet of shadow paper, a horizon: never an empty colour with small objects on it), figures small against huge type. The beat's subject fills ≥ 1/3 of frame height at key moments. A pull-back never shrinks the whole act into thumbnails: frame the part that carries the comparison.

**Transitions** (the only cuts, all designed; never dissolves or fades):
- **Act to act**: the act whips out in the story's screen direction with motion blur and the next act whips in from the opposite side, so the seam hides inside the blur. A graphic match cut (same shape, same place: a coin → a planet → a clock) may replace the whip once or twice per video.
- **Chapter to chapter**: an iris or diagonal paper-strip wipe onto the new location's ground; the chapter title is assembled from cut letters while the narration is silent, then the chapter pill moves to the corner.

## 7. Sound palette

- **Music**: a small 1960s spy jazz combo, long-form version: walking upright bass, brushes, vibraphone, a muted trumpet or organ, surf-guitar twang for a chapter's first downbeat. Minor keys, 84–112 BPM, original motifs only (never the famous spy themes). Brass stabs only on the act's big hits, placed ~8 ms early so their peak lands on the frame.
- **Foley follows the material**: paper (slides, slaps for letters landing, a cut "shh", a tear), metal (clicks, a lock, coins), tape (click, hiss) — light in the mix.
- **Design layer, used sparingly**: a riser into the act's reveal, a deep boom or impact on its biggest number, a sub drop when the floor gives way, a camera shutter on a freeze, a transition whoosh on a whip. The act changes, chapter cards and silences are scored automatically.
- **Silence**: true silence for stop-time and before each act's turn; the first sound after it is the most important one.
- **Mix**: narration on top; music ducked ~10 dB under speech; −14 LUFS, −1 dBTP.

## 8. Native moves (pick what each act needs)

- **The number is the building.** A spoken figure becomes the architecture of the scene; the story happens on and around it.
- **Credits are rhythm.** A list (companies, reasons, steps) lands one item per beat, each a line of cut type sliding in along a diagonal.
- **The chase.** A silhouette pursues (or carries) the money from one location to the next; the whip-pan follows.
- **Graphic match cut.** Shape rhymes across a seam: coin → share certificate seal → globe.
- **The diagonal grid.** One cut splits into a grid of many pieces (one company → thousands of shares → thousands of owners), and they fly back to assemble the whole.
- **Stop-time.** Freeze on a stab at the price reveal; silence; resume.
- **Spotlight freeze.** Push in and vignette the one badge that holds the act's promise.
- **The object is the title.** What everyone pursues becomes the last thing assembled (the act's verdict, the video's ending).

## 9. Pitfalls

- Never invent data to build a set. Every number has a source in the plan's `data`; when unknown, show the empty slot (a dashed cut outline).
- A figure fully hidden behind a letter reads as "nobody there"; a black prop reads as a letter; a warm object on a warm ground vanishes (keyline it).
- A credit only ever seen partially is uncomfortable: open wide on the full line first.
- A camera that leaves while something is still being cut or assembled feels broken: hang every move on the actions.
- Fast cutting belongs to adverts; here a whip is an event, not a habit (≤ 1 per 20 s inside an act).
- Every internal piece outlined looks like a mannequin: merge figures, cut only joint slits.

## 10. Engine

`packages/kit/src/spy/` (exported as `spy` from `@wealthgap/kit`); its `README.md` is the API reference. Acts draw onto `<SpyCanvas>` with a pure `draw(g, ctx)`.

## 11. Variation space

Each video picks its chapters' ink sets, its cast, its opening and ending; acts must not repeat each other's opening move.

- Openings: **the full-frame number** that shatters into the first scene; **a single silhouette** on a flat ground, looking at something off-frame; **the money already falling** through a column of type.
- Endings: **the title never assembles** (one piece missing, carried off by a figure); **a slow pull-out** showing every location was one giant page of type; **a stop-time freeze** on the last stab, held.

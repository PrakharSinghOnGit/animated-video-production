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
  figureSide, walkPose, POSE, onTwos, walkStride, focusCam, rectOf, padRect, figureRect, atDepth, drawAct, chapterPill, actIn, seg,
  bounce, pop, land, wobble, thump, shake, idle, stagger, scraps /* … */ } = spy;
type Ctx = spy.SpyCtx;
type Rect = spy.Rect;

export const meta = { id: "A01", title: "…" };

// Foley for this act (act-relative seconds). word(text, n) = start of that spoken word.
export const events = (word: (text: string, occurrence?: number) => number) => [
  { t: word("trillions") - 0.3, type: "card_slap" },
  // types: card_slap paper_slide paper_cut tear metal_click coin_drop tape_click whip stamp_thud pop cash_register typewriter
];

const K = INKS.noir;             // this chapter's ink set
// World layout: where each thing stands (positions, sizes). The camera frames the THINGS, not empty regions:
// build every focus rect from what is drawn there (lineRect, figureRect, the rect logo() returns, rectOf, padRect).
const FLOOR = 900, NUM = layout("$9.6T", 520), NUM_AT: [number, number] = [150, 780];

const draw = (g: CanvasRenderingContext2D, ctx: Ctx) => {
  // pure function of ctx.t: no state between frames, no Math.random, no Date
  const t = ctx.t, w = (s: string, n = 1) => ctx.word(s, n);
  // One action per thing being built/acted: the camera arrives before t0 and stays until t1 (+ hold).
  const focus = [
    { t0: 0.6, t1: w("trillions").t1 + 1.5, rect: padRect(lineRect(NUM, ...NUM_AT), 80) },
    // { …, rect: rectOf(figureRect(x, FLOOR, 0.6), coinRect), roll: 0.05 },   // a held diagonal (max ~0.1 rad)
  ];
  // widest: two actions too close for a calm move are NOT merged into one wide frame where everything turns tiny;
  // the camera finishes the first and whips to the second
  const cam = (s: number) => focusCam(s, focus, { widest: 0.6 });
  drawAct(g, ctx, {
    dur: ctx.duration, ground: K.paper, cam,
  }, (h) => {
    clear(h, K.paper);
    atDepth(h, cam(t), 0.5, () => { /* the set behind the action, in K.paperD / K.inkL: it moves less than the action */ });
    applyCam(h, cam(t));
    // … the act, beat by beat, with piece / drawLine / figureSide …
  });
};

export default function Act() {
  return <SpyCanvas draw={draw} />;
}
```

## Stage every beat (what separates a film from a diagram)
The acts drawn so far share one weakness: small, correct objects on an empty flat ground, joined by labels and arrows. They
read as an infographic. Before you write a beat, answer these; after you render it, check them on the sheet.

- **What is the set?** The ground is never just a colour. Something big stands behind or under the action in the
  shadow-paper inks (`paperD`, `inkL`, `hotD`): the spoken number as architecture, a sheet that splits the ground in two,
  a skyline, a horizon, a wall, a stair. It should mean something in the story (cheap side / dear side, before / after,
  inside / outside). Put it on its own plane with `atDepth` so a camera move reads as depth.
- **Who is the hero of this frame, and how big is it?** One subject per beat, at least 1/3 of the frame height at its
  hit (a figure, a number, an object). Everything else is smaller or behind. If three things have the same size and
  each has a label, it is a chart legend: pick one.
- **Is the camera on the thing or on the region?** Build every focus rect from the drawn objects (`lineRect`,
  `figureRect`, `rectOf`, `padRect`), never from a guessed region. A pull-back that shows "everything so far" turns it
  all into thumbnails: frame the part that carries the comparison instead, and let the rest leave the frame.
  Let objects fly out of frame toward where the camera goes next. Use `roll` on one or two holds for a diagonal.
- **Do the objects act, or are they labelled?** A coin that travels along an arrow from one word to another is a
  diagram. The same idea acted: the figure carries it, the door shuts on it, the stack outgrows the frame, the scale
  tips. Use labels for names, not for meaning; no dashed connector arrows unless the arrow is the subject.
- **Does the ground turn?** Once per act, at its turn, change the dominant ground (a sheet slides over, the floor
  drops, paper → ink). A whole act on one flat colour feels like one long slide.
- **Is something alive on every hold?** Held things `idle`, hanging things sway, the Agent shifts weight; after a hit
  something reacts (`land`, `scraps`, `shake` on the act's 1–3 biggest hits).
- **First and last second.** When the whip-in lands, a subject is already on screen; the act ends on its finished
  picture, held until the whip-out.

`bun run frames` measures this for you. The **summary** line gives the share of sparse frames (aim for under 15 %; a
deliberate held icon on a flat ground is fine, a third of the act is not) and the **small:** lines list every text,
figure and icon that is too small on screen, with times. Fix those by reframing or rescaling the shot, not by shrinking
the idea. (`label(..., { minPx: 30 })` keeps a lone label readable in a wide shot; in a crowded wide shot it makes
labels collide, so tighten the shot instead.)

## Engine rules
- **Every act uses `drawAct`** (whip in over the first 0.6 s, whip out over the last 0.6 s, blur, paper finish) and draws only screen-space extras (chapter pill, spotlight) in its `overlay`. **No subtitles**: on-screen words are impact text only (STYLE.md §4), as cut type in the scene. Don't put hits in those windows; the first beat holds until `actIn(t) === 1`. **Seams are planned by the pipeline** (`bun run seams`, Render → Seams): say how you'd like to arrive and leave (`open`/`close`: whip, iris, strips, pixels, none) and it picks ONE owner per cut and shows the neighbouring act's real frame (a whip becomes one pan shared by both acts; a wipe on the incoming act wins over one on the outgoing act). `from`/`to` are only the fallback colours for single-act previews. Keep the last frame of the act readable: it is what the next act's wipe starts from.
- **The camera is `focusCam` only**, with `{ widest: 0.6 }`. List every action with its real `t0`/`t1` and a world rect built from the drawn objects (`rectOf`, `padRect`, `lineRect`, `figureRect`); optional `roll` (≤ ~0.1 rad) for a held diagonal; never key raw x/y/zoom (except `pushIn` toward a rect for the act's one spotlight moment: `spotlight(..., pad, { shape: "round" })` around type, since a box around a number reads as a card). This is what guarantees the camera never leaves unfinished work, so be honest about `t1`: the end of a build, a walk or a landing, plus the time to read it.
- **Numbers are cut type** with `layout` + `drawLine` + `landEach`, complete before the spoken word (`landEnd`). Headline figures ≥ 90 px on screen; set labels via `label` ≥ 30 px on screen. No source notes by default (the description lists them); one small `label` only for a figure that needs it to be believed, in clear space.
- **Motion with weight** (STYLE.md §5): arrivals use `bounce`/`pop` (start 0.1–0.15 s before the word so the overshoot peaks on it), landings `land` + `scraps(g, t, hit, x, y, ink)` + `wobble` for things that hang or swing; the act's 1–3 biggest hits add `shake(cam, t, [hits])` to the focusCam camera. Held objects `idle`. Use `seg` + plain easing for camera-like drifts and slow builds only. Labels: `label(g, s, x, y, \`600 44px "${SPY_FONT.sans}"\`, col)` (weights above 600 are drawn at 600; the outline is automatic).
- **Puppets** via `figureSide` sampled `onTwos(t)`; advance x by `walkStride` per walk cycle so feet don't slide. Identity by accent colour/hat, never faces. The figure that is the viewer's stand-in ("you", the saver, the trader) is **the Agent**: pass `hero: true` (three hatband cuts + gold coin tie clip, `brand-assets/mascot/AGENT.md`); other people stay plain extras. Never draw the signature by hand.
- **Inks**: one `INKS` set for the whole chapter; ground changes (paper → hot → ink) mark the act's turn. Warm = the money (on a black keyline); hot = danger/loss/the hero's accent. Never fill shapes directly: always `piece` (cut gap + shadow).
- **Chapter acts** (`chapter` in the plan): open with `open: "iris"` or `"strips"` from the previous chapter's ground, show `chapterCard(g, n, title, progress, inks)` during the narration pause (progress over 0.6 s → first spoken word − 0.3 s), then go to the first beat; `chapterPill` in the overlay for the rest of the chapter. In non-chapter acts of a chapter, keep the pill in the overlay too.
- **Logos and icons**: `logo(h, name, x, y, size, col)` cuts a company logo (`"tesla"`, `"hdfcbank"`) or a generic icon (`"mdi:bank"`, `"mdi:piggy-bank"`) out of paper in the chapter's inks. Search names with `bun run icons <words>` before using them (unknown names throw). Use them where they carry meaning (the company the narration names, the bank in the diagram), sized like a set piece (≥ 120 px on screen), landing with `pop`/`land` on the word; build them into the scene (a logo stamped on a building, coins pouring out of a bank icon) rather than a row of badges. A company with no logo: its name in cut type, never a drawn imitation.
- **Brand end card** (only the act that contains the subscribe line; the brand appears nowhere else): call `brandEndCard(h, t, w("subscribe"))` as the last thing in `drawAct`'s overlay, and add events `paper_slide` at subscribe − 1.2, `card_slap` at − 0.7, `stamp_thud` at the word. If it is the video's last act, end it with `close: "none"` so the card holds.
- **Pace**: a whip is an event (≤ 1 per 20 s inside an act); otherwise let `focusCam` make calm moves. Stop-time (freeze everything for a beat on a stab) at most once per act, at the act's biggest reveal.

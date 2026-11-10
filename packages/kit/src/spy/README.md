# spy: the Briefing engine

Cut-paper canvas engine (four flat inks, scissor edges, silhouette puppets, League Gothic type as part of the set) with a continuous following camera, whip-pans with motion blur and paper wipes. Import: `import { spy } from "@wealthgap/kit"`. Look: LemoLab "60s Spy Title Sequence"; camera and seams: LemoLab "Living Screencast" (see CREDITS.md).

Rules (same as the Ledger): everything is a pure function of `ctx.t`; no `Math.random`, `Date`, timers or state between frames; hits come from spoken words (`ctx.word(text, n)`) and are complete at the word's start; numbers come from the plan's sourced data. Drawing is `piece(g, ...)`: never fill shapes directly, or they lose the cut gap and shadow. Flat inks only: no gradients, no fades, no dissolves.

Coordinates: world px with a camera (`applyCam(g, cam)`); screen px 1920x1080 for everything drawn in `overlay`. Safe area `SAFE` = x 96..1824, y 72..890 (below 890 is the subtitle strip).
**Shorts (9:16):** the canvas takes the composition's size, so in a 1080x1920 short `W`/`H` are 1080/1920 and `SAFE` = x 64..930, y 220..1440 (YouTube's buttons and title overlay). `W`, `H` and `SAFE` are live: read them (or `ctx.W`, `ctx.H`) inside `draw`, never copy them into module-level constants. `setFrameSize(w, h)` is called by the canvas host; `isVertical()`.

## Frame skeleton
`SpyCanvas draw(g, ctx)` -> `drawAct(g, ctx, opts, scene)`; `scene(g)` does `clear(g, ground)`, `applyCam`, then draws the set, type and puppets. `drawAct` adds the whip in/out (with blur), `overlay`, and `paperFinish` (do not call `paperFinish` yourself inside an act). Fonts are loaded before the first draw; `layout()` throws if called before that (module top level).

## Engine (engine.ts)
- `INKS.noir | teal | cobalt | plum`: `{ink, paper, hot, warm, inkL, paperD, hotD, warmD}`; `D` = darker shadow-paper variant. One set per chapter. `luma(hex)`.
- `clear(g, ground)`: fill the frame; the ground is the colour seen in cut gaps. `withBg(g, col, fn)`: other gap colour for pieces lying on a card.
- `piece(g, polys, col, opts?)`: one paper piece (contour or `[outer, hole...]`, evenodd; `rule: "nonzero"` unions strokes); opts `gap` (slit px, default 2.4), `gapCol`, `shadow`, `shA/shB/shX/shY`.
- `rough(pts, seed, amp, step, closed?)` scissor edge; `roughC(key, fn, seed, amp, step)` cut once, cached by id (use for anything that moves: the edge travels with the piece).
- Shapes: `rectP(x,y,w,h)`, `circP(cx,cy,r)`, `ellP(cx,cy,rx,ry)`, `arcP(cx,cy,r,a0,a1)`, `smooth(pts, it, closed)` (Chaikin; the easing smoothstep is `smoothstep`), `xf(pts, x, y, s, rot)`, `pathPoly`.
- `silhouette(g, (L) => {...}, opts?)`: pieces drawn with `piece(L, ...)` merge into one contour, then pasted with one outer slit and shadow. `slit(L, x, y, ang, len, w)`, `cutPoly(L, pts)` cut joints inside it. Nested calls draw directly.
- `paperFinish(g, amt)` texture (fixed seed, static), `label(g, text, x, y, font, col, align, letterSpacing)` for small text, `state(g)`, `curScale(g)`, `isLayer(g)`.
- `atDepth(g, cam, depth, fn, anchor?)`: draw a plane of the set with camera parallax. `depth` 0 = with the action, 0.5 = moves and zooms half as much (behind), 1 = pinned to the screen, negative = foreground. `fn` draws in world coordinates. What you put there is yours (giant type, a skyline, a sheet of shadow paper); it turns camera moves into depth.
- Re-exported helpers: `W H applyCam w2s s2w viewRect frameRect moveTime SAFE clamp lerp seg TAU inOutCubic inOutSine outCubic outBack outExpo hash vnoise mulberry`; types `G Pt Cam Rect Inks`.

## Type (glyph.ts, fonts.ts)
League Gothic outlines, each letter re-cut as its own piece. Capitals ~0.76 x size tall: size 520 gives ~395 px numerals. Supported: letters, digits, `$ . , % -` etc. (anything League Gothic has); missing glyphs draw the font's notdef box.
- `layout(str, size, {track?})` -> `{letters, width, size}`; `drawLine(g, lay, x, y, opts)`: (x, y) = baseline; opts `col seed jit amp align gap shadow each`. Default jitter is +-0.8 deg rotation and +-1.5 px baseline; `jit: 0` sets it straight.
- `each(L, i) => {dx, dy, rot, s, hide, col}` per-letter hook. `landEach(t, t0, {stagger=.07, dur=.25, rise, rot, col})` drops letters in one by one; `landEnd(t0, nLetters, opts)` = time the last one lands (complete this before the word).
- `lineRect(lay, x, y, align)` world rect of a drawn line (use for `focus.rect`, `spotlight`); `lineWidth(lay)`, `cutLetter`, `loadGothic`, `SPY_FONT`, `ensureSpyFonts`.

## Puppets (chars.ts)
`hero: true` makes the figure **the Agent**, the channel's recurring hero (three slanted hatband cuts + a gold coin tie clip in `warm`, default noir warm); extras leave it off. Sheet: `brand-assets/mascot/agent_sheet.png` (composition `AgentSheet` in `preview/Root.tsx`).
One figure, ~7 heads tall, hat and coat, one accent streamer (tie). Origin = between the feet, y down, faces +x.
- `figureSide(g, x, y, s, pose, {col, accent, paper, flip, eye, sil})` -> `{wrist}` (attach a prop there). s = 1 is ~540 px tall; 0.6 is a good scene scale.
- `POSE.stand | flatten | skid | overShoulder | leap | reach`; `walkPose(p)`, `runPose(p)` with p = cycle 0..1 (one cycle = two steps); `walkStride(s)` = world px per walk cycle (advance `x` by this per cycle and the feet do not slide).
- `onTwos(t)`: stepped to 12 fps. Sample puppet poses and puppet x with `onTwos(t)`; keep the camera and the type on ones.

## Camera (camera.ts)
- `focusCam(t, focus, opts?)`, `focusCamFn(focus, opts)`: `focus = [{t0, t1, rect, fill?, roll?}]`, one entry per action (something being cut, placed, assembled or acted in world `rect` from t0 to t1). The camera frames the active action, never leaves a rect before `t1 + hold` (opts `hold` .6 s), arrives by the next action's `t0` (moves start earlier, never later), each move takes at least `moveTime()` (1.1-2.8 s, in-out ease), drifts <= 2% / 10 s while holding. Actions too close for a move (or overlapping) are merged into one union frame, so give each action its real `t0`/`t1` and let the plan decide. `pace` scales the move time (shorts: `{ pace: 0.45, hold: 0.3, snap: true }`). `planFocus(focus, opts)` shows the merged plan (`dwells`, `moves`).
  - **`widest`** (use `{ widest: 0.6 }` in new acts): a merge is refused when the union frame would be zoomed out past `widest` × the wider of the two actions (everything would turn tiny); the camera stays on the first action until it is finished, then makes a quick move (≥ 0.3 s, blurred like a whip) to the second. Overlapping actions still merge.
  - **`roll`** per action (radians, clamped to ±6°): a held diagonal.
- Rects from what you draw (so the camera frames things, not guessed regions): `rectOf(...rectsOrPoints)` (union), `padRect(rect, px, py?)`, `figureRect(x, y, s)`, plus `lineRect(lay, x, y, align)` and the rect `logo()` returns.
- `pushIn(cam, rect, u, fill=.55)`: eased push-in toward a world rect. `spotlight(g, screenRect, amount, color, pad, { shape })`: flat dark paper with a scissor-cut window (the one number to remember); `shape: "round"` cuts an ellipse (prefer it around type: the default rounded box reads as a card with text in it); `rectToScreen(cam, worldRect)` maps the rect. Draw it in `overlay` or after the scene.
- `whip(a, b, u)`: camera interpolation with a fast-in/fast-out curve (`whipEase`), 0.4-0.7 s. Pass `cam` to `drawAct` and the blur is automatic.
- `motionBlur(g, src, vel, {dx, dy, dead, max})`, `camVelocity(camFn, t, fps)`, `scratchCanvas(i)`: the blur is a directional average of copies along the velocity (px/frame), zero below ~60 px/frame so ordinary moves stay sharp.

## Seams and acts (transitions.ts)
- `irisWipe / stripWipe / pixelWipe(g, u, from, to, opts?)`: u 0 = `from`, 1 = `to` (each a `(g) => void` that draws a whole frame; `fillScreen(color)` for a plain ground). Iris: `{x, y, ring}`; strips (the spy "shatter", paper strips slide off alternately): `{angle, n}`; pixels: `{size}`. `WIPE_T` = 0.9 s.
- `ACT_IN = ACT_OUT = 0.6`; `actIn(t)` 0..1 over the first 0.6 s (1 = settled), `actOut(t, dur)` 0..1 over the last 0.6 s, `actOffset(t, dur, dir)`. Every act ends with a whip-pan out to the left and the next begins with a whip-pan in from the right, the cut hides inside the blur; hold the first beat until `actIn(t) === 1`.
- `drawAct(g, ctx, opts, scene)`, opts: `dur` (ctx.duration), `ground`, `cam` (for blur), `open` / `close`: `"whip"` (default) | `"iris"` | `"strips"` | `"pixels"` | `"none"` (chapter acts open with iris or strips), `from` / `to` (backdrop colour during the whip or wipe: previous / next ground), `iris`, `dir` (1 or -1), `overlay(g)` (screen space after the blur: subtitle, pill, spotlight), `finish`.
- `chapterPill(g, n, title, progress, inks)`: "01 | TITLE" tag top-left, progress 0..1 slides it in. `chapterCard(g, n, title, progress, inks)`: full-frame card of cut League Gothic for the silent pause before a chapter (clears its own ground; letters land by progress ~0.65).

## Title and subtitles
- `drawTitle(g, "THE GAP", x, y, H, {col, align, split, shatter, strips, each})`: hand-cut letterforms A-Z (own glyphs, not League Gothic), `split` slides two halves apart along the 30 deg diagonal (px), `shatter` 0..1 breaks it into strips that slide off. `titleBox`, `titleLayout`, `drawGlyph`, `TITLE_GLYPHS`. Use for a video or chapter title that splits; use `drawLine` for everything else.
- `autoSubtitle(g, ctx, {ground, inks, maxWords})`: scissor-cut strip bottom-left, tilted -1 deg, League Spartan 600 44 px, cut bullet, <= 2 lines, never above y 900; light strip on dark grounds, dark on light; chunks are sentences or <= 12 words timed from word starts; slides in over 0.18 s. Call in `drawAct`'s `overlay` with the act's ground.

## Shorts (shorts.ts)
- `shortCaption(g, ctx, { inks, y?, size?, maxWords?, active?, hideAt? })`: kinetic captions for 9:16 shorts (screen space, in `drawAct`'s overlay): 1–3 spoken words at a time in cut League Gothic on a scissor-cut paper strip at ~74% height, stamping in on each chunk's first word, the spoken word in `active` (default `inks.hot`); shrinks to the safe width. `hideAt(t)` hides it while a giant impact number says the same thing.
- `shortChunks(words, maxWords, gap)`, `capText(word)`, `vertical()`.

## Logos and icons (logo.ts, data in paper/icons.ts)
Company logos (Simple Icons, ~3,500, CC0) and generic icons (Material Design Icons, ~7,400, Apache-2.0, names prefixed `mdi:`), cut out of paper like any other piece. **Find names with `bun run icons <words>`** (e.g. `bun run icons hdfc`, `bun run icons --mdi piggy`); `bun run icons --check tesla mdi:bank` confirms a list.
- `logo(g, name, x, y, size, col, {anchor, rot, fit, amp, seed, ...PieceOpts})` -> placed rect `[x0, y0, x1, y1]`. `anchor` `"center"` (default) | `"top-left"` | `"bottom"` (sits on a line); `fit` `"fit"` (default: the drawn shape's longest side = `size`) | `"box"` (the 24-unit icon box = `size`, so a row of icons matches); `amp` scissor wobble (default size/140, 0 = clean). Animate with `g.translate`/`g.scale` around the anchor (`pop`, `bounce`, `land`), keep `size` fixed. Works inside `silhouette`.
- `logoPolys(name, x, y, size, opts)` -> `Pt[][]` placed outlines for your own `piece(..., {rule: "nonzero"})`; `iconOutline(polys)` = the largest one. `icon(name)` -> `{title, hex, polys, bounds}` on the 24 box (`hex` = the brand's colour); `hasIcon(name)`; `findIcons(query)`.
- Colour: the chapter's inks (STYLE.md colour logic still rules; brand `hex` only as a deliberate exception). Logos are trademarks: only for a company the narration is about, never implying endorsement. No logo for a company (`hasIcon` false / not found) -> set its name as cut type, never draw an imitation logo. Unknown names throw with close matches.

## Brand (brand.ts)
- `brandEndCard(g, t, at, { tag? })`: the channel end card in screen space, complete on the act-relative second `at` (the spoken "subscribe"). Uses `brand-assets/Logo.png` (loaded with the fonts). `BRAND` = the logo's colours, `BRAND_TAGLINE`.

## Example act
```tsx
import { spy } from "@wealthgap/kit";
const { INKS, clear, applyCam, atDepth, piece, roughC, rectP, layout, drawLine, landEach, landEnd, lineRect, figureSide, figureRect, padRect, walkPose, POSE,
  onTwos, walkStride, focusCam, drawAct, actIn, actOut, shake, scraps, idle } = spy;
const K = INKS.noir, FLOOR = 880;

export function draw(g: spy.G, ctx: spy.SpyCtx) {          // inside <SpyCanvas draw={draw} />
  const t = ctx.t, w = ctx.word("trillion"), fall = landEnd(0, 5);
  const lay = layout("$9.6T", 520), box = lineRect(lay, 150, 780), WALK0 = 1550, walkT = w.t1 + 3.0;
  const focus = [{ t0: w.t0 - fall, t1: w.t1, rect: padRect(box, 60), roll: -0.04 },                  // the number lands (held on a slight diagonal)
                 { t0: walkT, t1: walkT + 3.5, rect: padRect(figureRect(WALK0 + 450, FLOOR, 0.6), 620, 90) }];   // then the walk: framed on the walker
  const cam = (s: number) => shake(focusCam(s, focus, { widest: 0.6 }), s, [w.t0]);                    // the act's big hit thumps
  drawAct(g, ctx, { dur: ctx.duration, ground: K.hot, cam }, (h) => {
    clear(h, K.hot);
    atDepth(h, cam(t), 0.5, () => piece(h, roughC("far", () => rectP(-900, 300, 5200, 420), 5, 3, 30), K.hotD, { gap: 0, shadow: false }));  // the set: a far wall, moving less than the action
    applyCam(h, cam(t));
    piece(h, roughC("floor", () => rectP(-700, FLOOR, 5200, 900), 3, 2.4, 20), K.ink, { gap: 0 });
    const ready = actIn(t) >= 1;                                                        // hold the first beat until the whip-in has landed
    drawLine(h, lay, 150, 780, { col: K.ink, each: ready ? landEach(t, w.t0 - fall) : () => ({ hide: true }) });   // complete when "trillion" starts
    scraps(h, t, w.t0, 150 + lay.width / 2, 780, K.ink);
    const u = Math.min(1, Math.max(0, (onTwos(t) - walkT) / 3.5)), x = WALK0 + 900 * u;
    const walking = u > 0 && u < 1 && actOut(t, ctx.duration) === 0;                    // stop walking when the act whips out
    const bob = walking ? 0 : idle(t, 2, 3, 2.8).dy;                                    // alive while he waits
    figureSide(h, x, FLOOR + 6 + bob, 0.6, walking ? walkPose((x - WALK0) / walkStride(0.6)) : POSE.stand, { col: K.ink, accent: K.warm, paper: K.paper, hero: true });
  });
}
```
Notes: build `focus` from word times inside `draw` (the plan is cached per array, recomputing it per frame is cheap). `spy.SpyCtx` is the Ledger's `PaperCtx`. Preview: `bun run studio --spy` (compositions `SpyDemo`, `SpyWipes`).

## Known limits
Wipes render `from` and `to` both (two full-frame draws) and the strip wipe adds an offscreen copy: fine at 1080p, keep scenes cheap. `luma`-based subtitle colour is a two-way choice. One puppet rig only (profile, facing +x). `drawTitle` has no digits or punctuation; use `drawLine` for those. Silhouettes cannot be nested inside one another.

## Motion with weight (motion.ts, shared with Drafting via paper/motion.ts)
All pure functions of `t` (act seconds).
- `bounce(t, t0, {w=20, damp=0.4})` 0 -> 1 on an under-damped spring (peaks ~1.25 at +0.17 s, settled by +0.5 s); `bounceTo(a, b, t, t0)`.
- `pop(t, t0, {squash=0.18})` -> `{s, sx, sy, done}`: scale in with overshoot, stretched while growing, squashed on the rebound. Scale around the object's base (landing) or centre (appearing).
- `land(t, t0, amount=0.22)` -> `{sx, sy}` squash on contact that springs back; `wobble(t, t0, deg=6)` settle swing in rad.
- `thump(t, t0, {amp=12, dur=0.4, punch=0.04})` -> `{dx, dy, s, rot}`; `shake(cam, t, [hitTimes])` adds thumps to a camera (only the act's biggest hits).
- `idle(t, seed, amp=6, period=3)` -> `{dx, dy, s, rot}` slow bob/sway for held things; `stagger(t0, n, gap=0.06)` start times for a row.
- `burst(t, t0, {n, speed, dir, spread, gravity, drag, size, dur, seed})` particle positions; `scraps(g, t, t0, x, y, col, opts)` draws them as small cut-paper pieces (world coords).
- `label(...)` draws League Spartan at most weight 600 (`LABEL_MAX_WEIGHT`) with a 3 px outline in the ground colour (`{halo, haloCol}` as the 9th argument; `halo: 0` = none). `{ minPx: 30 }` keeps it at least 30 px on screen when the camera is wide (it scales up around its anchor; for a lone label, not a crowded row).

## Measured sizes (review frames)
While `bun run frames` renders, `label`, `drawLine`, `figureSide` and `logo` report their real on-screen size (`paper/measure.ts`; off in normal renders). The frames report lists what is too small to read ("small: label "SALES" is 14 px on screen at 36s"): labels under 26 px, cut type with capitals under 40 px, figures under 150 px, logos under 90 px, when seen in at least two frames. Nothing to call from an act.

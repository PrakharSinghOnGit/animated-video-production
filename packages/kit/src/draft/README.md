# draft: the Drafting engine

Three-ink canvas engine (pencil on paper, wire on a blueprint, light on black), locked camera, everything a polyline that can morph into anything else. Import: `import { draft } from "@wealthgap/kit"`. Look and rules: `workflow/styles/drafting/STYLE.md`. Worked demo: `preview/Root.tsx` (20 s, three acts + Penny sheets; `bun run studio --style drafting`).

Rules: everything is a pure function of the `t` that `drawAct` passes to your scene (it renders several sub-frames for motion blur, so never read `ctx.t` inside the scene); no `Math.random`, `Date`, timers or state between frames; hits come from spoken words (`ctx.word(text, n)` → `{t0, t1}` act-relative seconds) and land on the word. Screen space only: 1920×1080 (shorts 1080×1920, read `W`/`H` live). No camera.

## Frame skeleton
`DraftCanvas draw(g, ctx)` → `drawAct(g, ctx, opts, (h, t) => { ...lines, fills, type... })`. `drawAct` paints the ink's ground + grid (+ paper grain), runs your scene on a layer (paper: pencil tooth knocked out, multiplied onto the paper), averages 3 sub-frames for motion blur, and draws the corner labels. Fonts (Geist) are loaded before the first draw.

`drawAct` opts: `ink` (`"paper" | "blueprint" | "hologram"`), `fig: {n, name}` (top-left `FIG. 07 — GEAR`), `meta` (string or `(t) => string`, bottom-right), `close: "scan" | "scanUp" | "flood"` + `to` (next act's ink) + `handoff(h, t)` (the shape the next act starts from, drawn in the next ink) + `floodShape(u)` (hard-edged shape at progress u, for flood), `open` + `from` (rarely: prefer the outgoing act's close), `blur` (sub-frames, default 3), `overlay(g, t)` (sharp, after the blur), `dur`. `ACT_IN = ACT_OUT = 0.5` s.

## Core (core.ts)
- `PAL` (cream, blue, cyan, black, graphite, white), `INK[name]` = `{bg, line, accent, grid, gridA, label}`, `nextInk(name)`, `GRID` 60, `BORDER()` `{x: 150, y: 90}`, `restRect()` = `[x0, y0, x1, y1]` inside the border.
- Easing: `spring(t, t0, w=24)` 0→1 critically damped (no overshoot), `springTo(a, b, t, t0, w)`, `expIn/expOut/expInOut(u)`, `move(t, t0, t1)` (exp in-out between two times), `seg(t, t0, t1)`, `clamp`, `lerp`, `stepTime(t, rate)`, `hash`, `vnoise`, `TAU`.

## Geometry (geom.ts): every shape is `Pt[]`
- Shapes: `lineP(x0,y0,x1,y1,n)`, `circleP(cx,cy,r,n,a0)`, `ellipseP`, `polygonP(cx,cy,r,sides,rot,n)` (resampled, so it morphs), `rectP(x,y,w,h,n?)`, `roundRectP(x,y,w,h,r)`, `bezierP(p0,p1,p2,p3,n)`, `sineP(x0,x1,y,amp,cycles,phase,n)`, `gearP(cx,cy,teeth,r,depth,rot)`.
- `morph(a, b, u, {closedA, closedB, key, n})`: any shape into any other (closed shapes are aligned so they don't twist; pass a `key` for pairs morphed every frame). A line into a circle curls.
- `resample(pts, n, closed)`, `truncate(pts, u, closed)` (draw-on), `polyLength`, `xform(pts, {x,y,s,sx,sy,rot,ox,oy})`, `centroid`, `bounds`.

## Inks (ink.ts)
- `line(g, pts, {ink, col?, w?, closed?, hidden?, progress?, seed?, alpha?, wobble?})`: one line in the ink (paper pencil / blueprint clean / hologram cyan with white core); `hidden` = dashed thinner; `progress` draws it on; `col: INK[ink].accent` for the stage accent.
- `fill(g, shape | [outer, ...holes], {ink, kind?, col?, angle?, gap?, progress?, light?})`: `kind` `"hatch"` (default paper/blueprint), `"cross"`, `"scan"` (default hologram; `light` 0..1 = line thickness), `"solid"` (accent; builds with a hard sweep), `"none"`. `progress` draws hatching on one line at a time.
- `shape(g, pts, {...LineOpts, fill?, fillProgress?, fillCol?, light?, opaque?})`: outline + fill; `opaque` hides what is behind it.
- `occlude(g, shape, ink)`: paint the ground colour (hide lines behind a solid). `background`, `grid`, `inkLayer`, `setInkTime` are used by `drawAct`.

## Type (type.ts)
- `text(g, str, x, y, {size, ink, weight=900, fill?, col?, align?, track?, letter?, progress?, light?, clip?})` → `{x, y, width, letters[]}`. (x, y) = baseline anchor. `fill` `"auto"` (paper hatch with doubled outline, blueprint solid, hologram scan), `"hatch" | "solid" | "outline" | "scan"`. `clip` = `[x, y, w, h]` (a slot between rails).
- `letter(i, ch)` hook → `{dx, dy, s, sx, sy, rot, hide, alpha}`; ready-made: `dropIn(t, t0, {stagger, height})`, `typeOn(t, t0, cps)`, `whipIn(t, t0, dx, dur)`, `riseIn(t, t0, {stagger, depth})` (use with `clip`).
- `label(g, str, x, y, {ink, size=26, weight=700, track=.2, col?, align?, alpha?})` → width. `measure`, `fitSize(str, width, weight, track)`, `capHeight(size)` (≈ 0.71 × size).

## 3D (three.ts): objects turn, the camera doesn't
- Meshes: `cube(s)`, `box(w,h,d)`, `extrude(outline, depth)`, `gear3(teeth, r, depth)`, `drum(L, r, sides)`.
- `Pose3` = `{x, y, rx, ry, rz, s, sx, sy, sz, persp (0 ortho → 1 perspective), dist, ox, oy, oz}`; `ox/oy/oz` offset a part before rotating, so a group turns around one pivot (bars on a floor). Corner-on cube: `rx: -0.6155, ry: PI/4` (its outline is a hexagon).
- `drawMesh(g, mesh, pose, {ink, hidden: "dashed" | "none" | "show", fill?, progress?})`: wireframe; hidden edges dashed.
- `drawSolids(g, [{mesh, pose, col?, fill?, faceDraw?}], {ink, fill?})`: solids that hide each other (painter's order), faces lit (hologram scan thickness follows the light); `faceDraw(g, facePts, i, light)` to put a word on a face.
- `globe(g, cx, cy, r, {ink, rx, ry, lat, lon, split, twist, ripple(lat, lon), hidden})`.
- `project(v, pose)`, `rotate`, `meshPoints`.

## Data (chart.ts)
`bars(g, {ink, values, max, x, y (baseline), w, h, grow(i), fillOf(i), colOf(i), gap})` → bar tops; `graph(g, pts, {ink, u, col, dots})`; `ring(g, values, {ink, cx, cy, r, len, bend (0 row → 1 ring), rot})`; `counter(g, t, x, y, {ink, value, t0, size, decimals, prefix, suffix, fill})` (rolls up with a spring); `panel(g, x, y, w, h, {ink, title, u, opaque})`; `toggle(g, x, y, {ink, on, label})`; `switch2(g, x, y, {ink, a, b, which})`; `cursor(g, x, y, {ink, press})`; `diamond`; `ruler(g, x0, x1, y, {ink, n, u})`; `dimension(g, x, y0, y1, {ink, text, u})`; `legend`.

## Scene (scene.ts)
- `chapterCard(g, t, {ink, n, title, t0, pressAt})` → `{rail, pressed}`: CHAPTER nn + the title dropping in, rail above; at `pressAt` the rail presses the title into one line (`rail`) the act continues from.
- `scanWipe(g, u, from, to, {up, ink})`, `floodWipe(g, u, from, to, shape)`, `corners(g, ink, fig, meta)`.

## Logos and icons (logo.ts, data in paper/icons.ts)
Company logos (Simple Icons, ~3,500, CC0) and generic icons (Material Design Icons, ~7,400, Apache-2.0, names prefixed `mdi:`) as outlines in the ink. **Find names with `bun run icons <words>`** (e.g. `bun run icons hdfc`, `bun run icons --mdi piggy`); `bun run icons --check tesla mdi:bank` confirms a list.
- `logo(g, name, x, y, size, {ink, fill?, fillProgress?, progress?, col?, fillCol?, w?, opaque?, anchor?, rot?, fit?})` -> `{rect, polys}`. Outlines in the ink's line (`progress` draws them on), filled with the ink's fill (`fill` default `"auto"` = hatch / scan; `"none"` = outline only; `fillProgress` hatches it in). `anchor` `"center"` | `"top-left"` | `"bottom"`; `fit` `"fit"` (default: longest side = `size`) | `"box"` (24-unit box = `size`, for a matching row).
- Made out of the previous shape: `morph(prev, iconOutline(logoPolys(name, x, y, size)), u, {closedA, closedB: true, key})` grows the logo's main outline from the last shape, then draw the full `logo(...)` once `u = 1`. `logoPolys`, `iconOutline`, `icon(name)` (`{title, hex, polys, bounds}` on the 24 box), `hasIcon`, `findIcons`. Fill your own outlines with `rule: "nonzero"` (`shape`/`fill`/`occlude` take `rule`).
- Colour: the ink's line, accent for the one that matters; no brand colours (STYLE.md). Logos are trademarks: only for a company the narration is about, never implying endorsement. No logo for a company -> its name in `text`, never an imitation logo. Unknown names throw with close matches.

## Penny (mascot.ts)
`penny(g, x, y, {ink, s=2.5, pose, mood, t, turn, look, aim, flip, blink, squash})` → `{center, top, hand, feet}`. Origin = between her feet; s = 2.5 is ~250 px wide (keep ≤ ~25 % of frame height). `pose`: `stand | walk | run | point | present | shrug | pencil | wave | sit`; `mood`: `happy | neutral | surprised | worried | smug`; `turn` radians (PI/2 = edge-on coin); `t` drives run/walk/wave cycles and blinks; `aim` = pointing angle. Run speed for non-sliding feet: `pennyRunSpeed(s)` px/s. Spec: `brand-assets/mascot/CHARACTER.md`.

## Motion with weight (motion.ts, shared with Briefing via paper/motion.ts)
`bounce`, `bounceTo`, `pop` (squash and stretch), `land`, `wobble`, `thump`, `shake`, `idle`, `stagger`, `burst`: see `packages/kit/src/paper/motion.ts`
(all pure functions of `t`). `specks(g, t, t0, x, y, {ink, col?, n?, speed?, ...})` draws a burst as pencil flicks in the ink's line colour.
`spring` (critically damped, never overshoots) stays for exact moves. `label` draws Geist at most weight 700 (default 600) with a 3 px outline
in the ink's paper colour (`halo`, `haloCol`; `halo: 0` = none).

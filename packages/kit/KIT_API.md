# @wealthgap/kit: API Contract (v0.1)

> **Where this file lives:** `packages/kit/KIT_API.md`. The scene-writing LLM reads it before every scene.
> **What it is:** the *target* API. The migration agent builds the kit to match it. Scene authors code against it.
> If something listed here is missing or behaves differently in the code, that is a **kit bug**: report it in `review/kit-requests.md`, do not work around it silently.
> **Status legend:** ✅ exists in the current repo (agent: verify and adapt) · 🆕 build new · 🔁 port from `shadow_market.py` (the reference clip)

---

## 1. Principles

1. **Primitives, not finished scenes.** The kit gives parts (shapes, labels, camera, rings, counters, charts). Scenes are *composed and choreographed* by the author LLM in each video's own folder.
2. **Everything is a function of the frame.** Animation uses `useCurrentFrame()` and the helpers below. Never CSS `transition`/`animation`, never Tailwind animation classes, never timers, never `Math.random` (use `seeded()`), never `Date.now`, never network calls.
3. **Seconds, not frames, in scene code.** Use `s.sec(0.6)` so scenes survive an fps change (30 for drafts, 60 for finals).
4. **Words drive time.** Anchor motion to spoken words with `s.word("trillion")`, never to hand-typed frame numbers.
5. **Tokens only.** No hex colors, font names or magic timings in scene files; use `tokens.*` and `ease.*`. (Gradients may combine tokens with alpha helpers.)
6. **Determinism.** Same inputs → same frames.

---

## 2. Package layout and imports

```
packages/kit/
├── package.json            name: "@wealthgap/kit", main/types: "src/index.ts" (TS source, no build step)
├── KIT_API.md              this file
└── src/
    ├── index.ts            re-exports everything below
    ├── tokens.ts           colors, fonts, type scale, safe areas, motion constants
    ├── scene.tsx           SceneProvider, useScene
    ├── motion.ts           ease, p, keys, pulse, stagger, seeded, lerp helpers
    ├── shapes.ts           polar shape library + morphing
    ├── primitives/         MorphShape, Orb, Gem, Coin, Sparkle, Ring, Label, Panel, Particles, Glow, Camera, Counter, Trail
    ├── charts/             Axis, LineDraw, Bars, BarCompare, SizeCompare, IconGrid, MoneyFlow (existing, re-exported)
    ├── text/               TitleCard, TermCard, SourceTag (existing, re-exported)
    ├── three/              Globe3D (existing, optional)
    ├── main/               Backdrop, Finish, VoiceOver, Sfx (used by Main only, not by scenes)
    ├── gallery/            Gallery composition + fixtures for every export
    └── lint-rules.ts       shared rules used by `bun run lint:scene`
```

```ts
import { useScene, Camera, MorphShape, shapes, Label, Ring, Orb, ease, p, keys, pulse, tokens } from "@wealthgap/kit";
```

Scenes live in `workspace/<VIDEO>/05-video/src/scenes/` and import **only** from `@wealthgap/kit`, `remotion` and `react`. A scene never imports from another scene or from `workflow/`.

---

## 3. Tokens 🆕 (✅ partly exists: migrate existing values, keep old names as aliases)

```ts
tokens.color = {
  bg: "#101010", surface: "#181818", surface2: "#202020",
  text: "#F4F4F8", muted: "#8A8A94", grid: "rgba(255,255,255,0.07)",
  pastel: { lav: "#C7B8FF", mint: "#A8E6CF", peach: "#FFC9A8", sky: "#A8D8FF", butter: "#FFE8A3", rose: "#FFB3C7" },
  accent: "#F5B83D",  accent2: "#2EC4B6",          // legacy gold/teal, still valid for data emphasis
  positive: "#3DDC97", negative: "#FF5A5F",
};
tokens.font = { display: "Poppins", body: "Inter", mono: "JetBrains Mono" };   // loaded once in Root via loadFonts()
tokens.type  = { hero: 132, title: 74, label: 52, small: 30 };                 // px at 1920 wide; kit scales by width/1920
tokens.safe  = { x: 80, y: 100 };                                              // px at 1080 high; kit scales
color helpers: alpha(color, a), lighten(color, t), darken(color, t), mix(a, b, t), pastelCycle(i)
```
Color arguments accept a **token name** (`"lav"`, `"mint"`, `"accent"`, `"positive"`) or a token value. Raw hex in a scene is a lint error.

---

## 4. Scene context and timing 🆕

The assembler wraps every scene in `<SceneProvider>`. **Frame 0 of a scene is its window start**, which is `leadMs` (default 200 ms) *before* the first spoken word of the scene, so the entrance can overlap the previous scene's exit.

```ts
const s = useScene();
s.id            // "S03"
s.fps, s.width, s.height
s.durationFrames          // window length
s.leadFrames              // frames before the scene's first word
s.voiceStart, s.voiceEnd  // frames (relative to window start) of first/last word
s.sec(seconds): number    // seconds → frames
s.ms(ms): number
s.word(text, occurrence = 1): { start: number; end: number; mid: number }   // frames relative to window start
s.wordRange(fromText, toText): { start: number; end: number }
s.words: { text: string; start: number; end: number }[]                      // every word in this scene
s.has(text, occurrence = 1): boolean
```
- `s.word()` matching is case-insensitive with punctuation stripped. If a word is missing, it **logs a warning, returns the scene midpoint** and the lint step reports it. Fix the anchor instead of ignoring it.
- A scene **must finish its exit animations by `durationFrames`** and may start entering during the lead.

---

## 5. Motion helpers 🔁

```ts
p(frame, a, b): number                  // clamped 0..1 progress between frames a and b
ease.outExpo | outCubic | out4 | inCubic | inOutCubic | smooth | linear
ease.outBack(overshoot = 1.4) | ease.spring(x)           // x is 0..1 normalised time; spring overshoots then settles
ease.bezier(x1, y1, x2, y2)                              // e.g. ease.bezier(.16, 1, .3, 1) is the house entrance curve
keys(frame, [[f0, v0], [f1, v1, ease?], ...]): number | number[]   // keyframes; value may be a vector (camera focus)
pulse(frame, centers: number[], widthFrames, amp): number          // short bumps, e.g. a "breath" on each emphasised word
stagger(i, perItemFrames, cap?): number                            // delay for item i
seeded(seed): () => number                                         // deterministic rng
lerp(a, b, t), clamp(x, a?, b?), mapRange(x, [a,b], [c,d])
```
Entrance vocabulary the author should reach for (see `SCENE_AUTHOR.md` §4): masked reveals, morphs, spawn-from-a-point with spring, stroke draw-on, camera moves, breathing/pulse. **Plain opacity fades and plain slides are not allowed as primary entrances.**

---

## 6. Primitives

All primitives are positioned in the scene's **screen space (1920×1080 design size)** unless inside `<Camera>`, where they use **world space**.

### 6.1 Camera 🔁
```tsx
<Camera scale={number} focus={[x, y]} rotate={deg?} origin={[960, 540]?}>   {/* world-space children */}
const cam = useCamera();     // inside or outside: cam.toScreen([wx, wy]) → [sx, sy]; cam.scale; cam.focus
```
Drive `scale` and `focus` with `keys()` so a scene has real camera moves (pull-back, dive, drift). Add a tiny handheld drift: `focus + [12*sin(t*.7), 9*cos(t*.9)] / scale`.

### 6.2 Shapes and morphing 🔁
```ts
shapes.circle(), shapes.squircle(n = 4), shapes.hexagon(), shapes.blob(t, { amp = 1, phase = 0, seed? }), shapes.star(points, inner)
shapes.lerp(a, b, m)            // morph between any two shapes, m in 0..1
shapes.smooth(shape, k = 9)
```
```tsx
<MorphShape
  cx={0} cy={0} radius={380} shape={shapes.blob(t)} rot={0}
  fill={"shadow" | token | { radial: [...stops] } | undefined}
  rim={{ width: 8, spin: deg, colors?: token[], glow?: number }}            // rotating pastel sweep gradient stroke
  contours={{ count: 10, gap: 0.074, lag: 0.115, t, alpha: 0.4 }}           // echo rings that trail the shape ("topographic" look)
  glow={{ color: "lav", blur: 44, alpha: 0.5 }} />
```

### 6.3 Objects 🔁
```tsx
<Orb cx cy radius color="mint" shape={shapes.circle()} spin={rad?} ring />   // shaded pastel sphere with orbit ring and highlight
<Gem cx cy radius color="peach" rot />                                      // faceted hexagon token
<Coin cx cy radius color="butter" spin={rad} />                              // spin changes apparent width (flip), flat when 0
<Sparkle cx cy size color? />                                                // 4-point glint; drive size with sin(pi * p)
<Ring at={frame} cx cy maxRadius color width? dur? />                        // expanding ripple that fades
<Panel x y w h radius color rimColors? stitch? />                            // rounded card/cushion with rim light and optional stitched seam
<Particles seed count region={[x,y,w,h]} colors? drift? />                   // drifting dust, deterministic
<Glow cx cy radius color alpha />                                            // radial-gradient glow (cheap), preferred to big blurs
<Trail points width color fade />                                            // fading path trail
```

### 6.4 Text 🔁
```tsx
<Label text="SHADOW MARKET" x={960} y={520} size={132}
       in={frame} out={frame | undefined} accent="rose"
       stag={0.028 /*s per letter in*/} stagOut={0.02} track={0.075} align="center" />
```
Letters rise through a clip mask with overshoot and exit upward through the mask; an accent underline draws on and wipes off. This is the **house text entrance**. Hold time: at least `0.5 s + 0.28 s × words` after the reveal completes. One label visible at a time unless the layout clearly separates them.

### 6.5 Numbers and charts ✅
```tsx
<Counter from={0} to={9.6} start={frame} end={frame} decimals={1} prefix="$" suffix="T" size={260} color="text" />
Axis, LineDraw, Bars, BarCompare, SizeCompare, IconGrid, MoneyFlow, Globe3D   // existing components; see §8 for props
```
`Counter` lands exactly on `end`; use `s.word("trillion").start - 4` so the number settles as the word is spoken.

---

## 7. Scene file contract

```tsx
// workspace/VIDxx/05-video/src/scenes/S01_giant-shadow.tsx
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { useScene, Camera, MorphShape, shapes, Label, Ring, ease, p, keys, pulse, tokens } from "@wealthgap/kit";

export const meta = {
  id: "S01",
  title: "Giant shadow",
  numbers: [],                                        // every number shown: { value: "9.6T", label: "...", source: "BIS Triennial Survey 2025" }
  sfx: [{ word: "bigger", occurrence: 1, sound: "whoosh", volume: 0.2, offsetFrames: -4 }],
};

export default function S01() {
  const f = useCurrentFrame();
  const s = useScene();
  const t = f / s.fps;
  const b1 = s.word("bigger", 1);
  const zoom = keys(f, [[0, 2.3], [s.sec(3.2), 1.0, ease.out4]]) as number;
  const R = 380 * (1 + pulse(f, [b1.start], s.sec(0.15), 0.05));

  return (
    <AbsoluteFill>
      <Camera scale={zoom} focus={[0, 0]}>
        <MorphShape radius={R} shape={shapes.blob(t)} fill="shadow"
          rim={{ width: 8, spin: t * 26 }} contours={{ count: 10, gap: 0.074, lag: 0.115, t }}
          glow={{ color: "lav", blur: 44, alpha: 0.5 }} />
        <Ring at={b1.start} maxRadius={R + 260} color="lav" />
      </Camera>
      <Label text="SHADOW MARKET" x={960} y={520} size={132} in={s.word("shadow").start - 6} out={s.sec(2.7)} accent="rose" />
    </AbsoluteFill>
  );
}
```
Rules: **default export = the scene component; named export `meta`**; one file per scene; filename `S<NN>_<slug>.tsx`; no side effects at import; no props (everything comes from `useScene()`).

`meta.numbers` is the only source for `sources.md`, so list every figure shown. `meta.sfx` is read by the assembler; scenes never play audio themselves.

---

## 8. Existing shortcuts ✅ (agent: verify props from source and correct this table)

| Component | Props (from the current README) | Use when |
|---|---|---|
| `BigNumber` | `value, prefix, suffix, label, sublabel, accentColor` | a single key number, no special choreography |
| `BarCompare` | `title, subtitle, items:[{label,value,displayValue,color,highlight}]` | plain ranked comparison |
| `LineDraw` | `title, series:[{x,y,label}], highlightPointIndex` | simple trend |
| `SizeCompare` | `title, subtitle, items:[{label,value,displayValue,color}]` | area-proportional circles |
| `IconGrid` | `title, highlightedCount, totalCount, label` | "1 in 100" concentration |
| `MoneyFlow` | `title, nodes:[{id,label,color}], transfers:[{fromId,toId,amountLabel}]` | flow between entities |
| `TitleCard` | `chapterBadge, title, subtitle, accentColor` | chapter openers |
| `TermCard` | `category, term, definition, highlightWord, accentColor` | definitions |
| `SourceTag` | `text, dataRef` | citation chip (always allowed) |
| `Globe3D` | *(agent: fill from source)* | geography with arcs |

Shortcuts are **optional**. Use them when they genuinely fit; when a beat needs choreography they cannot give, write custom code with primitives. Never bend the story to fit a shortcut.

---

## 9. Main-level components (used by the assembler, never by scenes)

```tsx
<Backdrop />      // persistent #101010 world: drifting pastel glows, dot grid, particles. Continuous across scenes so cuts feel like one world.
<Finish />        // vignette + grain overlay on top of everything
<VoiceOver src /> // the narration audio
<Sfx cues />      // built from every scene's meta.sfx and the storyboard's sfx, professional set only
```
Because `Backdrop` is global, **scenes must not paint an opaque full-screen background** (use `AbsoluteFill` with no background color). A scene may add its own local atmosphere (glow, particles) on top.

---

## 10. Performance rules (Remotion renders every frame in headless Chrome)

- Prefer **radial-gradient glows** (`<Glow/>`) to large `filter: blur()` or SVG blur. If a blur is needed, limit it to one or two elements and keep sigma moderate.
- Keep SVG path point counts moderate (a few hundred); memoize path geometry with `useMemo` when it does not depend on the frame.
- Use `seeded()` particles under ~150 per scene; for more, use a single `<canvas>`.
- Keep DOM nodes per scene under roughly 600. No per-frame `new Array(10000)`.
- Motion blur for fast moves: wrap in the kit's `<MotionBlur samples={4}>` if available (🆕 optional), otherwise keep fast moves under 0.5 s.
- Fonts load once at Root; never load fonts inside a scene.

---

## 11. Gallery and fixtures 🆕

`bun run gallery` opens Studio with a `Gallery` composition: every primitive and shortcut with 2-3 fixture prop sets, including **stress fixtures** (very long label, huge number, tiny/zero/negative values). Every kit export must have a fixture. The Gallery is how the human spots inconsistency across the library.

---

## 12. Changing the kit

- **Authors do not edit the kit.** They write missing needs to `workspace/<VIDEO>/05-video/review/kit-requests.md` (what, why, API sketch).
- **Only the harvest step** (human-approved) promotes a pattern from a scene into the kit. Promotion requires: props schema, fixture(s), Gallery entry, an entry in this file, and a changelog line below.
- Breaking changes bump the kit version (`packages/kit/package.json`). Each shipped video records the kit version in `metadata.json`.

### Changelog
- 0.1.0: initial contract (tokens, scene context, motion helpers, primitives ported from the reference clip).

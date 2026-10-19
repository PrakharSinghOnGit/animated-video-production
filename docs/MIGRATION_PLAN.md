# Migration Plan: LLM-Authored Motion Graphics Engine

> **Document Version:** 1.0 (Phase 0 Reconnaissance & Architectural Blueprint)  
> **Target:** Studio migration to `@wealthgap/kit` and per-scene LLM authoring loop with Remotion.

---

## 1. Executive Summary & Reconnaissance Findings

A thorough inspection of the repository (`WealthGap`), existing scripts, Remotion fixtures, workspaces, and migration references reveals the following technical baseline:

| Dimension | Current State | Target Architecture |
|---|---|---|
| **Package Management** | Bun v1.4.2 at root; isolated `workflow/05-video/package.json` with its own `node_modules`. | Bun Workspaces at root (`packages/*`, `workspace/*/05-video`). One single dependency tree. |
| **Remotion Suite** | v4.0.536 (React 19.2.3, Three.js ^0.186.1, @react-three/fiber ^9.8.2). All packages unified at 4.0.536. | Single instance hoisted to root; `@wealthgap/kit` declares them as `peerDependencies`. |
| **Scene Authoring Model** | Data-driven menu: LLM generates `scenes.json` referencing 9 fixed React components (`BigNumber`, `BarCompare`, etc.). | Code-driven: LLM writes modular TypeScript/React scenes (`S01_slug.tsx`) using `@wealthgap/kit` primitives. |
| **Verification Loop** | Blind render: LLM never sees visual output; math/styling errors result in blank or static frames. | **Render-and-look loop**: LLM renders stills & contact sheets, inspects PNGs, and performs up to 4 fix passes. |
| **Project Boundaries** | Monolithic `workflow/05-video` contains both library components and rendering scripts. | Clean three-tier split: `packages/kit/` (library), `workflow/` (prompts & scripts), `workspace/<VIDEO>/05-video/` (scenes & project). |
| **Active Video State** | Inconsistently checked: `.env.example` has `ACTIVE_VIDEO`, but video scripts default to `fixtures/sample-job`. | All scripts standardize on `--video <ID>` with default fallback to `process.env.ACTIVE_VIDEO`. |
| **Claude Code CLI** | Installed at `/Users/prakharsingh/.bun/bin/claude` (v2.1.111). Supports non-interactive `-p` (print) mode. | `author.ts` orchestrates fresh sessions per scene with headless execution and interactive fallback. |

---

## 2. File-by-File Move & Relocation Plan

To preserve git history and eliminate code duplication, all shared assets will be moved via `git mv`.

### A. Shared Code $\to$ `packages/kit/` (`@wealthgap/kit`)

```
workflow/05-video/src/design/tokens.ts       ─► packages/kit/src/tokens.ts (expanded with pastels & alpha helpers)
workflow/05-video/src/design/motion.ts       ─► packages/kit/src/motion.ts (expanded with p(), keys(), pulse(), etc.)
workflow/05-video/src/design/layout.ts       ─► packages/kit/src/layout.ts
workflow/05-video/src/design/fonts.ts        ─► packages/kit/src/fonts.ts
workflow/05-video/src/backgrounds/*          ─► packages/kit/src/main/ (Backdrop, Finish, UnifiedBackground, Grain, Vignette)
workflow/05-video/src/components/BigNumber/* ─► packages/kit/src/charts/BigNumber/
workflow/05-video/src/components/BarCompare/*─► packages/kit/src/charts/BarCompare/
workflow/05-video/src/components/LineDraw/*  ─► packages/kit/src/charts/LineDraw/
workflow/05-video/src/components/SizeCompare*─► packages/kit/src/charts/SizeCompare/
workflow/05-video/src/components/IconGrid/*  ─► packages/kit/src/charts/IconGrid/
workflow/05-video/src/components/MoneyFlow/* ─► packages/kit/src/charts/MoneyFlow/
workflow/05-video/src/components/TitleCard/* ─► packages/kit/src/text/TitleCard/
workflow/05-video/src/components/TermCard/*  ─► packages/kit/src/text/TermCard/
workflow/05-video/src/components/SourceTag/* ─► packages/kit/src/text/SourceTag/
workflow/05-video/src/components/Globe3D/*   ─► packages/kit/src/three/Globe3D/
```

#### New Files to Implement in `packages/kit/src/`:
1. `scene.tsx`: `SceneProvider` and `useScene()` hook providing `s.sec()`, `s.word()`, `s.wordRange()`, `s.has()`, `s.words`, window frame bounds, and lead offset calculations.
2. `shapes.ts`: Polar shape library (`circle`, `squircle`, `hexagon`, `blob`, `star`, `lerp`, `smooth`).
3. `primitives/`:
   - `MorphShape.tsx`: Dynamic polar shape morphing with rotating rainbow sweep rim and topographic echo contour rings.
   - `Camera.tsx`: Keyframed world-space 2.5D camera (`scale`, `focus`, `rotate`, `origin`) and `useCamera()` hook.
   - `Label.tsx`: Letter-by-letter masked text reveal with spring overshoot, accent underline, and hold-time enforcement.
   - `Orb.tsx`, `Gem.tsx`, `Coin.tsx`, `Sparkle.tsx`, `Ring.tsx`, `Panel.tsx`, `Particles.tsx`, `Glow.tsx`, `Trail.tsx`.
   - `Counter.tsx`: Spoken-word aligned numeric count-up.
4. `gallery/Gallery.tsx`: Visual component gallery containing standard and stress fixtures for every export.
5. `lint-rules.ts`: Shared static analysis rules enforced by `lint:scene`.

### B. Compatibility Shims in `workflow/05-video/src/`

To guarantee that legacy pipelines (`VID01_Currency_Market` and `fixtures/sample-job`) continue to work seamlessly without code breakage, thin re-export shims will remain in `workflow/05-video/src/`:
- `src/design/tokens.ts` $\to$ re-exports from `@wealthgap/kit`
- `src/design/motion.ts` $\to$ re-exports from `@wealthgap/kit`
- `src/components/*` $\to$ re-exports corresponding shortcuts from `@wealthgap/kit`
- `src/scenes/DynamicScene.tsx` $\to$ preserved for legacy `scenes.json` rendering

### C. Prompts & Scaffolding Template in `workflow/`

- `workflow/prompts/STORYBOARD.md`: New art director prompt (replaces `DIRECTOR_PROMPT.md`, which is marked legacy).
- `workflow/prompts/SCENE_AUTHOR.md`: New scene-authoring instructions.
- `workflow/prompts/HARVEST.md`: New component promotion guidelines.
- `workflow/prompts/VISUAL_GUIDELINES.md`: Updated with dark obsidian (#101010) rules and pastel tokens.
- `workflow/prompts/references/`: Holds `shadow_market.py`, reference stills, and `REFERENCE_NOTES.md`.
- `workflow/05-video/template/`: Per-video Remotion project template copied by `scripts/new_video.ts`.

---

## 3. Scripts Evolution Matrix

All scripts will be accessible from the root `package.json` and accept `--video <ID>` (defaulting to `ACTIVE_VIDEO` in `.env`).

| Command | Action & Role | Status |
|---|---|---|
| `bun run ingest` | Probes audio, parses brief, normalizes transcript into `public/captions.json`. | Existing (adapt to mirror into workspace `public/`). |
| `bun run timeline` | Generates `timeline.json` with frame-accurate scene windows (`leadMs = 200`) and relative word timings. | **New** |
| `bun run storyboard` | Generates `storyboard.json` via LLM or produces `review/storyboard_prompt.txt` (manual mode). | **New** |
| `bun run storyboard:check`| Validates `storyboard.json` schema, anchor existence, gap-free tiling, and writes `storyboard.md`. | **New** |
| `bun run assemble` | Compiles `src/scenes/index.ts` scene registry, SFX cues, and sources metadata. | **New** |
| `bun run still` | Renders PNG frames of scene compositions at key events (`enter`, anchors, `mid`, `exit`). | **New** |
| `bun run sheet` | Assembles a labeled contact sheet PNG (timestamps + words) for human/agent review. | **New** |
| `bun run lint:scene` | Validates scene code against banned syntax (no CSS transitions, no hex codes, no `Math.random`). | **New** |
| `bun run scene:play` | Renders a fast, low-res preview MP4 of an individual scene. | **New** |
| `bun run author` | Orchestrates LLM scene authoring passes (plan $\to$ write $\to$ lint $\to$ still $\to$ review $\to$ fix). | **New** |
| `bun run draft` | Fast draft render (0.5x scale, CRF 26, 30 fps) with chunk-level hash caching. | **Extended** |
| `bun run render` | Broadcast final render (1.0x scale, CRF 16, 30/60 fps) with chunk-level hash caching. | **Extended** |
| `bun run qc` | Automated QA checks: audio sync drift, black frames, freeze detection, missing scene validation. | **Extended** |
| `bun run harvest` | Scans workspace scenes for repeated patterns and drafts `harvest-report.md` for kit promotion. | **New** |
| `bun run gallery` | Launches Remotion Studio focused on `@wealthgap/kit` primitives & stress fixtures. | **New** |

---

## 4. Legacy Behaviour to Preserve

1. **`VID01_Currency_Market` Stability**: The existing video workspace, its `scenes.json`, and its 6 rendered chunks must render with byte-level visual parity.
2. **`fixtures/sample-job` E2E Test**: `bun run video:test` must continue to pass cleanly.
3. **Multi-Clip Whisper Normalization**: The cumulative `clipOffsetMs` algorithm in `normalizeTranscript.ts` must be preserved to support stitched multi-part scripts.
4. **Downstream Audio/Assembly Contract**: Audio ducking in `06-audio` and lossless concatenation in `07-assembly` rely on standardized chunk filenames and timings.

---

## 5. Potential Risks & Engineered Mitigations

1. **Remotion Webpack Symlink Transpilation**:
   - *Risk:* Webpack may treat `@wealthgap/kit` as pre-compiled node_modules and fail on raw TypeScript/JSX.
   - *Mitigation:* Configure `Config.overrideWebpackConfig` in `remotion.config.ts` to explicitly alias `@wealthgap/kit` to `packages/kit/src` and include it in Babel loader rules. Add `tsconfig.json` `paths` fallback.
2. **Multiple React / Remotion Instances**:
   - *Risk:* Multiple copies of React or `@remotion/*` break hook contexts (`useCurrentFrame`, `useVideoConfig`).
   - *Mitigation:* Single dependency tree at root; kit defines `peerDependencies`; verify using `bun pm ls` and `bunx remotion versions`.
3. **CPU Contention During Batch Scene Authoring**:
   - *Risk:* Running multiple Chromium headless instances simultaneously can saturate Apple Silicon CPU/RAM.
   - *Mitigation:* `author.ts` runs scenes sequentially by default (`--concurrency 1`), caching rendered stills.
4. **Text Clipping on Mobile Devices**:
   - *Risk:* Dynamic labels may exceed YouTube mobile safe zones.
   - *Mitigation:* Enforce `tokens.safe` boundaries and test contact sheets scaled down to 400px width.

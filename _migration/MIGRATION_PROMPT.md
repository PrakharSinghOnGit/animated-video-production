# MIGRATION PROMPT: "LLM-written scenes" for The Wealth Gap Studio

> **How to use**
> 1. Open Claude Code (strongest model, plan mode on) in the repo root: `/Users/prakharsingh/youtube/WealthGap`.
> 2. Put these files somewhere the agent can read (for example `_migration/`): `MIGRATION_PROMPT.md` (this file), `KIT_API.md`, `SCENE_AUTHOR.md`, `STORYBOARD.md`, and `shadow_market.py` + its audio and word-level transcript (the reference clip).
> 3. Say: **"Read _migration/MIGRATION_PROMPT.md completely. Do Phase 0 and stop at the gate."** Approve each phase.
> 4. Work on a git branch. Nothing here deletes your existing videos or stages.

---

## 0. Mission

Change the studio so that **an LLM writes the motion-graphics code for each scene** (as small `.tsx` files in each video's workspace) using a **shared kit of primitives**, with a **render-and-look loop** that lets the LLM see and fix its own output, while keeping the split:

- `packages/kit/` = shared code (design tokens, scene helpers, primitives, existing components).
- `workflow/` = generic engine: prompts, scripts, templates, no video assets.
- `workspace/<VIDEO>/` = everything specific to one video, **including its scene code and a Remotion project config**.

**Why:** the current pipeline asks an LLM for `scenes.json` (a list of choices from a fixed component menu) and never looks at the result, so videos look basic. A reference clip (`shadow_market.py`, plus its stills) shows the target quality: custom choreography per beat, word-anchored motion, a moving camera, morphing shapes, masked text reveals, ambient motion, and several fix passes after looking at frames.

**Definition of done:** at the end, `bun run storyboard`, `bun run author`, `bun run draft`, `bun run render`, `bun run qc`, `bun run package` produce a video from a transcript with LLM-authored scenes, with a human gate after the storyboard and after the draft; the old pipeline still works for existing videos; and the reference clip has been rebuilt in the new system as a benchmark.

---

## 1. Operating rules for you (the agent)

1. **Branch and back up.** Create `migration/kit` before touching anything. Commit after every phase and after every meaningful step with clear messages. Never force-push, never delete user data.
2. **Plan, then act.** At the start of each phase write a short plan; at the end, a report: what changed, how to run it, what is untested, what you need from me.
3. **Ask at most 6 questions in total,** in Phase 0, only about things that change the design. Otherwise choose defaults and record them in `docs/MIGRATION_DECISIONS.md`.
4. **Read before writing.** Inspect the real repo (tree, `package.json`s, existing scripts, components, tests, READMEs). The structure described in this prompt is from my description; **the repo is the truth**. Where they differ, adapt and note it.
5. **Do not break what works.** `VID01_Currency_Market` and `fixtures/sample-job` must still render through the old path until I approve removing it. Keep old scripts working (wrap, don't rewrite, unless necessary).
6. **Secrets.** Never print, move or commit anything from `.env`; you may add new keys to `.env.example` only. Ask before installing anything paid or any global tool.
7. **Verify, don't assume.** Remotion APIs and CLI flags change between versions: use the Remotion docs/skills available to you (`/remotion-docs` or the `remotion-best-practices` skill if installed; if not installed, run `npx remotion skills add` after asking me) and check `--help` output before relying on a flag. Same for the Claude Code CLI flags.
8. **Look at your own output.** For anything visual, render stills and open the PNGs. Do not claim a visual works without looking.
9. **Mac + Bun.** I'm on macOS using Bun for the root scripts. Run Remotion's CLI via `bunx remotion` (or Node if Bun has problems with it); record what worked in the decisions doc.

---

## 2. Target architecture

```
WealthGap/
├── package.json                    # Bun workspaces: ["packages/*", "workspace/*/05-video"]; root scripts
├── tsconfig.json                   # base config; "paths": { "@wealthgap/kit": ["packages/kit/src"] } as a fallback
├── bunfig.toml (if needed)
├── .env / .env.example             # ACTIVE_VIDEO=…
├── CLAUDE.md                       # repo rules for any coding agent (Phase 7)
├── packages/
│   └── kit/                        # @wealthgap/kit (moved/extended from workflow/05-video/src)
│       ├── package.json            # name "@wealthgap/kit", "main": "src/index.ts", peerDependencies: remotion, react, @remotion/*
│       ├── KIT_API.md
│       └── src/ …                  # see KIT_API.md §2
├── workflow/
│   ├── prompts/
│   │   ├── STORYBOARD.md           # new (replaces DIRECTOR_PROMPT.md, which becomes legacy)
│   │   ├── SCENE_AUTHOR.md         # new
│   │   ├── HARVEST.md              # new (Appendix B)
│   │   ├── VISUAL_GUIDELINES.md    # updated (Phase 5)
│   │   └── references/             # shadow_market.py, reference stills, REFERENCE_NOTES.md
│   ├── 05-video/
│   │   ├── scripts/                # ingest (existing), timeline, storyboard, storyboard-check, assemble, still, sheet,
│   │   │                           # lint-scene, scene-play, author, render (extended), qc (extended), package (existing), harvest
│   │   ├── template/               # per-video Remotion project skeleton copied by new-video
│   │   └── fixtures/               # sample-job (legacy) + shadow-clip (new benchmark)
│   └── …                           # 01–04, 06–07 unchanged
├── scripts/new-video.ts            # updated to scaffold the project template into workspace/<ID>/05-video
└── workspace/<VIDEO>/05-video/
    ├── package.json                # name "@wealthgap-video/<id>", private, depends on "@wealthgap/kit": "workspace:*"
    ├── remotion.config.ts  tsconfig.json
    ├── public/                     # audio + captions mirrored here by ingest (staticFile)
    ├── storyboard.json  storyboard.md (generated)  timeline.json (generated)
    ├── src/
    │   ├── index.ts  Root.tsx      # from template, registers Main + one composition per scene
    │   ├── Main.tsx                # from template, data-driven (timeline + scene registry); NOT LLM-written
    │   └── scenes/                 # S01_slug.tsx … written by the LLM; index.ts generated
    ├── review/                     # plan.md, pass-N.md, stills, sheets, kit-requests.md, report.md per scene
    ├── chunks/ final.mp4 stills/   # as today
    └── legacy/                     # old scenes.json etc. preserved (VID01 only)
```

**Key design decisions (implement unless the repo makes them impossible; record deviations):**

1. **One dependency tree at the root.** Remotion, React, three, etc. are installed once at the root so there is exactly **one copy of React and each `@remotion/*` package**, all at the **same version**. The kit lists them as `peerDependencies`. Verify with `bun pm ls` (look for duplicates) and `bunx remotion versions`.
2. **The kit is TypeScript source, no build step.** Workspace symlink resolves `@wealthgap/kit`; Remotion's bundler transpiles it because it resolves to a real path outside `node_modules`. If it does not, add a webpack alias in `remotion.config.ts` via `Config.overrideWebpackConfig` and/or the tsconfig `paths` fallback.
3. **Scene window and lead.** Each scene is mounted in a window `[startMs − leadMs, endMs]` (default `leadMs = 200`), so entrances can overlap the previous scene's exit. Frame 0 inside a scene is the window start. The persistent `Backdrop` and `Finish` live in `Main`, not in scenes.
4. **Scene contract.** `export const meta` + `export default` component, using only `@wealthgap/kit`, `remotion`, `react` (see `KIT_API.md` §7).
5. **Storyboard JSON is the source of truth;** `storyboard.md` is generated for human review (Gate 1).
6. **Main is not LLM-written.** It is a generic interpreter of `timeline.json` + the scene registry + `Backdrop`/`Finish`. Only scene files are LLM-authored.
7. **Chunked rendering with cache.** `render` renders **video-only chunks by frame range of `Main`** (so overlaps and persistent backdrop are correct), caches each chunk by a hash of (kit version/hash + that scene file + timeline slice + backdrop/Main code), re-renders only changed chunks, then concatenates. Audio is mixed in stages 06/07 as it is today (do not change audio behaviour unless needed; read the current chunk/assembly code first).
8. **Fonts load once** in `Root` (a kit `loadFonts()` using local files in `public/fonts` or `@remotion/google-fonts`).

---

## 3. Phases

### Phase 0: Recon, plan, questions (read-only)
1. Create branch `migration/kit`. Show `git status`; if the tree is dirty, ask me before proceeding.
2. Read: root `package.json`, `tsconfig.json`, `.env.example`, every README, `workflow/05-video/**` (components, backgrounds, scripts, fixtures, tests), `scripts/`, `workspace/VID01_Currency_Market/05-video/` (what exists: `scenes.json`, chunks, stills), `workflow/prompts/*`, and the migration files.
3. Inventory: Remotion + React + three versions, Bun version, how scripts are run, how `ingest` handles the "Studio multi-clip" transcript format, how `chunk`/`render`/`07-assembly` work (so you keep behaviour), where `ACTIVE_VIDEO` is read, how tests run.
4. Write `docs/MIGRATION_PLAN.md`: findings, a file-by-file move plan (what goes to `packages/kit`, what stays), risks, and the list of **legacy behaviour to preserve**.
5. Ask me up to 6 questions (examples: palette/background default change from #0B0F14 to #101010; do I want 30 fps drafts + 60 fps finals; where to put the reference clip files; whether `Globe3D` stays in the kit; whether to keep Gemini manual-paste mode for the storyboard step; how many scenes may run in parallel on my Mac).
**Gate 0:** show me `MIGRATION_PLAN.md` and the questions. Stop.

### Phase 1: Bun workspaces and the kit package
1. Convert the root to Bun workspaces (`packages/*`, `workspace/*/05-video`). Move shared Remotion code (`src/components`, `src/backgrounds`, tokens, motion helpers, Globe3D, anything reusable) from `workflow/05-video/src` into `packages/kit/src`, leaving thin re-export shims where old scripts import from the old paths. Do it with `git mv` to keep history.
2. Create `packages/kit/package.json` (`@wealthgap/kit`, `main`/`types` → `src/index.ts`, peerDependencies) and `src/index.ts` re-exporting everything that exists today. Keep old export names working.
3. Make `VID01` and `fixtures/sample-job` render exactly as before (render a draft of each, compare frame counts and a few stills against the pre-migration renders you saved in Phase 0 or at the start of this phase).
4. Verify single instances (`bun pm ls`, `bunx remotion versions`, one `renderStill` smoke test importing the kit from a workspace project).
**Acceptance:** old pipeline unchanged; `import { … } from "@wealthgap/kit"` works from a workspace project; no duplicate React/Remotion.
**Gate 1:** report + a before/after still of VID01.

### Phase 2: Per-video project template and `new-video`
1. Create `workflow/05-video/template/` containing: `package.json` (workspace member, depends on the kit), `remotion.config.ts`, `tsconfig.json` (extends root), `src/index.ts`, `src/Root.tsx`, `src/Main.tsx`, `src/scenes/index.ts` placeholder, `public/` placeholder, `.gitignore`.
2. `Root.tsx` loads fonts, reads `timeline.json`, registers **`Main`** (duration from `timeline.json` via `calculateMetadata`) **and one composition per scene** (id = scene id, duration = window length, wrapped in `SceneProvider`) so each scene can be previewed/rendered alone.
3. `Main.tsx`: `Backdrop` + a `Sequence` per scene (`from = windowStart`, `durationInFrames = window`, `premountFor` ≈ 1 s) rendering the registered scene inside `SceneProvider`, then `Finish`. No audio in `Main` (video-only chunks); keep an optional `VoiceOver` toggle for Studio previews.
4. Update `scripts/new-video.ts` to scaffold the template into `workspace/<ID>/05-video/` (without overwriting anything) and register nothing by hand (workspaces glob picks it up; run `bun install`).
5. Create a brand-new empty test video with `new-video`, run `bun install`, open Studio headlessly (or render a still of an empty `Main`) to prove the setup.
**Acceptance:** a fresh `workspace/<ID>/05-video/` renders a still; scenes can import the kit; `bun install` at the root links it.

### Phase 3: The kit (build to `KIT_API.md`)
Implement `KIT_API.md` in `packages/kit/src`. Order: `tokens` → `scene` (SceneProvider/useScene) → `motion` → `shapes` → `Camera` → `MorphShape` → `Label` (masked letter reveal) → `Ring`, `Glow`, `Particles` → `Orb`, `Gem`, `Coin`, `Sparkle`, `Panel` → `Counter`, `Trail` → `Backdrop`, `Finish`, `VoiceOver`, `Sfx` → `Gallery` + fixtures.
1. **Port from `references/shadow_market.py`** (read `REFERENCE_NOTES.md` you will write in Phase 5 or read the Python directly): polar shape library and morphing, contour echo rings, sweep-gradient rim, shaded orbs/gems/coins with sparkle, ripple rings, camera keyframes + zoom/focus, letter-by-letter masked labels with exits, the persistent backdrop (glows, dot grid, particles, vignette, grain), and the easing/spring functions. Match the look: #101010 background, the pastel tokens, rainbow rim light.
2. Add `useScene().word()` with robust matching (case-insensitive, punctuation stripped, occurrence index) and warnings when missing.
3. Build `bun run gallery` (Studio with a `Gallery` composition) and render a **contact sheet of the Gallery** to look at it. Fix visual bugs.
4. Add stress fixtures: very long label, huge number, zero, negative.
5. Performance check: record per-primitive still render time; flag anything slow (big blurs, large DOM).
**Acceptance:** every export has a fixture and appears in the Gallery; Gallery sheet looks consistent and on-brand; no CSS transitions/animations, no `Math.random` anywhere in the kit.
**Gate 3:** show me the Gallery contact sheet.

### Phase 4: Scripts (all run with `--video <ID>`, default `ACTIVE_VIDEO`)
Implement or extend, with Zod validation, clear errors, exit codes, and a `status.json` update per stage. Write unit tests for the pure logic (timeline building, anchor resolution, lint rules).

| Script (root script name) | Behaviour |
|---|---|
| `ingest` (existing) | keep; ensure it mirrors audio + normalized captions into `workspace/<ID>/05-video/public/` |
| `timeline` | reads normalized word captions + `storyboard.json` → `timeline.json`: `{ fps, width, height, leadMs, durationFrames, scenes:[{ id, slug, windowStartFrame, windowEndFrame, voiceStartFrame, voiceEndFrame, words:[{ text, startFrame, endFrame }] }] }` (word frames relative to the window start). fps comes from config (30 default). |
| `storyboard` | builds the full prompt (STORYBOARD.md + transcript + script + brief + KIT_API summary) and either (a) calls an LLM if configured (Claude via CLI/API) or (b) in **manual mode** writes `review/storyboard_prompt.txt` and waits for me to place `storyboard.json`. Then runs `storyboard:check`. |
| `storyboard:check` | Zod-validates `storyboard.json`; checks scenes tile the timeline, durations 3-12 s, every anchor word exists within its scene with that occurrence, palette tokens valid, sfx names allowed, no "fades in/slides in" wording, numbers have sources, no consecutive duplicate `relationship`/layout; writes **`storyboard.md`** (a readable table + warnings for Gate 1); exits non-zero on errors. |
| `assemble` | runs `timeline`, regenerates `src/scenes/index.ts` (registry from `S*.tsx` in storyboard order, reading each `meta`), generates `sfx` cue list from `meta.sfx` + `storyboard.sfx`, and `sources` data from `meta.numbers`. Scenes not yet written render as a placeholder card (id + slug) so partial videos still work. |
| `still` | uses `@remotion/renderer` (`bundle` once, cached; `selectComposition`; `renderStill`) to render frames of a scene composition into `review/<scene>/`; `--at enter,anchors,mid,exit` or explicit frames/seconds; filenames include frame and nearest word. |
| `sheet` | builds a labelled contact sheet PNG (frame, seconds, nearest spoken word) from the stills (use `sharp`, or ffmpeg `tile` if `sharp` is unavailable). |
| `lint:scene` | static checks (see §5) on a scene file; prints errors/warnings with line numbers; exit 1 on errors. |
| `scene:play` | low-res (0.5 scale) MP4 of one scene composition for quick human viewing. |
| `author` | the orchestrator (see §4). |
| `render` (extend) | `--draft` (0.5 scale, high CRF, 30 fps) / final; `--scenes S03,S04` re-render only those; chunk by frame range of `Main`; hash-cache; concat. Keep existing 07-assembly handoff unchanged. |
| `qc` (extend) | keep existing checks; add: every scene present, no placeholder scenes in final, lint passes for all scenes, black-frame and freeze checks per chunk, duration drift vs audio. |
| `harvest` | see Appendix B. |

**Acceptance:** each script has a `--help`, tests pass (`bun test`), and a dry run on the fixture works end to end except `author`.

### Phase 5: Prompts, references, Claude Code helpers
1. Copy `STORYBOARD.md`, `SCENE_AUTHOR.md` into `workflow/prompts/`; `KIT_API.md` into `packages/kit/`. Mark `DIRECTOR_PROMPT.md` as **legacy** (add a header note, keep the file).
2. Update `VISUAL_GUIDELINES.md` to match the new rules: #101010 base, pastel tokens, three-layer architecture, entrance vocabulary, banned generic motion, hold times, text limits, finance-integrity rules (link to `SCENE_AUTHOR.md` §4).
3. Create `workflow/prompts/references/`: `shadow_market.py`, `reference_stills/` (render the reference at t = 0, 1.0, 3.5, 7.9, 9.6, 11.5 if the video exists), and **`REFERENCE_NOTES.md`** explaining the craft patterns (word-anchored timeline constants, camera keyframes, layers, morphing shapes, label reveals, ambient motion, fix-pass lessons) in 40-60 lines.
4. Add `.claude/commands/` (verify the current Claude Code format for custom commands before writing): `storyboard.md`, `author-scene.md`, `review-scene.md`, `harvest.md`, each a short prompt that points to the right prompt file and scripts.
**Acceptance:** all prompt files present, cross-references correct (file names, command names, paths).

### Phase 6: Benchmark: rebuild the reference clip in the new system
1. Create a test workspace `workspace/_FX_shadow_clip/` with the clip's audio and word-level transcript (ask me to place them if missing).
2. Run `ingest`, then use the **example storyboard in `STORYBOARD.md` §7** as `storyboard.json` (it is the worked example for this exact clip). Run `storyboard:check`, `assemble`.
3. **Act as the scene author yourself** for S01 and S02 following `SCENE_AUTHOR.md` exactly (plan → write → lint → still → look → fix, max 4 passes each). Do not copy the Python; recreate the *look and choreography* with kit primitives.
4. Render a draft and a final chunked render; run `qc`.
5. Write `review/benchmark.md`: side-by-side stills (reference vs rebuilt) at 6 timestamps, what matches, what doesn't, what kit gaps you found, render times per scene, and the cost/time of the authoring loop.
**Acceptance:** the rebuilt clip is clearly in the same quality class as the reference (same beats on the same words, camera moves, morphing, masked labels, ambient motion); gaps are listed honestly.
**Gate 6:** show me the stills and the MP4 path. Stop.

### Phase 7: Orchestration, docs, handoff
1. Finish `author` (headless mode) and test it on the fixture with `--scenes S02` (see §4 for flags and fallbacks).
2. Add root scripts: `storyboard`, `storyboard:check`, `timeline`, `assemble`, `author`, `still`, `sheet`, `lint:scene`, `scene:play`, `draft`, `render`, `qc`, `package`, `harvest`, `gallery`, `studio`, plus a `build` that runs the full flow and **pauses at Gate 1 (storyboard) and Gate 2 (draft)** unless `--yes`.
3. Write `CLAUDE.md` (≤120 lines): purpose, folder rules (kit vs workflow vs workspace), the golden rules (tokens only, frame-driven motion, no randomness, authors don't edit the kit), commands, and "always render and look".
4. Update `README` for the video workflow: new commands, the two human gates, how to run Gemini-manual mode, how to re-render a single scene, how to harvest.
5. Document costs/time: render time per minute of video, chunk caching, typical authoring passes.
**Acceptance:** a new video can be created from scratch by following the README only.

---

## 4. The `author` orchestrator (spec)

Goal: for each scene in `storyboard.json` (or `--scenes S03,S04`), start a **fresh coding-agent session** that follows `SCENE_AUTHOR.md`, with the scene's data, then verify the result with scripts.

1. Build the prompt: `SCENE_AUTHOR.md` + `STORYBOARD_ROW` + `TIMELINE_SLICE` + `VIDEO_ARC` + `PREV/NEXT` summaries and handoffs + exact file paths and commands. Save it to `review/<scene>/prompt.txt`.
2. Run the agent headless. For Claude Code use its non-interactive print mode (`claude -p`) with limited tools (read/write/edit files, run only our `bun run …` scripts), a turn limit, and JSON output. **Verify the exact flags with `claude --help` for the installed version.** If headless mode is unavailable, fall back to **interactive mode**: print the prompt, tell me to paste it into Claude Code (or run `/author-scene S03`), and wait for `review/<scene>/report.md`.
3. After the agent finishes: run `lint:scene`; render stills; confirm `report.md` exists; if lint fails, resume once with the lint output. Never loop more than 2 orchestrator retries.
4. Run scenes **sequentially by default** (rendering is CPU-heavy); allow `--concurrency N` for agents that mostly think.
5. Log per scene: start/end time, passes used, lint result, and token/cost info if the CLI reports it, in `review/author-log.json`.
6. Skip scenes whose file already exists and whose inputs (storyboard row + timeline slice) are unchanged, unless `--force`. Keep previous versions in `review/<scene>/history/`.
7. After all scenes: run `assemble`, a quick `draft`, and print the Gate 2 checklist (open `review/contact-sheet.png`, watch the draft, list scenes to redo with `--scenes`).

---

## 5. `lint:scene` rules

**Errors**
- Imports outside `@wealthgap/kit`, `remotion`, `react` (and relative imports from other scenes or `workflow/`).
- CSS `transition`, `animation`, `@keyframes`, Tailwind `animate-*`/`transition-*` classes.
- `Math.random`, `Date.now`, `new Date(`, `fetch(`, `setTimeout`, `setInterval`, `requestAnimationFrame`, `localStorage`.
- Hex/rgb color literals or `fontFamily` strings (must come from tokens). Allow `rgba()` only through kit helpers.
- Missing `export default` or `export const meta` with `id`, `title`, `numbers`, `sfx`; `meta.id` not matching the filename.
- `useCurrentFrame` not used; no `useScene` use.
- An opaque full-screen background.
- `sfx.sound` not in the allowed set.
- `interpolate(` without clamp settings (when used directly).
**Warnings**
- Hard-coded frame numbers or "magic" literals for timing (suggest `s.sec()`/`s.word()`).
- Any `s.word("…")` text that is not in the scene's word list (comes from `timeline.json`).
- Font sizes below `tokens.type.small` after scaling.
- More than ~600 JSX elements (rough count) or more than 3 blur filters.
- Fewer than 2 distinct entrance types, or entrances that are opacity-only.
- No ambient motion (nothing animated by time alone).
- A `Label` that exits before the hold time.

---

## 6. Global acceptance tests (run before declaring done)

- [ ] `bun install` at root succeeds; one React and one version of every Remotion package.
- [ ] Old pipeline: `VID01` and `sample-job` still produce the same frame counts as before.
- [ ] `new-video` scaffolds a project that renders a placeholder `Main`.
- [ ] Gallery shows every kit export with fixtures; contact sheet reviewed.
- [ ] Unit tests pass (`bun test`): timeline, anchor resolution, storyboard check, lint rules.
- [ ] Lint catches a deliberately bad scene (CSS transition, hex color, `Math.random`).
- [ ] `storyboard:check` rejects a broken storyboard (gap, bad anchor, unsourced number) with readable errors.
- [ ] Benchmark clip renders; stills compared with the reference; `benchmark.md` written.
- [ ] Single-scene re-render: editing one scene re-renders only that chunk (cache works).
- [ ] `qc` passes on the benchmark; fails on a deliberately placeholder video.
- [ ] README lets me create a new video from scratch.

---

## 7. Final report format

1. What was built (by phase), with paths. 2. How to run the new flow (10 commands max). 3. What changed for old videos (nothing, or exactly what). 4. Benchmark results (render time, passes per scene, estimated cost/time per minute of video). 5. Known limits and risks. 6. Recommended next steps (the harvest loop, 60 fps finals, more primitives).

---

## Appendix A: Handling the two storyboard modes

- **Manual mode (default for now):** `bun run storyboard` writes `review/storyboard_prompt.txt` containing the full prompt; I paste it into Gemini/Claude, save the JSON as `storyboard.json`, and run `bun run storyboard:check`. The check must produce a clear, copy-pasteable list of fixes I can send back to the model.
- **Auto mode:** same prompt, but the script calls the configured LLM and retries up to 2 times feeding back `storyboard:check` errors.

## Appendix B: `harvest` and `HARVEST.md` (create this file in `workflow/prompts/`)

**Purpose:** after a video ships, promote reusable patterns from its scenes into the kit so the next videos start with more.

**Script behaviour:** `bun run harvest --video <ID>` scans `src/scenes/*.tsx` and `review/kit-requests.md`, finds repeated or generic-looking blocks (same helper pattern in 2+ scenes, large self-contained sub-components, requested missing primitives), and writes `review/harvest-report.md` with candidates (scene, lines, proposed API, why reusable). It changes **no code**.

**`HARVEST.md` prompt contents (write this):**
> You are the kit maintainer. Read `harvest-report.md`, the candidate scene code, and `KIT_API.md`. For each candidate decide: promote, generalise-then-promote, or leave in the scene. Only promote patterns that are visually distinct, reusable across topics, and parameterisable with a small prop API. For each promoted item: implement it in `packages/kit/src/primitives/`, add props, a Gallery fixture (including a stress fixture), an entry in `KIT_API.md` and a changelog line, and bump the kit version. Do not change behaviour of existing exports. Do not touch scenes of shipped videos except to optionally swap their local copy for the kit version in a separate commit (and only after re-rendering to confirm identical output). Finish with a short summary and the list of new exports.

## Appendix C: Things to decide with me as you go
- 30 fps drafts / 60 fps finals (render-time tradeoff); whether to keep Globe3D in the kit; whether to run authoring on a cheaper model for simple scenes; whether to add a motion-blur primitive for fast camera moves.

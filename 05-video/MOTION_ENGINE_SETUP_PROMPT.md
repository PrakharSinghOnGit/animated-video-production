## 0. Your role and the mission

You are a senior motion designer and a senior TypeScript/Remotion engineer in one. You are building a **standalone project** called **Motion Engine**.

**What it does, in one sentence:** it takes a voiceover **audio file**, a **word-by-word timestamped transcript** and a **text brief** describing what is needed (plus optional data files or extra requests), and it produces a **polished motion-graphics explainer video (MP4)** plus **metadata** about that video, with no other manual step.

```
INPUTS                                        OUTPUTS
 audio file (voiceover)          ┌──────────► final.mp4 (+ optional vertical cut)
 word-level transcript   ───►  MOTION ENGINE ─► metadata.json, scenes.json
 brief.md (what is needed)       │            ► captions (json/srt/vtt), chapters.txt
 optional: data, assets, config  └──────────► stills/ (contact sheet, thumbnails), qc-report.md, sources.md
```

**The video style:** modern finance/economics explainers (think Vox/Polymatter/Wendover-style motion graphics): animated charts, big numbers, maps, money-flow diagrams, comparisons, timelines, annotated text, clean captions. It must look **designed and consistent, not generic**.

**The channel context** (for tone and defaults only; keep the engine channel-agnostic through config): _The Wealth Gap_, finance topics, dark premium look, one gold accent.

### Non-goals (do NOT build or use these)

- No stock footage, no AI-generated video, no photos of real people, no real company logos, no real news-outlet logos or screenshots. Everything on screen is **drawn in code** (React/SVG/CSS/canvas) or comes from user-supplied files.
- No voice generation. The audio is always an input. (An optional script for generating test audio is allowed only for fixtures.)
- No upload to YouTube. (Metadata is produced so a later step can upload.)
- No dependency on n8n or any orchestrator. It must run from the command line, and an orchestrator can call the CLI later.
- No network access at render time. Fonts, map data and icons must be local or bundled, so renders are deterministic.

---

## 1. Operating rules for you (the agent)

1. **Plan first, then build.** At the start of every phase, write a short plan, list assumptions, then execute.
2. **Ask at most 5 questions in total up front** (Phase 0), only about things that change the architecture. For everything else, choose a sensible default, write it in `docs/ASSUMPTIONS.md` and move on.
3. **Never invent facts or numbers.** Every figure shown in a video must come from the brief, a data file or the transcript, and must be listed with its source in `sources.md`. If a number is missing, show a clearly flagged placeholder and add a `NEEDS_DATA` warning to the QC report. Never fake chart data.
4. **Preserve my edits.** I may edit files outside the conversation. If you see a surprising change, assume it was intentional or ask. Do not overwrite it.
5. **Small commits.** `git init` in Phase 0 and commit after every phase (and after every meaningful component) with a clear message.
6. **Secrets** go in `.env` (git-ignored). Never print or commit keys. Provide `.env.example`.
7. **Look at your own output.** You cannot watch video, but you can look at frames. After building any visual, render stills, view them, and fix problems before saying "done" (Section 12).
8. **Prefer reuse.** Before writing a new visual, check the component library. If nothing fits, follow the "Missing component protocol" (Section 10.4).
9. **Determinism.** Same inputs and same code must produce the same video. No `Math.random()` (use Remotion's seeded `random()`), no `Date.now()`, no live network calls during render.
10. **Report format** at the end of each phase: what you built, what you assumed, what you could not do, how to run it, what I should check.

---

## 2. Environment and setup (Phase 0)

### 2.1 Check and install

Verify, and install or tell me what is missing: **Node.js** (current LTS that Remotion supports; check with `/remotion-docs`), **npm** (or bun/pnpm; pick npm unless I say otherwise), **Git**, **ffmpeg + ffprobe**, **Python 3** (only for optional helper scripts), and a **Chromium/Chrome** (Remotion downloads one on first render if none is found).

### 2.2 Scaffold the project

- Inspect the current folder, including hidden files, before scaffolding. If it only contains this prompt file, scaffold into it carefully (do not delete `PROMPT.md`; if `create-video` refuses a non-empty folder, scaffold into a temp subfolder and move files up).
- Use a blank TypeScript Remotion project: `npx create-video@latest --yes --blank --no-tailwind <name>` then `npm i`. Use Tailwind only if I ask.
- **Pin every `@remotion/*` package to the exact same version** as `remotion`. Install extra packages with `npx remotion add <package>` so versions match.
- Packages expected (install when first needed): `@remotion/captions`, `@remotion/media`, `@remotion/transitions`, `@remotion/layout-utils`, `@remotion/google-fonts` (or local fonts), `@remotion/rough-notation`, `@remotion/zod-types`, `@remotion/sfx`, `@remotion/effects` (only if used), `zod`, and for data viz `d3-scale`, `d3-shape`, `d3-geo`, `topojson-client`, `world-atlas` (bundled, no network).

### 2.3 Install the Remotion agent skills (this is the single most important step)

```bash
npx remotion skills add          # installs to .agents/skills, with .claude/skills symlinked for Claude Code
# alternative for Claude Code plugin users (verify exact commands with /remotion-docs or Remotion's site):
# claude plugin marketplace add remotion-dev/claude-code-plugin
# claude plugin install remotion@remotion
```

After installing, **list the skills you can now see** and confirm they include: `remotion-best-practices` (router), `remotion-create`, `remotion-markup`, `remotion-captions`, `remotion-render`, `remotion-studio`, `remotion-maps`, `remotion-multimedia`, `remotion-docs`, `remotion-interactivity`, `remotion-saas`, `remotion-upgrade`. If they are missing, stop and tell me.

**How to use them (mandatory):**

- Before writing or changing any Remotion code, load the relevant skill reference. Do not rely on memory for Remotion APIs; they change between versions. Use `/remotion-docs` to look up an API when unsure. This reduces hallucinated APIs.
- Writing components, animation, audio, fonts, effects, transitions → `remotion-markup`.
- Anything with captions/word timing → `remotion-captions`.
- Maps and routes → `remotion-maps`.
- Duration/dimension of audio or video → `remotion-multimedia`.
- Rendering, stills, transparent output → `remotion-render`.
- Preview server → `remotion-studio`.
- Upgrading → `remotion-upgrade`.

**Remotion rules to follow from those skills (non-negotiable):**

- Drive all animation with `useCurrentFrame()` + `interpolate()` (+ `Easing.bezier()` / `Easing.spring()`). **CSS `transition`, CSS `animation` and Tailwind animation classes do not render correctly**: never use them.
- Keep `interpolate()` calls **inline in the `style` prop** and prefer individual CSS properties (`scale`, `translate`, `rotate`) over `transform` strings, so values stay editable in Remotion Studio. For `scale` animations use `output: 'perceptual-scale'`. Shared helpers may export constants (easings, frame ranges), not pre-computed values.
- Always set `extrapolateLeft/Right: 'clamp'` unless you intentionally want overshoot.
- Put assets in `public/` and reference them with `staticFile()`.
- Use `<Video>`/`<Audio>` from `@remotion/media`, and `<CanvasImage>` / `<AnimatedImage>` for images, as the installed skill version says.
- **Always premount `<Sequence>`** (`premountFor`), and use `layout="none"` when a sequence must not be wrapped in an absolute fill.
- Multi-scene videos: each substantial scene is its own component and file, registered as a **connected composition** so every scene has its own Studio timeline; use `<TransitionSeries>` when scenes have transitions and remember that transitions shorten the total duration by their overlap.
- Compositions with text must wait for fonts to load; anything async uses `delayRender`/`continueRender` (or the current `useDelayRender` API per the skill).
- Video layout rules: you are designing a video, not a webpage. One focal point per scene. For 1080px-wide frames keep key text at least 80px from the sides and 100px from top/bottom, headlines at least 84px and important supporting text at least 44px. Scale these with composition width (so 1920px wide is about 1.78x).
- The `remotion-create` skill says "only render if the user explicitly asks". **In this project, running `npm run render` / `npm run build` or my saying "build it" counts as asking.**

### 2.4 Optional connectors (install only if I confirm; none are required)

Skills give knowledge; MCP servers give connectivity. Every MCP adds context cost, so stay lean.

| Connector                                                | Use here                                                         | Needed?                                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Remotion docs (via `/remotion-docs` skill)               | API lookup                                                       | Yes (skill, not MCP). A separate Remotion MCP is reportedly deprecated in favour of the skills. |
| ffmpeg (skill or plain CLI)                              | Contact sheets, loudness, audio probing                          | Yes (CLI is enough)                                                                             |
| Playwright MCP                                           | Screenshot a real chart or page to use as a reference for design | Optional                                                                                        |
| Figma MCP                                                | Pull design tokens if I keep a brand file in Figma               | Optional                                                                                        |
| Image-generation connectors (Magnific, Higgsfield, etc.) | Stylized cutouts/illustrations                                   | **Not now.** Keep v1 pure code. Leave a documented extension point in `assets/`.                |
| ElevenLabs MCP/API                                       | Voice generation                                                 | **No.** Audio is an input.                                                                      |

### 2.5 Study before designing (read, don't copy)

Look at how others solved the "generic output" problem, then bring the _ideas_ into `DESIGN.md`:

- A toolkit that encodes **motion rules with numbers** (entrance easing `bezier(0.16, 1, 0.3, 1)`, exits at half the entrance duration, about 80-90 ms stagger between items, reading holds), a **self-review loop** that renders a contact sheet with one frame per beat, and a **single timeline JSON** read by scenes, sound and QC. Search GitHub for `claude-motion` (whaleyxbt) and for Remotion "motion-design" skills to see the structure.
- Vox-style pipelines that treat **the script/voiceover as the timeline**, lock one background/palette/fonts, and build scenes in **three layers** (background, midground texture, foreground elements) so the video feels like one continuous world.

---

## 3. INPUT CONTRACT (what the engine accepts)

Each video is a **job** in its own folder: `jobs/<job-id>/input/`. A job-id is a slug like `fx-market-explainer`.

```
jobs/<job-id>/input/
├── audio.mp3                 REQUIRED  (mp3 | wav | m4a | aac | flac)
├── transcript.json           REQUIRED  word-level timestamps (formats accepted below)
├── brief.md                  REQUIRED  the description of what is needed (template in Appendix B)
├── config.json               optional  overrides (fps, size, captions, music, aspect ratios...)
├── style.json                optional  per-job overrides of design tokens (accent color, fonts)
├── data/                     optional  *.csv / *.json the visuals must be built from
├── assets/                   optional  user-owned images/SVG/logos/fonts/music
├── storyboard.json           optional  if present, skip auto-planning and use it
└── requests.md               optional  free-text extra asks ("need a map of X", "chart from data/gdp.csv")
```

### 3.1 Accepted transcript formats → one internal format

Normalize everything into Remotion's `Caption` type (`import type { Caption } from "@remotion/captions"`), saved as `captions.json`:

```ts
type Caption = {
  text: string; // INCLUDE the leading space before each word (captions are whitespace sensitive)
  startMs: number;
  endMs: number;
  timestampMs: number | null;
  confidence: number | null;
  pageBreakAfter?: boolean;
};
```

Write a robust `normalizeTranscript()` that auto-detects and converts:

1. **Remotion `Caption[]` JSON** (use as is, after validation).
2. **Whisper-style word JSON** (`words: [{word, start, end}]` in seconds, or `segments[].words[]`).
3. **ElevenLabs alignment** (character-level start/end arrays → group characters into words).
4. **`.srt` / `.vtt`**: use `parseSrt` from `@remotion/captions` for SRT. These are usually phrase-level, not word-level. If so, **distribute word times proportionally by character count inside each cue** and emit a `WARN: approximate word timing` in the QC report.
5. **Plain `{ "words": [{ "text": "...", "start": 0.0, "end": 0.4 }] }`** (documented in `docs/INPUTS.md`).

**Normalization rules:** enforce monotonic times, clamp negatives to 0, fix overlaps by trimming the previous word's `endMs`, merge standalone punctuation tokens into the previous word, keep `text` leading-space convention, drop empty tokens, detect and warn on gaps longer than 1.5 s, detect and warn if the last word ends more than 500 ms after the audio duration (or the audio runs more than 4 s past the last word without it being an intentional outro).

### 3.2 The brief

`brief.md` has YAML front-matter (machine-readable) and free text (human description). Validate the front-matter with a Zod schema and print clear errors. Full template: **Appendix B**. Fields at minimum: `title`, `topic`, `language`, `tone`, `audience`, `aspect` (default `16:9`), `accent` (optional), `must_show` (key numbers with sources), `avoid`, `chapters` (optional hints), `outputs` (which files to produce).

The free text may say things like "the video explains how X works; show A vs B; the key number is Y." The planner uses it as **intent**; the transcript is the **timeline**.

### 3.3 `config.json` defaults

```json
{
  "fps": 30,
  "width": 1920,
  "height": 1080,
  "aspects": ["16:9"],
  "audioOffsetMs": 0,
  "tailPaddingMs": 1200,
  "captions": { "mode": "sidecar", "style": "clean-bottom", "wordsPerPage": 5 },
  "music": { "file": null, "volume": 0.08, "duckTo": 0.03 },
  "sfx": {
    "enabled": true,
    "volume": 0.25,
    "set": ["whoosh", "whip", "switch", "ding", "mouse-click", "page-turn"]
  },
  "render": {
    "draft": { "scale": 0.5, "crf": 28 },
    "final": { "codec": "h264", "crf": 16 }
  },
  "qc": { "failOnWarnings": false }
}
```

`captions.mode`: `burned` (drawn into the video), `sidecar` (only `.srt/.vtt/.json` files), or `both`.

### 3.4 What if the input is incomplete?

- No `storyboard.json` → generate it (Section 9).
- Brief too thin → proceed using the transcript, list assumptions in `plan/assumptions.md`, and flag it.
- `data/` missing but the transcript contains numbers → build number-led visuals (`BigNumber`, `StatCompare`) using only numbers found in the transcript/brief; never chart data that doesn't exist.
- `requests.md` asks for something no component supports → Section 10.4.

---

## 4. OUTPUT CONTRACT (what the engine produces)

Everything for a job lands in `jobs/<job-id>/output/`:

```
jobs/<job-id>/output/
├── final.mp4                    1080p H.264 + AAC, the deliverable
├── final_vertical.mp4           optional 9:16 cut, only if requested in config.aspects
├── metadata.json                machine-readable facts about the video (Section 14)
├── scenes.json                  the resolved storyboard with exact timings and props
├── captions.json                normalized word-level captions (Remotion Caption[])
├── captions.srt / captions.vtt  sidecar subtitles (phrase-level, built from words)
├── chapters.txt                 YouTube-ready chapter timestamps (first line 0:00)
├── description_draft.md         description with chapters, sources and disclaimer placeholder
├── sources.md                   every number/claim shown + where it came from
├── qc-report.md                 automated check results, warnings, NEEDS_DATA items
├── render.log                   full render log with timings and versions
├── stills/
│   ├── contact-sheet.png        one tile per scene or beat, timestamped
│   ├── keyframes/               PNGs used during review
│   └── thumbnails/              3 thumbnail candidates, 1280x720 PNG, each under 2 MB
└── draft.mp4                    low-res preview (only in draft mode)
```

A run that fails QC with an **error** must still write `qc-report.md` and exit non-zero. **Warnings** do not block the render.

---

## 5. Architecture and repository layout

Create this structure (adjust names only with a reason, and record it in `docs/ARCHITECTURE.md`):

```
motion-engine/
├── PROMPT.md                         this file
├── CLAUDE.md  (and AGENTS.md)        persistent rules for any agent (Section 15.3)
├── README.md                         how a human runs it
├── package.json                      scripts (Section 15.1)
├── remotion.config.ts
├── .env.example
├── .claude/
│   ├── skills/                       Remotion skills (installed) + project skills (Section 15.2)
│   └── commands/                     optional slash commands (Section 15.2)
├── docs/
│   ├── DESIGN.md                     the design system, the "taste" file (Section 8)
│   ├── COMPONENTS.md                 auto-updated component catalog
│   ├── STORYBOARD_RULES.md           planner rules (Section 9)
│   ├── INPUTS.md  OUTPUTS.md         contracts (Sections 3-4)
│   ├── ARCHITECTURE.md  ASSUMPTIONS.md
├── public/
│   ├── fonts/                        local fonts
│   ├── geo/                          bundled world TopoJSON and similar
│   └── jobs/<job-id>/                (generated) audio + captions copied here for staticFile()
├── src/
│   ├── Root.tsx                      registers compositions
│   ├── design/
│   │   ├── tokens.ts                 colors, type scale, spacing, radii, shadows
│   │   ├── motion.ts                 easings, spring presets, durations, stagger, hold-time rules
│   │   ├── layout.ts                 safe areas, grid, aspect-ratio helpers
│   │   └── fonts.ts                  font loading
│   ├── components/                   the reusable library (Section 10), one folder each
│   │   └── <Name>/{index.tsx, schema.ts, fixtures.json, preview.tsx}
│   ├── backgrounds/                  GridDrift, Grain, Vignette, GlowBlobs
│   ├── captions/                     CaptionBar, pages, highlight
│   ├── scenes/                       scene templates that map JSON to components
│   ├── compositions/
│   │   ├── Main.tsx                  the full video (reads a job via inputProps)
│   │   ├── Vertical.tsx              9:16 variant
│   │   ├── Thumbnail.tsx             still compositions for thumbnails
│   │   └── Gallery.tsx               every component with fixtures, for design review
│   ├── lib/
│   │   ├── schema.ts                 Zod schemas for brief, config, captions, scenes, metadata
│   │   ├── timing.ts                 ms↔frames, anchors, beat helpers
│   │   └── registry.ts               componentName → {component, schema}
├── scripts/                          Node/TS CLI (run with tsx or node --strip-types)
│   ├── new-job.ts  ingest.ts  analyze.ts  plan.ts  validate-plan.ts
│   ├── sfx-plan.ts  render.ts  sheet.ts  qc.ts  package.ts  build.ts
├── fixtures/sample-job/              tiny end-to-end test job (Section 18)
├── jobs/                             real jobs (git-ignored except .gitkeep)
└── out/                              scratch renders (git-ignored)
```

**Design principle:** the video is **data-driven**. `scenes.json` + `captions.json` + tokens fully describe the video. `Main.tsx` is a thin interpreter: it reads the job and renders each scene through the registry. This is what makes the engine standalone and automatable.

---

## 6. Pipeline stages (each is a CLI step and a gate)

```
new-job → ingest → analyze → plan → validate-plan → (HUMAN GATE 1: approve storyboard)
        → build scenes → draft render → review loop → (HUMAN GATE 2: approve draft)
        → final render → qc → package
```

| #   | Stage            | Input                                                       | Output                                                                                          | Fails when                                                                      |
| --- | ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 0   | `new-job <id>`   | none                                                        | folder skeleton + template brief                                                                | id exists                                                                       |
| 1   | `ingest`         | `input/*`                                                   | validated inputs, `captions.json`, `job.json`, files copied to `public/jobs/<id>/`              | missing audio/transcript, invalid brief, transcript far off audio length        |
| 2   | `analyze`        | `captions.json` + brief                                     | `plan/beats.json`: sentences, pauses, numbers, entities, emphasis words, suggested scene breaks | none (warn only)                                                                |
| 3   | `plan`           | beats + brief + `data/` + `requests.md` + component catalog | `scenes.json` (or `storyboard.json` taken as is)                                                | planner output invalid after 3 retries                                          |
| 4   | `validate-plan`  | `scenes.json`                                               | pass/fail + readable fixes                                                                      | gaps, overlaps, unknown components, bad props, text too long, unsourced numbers |
| 5   | build scenes     | `scenes.json`                                               | rendered previews                                                                               | none                                                                            |
| 6   | `render --draft` | job                                                         | `draft.mp4` + stills                                                                            | render error                                                                    |
| 7   | review loop      | stills/contact sheet                                        | fixes in code/plan                                                                              | max 3 passes, then escalate to human                                            |
| 8   | `render --final` | job                                                         | `final.mp4`                                                                                     | render error                                                                    |
| 9   | `qc`             | final.mp4 + job                                             | `qc-report.md`                                                                                  | any ERROR check                                                                 |
| 10  | `package`        | everything                                                  | `metadata.json`, chapters, description, sources                                                 | none                                                                            |

Every stage: **idempotent**, **logs to `output/render.log`**, returns exit code 0/1, and writes a short JSON status so an orchestrator can read it.

---

## 7. Timing and sync (the heart of the system)

**The voiceover is the timeline.** Everything is derived from word timestamps.

- `frame = Math.round(ms / 1000 * fps)`. Put this in `lib/timing.ts` and use it everywhere; never hand-compute frames in components.
- **Composition duration** = audio duration (measured with the `remotion-multimedia` audio duration helper inside `calculateMetadata`) + `tailPaddingMs`. Use `calculateMetadata` so duration, props and `defaultOutName` are derived from the job; the render must not need hardcoded frame counts.
- **Scenes** cover the timeline with **no gaps and no overlaps** (except intentional transition overlaps, accounted for in total duration).
- **Anchors**: a scene can attach actions to specific words: `{ "anchor": "trillion", "occurrence": 1, "action": "countUp.end" }`. Resolve anchors by matching the word (case-insensitive, punctuation stripped) inside the scene's time range; fall back to a fuzzy match; if still missing, warn and use the scene midpoint. An animation that is tied to an anchor should **land on the word, not before it**: start the entrance 6-10 frames early so its peak coincides with the spoken word.
- **Lead and lag:** visuals appear **slightly before** the narration mentions them (about 150-250 ms), never after. Cuts happen on sentence ends or on pauses of 250 ms or more, not mid-phrase.
- **Reading time:** on-screen text must be readable. Minimum hold = 500 ms + 280 ms per word. If the voiceover is faster than that, shorten the text, never the animation quality.
- Use `<Sequence premountFor={...}>` everywhere so heavy components (maps, charts) are ready before they play.
- **Captions** (if burned or both): build pages with `createTikTokStyleCaptions` from `@remotion/captions` (`combineTokensWithinMilliseconds` controls words per page; around 1200 ms is a good start), render each page in its own `<Sequence>`, keep `whiteSpace: "pre"`, and highlight the active word using token `fromMs/toMs`. Put caption logic in its own component/file. Reserve the bottom safe band so captions never collide with scene content.

---

## 8. Design system: write `docs/DESIGN.md` and `src/design/*` FIRST

This is what separates a crafted video from a generic one. Build it **before any scene**, and make every component read from it. Treat the values below as **defaults**; they can be overridden per job with `style.json`.

### 8.1 Palette (dark, premium, one accent)

| Token      | Default                  | Use                          |
| ---------- | ------------------------ | ---------------------------- |
| `bg`       | `#0B0F14`                | main background              |
| `surface`  | `#121923`                | cards, chart panels          |
| `surface2` | `#1A2431`                | raised elements              |
| `text`     | `#F4F6F8`                | primary text                 |
| `muted`    | `#8A97A6`                | secondary text, axes, labels |
| `accent`   | `#F5B83D`                | the ONE highlight (gold)     |
| `accent2`  | `#2EC4B6`                | secondary data series (teal) |
| `positive` | `#3DDC97`                | gains                        |
| `negative` | `#FF5A5F`                | losses                       |
| `grid`     | `rgba(255,255,255,0.06)` | background grid lines        |

Rules: **one accent per scene**; use `negative`/`positive` only for meaning (never decoration); minimum text contrast 4.5:1; never pure `#000` or pure `#FFF`.

### 8.2 Typography

- Two families only: a geometric sans for headings/body (default **Inter**) and a tabular/mono style for numbers (default **JetBrains Mono** or Inter with `font-variant-numeric: tabular-nums`). Load them locally (`public/fonts/`) or via `@remotion/google-fonts`, and **wait for them before rendering**.
- Scale for a 1920 px frame (multiply by `width/1920`): headline 150, big number 260-340, subhead 80, body/label 52, caption 56, source tag 30. **Never below 30 px at 1920.**
- Max **8 words** of on-screen text per scene (labels in charts excluded). One idea per scene.
- Numbers: tabular figures, thousands separators, units next to the number in a smaller weight (`$9.6` big, `trillion / day` small).

### 8.3 Layout

- Safe area: 80 px sides, 100 px top/bottom at 1080 px width, scaled by width. Captions band reserved at the bottom when burned in.
- 12-column grid, 8-point spacing scale. Centered compositions for single big ideas; asymmetric for comparisons.
- One focal point per scene; everything else is quieter (lower opacity, smaller, muted color).
- **Three-layer scenes:** (1) background (`GridDrift` + `Vignette` + faint `GlowBlobs`), (2) midground texture (subtle shapes/lines/halftone, low contrast), (3) foreground content (the thing the narrator is talking about). The background is **shared across scenes** so cuts feel like moving through one world.

### 8.4 Motion rules (with numbers)

- **Entrance:** `Easing.bezier(0.16, 1, 0.3, 1)`, 18-24 frames at 30 fps (0.6-0.8 s) for large elements, 12-16 frames for small ones. Springs for pops: `Easing.spring({damping: 200})` (no bounce) by default; a bouncy spring only for playful emphasis and rarely.
- **Exit:** half the entrance duration, ease-in. Never let things just vanish.
- **Stagger:** 80-90 ms (about 2-3 frames) between items in a group; cap the total stagger at 600 ms.
- **Count-ups:** ease-out, 0.9-1.4 s, land exactly on the spoken word. Tabular numbers so digits don't jitter.
- **Chart drawing:** lines draw over 1.2-2.0 s; bars grow over 0.6-0.8 s with stagger; axes fade in first (0.3 s).
- **Camera:** every scene has slow ambient motion: push-in `scale 1 → 1.04` or a 40 px drift across the scene, plus the background grid drifting. **Nothing is fully static for more than 3 s.**
- **Transitions:** default is a clean 8-12 frame wipe/slide or crossfade through `<TransitionSeries>`; "glitch" and flashy transitions only at dramatic beats (max 1 per 30 s). Prefer **motivated** transitions (an element grows to fill the screen and becomes the next scene).
- **Texture:** very subtle film grain (opacity under 0.06) and vignette on the whole frame for depth; no heavy blur on large areas (slow renders).
- **Emphasis** uses `@remotion/rough-notation` (`Highlight`, `Circle`, `Underline`, `Box`, `Bracket`, `StrikeThrough`) driven by `progress` from `interpolate()`.
- **Banned:** bullet-point slides, centered paragraphs, stock gradients, default fonts, drop shadows on text, random wobble, more than 2 animated things competing for attention, text on busy backgrounds, any element without an entrance/exit.

Put these into `src/design/motion.ts` as named constants (`EASE_OUT_EXPO`, `ENTER_L`, `ENTER_S`, `STAGGER_MS`, `HOLD_MIN_MS`, etc.). Components import constants; they do not invent timings.

### 8.5 `DESIGN.md` must also contain

A written **visual philosophy** (3-5 sentences), a **do/don't list with examples**, the exact token tables, motion rules, and an **"anatomy of a good scene"** (background → midground → one focal element → one annotation → source tag). Every future prompt starts with "read `docs/DESIGN.md`".

---

## 9. The storyboard planner (the "brain")

Goal: turn **captions + brief + data + requests** into a validated `scenes.json`.

### 9.1 Three planning modes (implement all, same output schema)

- **A. Interactive:** I run Claude Code in this folder and say `/plan <job-id>`; you read the inputs, write `scenes.json`, run `validate-plan`, fix errors.
- **B. Headless:** `npm run plan -- <job-id> --headless` builds a prompt from `docs/STORYBOARD_RULES.md` + the component catalog (`docs/COMPONENTS.md`) + beats + brief and calls the agent CLI non-interactively (for Claude Code, something like `claude -p` with structured JSON output; verify flags with `claude --help`). Parse the result, validate with Zod, **retry up to 3 times feeding back the validator's error messages**, then fail with a readable report.
- **C. Provided:** if `storyboard.json` exists, validate and use it.

### 9.2 `scenes.json` schema (Zod, in `lib/schema.ts`)

```json
{
  "jobId": "fx-market-explainer",
  "fps": 30,
  "scenes": [
    {
      "id": "s03",
      "chapter": "The size of the market",
      "startMs": 13000,
      "endMs": 20200,
      "voLine": "It's the arena where money itself is bought and sold...",
      "intent": "Show how huge daily FX trading is",
      "visualMetaphor": "A single number growing, with money arcs between financial hubs",
      "layers": {
        "background": {
          "component": "GridDrift",
          "props": { "intensity": 0.6 }
        },
        "midground": {
          "component": "GlowBlobs",
          "props": { "hue": "accent2" }
        },
        "foreground": [
          {
            "component": "BigNumber",
            "props": {
              "value": 9.6,
              "prefix": "$",
              "suffix": "T",
              "label": "traded every day",
              "decimals": 1
            },
            "anchors": [
              { "word": "trillion", "occurrence": 1, "action": "countUp.end" }
            ]
          },
          {
            "component": "WorldMapArcs",
            "props": { "hubs": ["London", "New York", "Tokyo", "Singapore"] },
            "enterAtMs": 14500
          }
        ]
      },
      "annotation": {
        "type": "highlight",
        "target": "9.6",
        "atWord": "trillion"
      },
      "sourceTag": {
        "text": "BIS Triennial Survey 2025",
        "dataRef": "brief.must_show[0]"
      },
      "transitionOut": { "type": "wipe", "durationFrames": 10 },
      "sfx": [{ "at": "scene.start", "sound": "whoosh", "volume": 0.2 }]
    }
  ]
}
```

(The numbers above are only a schema example; real values always come from the job's brief/data.)

### 9.3 Segmentation rules

- A scene is **one idea**. Break on sentence ends or pauses of 250 ms or more. Target **3-8 s**; hard limits 2 s minimum and 12 s maximum (above 8 s, add a sub-beat: a second element enters or the camera shifts).
- Within a scene, something visibly changes at least every **3-5 s** (new element, annotation, count-up, highlight).
- Total coverage: first scene starts at 0; last scene ends at `audioDuration + tailPadding`.
- **Hook (first 5-8 s):** the most striking visual of the whole video. **Ending:** a recap/payoff card, then a calm tail.

### 9.4 Visual grammar: what the narrator says → what the viewer sees

| The narration is about…                    | Use                                                         | Notes                             |
| ------------------------------------------ | ----------------------------------------------------------- | --------------------------------- |
| A single key number                        | `BigNumber`                                                 | count-up lands on the word        |
| Two or more quantities                     | `BarCompare`, `SizeCompare` (proportional shapes)           | make the size difference visceral |
| A trend over time                          | `LineDraw`, `AreaDraw`                                      | annotate the peak/trough          |
| Parts of a whole / who owns what           | `ShareBar`, `Waffle`/`IconGrid` (100 people, 1 highlighted) | great for "the wealth gap" ideas  |
| Money moving between parties               | `MoneyFlow` (nodes + particles)                             | label flows                       |
| Geography                                  | `WorldMapArcs`, `RegionHighlight`                           | bundled TopoJSON only             |
| A process or cause-and-effect              | `FlowDiagram`, `ConsequenceChain`                           | left-to-right, 3-5 nodes max      |
| A definition / term                        | `TermCard` + rough-notation underline                       | one sentence max                  |
| A historical sequence                      | `Timeline`                                                  | 3-6 events                        |
| A claim with a source                      | `QuoteCard` / `StatCallout` + `SourceTag`                   |                                   |
| A ranking                                  | `RankList` (animated bar race)                              |                                   |
| A before/after or A vs B                   | `SplitCompare`                                              |                                   |
| A formula or relationship                  | `EquationReveal`                                            |                                   |
| A new chapter                              | `ChapterCard`                                               |                                   |
| An invented news headline for illustration | `HeadlineCard` with **generic/fictional** outlet styling    | never real logos                  |

Rules: do **not** put the narration's sentence on screen. Show the idea. Do not use the same foreground component more than **twice in a row**. Alternate density (busy → calm). Alternate layouts (centered, left-heavy, split). Every 4th-6th scene should be a "set piece" with extra craft.

### 9.5 Data and accuracy rules (the planner must enforce)

- Each number on screen must trace to: transcript, `brief.must_show`, or `data/`. The planner writes `sourceTag` and `dataRef`. `validate-plan` fails if a numeric prop has no `dataRef`/transcript match.
- If the transcript says a number and the brief says a different one, **stop and flag it** (`CONFLICT` in `qc-report.md`); do not pick silently.
- Charts use only real rows from `data/` files. No interpolated or fabricated points. If a chart is requested without data, use a number-led alternative and flag `NEEDS_DATA`.
- Keep wording honest: "according to <source>", date the figure, and don't turn flows into stocks (e.g. daily volume is not the size of a market) when writing labels.

### 9.6 `validate-plan` checks

Schema valid; no time gaps/overlaps; durations within limits; every component exists in the registry and its props pass that component's Zod schema; text length limits (8 words per scene, label limits); anchors resolvable; numbers sourced; variety rule; sfx names allowed; transitions durations sum correctly; total equals composition duration. Output human-readable fixes ("scene s07: text has 12 words; shorten to 8").

---

## 10. The reusable component library

Build once, reuse forever. **Every component:**

1. Lives in `src/components/<Name>/` with `index.tsx`, `schema.ts` (Zod props), `fixtures.json` (2-3 realistic prop sets), `preview.tsx` (a composition for Studio).
2. Reads **only** design tokens and motion constants (no hardcoded colors, fonts, timings).
3. Has built-in **enter → hold → exit** driven by props `enterAtFrame`, `exitAtFrame` (relative to its parent sequence) and **anchor-driven moments** via an `anchorFrames` prop map.
4. Is **pure and deterministic** (seeded randomness only).
5. Handles the aspect ratio through `layout.ts` helpers (works in 16:9 and 9:16).
6. Is registered in `registry.ts` and documented in `docs/COMPONENTS.md` (auto-generated from the Zod schemas: name, purpose, props, example).
7. Appears in the **`Gallery`** composition, so I can review the whole library in Studio.

### 10.1 Component list (v1)

| Group       | Components                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Numbers     | `BigNumber` (count-up, prefix/suffix, label), `StatCompare` (A vs B numbers), `Delta` (up/down with arrow), `Counter`                                          |
| Charts      | `BarCompare`, `BarRace`, `LineDraw`, `AreaDraw`, `ShareBar`, `Waffle` / `IconGrid`, `ScatterPlot`, `Gauge`                                                     |
| Proportion  | `SizeCompare` (circles/squares scaled by value), `Pyramid`, `Treemap`                                                                                          |
| Flow        | `MoneyFlow`, `FlowDiagram`, `ConsequenceChain`, `Funnel`                                                                                                       |
| Geo         | `WorldMapArcs`, `RegionHighlight` (bundled TopoJSON; use `remotion-maps` only if I provide a map token)                                                        |
| Text        | `TitleCard`, `ChapterCard`, `TermCard`, `QuoteCard`, `StatCallout`, `HeadlineCard`, `EquationReveal`, `RankList`                                               |
| Time        | `Timeline`, `Clock/Calendar`                                                                                                                                   |
| Structure   | `SplitCompare`, `Annotation` (rough-notation wrapper), `SourceTag`, `LowerThird`                                                                               |
| Backgrounds | `GridDrift`, `Grain`, `Vignette`, `GlowBlobs`, `HalftoneField`                                                                                                 |
| Transitions | `Wipe`, `SlideCover`, `ZoomThrough`, `Glitch` (use sparingly), `LightLeak` overlay (via `@remotion/effects` if installed)                                      |
| Captions    | `CaptionBar` (clean-bottom), `CaptionPop` (center word-by-word), `CaptionLine`                                                                                 |
| Icons       | a small bundled SVG icon set (people, coin, bank, building, factory, globe, house, chart, flame, lock...) drawn or from an open-source set; **no brand logos** |

Build them **in this order**, reviewing each in Studio and stills before moving on: tokens → backgrounds → `BigNumber` → `BarCompare` → `LineDraw` → `SizeCompare` → `IconGrid` → `MoneyFlow` → `WorldMapArcs` → text/structure components → transitions → captions. Use parallel subagents for independent components if your tool supports it, but **you** integrate and review.

### 10.2 Quality bar for each component

Render stills at three moments (entering, hold, exiting) for each fixture and inspect: no overlap, no clipping, text at least 30 px at 1920, correct safe area, correct easing feel, numbers tabular, sane with long labels and with very large or very small values (stress fixtures).

### 10.3 Props style

Props are small, typed, and semantic (`value`, `label`, `series`, `highlightIndex`), not styling. Colors are token names (`"accent"`), never hex, so a job's `style.json` can retheme everything.

### 10.4 Missing component protocol

If the planner needs a visual no component provides:

1. Write the request to `jobs/<id>/plan/component-requests.md` (name, purpose, props, a one-line visual description, which scene needs it).
2. Use the project skill `add-component` to build it to the library standard (schema, fixtures, preview, docs, registry entry).
3. Re-run `plan` or `validate-plan`. The library grows with every video, so the second video is faster than the first.

---

## 11. Audio, sound design and captions

- **Voiceover:** never alter it in the final mix except for loudness normalization. It is the reference timeline.
- **Music (optional):** only a user-supplied file from `input/assets/` or `config.music.file`. Loop/trim with `<Audio>` (`loop`, `trimBefore/After`), fade in 1 s and out 2 s, base volume about 0.08. **Duck** under speech: lower to about 0.03 while words are being spoken, using a `volume` callback built from caption timings with eased 150 ms ramps. No music file → no music; never download music.
- **SFX:** use `@remotion/sfx` `<Audio>` with the **professional subset only**: `whoosh`, `whip`, `switch`, `ding`, `mouse-click`, `page-turn`, `shutter-modern`. The bundled set contains meme sounds (vine-boom, bruh, wilhelm-scream, etc.); **never use those** (they ruin credibility for finance content). SFX at volume 0.15-0.3, placed by the plan (`sfx` entries) on transitions, number landings and chapter cards. Use at most one SFX per 2 s on average. The `sfx-plan` step may auto-suggest SFX from scene transitions and anchors.
- **Loudness:** measure with ffmpeg (`loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json -f null -`). Target about **-14 LUFS integrated** and true peak at or below **-1.5 dBTP**. If the VO is outside ±2 LU, apply a final loudnorm pass on the audio stream only and record both values in `metadata.json`.
- **Captions:** per Section 7. Provide at least two caption styles (`clean-bottom` for long form, `pop-center` for vertical). Sidecar `.srt/.vtt` are always written: build phrase-level cues from words (max 42 characters per line, max 2 lines, 1-6 s per cue).

---

## 12. The review loop and QC (how you avoid "generic" and "broken")

You cannot watch the video, but you can inspect frames. **Never say a scene is done before completing this loop.**

### 12.1 Review loop (after any visual change)

1. Render stills for the affected scenes at: **enter+15 frames, mid-hold, exit−10 frames**, and at every **anchor frame** (`npx remotion still <id> out.png --frame=N`, or several frames in one call with `npx remotion render <id> out/frames --frames=0,30,90 --image-format=png`).
2. Build a **contact sheet** (`npm run sheet`): one tile per beat, labelled with its timestamp and scene id (ffmpeg `tile` filter plus labels, or an image library).
3. **Look at the images** and run the checklist below. Write findings to `output/stills/review-<n>.md`.
4. Fix the code or the plan, re-render only the affected scenes, and look again. **Maximum 3 passes**, then show me the remaining issues.

### 12.2 Visual checklist (answer each: pass/fail + note)

- Is there exactly **one focal point**? Does the eye know where to go in 1 second?
- Any **collision, overlap, clipping** at the frame edge? Is everything inside the safe area?
- Is all text **at least the minimum size** (30 px at 1920) and **readable at phone size** (view the still scaled to about 400 px wide)?
- Contrast OK? Is any text on a busy area?
- Does the animation **land on the anchor word**? (compare anchor frame to the word timestamp)
- Is there **ambient motion** so nothing sits static for more than 3 s?
- Does it look like **the same world** as the previous scene (background, palette, type, spacing)?
- Numbers correct, sourced, formatted (tabular, separators, units)?
- Captions not colliding with content?
- Is it **better than a default template**? If the honest answer is "it looks like a generic slide", redo it with a stronger visual metaphor.

### 12.3 Automated QC (`npm run qc`), writes `qc-report.md`

**ERROR (blocks):** output file missing/zero bytes; wrong resolution or fps; video duration differs from audio + tail by more than 0.5 s; no audio stream; black frames longer than 0.5 s outside intentional fades (`blackdetect`); scene coverage gaps/overlaps; unresolved `NEEDS_DATA` on a number-bearing scene when `failOnWarnings` is true.
**WARN:** audio loudness outside -14 ±2 LUFS or true peak above -1 dBTP; frozen video for more than 3 s (`freezedetect`; ambient motion should prevent it); transcript gaps over 1.5 s; approximate word timing (SRT input); text-fit warnings; anchors not found; same component more than twice in a row; scene longer than 12 s; file size over a configurable limit.
**INFO:** render time, per-scene complexity (slowest scenes), fonts used, Remotion/Node/ffmpeg versions.
Add a best-effort **layout audit**: components that render text expose bounding boxes via `measureText`/`fitText` from `@remotion/layout-utils`; flag overflow or sub-minimum font sizes.

---

## 13. Rendering

- **Props:** the composition reads a job via `inputProps` (`--props=<job>.json`) and `calculateMetadata`. Never hardcode a job in `Root.tsx`.
- **Profiles:** `draft` (scale 0.5, high CRF, concurrency tuned, for quick review) and `final` (1080p, H.264, CRF about 16, AAC audio). Verify the exact flag names with `/remotion-docs` and `npx remotion render --help` (`--codec`, `--crf`, `--scale`, `--concurrency`, `--props`, `--frames`, `--image-format`).
- **WebGL effects** (only if `@remotion/effects` is used): enable the ANGLE renderer in `remotion.config.ts` via `Config.setChromiumOpenGlRenderer('angle')`.
- **Speed tricks:** premount sequences; avoid huge blur/filter areas and giant SVG filter chains; keep DOM node counts moderate (use canvas for particle-heavy scenes); memoize heavy computations (`useMemo`) like path generation and geo projections; precompute chart geometry outside the frame loop; keep images small; render stills for review instead of full videos while iterating; open `npx remotion studio --no-open` once per session and reuse it; run scene-level previews through the connected compositions.
- **Deterministic builds:** pin versions, lock file committed, record versions in `metadata.json`.
- **Vertical (9:16) variant:** do not just crop. Use the same scenes with the vertical layout helpers and the `pop-center` caption style. Only produce it when `config.aspects` includes `9:16`.
- **Licensing check:** Remotion is free for individuals and for-profit organizations of up to 3 people (including automation); larger teams need a company license. Put this reminder in `README.md` and ask me once in Phase 0 how many people use the project.

---

## 14. Metadata and packaging (`npm run package`)

`metadata.json` is the single source of truth about the finished video. Validate it with Zod. Example shape:

```json
{
  "schemaVersion": 1,
  "jobId": "fx-market-explainer",
  "title": "…",
  "topic": "…",
  "language": "en",
  "createdAt": "ISO-8601",
  "inputsHash": "sha256 of audio + transcript + brief + data + config",
  "video": {
    "file": "final.mp4",
    "durationSec": 0,
    "fps": 30,
    "width": 1920,
    "height": 1080,
    "codec": "h264",
    "sizeBytes": 0
  },
  "audio": {
    "integratedLUFS": -14.0,
    "truePeakDBTP": -1.6,
    "hasMusic": false,
    "sfxCount": 0
  },
  "captions": {
    "mode": "sidecar",
    "files": ["captions.srt", "captions.vtt", "captions.json"],
    "wordCount": 0
  },
  "chapters": [{ "time": "0:00", "title": "…" }],
  "scenes": [
    {
      "id": "s01",
      "startMs": 0,
      "endMs": 0,
      "components": ["BigNumber"],
      "chapter": "…"
    }
  ],
  "numbersShown": [
    { "scene": "s03", "value": "…", "source": "…", "dataRef": "…" }
  ],
  "assets": [
    {
      "file": "…",
      "origin": "user-supplied | generated-in-code",
      "license": "…"
    }
  ],
  "fonts": ["Inter", "JetBrains Mono"],
  "thumbnails": ["stills/thumbnails/thumb-a.png"],
  "qc": { "errors": 0, "warnings": 0, "needsData": [] },
  "render": {
    "seconds": 0,
    "profile": "final",
    "remotion": "x.y.z",
    "node": "x",
    "ffmpeg": "x"
  },
  "suggestedMetadata": {
    "titleOptions": ["…", "…", "…"],
    "descriptionFile": "description_draft.md",
    "tags": ["…"]
  }
}
```

- `chapters.txt`: first line must be `0:00`, at least 3 chapters, each at least 10 s, built from scene `chapter` fields.
- `description_draft.md`: a hook line (first two lines matter), chapters, a **Sources** list built from `sources.md`, and the disclaimer line **"For educational purposes only. Not financial advice."**
- `suggestedMetadata.titleOptions`: 3 curiosity-driven, honest titles under 60 characters; **no promise the video does not deliver**. Tags are optional and minor.
- **Thumbnails:** a `Thumbnail` composition with 3 variants (big number, big comparison, big question), built from the same tokens, at 1280x720, PNG, under 2 MB, with at most 3 elements and 1-4 words of text, readable at about 120 px wide.

---

## 15. CLI, shortcuts and Claude Code workflow

### 15.1 `package.json` scripts (all take `<job-id>`)

```
job:new     create a job skeleton + brief template
ingest      validate + normalize inputs
analyze     sentence/pause/number/emphasis beats
plan        generate scenes.json  (--headless for non-interactive)
check       validate-plan
studio      Remotion Studio, optionally loaded with the job
gallery     Studio with the Gallery composition (all components + fixtures)
still       render one still:  still <id> <sceneId|ms>
sheet       contact sheet
draft       fast low-res render
render      final render
qc          automated checks
package     metadata, chapters, description, sources, thumbnails
build       everything:  build <id> [--draft] [--headless] [--yes] [--from <stage>]
test        run the fixture end to end
```

`build` runs stages in order, stops at human gates unless `--yes`, and supports `--from <stage>` to resume.

### 15.2 Project skills and slash commands (create in `.claude/`)

Project skills are folders with a `SKILL.md` (front-matter `name` and `description`) that load only when relevant. Create:

- **`storyboard-from-transcript`**: how to turn beats + brief into `scenes.json` (Sections 9.1-9.6, short form).
- **`finance-visual-grammar`**: the table in 9.4 plus finance-specific rules (flows vs stocks, units, dates, sources, no advice).
- **`add-component`**: the exact procedure and checklist of Section 10 for adding a new component.
- **`scene-review`**: the review loop and checklist of Section 12.
- **`motion-polish`**: the numeric motion rules in 8.4 and a "make it feel expensive" checklist (layering, ambient motion, anticipation/overshoot, stagger, texture, sound).

Optional slash commands (files in `.claude/commands/`, if your version supports them): `/new-job`, `/plan`, `/review`, `/polish`, `/add-component`, `/build`. Each is a 5-10 line prompt that calls the matching skill and script.

### 15.3 `CLAUDE.md` / `AGENTS.md` (keep under about 120 lines)

Must contain: project purpose in 3 lines; the golden rules (no invented numbers, no CSS transitions, deterministic, tokens only, preserve user edits); where things live; the commands in 15.1; "load the Remotion skills before coding"; "always run the review loop"; "ask before installing paid or networked services"; and the report format from Section 1.

### 15.4 Working tips for Claude Code

- Use **plan mode** (or "plan first") for Phases 0-4, then switch to execution.
- Match **effort to the stage** (the `/effort` setting on recent models): low for storyboards and brainstorming, medium for building components, **high for the review loop, retiming and final polish**; reserve the highest levels for autonomous end-to-end runs.
- Run `/clear` (or start a fresh session) between phases; the repo and `docs/` hold the memory, not the chat. Use `/compact` if a long session slows down.
- Keep the Studio server running in the background and open compositions by id (`/<composition-id>`), including scene-level previews.
- **Iterate on the render, not the code.** Feedback must be specific ("title is too small, raise to 150 px; delay the second bar by 0.2 s"), never "make it better". Paste a screenshot of a frame whose style you like and say what to match.
- Commit before big refactors so a bad run is one `git reset` away.

### 15.5 Automation later (n8n or any orchestrator)

The engine must be callable as `npm run build -- <job-id> --headless --yes` and return exit code 0 on success. It writes `jobs/<id>/status.json` (`stage`, `state`, `error`, `startedAt`, `finishedAt`) after every stage. An orchestrator only needs to: drop files into `jobs/<id>/input/`, run the command, then read `output/metadata.json` and `output/final.mp4`.

- If the orchestrator runs in Docker, the container needs Node, ffmpeg, Chromium dependencies and the project mounted; Claude Code on the host is **not** visible inside the container by default (use SSH or install the CLI in the image, and check Anthropic's current terms for automated use).
- Add a `Dockerfile` and `docker-compose.yml` only in the last phase; consult `/remotion-docs` for the Docker setup.
- Never run two renders of the same job at once (lock file in the job folder).

---

## 16. Tricks, tips and guard-rails

1. **Voiceover first, always.** Never retime audio to fit visuals; retime visuals to the audio.
2. **Anchor, don't guess.** Link every important animation to a word, not to a hand-typed second.
3. **Lead the voice slightly** (150-250 ms); a visual that arrives late feels broken.
4. **Metaphor beats text.** If a scene is just words, redesign it.
5. **Build the Gallery early.** A page showing every component at once is the fastest way to spot inconsistency.
6. **Stress-test components** with long labels, huge numbers (`1,234,567,890`), tiny values, negative values and 0.
7. **Constrain choices.** Fewer, better components with strict tokens look more premium than many loose ones.
8. **Layer for depth.** Background + midground + foreground, and a slow camera push on every scene.
9. **Consistent exits.** Elements leave the way they came, at half the time.
10. **Beat sound on motion.** One soft whoosh per transition, a tick on counters, silence for emphasis; never wall-to-wall effects.
11. **Cap complexity per scene.** Max 3 animated groups; if a scene needs more, split it.
12. **Keep numbers honest.** Add a `SourceTag` on every data scene; it also makes the video look more credible.
13. **Colour means something.** Accent = focus, red/green = change, teal = comparison. Don't recolor decoratively.
14. **Use `calculateMetadata`** so any audio length just works.
15. **Premount** every sequence and **memoize** geometry; most slow renders come from recomputing paths every frame.
16. **Bundle everything.** Fonts, TopoJSON, icons live in `public/`; no CDN at render time.
17. **Seeded randomness** only (`random("seed")`), so re-renders are identical.
18. **Test with the fixture** after any change to timing, captions or the registry.
19. **Log versions** (Remotion, Node, ffmpeg) in every render; most "it broke" cases are version drift.
20. **Rendering is cheap, tokens are not.** Render stills for iteration; render the full video only at the draft and final stages.

### Common failure modes

| Symptom                            | Likely cause                                               | Fix                                                       |
| ---------------------------------- | ---------------------------------------------------------- | --------------------------------------------------------- |
| Animation doesn't play in render   | CSS `transition`/`animation` or Tailwind animation class   | rewrite with `useCurrentFrame` + `interpolate`            |
| Wrong font in render               | font not loaded before first frame                         | load fonts via the skill's method and wait for them       |
| Words appear glued together        | missing leading space in caption `text`                    | enforce leading-space rule in `normalizeTranscript`       |
| Visuals drift from voice           | frame math done manually or `fps` mismatch                 | use `lib/timing.ts`; check `fps` in config vs composition |
| Total duration off by a few frames | `<TransitionSeries>` overlap not subtracted                | subtract transition durations in `calculateMetadata`      |
| Pop-in on first frame of a scene   | sequence not premounted                                    | add `premountFor`                                         |
| Map/chart blank in render          | async data not awaited                                     | bundle data; use the delay-render API                     |
| Slow render                        | big blur, thousands of DOM nodes, per-frame path recompute | canvas, `useMemo`, smaller effects                        |
| Different output each run          | `Math.random`, `Date.now` or network data                  | seeded random; bundle data                                |
| Text clipped at edges              | ignored safe area or long labels                           | `fitText`/`measureText`, safe-area helper                 |

---

## 17. Phased execution plan (stop at every gate)

**Phase 0: Environment and scaffold.** Check tools, scaffold Remotion, install and verify skills, `git init`, create the folder structure and empty docs. Ask my up-to-5 questions (how many people use it; language(s) of the videos; default aspect ratio(s); whether I have a music library; whether I want to wire any optional connector now). _Gate: show me the tool check, skill list, folder tree and assumptions._

**Phase 1: Contracts.** Zod schemas, `new-job`, `ingest`, `normalizeTranscript` (all formats), audio probing, `analyze`, `docs/INPUTS.md` and `OUTPUTS.md`, the sample fixture job. _Gate: `npm run ingest` and `analyze` pass on the fixture; show me the normalized captions and beats._

**Phase 2: Design system.** `DESIGN.md`, `tokens.ts`, `motion.ts`, `layout.ts`, fonts, backgrounds, the `Gallery`. _Gate: one still of the Gallery with backgrounds and type scale so I can approve the look before components multiply._

**Phase 3: Component library.** Build in the order of 10.1, each with schema, fixtures, preview, stress tests and review loop. Auto-generate `COMPONENTS.md`. _Gate: Gallery contact sheet; I approve or request changes._

**Phase 4: Planner and validator.** `plan` (all three modes), `validate-plan`, `STORYBOARD_RULES.md`, project skills. _Gate: scenes.json for the fixture, validated; I approve the storyboard._

**Phase 5: Scene engine and Main composition.** Registry-driven `Main`, anchors, transitions, `calculateMetadata`, scene-level connected compositions. _Gate: Studio link and stills of 6 scenes._

**Phase 6: Audio and captions.** Captions pages/styles, sidecar files, music ducking, SFX plan, loudness measurement. _Gate: listen-check by me on the fixture draft._

**Phase 7: Render, QC, package.** Draft/final profiles, contact sheet, `qc`, `package`, thumbnails, `status.json`. _Gate: full fixture output folder matching Section 4._

**Phase 8: End-to-end.** `npm run build -- fixture-sample --draft` then final. Then a **real job** from me. _Gate: I review the real video; we log issues and fix._

**Phase 9: Hardening and handoff.** README, Docker (optional), headless mode test, `CLAUDE.md`, final cleanup, a list of known limits and a backlog of nice-to-haves.

---

## 18. Definition of done and the test fixture

**Fixture (`fixtures/sample-job/`):** a 30-second job: placeholder audio generated with ffmpeg (a tone or silence of exactly 30 s, e.g. `ffmpeg -f lavfi -i "sine=frequency=220:duration=30" audio.mp3`), a **hand-authored word-level transcript** whose timings fill those 30 s (about 70-80 words), a brief using clearly **fictional** numbers marked as such, and one small `data/*.csv`. It must exercise at least: `BigNumber`, `BarCompare`, `LineDraw`, `SizeCompare`, `MoneyFlow`, `TitleCard`, `SourceTag`, captions, one transition and one SFX.

**Done means:**

- [ ] `npm run test` produces the full output folder (Section 4) from the fixture with exit code 0.
- [ ] Re-running gives an identical `scenes.json` hash and visually identical frames (determinism).
- [ ] `validate-plan` rejects a deliberately broken plan with readable errors.
- [ ] QC catches a deliberately corrupted input (e.g., transcript 5 s longer than audio).
- [ ] Gallery shows every component, stress fixtures render cleanly, and no component uses hardcoded colors or timings.
- [ ] Contact sheet reviewed; every checklist item in 12.2 passes or is listed as a known issue.
- [ ] A real job from me renders end to end with no manual code edits.
- [ ] `README.md` explains setup, the input contract, the output contract and the 6 most useful commands.
- [ ] `CLAUDE.md`, `docs/*`, and project skills exist and are consistent with the code.

---

## Appendix A: Transcript shapes to support

```jsonc
// Whisper-like
{ "words": [ { "word": " There", "start": 0.12, "end": 0.38 }, ... ] }
// or segments with words
{ "segments": [ { "words": [ { "word": "There", "start": 0.12, "end": 0.38 } ] } ] }

// Plain (documented default)
{ "words": [ { "text": "There", "start": 0.12, "end": 0.38 } ] }

// ElevenLabs-style character alignment
{ "characters": ["T","h","e","r","e"," "], "character_start_times_seconds": [..], "character_end_times_seconds": [..] }
```

Times are seconds unless a field name ends with `Ms`. Auto-detect, convert to `Caption[]`, and write `plan/ingest-report.md` stating which format was detected and every fix applied.

## Appendix B: `brief.md` template

```markdown
---
title: "Working title of the video"
topic: "One-line topic"
language: en
audience: "who this is for"
tone: "calm, authoritative, a little dramatic"
aspect: "16:9" # or 9:16
accent: "#F5B83D" # optional override
must_show: # numbers/claims that MUST appear, each with a source
  - { value: "…", label: "…", source: "…", year: 2025 }
avoid: # things never to show or imply
  - "real company logos"
  - "investment advice or predictions"
chapters: # optional hints (the planner may refine them)
  - "The hook"
  - "How it works"
  - "Why it matters"
outputs: [video, captions, chapters, thumbnails, metadata]
---

## What this video explains

Plain-language description of the story and the logic of the argument.

## What the visuals should emphasise

Any specific comparisons, charts, maps or metaphors I want, and what to keep simple.

## Extra requests

Anything else (for example "show A vs B as proportional circles", "use data/gdp.csv for the line chart").
```

## Appendix C: Prompts to reuse while building

**Build one component:**

> Read `docs/DESIGN.md` and the `remotion-markup` skill. Build `<ComponentName>` in `src/components/<ComponentName>/` with schema, 3 fixtures, preview and registry entry. Tokens only. Then render stills of every fixture (enter, hold, exit) and a stress fixture (long labels, huge/small/negative values), inspect them, fix problems, and show me the contact sheet.

**Build one scene from the plan:**

> Read `docs/DESIGN.md`. Scene `<id>` in `scenes.json`, VO "<line>", key words land at <timestamps from captions.json>. Compose it only from library components, three layers, one focal point. Anchor <word> to <action>. Render stills at enter+15, mid, exit−10 and each anchor frame, review with the checklist in 12.2, fix, and report.

**Polish pass:**

> Run `motion-polish` on the whole video. Find scenes that look like a default template, scenes with static stretches over 3 s, inconsistent easing, and text under 30 px (at 1920). List fixes, apply them, re-render the contact sheet, and compare before and after.

**Fix feedback (specific):**

> In scene s05 the title is too small (raise to 150 px), the second bar should start 0.2 s after the first, and the counter should land exactly on the word "trillion". Change only that, then re-render the stills for s05.

**Plan a job:**

> `/plan <job-id>`: read the brief and `captions.json`, write `scenes.json` following `STORYBOARD_RULES.md`, run `check`, fix every error, list any `component-requests.md` entries, and summarise the storyboard as a 10-line table for my approval.

## Appendix D: Things to read and borrow ideas from (do not copy code blindly)

- Remotion's official agent skills and docs (`remotion-dev/skills`, Remotion docs for captions, transitions, `calculateMetadata`, rendering).
- Open-source Claude Code motion toolkits on GitHub (search `claude-motion`, "Remotion motion design skill", "Vox-style explainer skill") for motion rules with numbers, frame-based review loops and timeline-driven sound design.
- Check every licence before reusing code, fonts, icons or sounds.

---

**Begin now: read this whole file, then execute Phase 0 and stop at its gate.**

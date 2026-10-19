# 🎬 The Wealth Gap — YouTube Video Production Studio

A modular, code-driven video automation harness and workflow structure separating **generic pipeline automation engine** (`workflow/`) from **video production workspaces** (`workspace/`).

---

## 🏗️ Studio Architecture: Workflow vs. Workspace

```
WealthGap/
├── package.json               # Root Bun runner scripts for all pipeline steps
├── tsconfig.json              # Studio TypeScript configuration
├── .env                       # API keys & active video selection
├── brand-assets/              # Global channel logos, banners, watermarks
│
│  ═════════════════════════════════════════════════════════════════════
│  WORKFLOW (Generic Engine, Prompts & Harness — NO video assets)
│  ═════════════════════════════════════════════════════════════════════
├── workflow/
│   ├── prompts/               # 🎯 Master AI Prompts & Style Guides
│   │   ├── DIRECTOR_PROMPT.md # Prompt for Claude/GPT to generate scenes.json
│   │   └── VISUAL_GUIDELINES.md # Pacing, 3-layer architecture & palette rules
│   ├── 01-ideation/           # Research workflow & angle prompts
│   ├── 02-scripting/          # Script retention formulas & writer prompts
│   ├── 03-voiceover/          # Sarvam Bulbul v4 Flash TTS, cost & prosody engine
│   ├── 04-transcription/      # Word-level Whisper timestamps for motion sync
│   ├── 05-video/              # Remotion 2D + Three.js 3D Motion Graphics Engine
│   │   ├── src/components/    # BigNumber, BarCompare, LineDraw, Globe3D...
│   │   ├── src/backgrounds/   # UnifiedBackground (Grid, GlowBlobs, Vignette)
│   │   ├── scripts/           # ingest, plan, chunk, render, qc, package
│   │   └── fixtures/          # Generic test jobs (sample-job)
│   ├── 06-audio/              # Sound design, SFX cues, dynamic music ducking
│   └── 07-assembly/           # Master stitching, LUFS mastering, QC review
├── scripts/                   # Studio scaffolding (new-video)
│
│  ═════════════════════════════════════════════════════════════════════
│  WORKSPACE (Per-Video Assets, Scripts, Audio & Generated Media)
│  ═════════════════════════════════════════════════════════════════════
└── workspace/
    └── VID01_Currency_Market/ # Individual Video Workspace
        ├── 01-ideation/       # Video/audio references & concept notes
        ├── 02-scripting/      # Production script (script_raw.md)
        ├── 03-voiceover/      # Ported TTS prompts & generated WAV clips
        ├── 04-transcription/  # Word-level timestamps & full_transcript.json
        ├── 05-video/          # Storyboard (scenes.json) & renders
        │   ├── chunks/        # Rendered scene chunks (s01.mp4, s02.mp4, ...)
        │   ├── final.mp4      # Master 1080p broadcast render
        │   └── stills/        # High-res YouTube thumbnails (A/B/C)
        ├── 06-audio/          # Video-specific SFX & music tracks
        └── 07-assembly/       # Final exports & review signoff
```

---

## ⚡ Master Control from Root (Using `bun`)

All commands run directly from repo root — you never need to `cd` into subdirectories:

### 1. Step 1: Ideation & Workspace Scaffolding
```bash
# Option A: Standard new video workspace:
bun run new-video VID02_Stock_Market_Bubble

# Option B: New video with YouTube inspiration URL:
# (Automatically extracts audio, thumbnail, metadata & populates notes.md)
bun run new-video VID02_Stock_Market_Bubble "https://www.youtube.com/watch?v=..."
```

### 2. Step 2: Transcribing Reference & Remaking Original Script
```bash
# 2A. Transcribe reference audio using local faster-whisper (DEFAULT, 100% offline)
bun run script:transcribe VID02_Stock_Market_Bubble

# Optional: Run on Hugging Face ZeroGPU Space (@gradio/client)
bun run script:transcribe VID02_Stock_Market_Bubble --cloud

# 2B. Remake into original, retention-optimized Wealth Gap script (FORCED 8–10 Min, ~1,300–1,600 words)
# Option 1: AI generation via local Ollama Gemma 3 (12b):
bun run script:remake VID02_Stock_Market_Bubble

# Option 2: Scaffold structured manual template:
bun run script:remake VID02_Stock_Market_Bubble --manual
```

### 3. Step 3: Format Voiceover Sections & Prosody
```bash
# Convert script_raw.md into structured VO sections with calibrated F5-TTS speeds & Sarvam tags:
bun run tts:format VID02_Stock_Market_Bubble
```

### 4. Step 4: Voiceover Audio Generation (TTS & Voice Cloning)
```bash
# 4A. One-Time Setup: Initialize persistent cloned voice profile from reference audio
bun run voice:setup

# Remake or update cloned voice after changing voice_to_clone.wav & prompt.txt:
bun run voice:remake

# 4B. Check character count and cost estimate (₹0.00 Local F5-TTS, ₹1/1k chars Cloud)
bun run tts:cost --video VID01_Currency_Market

# 4C. Dry-run voice settings & speeds without generating audio
bun run tts:dry-run --video VID01_Currency_Market

# 4D. Generate audio with Local Cloned Voice (DEFAULT, 100% Offline, ₹0.00):
bun run tts --video VID01_Currency_Market
# Or generate part 1 only:
bun run tts --video VID01_Currency_Market --part 1

# 4E. Fallback: Generate via Sarvam Bulbul v4 Flash Cloud API:
bun run tts:cloud --video VID01_Currency_Market
# Or with flag:
bun run tts --cloud --video VID01_Currency_Market
```

### 5. Step 5: Word-Level Transcription (For Video Alignment & LLMs)
```bash
# Extract millisecond-accurate word timestamps with local faster-whisper:
bun run transcribe
# Or for a specific part:
bun run transcribe --part 1

# Generates 4 tailored formats:
# 1. full_transcript_compact.txt (🎯 95% token savings - perfect for pasting into LLMs)
# 2. full_transcript.csv         (Tabular clip,start,end,word timestamps)
# 3. clips_summary.csv          (High-level scene timing & cumulative timeline)
# 4. full_transcript.json       (Cleaned Remotion-ready JSON without duplicate segments)
```

### 6. Step 6: Video Storyboarding & Planning
1. Open [`workflow/prompts/DIRECTOR_PROMPT.md`](file:///Users/prakharsingh/youtube/WealthGap/workflow/prompts/DIRECTOR_PROMPT.md).
2. Paste the prompt along with `workspace/<VIDEO>/04-transcription/full_transcript_compact.txt` (or `.csv`) into Claude / GPT-4o / Gemini.
3. Save the resulting JSON directly into `workspace/<VIDEO>/05-video/scenes.json` (or `storyboard.json` in kit workflow).
4. Validate the storyboard against the component registry and design rules:
```bash
bun run video:check VID01_Currency_Market
# Or for kit storyboard:
bun run storyboard:check --video VID02_Stock_Market
```

---

## 🎨 New: Kit Video Production Workflow (`@wealthgap/kit`)

The studio includes a code-authoring video motion engine where visual scenes are authored in TypeScript/TSX using `@wealthgap/kit` primitives, deterministic camera choreography (`Camera`), and the 3-layer motion graphics grammar.

### The Two Human Review Gates

The pipeline is split into autonomous computation steps and two mandatory human creative review gates:

```
VO & Transcript ──> [timeline] ──> [storyboard] ──> 🛑 GATE 1: Storyboard Review
                                                            │ (Approve storyboard.json)
                                                            ▼
[render] <── 🛑 GATE 2: Draft Review <── [author] <── [assemble]
   │             │ (Inspect contact sheets & draft.mp4)
   ▼             ▼
[qc] ──> [package]
```

1. **Gate 1: Storyboard Sign-off**:
   - Review scene breakdown, duration pacing, visual density, and word anchor bindings before any TSX code is written.
   - Verified via `bun run storyboard:check`.
2. **Gate 2: Draft & Contact Sheet Sign-off**:
   - Each scene produces 3–4 high-resolution review stills (`review/<scene>/stills/`) and an annotated contact sheet (`review/<scene>/contact-sheet.png`).
   - Run `bun run draft` to verify motion flow, typography hierarchy, and color palettes before final broadcast rendering.

---

### Step-by-Step Production Guide (Gemini-Manual Mode)

In manual mode (default), you use your preferred AI chat model (Claude 3.7 Sonnet, Gemini 2.5 Pro, GPT-4o) with zero API keys required:

#### 1. Build Frame Timeline & Storyboard Prompt
```bash
bun run timeline --video VID02_Stock_Market
bun run storyboard --video VID02_Stock_Market
```
- Outputs `storyboard-prompt.txt` containing full transcript timestamps, kit component catalog, and pacing constraints.

#### 2. Generate and Verify Storyboard (Gate 1)
- Paste `storyboard-prompt.txt` into Gemini/Claude.
- Save the returned JSON to `workspace/VID02_Stock_Market/05-video/storyboard.json`.
- Validate against timeline constraints:
```bash
bun run storyboard:check --video VID02_Stock_Market
```

#### 3. Assemble Workspace Project
```bash
bun run assemble --video VID02_Stock_Market
```
- Scaffolds `src/scenes/` TSX skeletons and generates `src/Root.tsx`, `src/Main.tsx`, and `src/index.ts`.

#### 4. Author Scenes with LLM Assistance
```bash
bun run author --video VID02_Stock_Market
```
- Generates scene prompts in `review/<scene>/prompt.txt`.
- Copy each prompt to your LLM, and save the generated TSX to `src/scenes/<scene>.tsx`.
- The tool automatically runs `lint:scene` static analysis, renders review stills, and stitches `contact-sheet.png`.

#### 5. Review Draft Video (Gate 2)
```bash
bun run draft --video VID02_Stock_Market
```
- Renders `draft.mp4` at half-resolution in ~10–12 seconds.
- Inspect contact sheets at `workspace/VID02_Stock_Market/05-video/review/*/contact-sheet.png`.

#### 6. Broadcast Master Render, QC & Packaging
```bash
bun run render --video VID02_Stock_Market
bun run qc --video VID02_Stock_Market
bun run package --video VID02_Stock_Market
```
- Generates 1080p broadcast `final.mp4`, automated quality control report (`review/qc-report.md`), sidecar SRT/VTT subtitles, YouTube chapters, and thumbnails.

---

### End-to-End Orchestrated Runner (`bun run build`)

You can run the full pipeline in one command. It executes each stage automatically and pauses at Gate 1 and Gate 2:
```bash
bun run build --video VID02_Stock_Market
```

---

### Single-Scene Iterations & Re-renders

To tweak a single scene without touching the rest of your video:
```bash
# 1. Re-author or re-lint a specific scene:
bun run author --video VID02_Stock_Market --scenes s02

# 2. Check scene linter:
bun run lint:scene --video VID02_Stock_Market --scene s02

# 3. Preview live in Remotion Studio:
bun run studio

# 4. Re-render draft or final video:
bun run draft --video VID02_Stock_Market
```

---

### Harvesting Reusable Components (`bun run harvest`)

When you create an outstanding visual element in a scene (e.g. an animated custom 3D coin stack, currency meter, or flow node), promote it to the shared kit:
```bash
bun run harvest --video VID02_Stock_Market --scene s01 --name GiantShadow --category illustration
```
- Moves the extracted component into `packages/kit/src/components/GiantShadow.tsx`.
- Exports it in `packages/kit/src/index.ts`.
- Updates `packages/kit/component-catalog.json` so future storyboard prompts know it exists.
- Adds an entry to `workflow/05-video/src/Gallery.tsx`.

---

### Render Performance & Timings

Benchmarks measured on Apple Silicon:

| Output Profile | Resolution | Framerate | Encoding | Typical Render Speed | 1-Minute Video Est. |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Draft** (`bun run draft`) | 960x540 (0.5x) | 30 fps | H.264 CRF 26 | **~10–12s** per 12s scene (~1.0x real-time) | **~50–60s** |
| **Broadcast Final** (`bun run render`) | 1920x1080 | 30 / 60 fps | H.264 CRF 16 | **~10–14s** per 12s scene (~1.0x real-time) | **~60–75s** |

---

## 🌐 3D Motion Graphics with Three.js

The engine features native 3D WebGL support via `@remotion/three` and `@react-three/fiber`:
- **Component**: `Globe3D` (`workflow/05-video/src/components/Globe3D`)
- **Capabilities**: Interactive 3D rotating wireframe globe, capital flow arcs between global financial hubs (NY, London, Tokyo, Singapore), customizable rotation speeds, lighting, and HTML narrative overlays.
- **Preview & Test**:
```bash
cd workflow/05-video && bun x remotion still Globe3D out/Globe3D.png --gl=angle
```

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
# 2A. Transcribe reference audio using Hugging Face Space (openai/whisper via @gradio/client)
# (Auto-falls back to local faster-whisper if HF ZeroGPU queue is full)
bun run script:transcribe VID02_Stock_Market_Bubble
# Or force fast local execution:
bun run script:transcribe VID02_Stock_Market_Bubble --local

# 2B. Remake into original, retention-optimized Wealth Gap script (anti-plagiarism)
# Option 1: AI generation via local Ollama Gemma 3 (12b):
bun run script:remake VID02_Stock_Market_Bubble

# Option 2: Scaffold structured manual template:
bun run script:remake VID02_Stock_Market_Bubble --manual
```

### 3. Step 3: Format Voiceover Sections & Prosody
```bash
# Convert script_raw.md into structured VO sections with calibrated Sarvam prosody tags:
bun run tts:format VID02_Stock_Market_Bubble
```

### 4. Step 4: Voiceover Audio Generation (TTS)
```bash
# Check character count and estimated API cost (₹1 per 1,000 chars)
bun run tts:cost

# Dry-run voice settings & prosody multipliers without calling API
bun run tts:dry-run

# Generate audio for active video in .env
bun run tts
```

### 5. Step 5: Word-Level Transcription (For Video Alignment)
```bash
# Extract millisecond-accurate word timestamps with Whisper
bun run transcribe
```

### 6. Step 6: Video Storyboarding & Planning
1. Open [`workflow/prompts/DIRECTOR_PROMPT.md`](file:///Users/prakharsingh/youtube/WealthGap/workflow/prompts/DIRECTOR_PROMPT.md).
2. Paste the prompt along with your `workspace/<VIDEO>/04-transcription/full_transcript.json` into Claude / GPT-4o / Gemini.
3. Save the resulting JSON directly into `workspace/<VIDEO>/05-video/scenes.json`.
4. Validate the storyboard against the component registry and design rules:
```bash
bun run video:check VID01_Currency_Market
```

### 7. Step 7: Video Rendering (Chunks vs. Full Video)

#### A. Interactive Live Studio Preview
```bash
# Launch Remotion Studio on http://localhost:3000
bun run video:studio
```

#### B. Scene-by-Scene Chunk Rendering (Single or All)
```bash
# List all scenes with durations for this video
bun run video:chunk VID01_Currency_Market

# Render ONE specific scene to test or edit:
bun run video:chunk VID01_Currency_Market s01
# -> Output saved to workspace/VID01_Currency_Market/05-video/chunks/s01.mp4

# Render ALL scenes sequentially one-by-one into chunks/:
bun run video:chunk VID01_Currency_Market --all
```

#### C. Full Video Rendering
```bash
# Fast draft render (half-resolution, fast CRF)
bun run video:draft VID01_Currency_Market

# Broadcast-grade 1080p 30fps master render
bun run video:render VID01_Currency_Market
```

#### D. Quality Control & Deliverable Packaging
```bash
# Run automated QC checks (layer budget, audio sync, color tokens)
bun run video:qc VID01_Currency_Market

# Package YouTube thumbnails, chapters, description draft, SRT/VTT captions
bun run video:package VID01_Currency_Market
```

---

## 🌐 3D Motion Graphics with Three.js

The engine features native 3D WebGL support via `@remotion/three` and `@react-three/fiber`:
- **Component**: `Globe3D` (`workflow/05-video/src/components/Globe3D`)
- **Capabilities**: Interactive 3D rotating wireframe globe, capital flow arcs between global financial hubs (NY, London, Tokyo, Singapore), customizable rotation speeds, lighting, and HTML narrative overlays.
- **Preview & Test**:
```bash
cd workflow/05-video && bun x remotion still Globe3D out/Globe3D.png --gl=angle
```

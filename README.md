# 🎬 The Wealth Gap — YouTube Video Production Studio

A modular, code-driven video automation harness and workflow structure separating **pipeline automation code** from **video production workspaces**.

---

## 🏗️ Studio Architecture: Code vs. Workspace Separation

```
WealthGap/
├── package.json               # Pipeline runner scripts
├── tsconfig.json              # TypeScript configuration
├── .env                       # API keys and active video configuration
├── brand-assets/              # Global channel logos, banners, watermarks
│   ├── Logo.png
│   ├── Banner.png
│   └── WaterMark.png
│
│  ═════════════════════════════════════════════════════════════════════
│  PIPELINE AUTOMATION & WORKFLOWS (Steps 01 - 07)
│  (Contains harness code, scripts, prompts, and specs — NO video data)
│  ═════════════════════════════════════════════════════════════════════
├── 01-ideation/               # [Manual] Research workflow, angle prompts, competitor analysis
├── 02-scripting/              # [Manual] Script structure, retention formulas, writer prompts
├── 03-voiceover/              # [Automated] Sarvam Bulbul v4 Flash TTS, cost & prosody engine
├── 04-transcription/          # [Automated] Word-level Whisper timestamps for motion sync & cuts
├── 05-video/                  # [Spec] Chunked video generation & Remotion/motiongraphics harness
├── 06-audio/                  # [Spec] Sound design, SFX cues, dynamic music ducking (-18dB)
├── 07-assembly/               # [Spec] Master stitching, LUFS mastering (-14 LUFS), review checklist
├── scripts/                   # Workspace scaffolding utilities (new-video)
│
│  ═════════════════════════════════════════════════════════════════════
│  WORKSPACE (Per-Video Inputs, Assets, and Generated Deliverables)
│  ═════════════════════════════════════════════════════════════════════
└── workspace/
    └── VID01_Currency_Market/ # Video project directory
        ├── 01-ideation/
        │   ├── notes.md       # Angle ideas, titles, thumbnail sketches
        │   ├── video-bank/    # Downloaded reference video clips
        │   └── audio-bank/    # Downloaded reference audio tracks
        ├── 02-scripting/
        │   └── script_raw.md  # Production script with clip cues and VO tone tags
        ├── 03-voiceover/
        │   ├── sections/      # Part-by-part script with ported TTS prosody
        │   └── audio/         # Generated 48kHz WAV audio clips (part-1, part-2, ...)
        ├── 04-transcription/
        │   ├── words/         # Millisecond-accurate word timestamp JSONs per clip
        │   └── full_transcript.json
        ├── 05-video/
        │   ├── assets/        # Visual assets, charts, B-roll
        │   └── chunks/        # Rendered video chunks (part-1.mp4, part-2.mp4, ...)
        ├── 06-audio/
        │   ├── sfx/           # Sound effects (whooshes, risers, cash sounds)
        │   └── music/         # Background music tracks
        └── 07-assembly/
            └── export/        # Final master video & thumbnails
```

---

## ⚡ Quick Start: 7 Production Steps

### Step 1: Ideation (Manual)
Download competitor videos and audio references to `workspace/<VIDEO>/01-ideation/video-bank/` and `audio-bank/`.

### Step 2: Scripting (Manual)
Draft the production script in `workspace/<VIDEO>/02-scripting/script_raw.md` using the format:
```markdown
**[CLIP 1]:** Fast drone zoom into Wall Street.
**VO:** `[VO: Intense, dramatic tone]` There is a shadow market out there...
```

### Step 3: Voiceover (Automated)
Generate voiceovers via Sarvam AI Bulbul v4 Flash:
```bash
# Check character count and estimated cost (₹1 / 1,000 chars)
bun run cost

# Preview voice settings without calling the API
bun run tts:dry-run

# Generate audio for Part 1 (or all parts)
bun run tts --part 1
bun run tts

# Combine generated clips into unified tracks
bun run tts --combine
```

### Step 4: Word-Level Transcription (Automated)
Run Whisper to extract millisecond word timestamps for motion graphics & cuts:
```bash
# Transcribe all generated clips for the active video
bun run transcribe

# Transcribe only Part 1 using the 'base' model
bun run transcribe --part 1 --model base
```

### Step 5: Chunked Video Generation (Spec)
Motion graphics harness renders video in 7 modular chunks (`05-video/chunks/chunk_part*.mp4`). See [05-video/README.md](file:///Users/prakharsingh/youtube/WealthGap/05-video/README.md).

### Step 6: Sound Design & Mixing (Spec)
Automated sidechain ducking (-18dB under speech) and SFX placement. See [06-audio/README.md](file:///Users/prakharsingh/youtube/WealthGap/06-audio/README.md).

### Step 7: Final Assembly & Review (Spec)
Lossless concatenation into master 4K video, YouTube metadata, and QA checklist. See [07-assembly/README.md](file:///Users/prakharsingh/youtube/WealthGap/07-assembly/README.md).

---

## 🆕 Creating a New Video Workspace

To scaffold a clean new video project in 1 second:
```bash
bun run new-video VID02_Stock_Market_Bubble
```
This automatically sets up all 7 step folders with templates inside `workspace/VID02_Stock_Market_Bubble/`.

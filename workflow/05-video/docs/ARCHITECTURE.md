# Motion Engine — Architecture & Pipeline Design

## 1. Overview
Motion Engine is a standalone, deterministic motion-graphics explainer engine built with Remotion and TypeScript. It converts three core inputs—an audio file, a word-level timestamped transcript, and a brief—into a complete, broadcast-ready explainer video (`final.mp4`), sidecar captions (`.srt`, `.vtt`, `.json`), YouTube chapters, thumbnail candidates, and automated QC reports.

```
INPUTS                                         OUTPUTS
 audio file (voiceover)          ┌──────────► final.mp4 (+ optional vertical cut)
 word-level transcript   ───►  MOTION ENGINE ─► metadata.json, scenes.json
 brief.md (what is needed)       │            ► captions (json/srt/vtt), chapters.txt
 optional: data, assets, config  └──────────► stills/ (contact sheet, thumbnails), qc-report.md, sources.md
```

## 2. Directory Layout & Studio Integration
The engine lives inside `05-video/` to fit the studio's 7-step architecture:
- `01-ideation/`
- `02-scripting/`
- `03-voiceover/`
- `04-transcription/`
- `05-video/` (Motion Engine)
- `06-audio/`
- `07-assembly/`
- `workspace/<VIDEO_ID>/`

### Workspace Mapping
While standalone runs can use `jobs/<job-id>/input/`, the CLI also supports pointing directly to `workspace/<VIDEO_ID>/`:
- Audio source: `workspace/<VIDEO_ID>/03-voiceover/audio/combined/full_voiceover.wav` (or part files)
- Transcript source: `workspace/<VIDEO_ID>/04-transcription/full_transcript.json`
- Output destination: `workspace/<VIDEO_ID>/05-video/`

## 3. Data Flow & Pipeline Stages
1. **`ingest`**: Normalizes transcript formats (Whisper words, SRT, Remotion captions) into standard `Caption[]` (`captions.json`) and probes audio.
2. **`analyze`**: Extracts sentence boundaries, pauses (>250ms), numeric callouts, and emphasis tokens into `plan/beats.json`.
3. **`plan`**: Compiles `scenes.json` from beats, brief instructions, and available components.
4. **`validate-plan`**: Zod validation, checks for coverage gaps, duration limits (3–8s target, 2–12s hard), safe zones, text length (<= 8 words/scene), and data sourcing.
5. **`render`**: Executes deterministic Remotion render (`--draft` for 0.5x speed or `--final` for 1080p CRF 16).
6. **`qc`**: Validates file integrity, duration sync (audio vs video <= 0.5s), loudness (-14 LUFS ±2), black frames, freeze detection, and text fit.
7. **`package`**: Generates `metadata.json`, `chapters.txt`, `description_draft.md`, `sources.md`, and thumbnail candidates.

## 4. Non-Negotiable Technical Constraints
- **Animation Mechanism:** Strict inline `useCurrentFrame() + interpolate()` with individual CSS transform properties (`scale`, `translate`, `rotate`). Zero CSS `@keyframes`, zero CSS `transition`, zero Tailwind animations.
- **Visual Staging:** Three-layer scene structure:
  - Layer 1: Background (`GridDrift` + `Vignette` + subtle `GlowBlobs`)
  - Layer 2: Midground subtle geometry/halftone
  - Layer 3: Foreground semantic component (`BigNumber`, `BarCompare`, `MoneyFlow`, etc.)
- **Timing Anchor:** Voiceover is ground truth. Anchor words trigger peak animations with a 6–10 frame lead so the visual resolves exactly on the spoken word.

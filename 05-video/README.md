# The Wealth Gap — Deterministic Motion Engine

A fully deterministic, code-driven motion graphics pipeline built on **Remotion v4**, **TypeScript**, and **FFmpeg**. It translates voiceover audio, word-level transcripts, and editorial briefs directly into broadcast-grade 1080p explainer videos (`final.mp4`), sidecar subtitles, YouTube chapters, and thumbnails with **zero manual video edits**.

---

## 🏛️ Studio Architecture Integration

This engine operates inside Stage 5 (`05-video/`) of the **7-Step Wealth Gap Studio Pipeline**:

```
WealthGap/
├── 01-ideation/         # References, audio & video bank
├── 02-scripting/        # Script generation & raw scripts
├── 03-voiceover/        # TTS synthesis & audio chunks
├── 04-transcription/    # Word-level Whisper JSON transcripts
├── 05-video/            # Motion Engine (Remotion code & scripts)
├── 06-audio/            # SFX and background music
├── 07-assembly/         # Final mastering and distribution
└── workspace/           # Per-video workspace instances (VID01, VID02, ...)
```

The engine seamlessly bridges both isolated test fixtures (`fixtures/sample-job/`) and real workspace videos (`workspace/VID01_Currency_Market/`).

---

## ⚡ The 6 Most Useful Commands

| Command | Purpose |
|---|---|
| `npm run job:new <id>` | Create a new job skeleton and markdown brief template |
| `npm run ingest <id>` | Validate audio, detect transcript format, and mirror assets |
| `npm run analyze <id>` | Detect sentence pauses, numeric figures, and scene breaks |
| `npm run plan <id>` | Synthesize storyboard and generate validated `scenes.json` |
| `npm run render <id>` | Render broadcast 1080p H.264 video (`--draft` for rapid 0.5x preview) |
| `npm run build <id>` | Run the full end-to-end 7-stage pipeline autonomously |
| `npm run test` | Run the complete verification test suite on `fixtures/sample-job` |

---

## 🛠️ Pipeline Stages

Each stage runs deterministically, validates schemas via **Zod**, and updates `status.json`:

1. **`ingest`**: Normalizes transcript formats (Whisper word JSON, Remotion Captions, plain words, ElevenLabs alignment, Studio multi-clip) into standard `captions.json`.
2. **`analyze`**: Parses sentence boundaries, pauses ($\ge 250\text{ ms}$), and numbers into `beats.json`.
3. **`plan`**: Maps transcript beats to visual metaphors and writes `scenes.json`.
4. **`check`**: Audits variety rules, safe zones, text constraints, and anchor resolution.
5. **`render`**: Compiles frames via `<TransitionSeries>` with scene premounting and professional sound design.
6. **`qc`**: Audits video for black frames, freeze detection, duration drift, and -14 LUFS loudness.
7. **`package`**: Exports `metadata.json`, sidecar `.srt`/`.vtt`, `chapters.txt`, `sources.md`, `description_draft.md`, and 3 thumbnail variants.

---

## 🎨 Visual Grammar & Component Library

All visuals strictly import design tokens from `src/design/tokens.ts` and `motion.ts` (no CSS transitions, no Tailwind animations, no hardcoded colors):

- **Numbers**: `BigNumber` (count-up landing on spoken word anchor)
- **Comparisons**: `BarCompare` (staggered bars), `SizeCompare` (area-proportional circles)
- **Trends**: `LineDraw` (d3-shape smooth animated curve with peak pins)
- **Distributions**: `IconGrid` (100-person concentration grid)
- **Flows**: `MoneyFlow` (interbank node particles & curved transfers)
- **Typography & Structure**: `TitleCard`, `TermCard` (with rough-notation underlines), `SourceTag` (institutional citations)
- **Atmospheric Backgrounds**: `GridDrift`, `GlowBlobs`, `Vignette`, `Grain`

To view the live component catalog in Studio:
```console
npm run gallery
```

---

## 📜 Remotion Licensing Note

Remotion is free for individuals and companies with up to 3 people. For larger teams, a company license is required at [remotion.dev/license](https://www.remotion.dev/license).

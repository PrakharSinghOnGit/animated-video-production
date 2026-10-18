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

| Command                | Purpose                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `npm run job:new <id>` | Create a new job skeleton and markdown brief template                 |
| `npm run ingest <id>`  | Validate audio, detect transcript format, and mirror assets           |
| `npm run analyze <id>` | Detect sentence pauses, numeric figures, and scene breaks             |
| `npm run plan <id>`    | Synthesize storyboard and generate validated `scenes.json`            |
| `npm run render <id>`  | Render broadcast 1080p H.264 video (`--draft` for rapid 0.5x preview) |
| `npm run build <id>`   | Run the full end-to-end 7-stage pipeline autonomously                 |
| `npm run test`         | Run the complete verification test suite on `fixtures/sample-job`     |

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

### Part 1: How to Use What We Built

The system connects your workspace folder (workspace/<VIDEO_ID>/) directly to
the motion graphics engine (05-video/).

#### The Standard Video Creation Workflow

1. Step 1 & 2: Scripting & Ideas
   Your script is placed in script_raw.md.
2. Step 3: Voiceover Generation
   Run your TTS script to generate audio into audio/.
3. Step 4: Transcription
   Run Whisper to produce full_transcript.json with word-level timestamps.
4. Step 5: Automated Motion Graphics (05-video/)
   Open your terminal in 05-video/ and run:
   cd /Users/prakharsingh/youtube/WealthGap/05-video


    # 1. Ingest audio & transcript (normalizes timing and copies assets)
    npm run ingest VID01_Currency_Market

    # 2. Analyze speech pauses & numbers to detect scene breaks
    npm run analyze VID01_Currency_Market

    # 3. Generate the storyboard (scenes.json)
    npm run plan VID01_Currency_Market

    # 4. Preview interactively in Remotion Studio in your browser
    npm run studio

5. Step 6: Render and Package


    # Rapid 0.5x scale draft render (~25 seconds)
    npm run draft VID01_Currency_Market

    # Full 1080p broadcast master render with automated QC and packaging
    npm run render VID01_Currency_Market
    npm run qc VID01_Currency_Market
    npm run package VID01_Currency_Market

All deliverables will appear in workspace/VID01_Currency_Market/05-video/:
• final.mp4 (1080p H.264)
• captions.srt & captions.vtt (sidecar subtitles)
• chapters.txt (YouTube chapters)
• description_draft.md (YouTube description with timestamps, sources, and
disclaimer)
• stills/thumbnails/ (thumb-a.png, thumb-b.png, thumb-c.png)

──────

### Part 2: Why the Demo Is Basic & The "Director Prompt" to Make It Look

High-End

The demo looked basic because plan.ts currently uses rule-based procedural
keyword matching (e.g. if word contains "trillion" → show BigNumber). It only
placed one element per scene on a dark grid.

In high-end explainer channels (Vox, Johnny Harris, Polymatter,
MagnatesMedia), visual density is created by:

1. Multi-element layering: Combining a chart or 3D visual on the left, a stat
   counter on the right, and an institutional source card at the bottom.
2. Anchor choreography: Animating elements sequentially as the voice speaks
   specific words rather than showing everything at frame 0.
3. Varied visual metaphors: Alternating between macro maps, comparative scale
   spheres, line trajectory draws, and network particle flows.

#### The AI Director Storyboard Prompt

Whenever you have a new video or want to upgrade scenes.json, run this prompt
with Claude / ChatGPT / Gemini:

    You are a Lead Motion Graphics Art Director for "The Wealth Gap" YouTube

channel (style: Vox, Polymatter, and MagnatesMedia).

    Your job is to read my script brief (`brief.md`) and word-level transcript

(`captions.json` or `beats.json`), and write the cinematic `scenes.json`
storyboard for Remotion.

    ### Library of Available Components
    - `BigNumber`: Large animated counter landing on a spoken word anchor.

Props: { value, prefix, suffix, label, sublabel, accentColor } - `BarCompare`: Comparative staggered horizontal bars. Props: { title,
subtitle, items: [{ label, value, displayValue, color, highlight }] } - `LineDraw`: Smooth D3 line chart drawing over time with peak pin. Props:
{ title, series: [{ x, y, label }], highlightPointIndex } - `SizeCompare`: Visceral area-proportional scale spheres (e.g. 10x stock
vs currency). Props: { title, subtitle, items: [{ label, value, displayValue,
color }] } - `IconGrid`: 100-icon wealth/population concentration grid. Props: { title,
highlightedCount, totalCount: 100, label } - `MoneyFlow`: Nodes and liquidity particle arcs between banks/entities.
Props: { title, nodes: [{ id, label, color }], transfers: [{ fromId, toId,
amountLabel }] } - `TitleCard`: Cinematic scene opener. Props: { chapterBadge, title,
subtitle, accentColor } - `TermCard`: Definition card with rough-notation underline. Props: {
category, term, definition, highlightWord, accentColor } - `SourceTag`: Institutional citation tag. Props: { text, dataRef }

    ### Rules for High-End Motion
    1. **One Idea Per Scene (3 to 8 seconds)**: Break on pauses >= 250ms or

sentence boundaries. 2. **Sequential Entrances (Stagger)**: Do not drop all elements at 0ms.
Element A enters at scene start; Element B enters at `enterAtMs` when the
voice reaches that concept. 3. **Anchor to Words**: For numbers, set an anchor:
`"anchors": [{ "word": "trillion", "occurrence": 1, "action": "countUp.
  end", "offsetFrames": -8 }]` 4. **Visual Grammar**: - Money moving between parties -> `MoneyFlow` - Scale contrast -> `SizeCompare` - Data over time -> `LineDraw` - Key claims -> Component + `sourceTag` with institution name (BIS, Fed,
IMF, World Bank). 5. **Atmosphere**: Alternate midground glow hues (`accent` #F5B83D vs
`accent2` #2EC4B6) and background grid drift intensity. 6. **No Repetition**: Never use the same primary foreground component more
than twice in a row.

    INPUT BRIEF:
    <paste brief.md here>

    INPUT TRANSCRIPT BEATS:
    <paste plan/beats.json or captions.json here>

    OUTPUT:
    Return ONLY the raw JSON object matching the ScenesFile schema for `scenes.

json`.

Saving that JSON directly into workspace/<VIDEO_ID>/05-video/scenes.json
immediately re-renders the entire video with those cinematic choices.

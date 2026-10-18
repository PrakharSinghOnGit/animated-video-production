# Input Contract

Each video job provides its input files inside `jobs/<job-id>/input/` (or via `workspace/<VIDEO_ID>/`):

```
jobs/<job-id>/input/
├── audio.mp3                 REQUIRED  (mp3 | wav | m4a | aac | flac)
├── transcript.json           REQUIRED  word-level timestamps
├── brief.md                  REQUIRED  markdown brief with YAML front-matter
├── config.json               optional  engine overrides (fps, size, captions, music...)
├── style.json                optional  job token overrides (accent color, font families)
├── data/                     optional  *.csv / *.json for charts and data graphics
├── assets/                   optional  user-owned images/SVG/logos/fonts/music
├── storyboard.json           optional  if provided, bypasses auto-planner
└── requests.md               optional  free-text special requests
```

## Supported Transcript Formats
The `ingest` stage automatically detects and normalizes:
1. **Whisper Word JSON**: `{ "words": [{ "word": " The", "start": 0.0, "end": 0.3 }] }` or `segments[].words[]`.
2. **Plain Word JSON**: `{ "words": [{ "text": "The", "start": 0.0, "end": 0.3 }] }`.
3. **Remotion `Caption[]` JSON**: native `{ text, startMs, endMs, timestampMs, confidence }`.
4. **SRT / VTT Subtitles**: cue-level timing proportionally divided across word character counts (with QC warning).
5. **ElevenLabs Character Alignment**: grouped into word tokens.

### Normalization Guarantees
- Enforces strictly monotonic timing (no overlapping timestamps).
- Preserves leading space before words (`" world"`).
- Clamps negative values to 0.
- Merges dangling punctuation into preceding word tokens.
- Detects silence gaps longer than 1.5s.

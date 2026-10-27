# Step 3: Voiceover Generation (Automated)

Generates the narration locally with a cloned voice (Chatterbox by default, F5-TTS with `--f5`). Offline, no API cost.
Sections come from `bun run tts:format`; see `bun run tts --help` for every option.

## Files

- Code: `run.ts`, `src/config.ts`, `src/generate.ts` (+ `chunk.ts`, `normalize.ts`, `tts_best_of_n.py`).
- Per video, in `workspace/<VIDEO_ID>/03-voiceover/`: `sections/` (script sections), `audio/part-N/` (clips),
  `audio/combined/` (optional concatenated tracks), `reports/` (per-take ASR scores).

## Usage

```bash
bun run tts --cost                       # character count per section
bun run tts --dry-run                    # preview settings and destinations
bun run tts --part 1                     # one part
bun run tts --section part1_01_beat --force
bun run tts --combine                    # also concatenate clips per part and full script
bun run tts --f5                         # legacy F5-TTS engine
```

`--scale <0.0-1.0>` scales the per-section F5-TTS speed offsets (default 1.0).

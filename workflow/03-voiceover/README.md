# Step 3: Voiceover

Gemini TTS (default; free tier with an AI Studio key in `GEMINI_TTS`) reads each script block in one call, directed by
the channel style plus the block's `[VO: tone]` note; the script's CAPS, `...`, `—` and `!` shape the delivery.
`--qwen` (or `TTS_ENGINE=qwen`) uses Qwen3-TTS 1.7B Base (local, Apple Silicon MLX, free) cloning the **channel voice**
(`voices/ACTIVE`). Sections come from `bun run tts:format`; `bun run tts --help` lists every option.

## Files

- Code: `run.ts`, `src/generate.ts` (+ `chunk.ts`, `normalize.ts`, `tts_best_of_n.py`), voices: `src/voice_profile.ts`,
  `src/design_voice.py` (Qwen VoiceDesign), `src/design_voice_gemini.py`.
- `voices/<name>/`: `design.json` (description + sample text), `take*.wav` (gitignored), `reference.wav` + `reference.txt`
  (the picked take, what gets cloned). `voices/ACTIVE` names the channel voice. `voice_profile/` is the old clone ("legacy").
- Per video, in `workspace/<VIDEO_ID>/03-voiceover/`: `sections/`, `audio/part-N/`, `audio/combined/`, `reports/`
  (per sentence: chosen seed, WER, voice similarity).

## Usage

```bash
bun run voice:design --name warm_insider --describe "Male, late 30s, warm baritone..."   # takes to listen to
bun run voice:design --name warm_insider --pick 2                                       # make take 2 the reference
bun run voice:use warm_insider                                                          # channel voice
bun run tts --video <ID> --force --combine
bun run tts --section part1_01_beat --force --voice-profile other_voice                # one-off test
```

Python: one `.venv` (`requirements.txt`): mlx-audio, faster-whisper, scipy, pillow, google-genai.

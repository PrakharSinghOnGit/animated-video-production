# Step 4: Word-Level Transcription (Automated)

This step transcribes the generated voiceover audio files file-by-file to produce **millisecond-accurate word timestamps**. These timestamps empower the downstream motion graphics and video editing harness to cut B-roll, animate kinetic typography, and place visual markers on the exact frame a word is spoken.

---

## 📂 Architecture & File Organization

- **Automation Code (Here)**: Lives in `04-transcription/` (`transcribe.ts`, `transcribe_whisper.py`, `src/types.ts`).
- **Video Input & Output**: Lives inside the active video's workspace:
  ```
  workspace/<VIDEO_ID>/04-transcription/
  ├── words/                      # Word-level timestamp JSONs per audio clip
  │   ├── 01_part1_01_shadow_market.json
  │   └── ...
  └── full_transcript.json        # Unified chronological transcript of all clips
  ```

---

## 🔍 Word Timestamp Schema

Each generated JSON in `words/` provides:

```json
{
  "audio_file": "01_part1_01_shadow_market.wav",
  "duration": 11.591,
  "language": "en",
  "model": "base",
  "text": "There is a shadow market out there...",
  "words": [
    { "word": "There", "start": 0.0, "end": 0.14, "probability": 0.673 },
    { "word": "is", "start": 0.14, "end": 0.34, "probability": 0.972 },
    { "word": "shadow", "start": 0.5, "end": 0.86, "probability": 0.929 },
    { "word": "market", "start": 0.86, "end": 1.26, "probability": 0.951 }
  ]
}
```

---

## 🚀 Commands & Usage

```bash
# 1. Transcribe all audio clips for the default active video
bun run transcribe

# 2. Transcribe for a specific video project
bun run transcribe --video VID01_Currency_Market

# 3. Transcribe only a specific part (e.g. Part 1)
bun run transcribe --part 1

# 4. Use a different Whisper model size (tiny, base, small, medium, large-v3)
bun run transcribe --model small

# 5. Force re-transcription (overwrites cached JSONs)
bun run transcribe --force
```

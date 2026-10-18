# Step 3: Voiceover Generation (Automated)

This step takes the structured voiceover sections with ported prosody parameters and generates broadcast-grade (48kHz WAV) audio clips via the **Sarvam AI Bulbul v4 Flash** (`bulbul:v4-flash`) model.

---

## 📂 Architecture & File Organization

- **Automation Code (Here)**: Lives in `03-voiceover/` (`run.ts`, `src/config.ts`, `src/sarvam_client.ts`, `src/generate.ts`).
- **Video Input & Output**: Lives inside the active video's workspace:
  ```
  workspace/<VIDEO_ID>/03-voiceover/
  ├── sections/              # Section-by-section script with ported prosody
  │   ├── part1.ts
  │   ├── ...
  │   └── index.ts
  └── audio/                 # Generated audio clips (48kHz WAV)
      ├── part-1/
      ├── part-2/
      └── combined/          # (Optional concatenated full-part tracks)
  ```

---

## 🚀 Commands & Usage

```bash
# 1. Estimate total characters and cost (₹1 / 1,000 characters)
bun run tts --cost
# Or for a specific video:
bun run tts --video VID01_Currency_Market --cost

# 2. Preview voice settings and file destinations (Dry run)
bun run tts --dry-run
bun run tts --part 1 --dry-run

# 3. Generate Audio
bun run tts --part 1
bun run tts --section part1_01_shadow_market --force
bun run tts --all

# 4. Generate with Audio Concatenation (Combines clips per part and full script)
bun run tts --combine
```

---

## 🎛️ Expression Multipliers (Scaling)

Control prosody intensity to prevent unnatural voice swings:
- `--scale <0.0–1.0>`: Master scaling (default: 0.3)
- `--pitch-scale 0.0`: Completely flattens pitch to 0.0 while preserving subtle pacing and loudness.
- Configure in `.env` via `SARVAM_EXPRESSION_SCALE` and `SARVAM_PITCH_SCALE`.

# Step 6: Sound Design & Audio Mixing (SFX & Music)

This step layers sound effects (whooshes, risers, sub-bass drops, cash registers, typewriter clatter) and dynamic background music underneath the voiceover, applying automated sidechain ducking.

> **Status:** Specification Phase. (Full automation code to be integrated here).

---

## 🎯 Purpose & Sound Identity

"The Wealth Gap" channel relies on high-energy cinematic pacing. Sound design anchors viewer attention during complex macroeconomic explanations:
- **Audio Ducking**: Background music automatically drops by **-18dB** whenever speech is active and swells up during dramatic pauses.
- **Micro-SFX on Visual Cuts**: Every chart tick, graph drop, or currency flash has a synchronized sound design cue.

---

## 📥 Inputs

1. **Dialogue Stem**:
   `workspace/<VIDEO_ID>/03-voiceover/audio/combined/full_voiceover.wav` (or part-by-part clips).
2. **Sync Cues (Word Timestamps)**:
   `workspace/<VIDEO_ID>/04-transcription/words/*.json` (e.g. triggering a cash register SFX on the exact millisecond the word "trillion" is spoken).
3. **Sound Effects Library**:
   `workspace/<VIDEO_ID>/06-audio/sfx/` (Whooshes, impacts, pops, paper ruffles, glitch hits).
4. **Music Bed**:
   `workspace/<VIDEO_ID>/06-audio/music/` (Tense, pulsing electronic/orchestral background tracks).

---

## 📤 Outputs

All mixed audio files are saved into:
```
workspace/<VIDEO_ID>/06-audio/
├── dialogue_stem.wav    # Cleaned, EQ-balanced voiceover
├── sfx_stem.wav         # Timed sound effects layer
├── music_stem.wav       # Ducked background music track
└── audio_mix.wav        # Mastered composite stereo mix (-14 LUFS, -1.0 dB true peak)
```

---

## 🛠️ Planned Automation Interface

```bash
# Generate automated sound cues and sidechain ducking mix
bun run 06-audio/mix.ts --video VID01_Currency_Market

# Mix only a specific part
bun run 06-audio/mix.ts --part 1
```

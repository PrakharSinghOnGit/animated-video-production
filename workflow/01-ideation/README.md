# Step 1: Ideation & Research (Manual)

This step captures the raw creative inspiration, competitor analysis, reference media, and core hypotheses before writing a single word of the script.

> **Note:** There is **no automation** in this folder. It defines the workflow, folder conventions, and research tools for the video ideation phase.

---

## 📂 Workspace Folder Structure

For every video project in `workspace/<VIDEO_ID>/01-ideation/`:

```
workspace/<VIDEO_ID>/01-ideation/
├── notes.md            # Brainstorming notes, title ideas, core angle, thumbnail sketches
├── video-bank/         # Downloaded reference videos, competitor edits, B-roll references
└── audio-bank/         # Downloaded reference voiceovers, podcast clips, sound design tracks
```

---

## 🎯 Ideation Workflow

1. **Identify the Core Asymmetry / Curiosity Hook**:
   - What is the counter-intuitive truth? *(e.g. "The currency market moves $7T/day, but Washington can run infinite deficits while regular people get wiped out.")*
   - What is the "Villain" or "Invisible Force"? *(Central banks, interest rate differentials, leverage traps)*

2. **Download Reference Footage & Audio (Video Bank / Audio Bank)**:
   - Use `yt-dlp` to download reference videos and competitor audio directly into the workspace:
   ```bash
   # Download best quality reference MP4 to video-bank
   yt-dlp -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]" "<URL>" -o "workspace/<VIDEO_ID>/01-ideation/video-bank/%(title)s.%(ext)s"

   # Download reference MP3 to audio-bank
   yt-dlp -x --audio-format mp3 "<URL>" -o "workspace/<VIDEO_ID>/01-ideation/audio-bank/%(title)s.%(ext)s"
   ```

3. **Title & Thumbnail Concept Pairing**:
   - Never write a script without at least 3 thumbnail concepts and 5 validated title angles.
   - Store these in `workspace/<VIDEO_ID>/01-ideation/notes.md`.

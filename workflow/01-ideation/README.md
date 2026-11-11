# Step 1: Ideation & Research (Manual)

This step captures the raw creative inspiration, competitor analysis, reference media, and core hypotheses before writing a single word of the script.

> **Idea check (automated):** before a project exists, add ideas in the dashboard (**Ideas**) or with
> `bun run ideas --add "Title" --note "..."`, then `bun run ideas --id I01`. It searches YouTube for the topic and
> scores each video against its channel's normal reach (views ÷ the median of the channel's recent uploads of the
> same format, **`yt-viral/swipe.py`**, which also names each title's hook formula). A model judges the idea against
> **`AUDIENCE.md`** (who the channel is for + the idea test) and the channel's own numbers, writes ~8 title +
> thumbnail packages, lints them with **`yt-package/title.py`** and keeps the 3 best (each stored with the linter's
> score). Results: `workspace/_ideas/ideas.json`. The Ideas page also has a free title checker (same linter).
> "Start project" creates the video (untitled, then named from the idea) and writes the idea, angle and packages
> into its `02-scripting/idea.md`. `yt-package/` and `yt-viral/` are vendored from youtube-agent-skill (MIT, see
> their CREDITS.md); `skills.ts` wraps them for TypeScript.
> **Find ideas** (Ideas page, or `bun run ideas --discover [--focus "housing"] [--check 3]`): 5 searches across the
> audience's topics (last 6 months, most viewed), every video scored against its channel's median, then the editor
> (`workflow/prompts/IDEA_DISCOVER.md`) turns the outliers into 6 ranked ideas (score 0–10 from audience fit and
> proven demand, each citing the outliers behind it, with one linted package). `--check N` runs the full check on
> the top N. About $0.2 + $0.15 per check; ~650 + 270 quota units per check. Runs: `workspace/_ideas/discover/`.
> Keep `AUDIENCE.md` current: it is the brief every idea is judged against.
>
> **Packages first (automated):** before writing, `bun run concepts --topic "..."` (or `--idea I03` for an idea in the
> bank, which adds its YouTube research) proposes **five title + thumbnail concepts**: five different levers, thumbnails
> on different axes, each with the question it leaves open, the video's first sentence, the claims the script must
> source and the finding that would kill it; a blind viewer then says which it would click (~$0.1–0.2). No sources exist
> yet, so a figure the creator did not state is rejected in code: numbers are `{slots}` until research fills them.
> `bun run concepts --pick I03 2 --to VID07_Name` writes the chosen package into the project's `02-scripting/idea.md`
> ("Chosen package"): the writer keeps its promise and `bun run meta` keeps one final package faithful to it.
> Results: `workspace/_ideas/concepts/<key>.md`. If none of the five is strong, change the angle before writing.
>
> The rest of this file is the manual workflow inside a project (references, notes).

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

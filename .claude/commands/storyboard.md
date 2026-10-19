Generate or validate the storyboard for a video project.

## Usage
`/storyboard [video_id]` (defaults to `ACTIVE_VIDEO` in `.env`)

## Instructions
1. Identify the target video ID: either from `$ARGUMENTS` or from `ACTIVE_VIDEO` in `.env`.
2. Ensure the transcript and timeline are ready:
   - Run `bun run timeline --video $ARGUMENTS` if `timeline.json` is not present.
3. Read the storyboard prompt guidelines:
   - File: `workflow/prompts/STORYBOARD.md`
4. Inspect inputs:
   - Brief: `workspace/<VIDEO_ID>/05-video/brief.md` (or `workspace/<VIDEO_ID>/02-scripting/script_raw.md`)
   - Transcript: `workspace/<VIDEO_ID>/04-transcription/full_transcript_compact.txt` (or `full_transcript.json`)
   - Timeline: `workspace/<VIDEO_ID>/05-video/timeline.json`
5. Write or update `workspace/<VIDEO_ID>/05-video/storyboard.json` adhering strictly to the `StoryboardFile` schema in `STORYBOARD.md`.
6. Run validation:
   ```bash
   bun run storyboard:check --video $ARGUMENTS
   ```
   If errors are reported, fix them immediately until validation passes cleanly with exit code 0.
7. Run scene assembler:
   ```bash
   bun run assemble --video $ARGUMENTS
   ```

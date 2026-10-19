Render and visually inspect a single Remotion scene's stills, contact sheet, and motion preview.

## Usage
`/review-scene <scene_id> [video_id]` (e.g. `/review-scene S01`)

## Instructions
1. Parse `$ARGUMENTS` to determine scene ID and optional video ID (defaulting to `ACTIVE_VIDEO` in `.env`).
2. Generate all review assets:
   ```bash
   # Render keyframe stills (enter, anchor hits, mid, exit)
   bun run still --video <VIDEO_ID> --scene <SCENE_ID>

   # Tile stills into contact sheet
   bun run sheet --video <VIDEO_ID> --scene <SCENE_ID>

   # (Optional) Generate low-res fast preview video
   bun run scene:play --video <VIDEO_ID> --scene <SCENE_ID>
   ```
3. Open and inspect the contact sheet:
   - File: `workspace/<VIDEO_ID>/05-video/review/<SCENE_ID>/contact-sheet.png`
4. Evaluate against the Review Checklist in `workflow/prompts/SCENE_AUTHOR.md` §6:
   - **Story & Word Sync:** Are visuals arriving 150-250ms before narration hits?
   - **Craft & Motion:** Are entrances using masked reveals, morphs, or spawns? No plain fades?
   - **Composition & Safe Area:** Elements within safe bounds? Text >= 30px? Hold times respected?
   - **Continuity:** Smooth transition matching handoff notes with adjacent scenes.
5. Provide actionable feedback or record necessary fixes in `review/<SCENE_ID>/pass-N.md`.

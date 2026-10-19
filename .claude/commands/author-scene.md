Author an individual Remotion motion graphics scene for a video.

## Usage
`/author-scene <scene_id> [video_id]` (e.g. `/author-scene S01` or `/author-scene S02 VID01_Currency_Market`)

## Instructions
1. Parse arguments:
   - Scene ID (e.g. `S01`, `S02`, etc.)
   - Video ID (optional, defaults to `ACTIVE_VIDEO` in `.env`)
2. Read the authoring guidelines and kit API:
   - System Prompt: `workflow/prompts/SCENE_AUTHOR.md`
   - Kit Primitives & Helpers: `packages/kit/KIT_API.md`
   - Visual Guidelines: `workflow/prompts/VISUAL_GUIDELINES.md`
   - Craft Reference Notes: `workflow/prompts/references/REFERENCE_NOTES.md`
3. Check if an authoring brief exists at `workspace/<VIDEO_ID>/05-video/review/<SCENE_ID>/prompt.txt`. If not, generate it:
   ```bash
   bun run author --video <VIDEO_ID> --scene <SCENE_ID>
   ```
4. Follow the authoring workflow in `SCENE_AUTHOR.md`:
   - Step A: Understand & plan in `review/<SCENE_ID>/plan.md`.
   - Step B: Author `workspace/<VIDEO_ID>/05-video/src/scenes/<SCENE_ID>_<slug>.tsx`.
   - Step C: Run static analysis:
     ```bash
     bun run lint:scene --video <VIDEO_ID> --scene <SCENE_ID>
     ```
   - Step D: Render stills and contact sheet:
     ```bash
     bun run still --video <VIDEO_ID> --scene <SCENE_ID>
     bun run sheet --video <VIDEO_ID> --scene <SCENE_ID>
     ```
   - Step E: Inspect the rendered images. Check focal hierarchy, text safe margins, hold times, and easing. Iterate if needed (max 4 passes).
   - Step F: Write summary in `review/<SCENE_ID>/report.md`.

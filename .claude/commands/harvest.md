Scan completed scenes for reusable motion graphics patterns and promote candidates to `@wealthgap/kit`.

## Usage
`/harvest [video_id]` (defaults to `ACTIVE_VIDEO` in `.env`)

## Instructions
1. Determine the target video ID from `$ARGUMENTS` or `ACTIVE_VIDEO` in `.env`.
2. Run the harvest scan script:
   ```bash
   bun run harvest --video <VIDEO_ID>
   ```
3. Read the generated report:
   - File: `workspace/<VIDEO_ID>/05-video/review/harvest-report.md`
4. Follow instructions in `workflow/prompts/HARVEST.md`:
   - Inspect candidates and kit requests in `workspace/<VIDEO_ID>/05-video/review/kit-requests.md`.
   - For promoted components, implement them in `packages/kit/src/primitives/<Component>.tsx`.
   - Re-export in `packages/kit/src/index.ts`.
   - Add standard and stress fixtures to `packages/kit/src/gallery/fixtures.ts`.
   - Document in `packages/kit/KIT_API.md` and bump kit version in `packages/kit/package.json`.
5. Verify kit gallery:
   ```bash
   bun test
   ```

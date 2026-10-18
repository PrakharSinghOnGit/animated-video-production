# Motion Engine — Guidelines for AI Coding Agents

## Purpose
Motion Engine takes voiceover audio, word-level timestamps, and a markdown brief to produce a deterministic, polished 1080p motion-graphics explainer video (MP4) with sidecar captions, chapters, and metadata. Built with Remotion, TypeScript, and SVG/canvas.

## Golden Rules (Non-Negotiable)
1. **Never Invent Facts or Numbers:** Every number must come from the brief, transcript, or data files, cited in `sources.md`. Flag missing numbers as `NEEDS_DATA`.
2. **Animation Architecture:** Drive ALL animations via `useCurrentFrame() + interpolate()` with inline styles and individual properties (`scale`, `translate`, `rotate`). NEVER use CSS `transition`, CSS `@keyframes`, or Tailwind animation classes.
3. **Deterministic Rendering:** No `Math.random()` (use Remotion's seeded `random()`), no `Date.now()`, no live network requests at render time.
4. **Design Tokens Only:** Import colors and motion rules from `src/design/tokens.ts` and `motion.ts`. No hardcoded hex or custom timings.
5. **Safe Zones & Typography:** Keep focal text inside safe bounds (80px sides, 100px top/bottom at 1080p). Minimum text size is 30px at 1920x1080. Max 8 words of on-screen text per scene.
6. **Preserve User Edits:** Never overwrite human modifications without clear intention.
7. **Always Run Review Loop:** Render stills (enter+15, hold, exit-10, anchors) to verify frames before concluding a task.

## Repository Layout
- `src/design/`: Tokens (`tokens.ts`), motion curves (`motion.ts`), layout helpers (`layout.ts`), font loader (`fonts.ts`).
- `src/components/`: Reusable components (`BigNumber`, `BarCompare`, `LineDraw`, etc.), each with index, schema, fixtures, preview.
- `src/backgrounds/`: `GridDrift`, `Grain`, `Vignette`, `GlowBlobs`.
- `src/scenes/`: Scene templates mapping plan data to components.
- `src/compositions/`: `Main.tsx` (full video), `Vertical.tsx` (9:16), `Gallery.tsx` (component catalog), `Thumbnail.tsx`.
- `src/lib/`: `schema.ts`, `timing.ts`, `registry.ts`.
- `scripts/`: CLI tools (`ingest.ts`, `analyze.ts`, `plan.ts`, `validate-plan.ts`, `render.ts`, `qc.ts`, `package.ts`, `build.ts`).
- `jobs/` or `workspace/`: Job input/output directories.

## Core Commands
- `npm run ingest <job-id>`: Validate & normalize inputs into `captions.json`
- `npm run analyze <job-id>`: Extract sentence/pause/number beats into `beats.json`
- `npm run plan <job-id>`: Generate storyboard `scenes.json`
- `npm run check <job-id>`: Validate storyboard rules and schema
- `npm run studio`: Launch Remotion Studio
- `npm run gallery`: Launch Remotion Studio focused on the component Gallery
- `npm run still <job-id> <frame|anchor>`: Render a still image
- `npm run sheet <job-id>`: Generate timestamped contact sheet
- `npm run draft <job-id>`: Rapid 0.5x preview render
- `npm run render <job-id>`: Full 1080p H.264 render
- `npm run qc <job-id>`: Automated quality assurance audit
- `npm run package <job-id>`: Build final metadata, chapters, and thumbnails
- `npm run build <job-id>`: Full end-to-end pipeline run

## Agent Protocols
- Load Remotion agent skills in `.agents/skills/` before writing code.
- Report format: what was built, assumptions made, blockers/limitations, how to run, and what to verify.

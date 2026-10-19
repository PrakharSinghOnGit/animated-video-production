# HARVEST: Kit Maintenance & Promotion Prompt

> **Where this file lives:** `workflow/prompts/HARVEST.md`  
> **Who runs it:** Kit maintainer or senior motion developer after a video ships.  
> **Goal:** Promote reusable visual patterns from completed video scenes into `@wealthgap/kit`.

---

## Instructions

You are the kit maintainer. Read `workspace/<VIDEO_ID>/05-video/review/harvest-report.md`, candidate scene code in `src/scenes/*.tsx`, and `packages/kit/KIT_API.md`.

For each candidate identified by the harvest scan:
1. **Decision Matrix:**
   - **Promote**: The component is general, highly reusable, and distinct.
   - **Generalise-then-promote**: Useful concept, but requires parameterising hardcoded values into a clean props API.
   - **Leave in scene**: Specific narrative visual that belongs only to that scene's story.

2. **Standards for Promoted Items:**
   - Only promote patterns that are visually distinct, reusable across topics, and parameterisable with a small prop API.
   - Implement the new primitive in `packages/kit/src/primitives/<PrimitiveName>.tsx`.
   - Re-export the primitive in `packages/kit/src/index.ts`.
   - Add a standard and stress fixture to `packages/kit/src/gallery/fixtures.ts`.
   - Document props and usage in `packages/kit/KIT_API.md`.
   - Add a changelog line and bump the kit minor version in `packages/kit/package.json`.

3. **Constraints:**
   - Do not change behaviour of existing exports.
   - Do not touch scenes of previously shipped videos except to optionally swap their local copy for the kit version in a separate commit (and only after re-rendering to confirm identical output).

4. **Deliverable:**
   - Finish with a concise summary and the list of new kit exports.

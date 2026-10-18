---
name: add-component
description: Standardized procedure to construct, test, preview, and register a new reusable motion component.
---

# Add Component Skill

## Checklist for New Components
1. Create `src/components/<ComponentName>/`:
   - `schema.ts`: Zod props schema.
   - `index.tsx`: Component implementation (inline interpolate, tokens only, no CSS animations).
   - `fixtures.json`: Realistic and stress fixtures.
   - `preview.tsx`: Remotion composition for studio.
2. Register in `src/lib/registry.ts`.
3. Register preview in `src/Root.tsx`.
4. Run `npx tsx scripts/generate-components-doc.ts` to update `docs/COMPONENTS.md`.
5. Render test still and review checklist before concluding.

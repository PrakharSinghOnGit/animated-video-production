---
name: storyboard-from-transcript
description: Turn beats.json and brief.md into a fully validated scenes.json storyboard following visual grammar and timing rules.
---

# Storyboard from Transcript Skill

## Goal
Generate a gapless, validated `scenes.json` storyboard from transcript beats and brief requirements.

## Protocol
1. Read `plan/beats.json` and `brief.md`.
2. Map each beat to a visual component using `docs/DESIGN.md` visual grammar.
3. Enforce:
   - First scene starts at 0ms; final scene ends at `totalDurationMs + tailPaddingMs`.
   - No time gaps or overlaps between scenes.
   - Max 8 words of narrative text per scene.
   - No component repeated more than twice consecutively.
   - Ground every number in `brief.must_show` or transcript tokens.
4. Run `npm run check <job-id>` to validate before proceeding.

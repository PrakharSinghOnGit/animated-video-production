# Fable 5.2 work list — The Wealth Gap engine

Prompts for the two months of Fable 5.2 access (from 2026-11-10). They are ranked by how much each one should
improve the channel. Each prompt is self-contained: start a fresh session, attach this file, and paste **one**
prompt. Don't paste several at once.

**How to run each one**
- Start in plan mode. Read Fable's plan, push back on it, then let it build.
- Spend Fable on judgment (design, prompts, visual taste, architecture). Leave mechanical edits to cheaper models.
- Anything Fable improves must keep working with every model in `workflow/models.json`. After the access ends, the
  improvements should still be there in code, prompts and style docs.
- Every prompt below already includes the shared rules (next section), so you don't need to paste them separately.

---

## Shared rules (part of every prompt)

> Read `CLAUDE.md`, `VIDEO_PRODUCTION.md`, and the README of any folder you touch before changing anything.
> Rules:
> - Fixes must be **generic**, never tuned to one video. VID02 and VID03 are test beds; VID02 must never be published.
> - Kit helpers must **help the LLM, not box it into one look**. Videos should feel dynamic and flowing, not like
>   templated slides.
> - Act code stays deterministic (a function of `ctx.t`), hits come from spoken words, and numbers come only from
>   the plan's sourced `data`. Never invent facts, figures or sources.
> - Never read or print `.env`. Steps marked 💲 cost real money: don't re-run them speculatively, and say before you
>   do.
> - Measure before and after. For visuals, render frames (`bun run frames`) and actually look at them. For code,
>   run the tests and the typecheck. Say plainly what you could not verify.
> - Commit finished work in small logical commits. Don't push.

---

## 1. Make the acts look much better (highest impact)

```
Goal: raise the visual quality of rendered acts in both house styles (Briefing and Drafting) so they read as
high-end motion design, not generic slides. This is the channel's biggest quality gap.

Context: acts are written by an LLM author (workflow/prompts/ACT.md + workflow/styles/<style>/ACT.md + STYLE.md)
using the kit (packages/kit/src/spy/ for Briefing, packages/kit/src/draft/ for Drafting, shared helpers in
packages/kit/src/paper/). A free Gemini critic reviews frames. VID03 has finished acts to study.

Do this:
1. Audit. Render contact frames of the existing acts in workspace/ (bun run frames). Compare them honestly with
   what STYLE.md promises. List the 10 most visible problems, ranked, each with a frame as evidence (composition,
   empty space, scale, rhythm, type, camera, transitions between acts, colour, motion that feels mechanical).
2. For each problem, decide where the fix belongs: a kit primitive, the style's ACT.md guidance, the director's
   plan, or the critic. Prefer fixes that raise the floor for every act over one-off patches.
3. Implement the top fixes. Keep the API easy for an LLM to use and document it in the style's README.
4. Prove it: re-render the same acts (or re-author one act per style 💲, after asking me) and show before/after
   frames side by side.

Deliverable: the ranked audit, the changes, before/after frames, and the problems you left for later.
(Include the "Shared rules" section of docs/FABLE_PROMPTS.md.)
```

## 2. Stronger director: story, pacing, visual variety

```
Goal: make the director's plan (workflow/prompts/DIRECTOR.md → 05-video/acts.json) produce acts with a clear
story arc, varied pacing and varied visual ideas, so a 9-minute video doesn't feel repetitive.

Do this:
1. Read DIRECTOR.md, both styles' STYLE.md, and the acts.json of finished videos in workspace/. Diagnose what
   repeats (same act shapes, same beats, same camera moves, flat energy) and where the plan loses the narration's
   story.
2. Rewrite DIRECTOR.md to fix that. Ideas to consider (your call): an energy curve across the video, rules
   against the same visual idea twice in a row, a "visual thesis" per chapter, explicit hand-offs between acts,
   moments of stillness. Keep it creative, not a checklist that boxes the LLM in.
3. Check the plan schema and validator still match the prompt, and add fields only when the act author will
   actually use them.
4. Evaluate: run `bun run direct` (💲, ask me first) on one test video with the old and new prompt and compare the
   two plans in a short written review.

Deliverable: new DIRECTOR.md, any schema changes, and the side-by-side comparison of the two plans.
(Include the "Shared rules" section of docs/FABLE_PROMPTS.md.)
```

## 3. Scripts that keep viewers watching

```
Goal: improve the script step (workflow/02-scripting: WRITER.md, write_script.ts, research.ts) so scripts are
better researched and hold attention. The channel's early videos lose viewers, and the script is the root of that.

Do this:
1. Read workflow/prompts/WRITER.md, workflow/02-scripting/voice.md and the scripts of the finished videos.
   Critique them like a senior YouTube script editor: the hook in the first 30 s, open loops, payoff timing,
   specificity, a clear stake for the viewer, how a 22-year-old would feel, and dead stretches.
2. Improve WRITER.md and the research step. Every factual claim must carry a source (URL + what it says). Claims
   without a source get flagged for my fact-check, never silently kept. Keep my input format: plain text with
   [] hints, which the LLM rewrites and I review at gate G1a.
3. Add a "retention pass": a second, cheaper review prompt that marks likely drop-off points and suggests cuts.
4. Test it on one draft (💲, ask me first) and show old vs new for the first 60 seconds.

Deliverable: updated prompts and code, an example output, and a list of what still needs a human.
(Include the "Shared rules" section of docs/FABLE_PROMPTS.md.)
```

## 4. Titles and thumbnails (packaging)

```
Goal: make the publish step (workflow/07-publish, prompts META.md, THUMBS.md, THUMBS_REVIEW.md) produce titles
and thumbnails that earn clicks. Packaging is the hardest part for me and is probably why views are low.

Do this:
1. Read workflow/07-publish/GUIDE.md and the prompts. Look at the thumbnails and titles of the published videos.
2. Critique them against what works for small finance and explainer channels: one idea per thumbnail, curiosity
   gap, readable at phone size, contrast, faces vs characters (we have Penny and the Agent), no clutter, title
   and thumbnail complementing each other rather than repeating.
3. Upgrade the prompts and the thumbnail rendering so the 3 A/B variants are genuinely different bets, not 3
   versions of one idea. Add a check that renders each thumbnail at real phone size and rejects unreadable ones.
4. Add an "idea first" mode: given a topic, propose 5 title + thumbnail concepts BEFORE the script is written,
   so I can pick a video whose packaging is strong.

Don't invent claims in titles. Everything must be backed by the script's sources.
Deliverable: new prompts and code, sample outputs for one finished video, and your reasoning.
(Include the "Shared rules" section of docs/FABLE_PROMPTS.md.)
```

## 5. Codebase health: split the dashboard server, add tests and CI

```
Goal: make the repo maintainable and ready to share code with a future second channel later. Don't build that
channel; just make the code easy to split.

Do this:
1. Map the architecture: which modules each pipeline step uses and where code is duplicated. Write a short
   docs/ARCHITECTURE.md (diagram + one paragraph per part).
2. workflow/dashboard/server.ts is about 150 KB in one file. Split it into route modules by feature without
   changing behaviour. Check by running the dashboard and clicking through every page (bun run dashboard).
3. There are only about 9 test files. Add tests where bugs would hurt most: script/act parity, timing and
   alignment, plan validation, FCPXML export, the audio mix timeline. Prefer small, fast tests.
4. Add a GitHub Actions workflow that runs typecheck + tests on push (no secrets, no paid steps, no rendering).
5. List the parts that are generic (voice, transcription, model routing, FCPXML delivery, dashboard shell) vs
   finance-channel specific, and propose (don't do yet) how they would become shared packages.

Deliverable: the refactor, tests, CI, ARCHITECTURE.md, and the proposal.
(Include the "Shared rules" section of docs/FABLE_PROMPTS.md.)
```

## 6. A visual critic that actually catches problems

```
Goal: make automatic review of rendered acts catch what a human would catch, so fewer bad acts reach me at
gate G2/G3.

Context: today a free Gemini critic looks at frames, and `bun run frames` prints a layout report (clipped, near
empty, subjects small). Other engines check clipped text, low contrast, title-safe areas, frozen frames and
loudness automatically.

Do this:
1. Read the critic and QC code (05-video/scripts/frames.ts, qc.ts, the critic prompt). Collect the act problems
   seen so far (git log, workflow/learning/) and check which ones the critic would have missed.
2. Add cheap deterministic checks first (contrast of impact text, title-safe area, text overlap, frozen or
   near-identical frames, a long hold with no motion, act-to-act seam jumps), then tighten the LLM critic's
   prompt with a scoring rubric tied to STYLE.md.
3. Output one tiled contact sheet per act with flagged frames marked, for both the critic and me.
4. Measure it on the existing acts: what it flags and how many false positives it raises.

Deliverable: the checks, the new critic prompt, a contact sheet example, and the measured results.
(Include the "Shared rules" section of docs/FABLE_PROMPTS.md.)
```

## 7. Sound design pass

```
Goal: make foley and the mix sound professional. SFX quality and variety are known weak points
(workflow/06-audio, assets/sfx manifests, 05-video cues).

Do this:
1. Read the audio pipeline (cues.ts, mix.ts/mix.py, master.ts, sfx manifests) and listen to the mix of a
   finished video by analysing it: loudness over time, SFX density per minute, repetition of the same sample,
   masking of the voice.
2. Fix the root causes: smarter cue choice (variation, round-robin, intensity matched to the visual hit), level
   and EQ rules so SFX sit under the voice, ducking, and a target of -14 LUFS integrated for YouTube with true
   peak at -1 dBTP or lower.
3. Keep the licence rules: Epidemic free tier never in a monetised mix, CC BY credits into credits.txt.

Deliverable: changes plus before/after numbers (loudness, repeats, density) for one video.
(Include the "Shared rules" section of docs/FABLE_PROMPTS.md.)
```

---

## Later (when there's data or a decision)
- **Analytics learning loop** (09-analytics): worth it only after about 10 published videos with real numbers.
- **Topic scout** (find outlier videos by YouTube niche → ideas and titles): needs a YouTube Data API key.
- **Documentary channel**: make one pilot by hand first, then extract shared libraries (prompt 5 prepares this).

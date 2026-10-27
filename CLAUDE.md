# CLAUDE.md — The Wealth Gap video engine

Automated 8–10 min finance explainers: original script → local Chatterbox voice → word-aligned captions → acts drawn
in the **Briefing** style (Remotion + canvas, `packages/kit/src/spy/`) → foley + mix (music added in post) → render → QC.

**To make a video, follow `VIDEO_PRODUCTION.md`** (steps, costs, gates, fixes). Dashboard: `bun run dashboard`.

## Layout
- `packages/kit/` (`@wealthgap/kit`): `spy/` is the Briefing engine (API in `spy/README.md`); `paper/` is the older
  Ledger engine; `archetypes/` and the older primitives belong to the scene-based style before that.
- `workflow/`: `styles/<style>/` (STYLE.md + ACT.md per house style), `prompts/DIRECTOR.md` + `prompts/ACT.md`,
  `03-voiceover`, `04-transcription`, `05-video/scripts`, `06-audio`, `dashboard/`.
- `workspace/<VIDEO>/` (gitignored): per-video audio, transcript, `05-video/acts.json`, act files
  `05-video/src/scenes/A01_*.tsx`, review frames, renders, `timings.json`.

## Rules for act code
1. Follow the plan's style (`acts.json` `style`, default `briefing`): `workflow/styles/<style>/STYLE.md` + `ACT.md`;
   draw only with that style's kit module and its ink sets.
2. Deterministic: everything is a function of `ctx.t`; no `Math.random`, `Date`, timers or state between frames.
3. Hits come from spoken words (`ctx.word(text, n)`) and are complete at the word's start.
4. Every act uses the style's act wrapper (`drawAct` + `focusCam` in Briefing) so acts flow into each other.
   No running subtitles in Briefing: impact text only; YouTube captions come from `bun run srt`.
5. Always render and look (`bun run frames`) before calling an act done. Never invent data; numbers come from the
   plan's sourced `data`.
6. Render with `--gl=angle` (the render scripts do); without it canvas rendering is ~30× slower.

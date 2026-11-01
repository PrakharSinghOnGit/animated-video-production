# CLAUDE.md — The Wealth Gap video engine

Automated 8–10 min finance explainers: original script → Gemini TTS voice (or local Qwen3-TTS clone, `--qwen`) → word-aligned captions → acts drawn
in a house style: **Briefing** (`packages/kit/src/spy/`) or **Drafting** (`packages/kit/src/draft/`, three inks + the Penny character, `brand-assets/mascot/`) (Remotion + canvas) → foley + mix (music added in post) → render → QC.

**To make a video, follow `VIDEO_PRODUCTION.md`** (steps, costs, gates, fixes). Dashboard: `bun run dashboard` (`dashboard:public` = password-protected internet access via Tailscale Funnel, `dashboard/public.ts`).

## Layout
- `packages/kit/` (`@wealthgap/kit`): `spy/` is the Briefing engine (API in `spy/README.md`); `draft/` the Drafting engine (API in `draft/README.md`, demo `bun run studio --style drafting`); `paper/{lib,engine,transitions,
  CanvasHost}` are the shared canvas helpers `spy/` imports; `main/` + `backgrounds/` feed the render template.
- `workflow/`: `styles/briefing/`, `styles/drafting/` (STYLE.md + ACT.md; pick per video with `direct --style`), `prompts/DIRECTOR.md` + `prompts/ACT.md`,
  `03-voiceover`, `04-transcription`, `05-video/scripts`, `06-audio`, `07-publish` (YouTube packaging: GUIDE.md + meta/thumbs/review/export),
  `08-shorts` (2–3 vertical shorts per video, style `styles/shorts/`), `09-analytics` (YouTube numbers → diagnosis → reviewer; lessons in `learning/`, appended to prompts by `loadPrompt` only after approval), `deliver/` (downloads + Final Cut Pro project), `dashboard/`, `lib/models.ts` (which model/provider runs each agent step;
  defaults in `workflow/models.json`). `bun run compact` frees a finished workspace.
- `workspace/<VIDEO>/` (gitignored): per-video audio, transcript, `05-video/acts.json`, act files
  `05-video/src/scenes/A01_*.tsx`, review frames, renders, `timings.json`; shorts in `shorts/S1/` (same layout, `--video <VIDEO>/shorts/S1`).

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

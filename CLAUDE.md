# CLAUDE.md — The Wealth Gap video engine

Automated 8–10 min finance explainers: original script → local Chatterbox voice → script-aligned captions → acts drawn in the **Ledger** style (Remotion + canvas) → music, foley, mix → render → QC.

## Layout
- `packages/kit/` (`@wealthgap/kit`): `paper/` is the Ledger drawing engine (canvas: desk, sheet, pencil, handwriting, cut-outs, halftone, stamps, camera, act transitions, captions). `archetypes/` and the older primitives belong to the previous scene-based style.
- `workflow/`: the engine. `styles/ledger/STYLE.md` (the look), `prompts/DIRECTOR.md` + `prompts/ACT.md` (agent briefs), `03-voiceover`, `04-transcription`, `05-video/scripts`, `06-audio`.
- `workspace/<VIDEO>/` (gitignored): per-video audio, transcript, `05-video/acts.json`, act files `05-video/src/scenes/A01_*.tsx`, review frames, renders, `timings.json`.

## Pipeline
| Step | Command | Who |
|---|---|---|
| Voice | `bun run tts --video <ID> --force --combine` (Chatterbox; `--pace 0.9`, `--exaggeration`, `--cfg`) | local |
| Align | `bun run transcribe --video <ID>` → `bun run audio:master --video <ID>` → `bun run captions --video <ID>` | local |
| Plan | `bun run direct --video <ID>` (acts.json + treatment; `--check` validates) | Opus |
| Draw | `bun run act --video <ID> [--act A03] [--parallel 2]` (author + fresh-context critic) | Opus + Sonnet |
| Review frames | `bun run frames --video <ID> --scene A01 --every 4 --words` | local |
| Sound | `bun run cues` → `bun run audio:music` → `bun run audio:mix` (all `--video <ID>`) | local |
| Render | `bun run draft` / `bun run render` then `bun run qc` (all `--video <ID>`) | local |
| Whole build | `bun run build --video <ID>` (gates after plan and draft) | |
| Time & cost | `bun run timings --video <ID>` | |

Python tools use the repo `.venv` (py3.11): `uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python -r workflow/03-voiceover/requirements.txt -r workflow/06-audio/requirements.txt`.

## Rules for act code
1. Follow `workflow/styles/ledger/STYLE.md`; draw only with `paper` from `@wealthgap/kit`; colours from `paper.P`.
2. Deterministic: everything is a function of `ctx.t`; no `Math.random`, `Date`, timers or state between frames.
3. Hits come from spoken words (`ctx.word(text, n)`) and are complete at the word's start.
4. Every act uses `actCamera` + `drawActStage` + `autoCaption` so acts flow into each other.
5. Always render and look (`bun run frames`) before calling an act done. Never invent data; numbers come from the plan's sourced `data`.

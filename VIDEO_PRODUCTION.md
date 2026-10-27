# Video production runbook (for agents)

You are producing one **8–10 min finance explainer** for the YouTube channel *The Wealth Gap*: an original script →
a local cloned voice → motion graphics drawn in code (Remotion + canvas) in the **Briefing** house style → sound
effects → render. The user writes a plain-text draft, approves the script, reviews at the gates, and adds music in post.
Everything else is this pipeline. Read this whole file before running anything.

## 0. Ground rules (non-negotiable)

- **Never invent facts, figures, sources or quotes.** On-screen numbers come only from the plan's sourced `data`.
  The director lists figures sourced only from the narration: tell the user they need a fact-check.
- **The script must be original** (own research and wording). Don't remake a competitor's transcript; VID02 was one,
  so it is a test bed only and must never be published.
- **Secrets:** never print, read or `source` `.env` (it holds API keys). Don't work around a permission denial.
- **Licences:** Epidemic Sound free-tier audio must never reach a monetised mix (only with `EPIDEMIC_COMMERCIAL=1`
  and a paid licence). CC BY sound effects need the credits from `06-audio/credits.txt` in the video description.
- **Money:** steps marked 💲 call Claude through `claude -p` and cost real money (amounts below). Don't re-run them
  speculatively; fix small things by editing the code yourself (cheap) instead of a paid fix round.
- **Gates:** stop and wait for the user at **G1a script approval** (only the user approves a script), **G1 plan**, **G2 first act**, **G3 draft**. Never author all acts before
  the user has approved the first one.
- **Cheap helper:** `agy` (Antigravity CLI, Gemini Flash, free) may do boring read-only work (the frame critic already
  uses it). Always use `--mode plan`; never give it a decision or a write.
- **Git:** `workspace/VID*` is gitignored on purpose. Commit pipeline changes only when the user asks.

## 1. Where things live

| Path | What |
|---|---|
| `workspace/<ID>/` | one video: `02-scripting/script_raw.md`, `03-voiceover/`, `04-transcription/`, `05-video/` (acts.json, act files `src/scenes/A01_*.tsx`, `review/<act>/` frames), `06-audio/`, `07-assembly/export/` (.srt), `timings.json` |
| `workflow/styles/briefing/` | the house style: `STYLE.md` (the look, sound, camera) + `ACT.md` (engine contract for act authors) |
| `workflow/prompts/` | `DIRECTOR.md` (plans acts), `ACT.md` (authors one act); both take `{{STYLE}}` |
| `packages/kit/src/spy/` | the Briefing drawing engine (`README.md` = API); `paper/` = shared canvas helpers it imports |
| `workflow/05-video/scripts/` | pipeline commands (see `package.json` scripts) |
| `workflow/06-audio/` | mastering, procedural music/foley, mix |
| `workflow/dashboard/` | local dashboard (`bun run dashboard`) |

## 2. Setup check (once per machine)

`bun install`; Python tools use the repo `.venv` (py3.11):
`uv venv --python 3.11 .venv && uv pip install --python .venv/bin/python -r workflow/03-voiceover/requirements.txt -r workflow/06-audio/requirements.txt`.
`ffmpeg`, `claude` (Claude Code CLI) and optionally `agy` must be on PATH.

## 3. The run

Times and costs are measured on VID02 (10:25 of narration, Apple-silicon Mac). Every step records itself in
`workspace/<ID>/timings.json`; `bun run timings --video <ID>` prints the table (the user wants it reported).

### Step 1: Workspace + script 💲 (~5 min, ~$1–2, Opus writer) → **G1a script approval**
1. `bun run new-video <ID>` with an ID like `VID03_Short_Topic_Name` (or the dashboard's "Create workspace").
2. The user writes their draft in **plain text** in `workspace/<ID>/02-scripting/idea.md`. Anything in
   `[square brackets]` is an instruction to the writer, never narration.
3. `bun run write --video <ID> [--model opus|sonnet] [--minutes 9]` → `script_raw.md` (chunked into
   `### Part`/`### CHAPTER n: Title` sections and `**VO:**` beats, plus a `**[ON SCREEN]:**` hint per beat)
   and `script_notes.md` (5 hooks scored with `workflow/02-scripting/yt-script/hookscore.py`, numbers to verify,
   changes, questions, runtime). Brief: `workflow/prompts/WRITER.md`; channel voice:
   `workflow/02-scripting/voice.md` (keep it current with the user).
4. **G1a:** the user reviews. Small changes: they edit `script_raw.md` directly. Bigger ones: they write
   `02-scripting/feedback.md` and you run `bun run write` again (it revises when feedback is newer).
5. `bun run write --video <ID> --approve` (only when the user says so) → `approved.json` (hash of the script).
   `tts:format` refuses an unapproved or since-edited script (`--unapproved` overrides; don't use it unasked).
6. `bun run tts:format --video <ID>` → `03-voiceover/sections/`.
   Older videos without `idea.md` (VID01, VID02) skip the approval gate.

### Step 2: Voice (local Chatterbox, ~5 min per minute of audio, free)
`bun run tts --video <ID> --force --combine` (≈50 min for 10 min of audio). Tuning: `--pace 0.9` (slower),
`--exaggeration`, `--cfg`. Ask the user to listen to a few `03-voiceover/audio/part-*/` files if anything looks off.

### Step 3: Align (~3 min, free)
`bun run transcribe --video <ID>` → `bun run audio:master --video <ID>` → `bun run captions --video <ID>`
→ `bun run srt --video <ID>` (YouTube closed captions in `07-assembly/export/<ID>.srt`; the video itself shows
no running subtitles).

### Step 4: Plan 💲 (~6 min, ~$1.5, Opus) → **G1**
`bun run direct --video <ID>` (style defaults to `briefing`; `--style <name>` picks another folder in
`workflow/styles/`). Writes `05-video/acts.json`: ~10 acts of 40–90 s, each with beats, BPM, data, chapter.
Show the user the act list (the command prints it) and the unverified figures. Wait for approval.

### Step 5: Acts 💲 (~17 min, ~$3 per act, Opus author + free Gemini critic) → **G2 after A01**
1. `bun run act --video <ID> --act A01`, then look: `bun run frames --video <ID> --scene A01 --every 4 --words`
   and Read `05-video/review/A01/sheet.jpg`.
2. `bun run preview --video <ID> --act A01` → `review/A01/preview.mp4` (the act with voice + foley, GPU render).
3. **Sync review** (free by default): `bun run review --video <ID> --act A01 [--agent agy|haiku|sonnet|opus]
   [--give transcript,plan,script,code] [--every 2] [--focus "..."] [--to-notes]`. It renders frames every N s + at
   hit words and gives the agent the act's word-aligned narration, so it can say "X appears 6 s before it is
   spoken". Findings: `review/A01/reviews/*.json|md`; `--to-notes` appends them to `director_notes.md`.
4. Show the user the preview (dashboard: Acts → the act) and wait for notes. They collect notes in
   `review/<act>/director_notes.md` (the dashboard has "Add note at current time" on the preview).
5. Small fixes: edit the act file yourself, re-run `frames`/`preview`, look again (see §5).
   Big rework: `bun run act --video <ID> --act A01 --fix workspace/<ID>/05-video/review/A01/director_notes.md`
   (resumes the author's session: **expensive**, $5–11; the usage page shows fix rounds are the biggest cost).
6. After approval: `bun run act --video <ID> --act A02,A03,... --parallel 2`. Run the free review on every act and
   fix obvious problems cheaply before showing the user.
7. The act holding the subscribe line ends with the brand end card (`brandEndCard`, see the style's ACT.md). The
   logo appears nowhere else.

### Step 6: Sound (~2 min, free)
`bun run cues --video <ID>` (foley events from the acts + music cue plan) → `bun run audio:music --video <ID>`
(procedural spy-jazz bed as a **separate stem**, `06-audio/music.wav`) → `bun run audio:mix --video <ID>`
(voice + foley only, −14 LUFS; the user adds music in post; `--with-music` includes the bed).

### Step 7: Render → **G3** (~2–4 min draft, free)
`bun run assemble --video <ID>` → `bun run draft --video <ID>` → user watches `05-video/draft.mp4` →
`bun run render --video <ID>` → `bun run qc --video <ID>` (hard fails on placeholders, loudness, duration).
Hand over: the final mp4, the `.srt`, `06-audio/music.wav` (stem), `06-audio/credits.txt`, the timings table.

`bun run build --video <ID>` chains steps 3–7 with confirmation prompts at the gates; use it once the act
pipeline needs no hand-holding.

## Dashboard
`bun run dashboard` → http://127.0.0.1:4600. Every step above with all its options as form controls, live logs,
duration/CPU/memory/GPU per run (history in `workspace/<ID>/dashboard_runs.json`), players for every audio/video
output, script editing and approval, per-act preview + reviews + notes, a Claude usage page (tokens from Claude
Code's session logs, pipeline costs from `timings.json`) and a machine page. Prefer telling the user to use it for
reviews; you can run the same commands from the CLI.

## 4. Preview one act with sound (manual)
```bash
cd workflow/05-video
bunx remotion render ../../workspace/<ID>/05-video/src/index.ts A01 /tmp/A01.mp4 \
  --public-dir ../../workspace/<ID> --concurrency 6 --gl=angle
# then mux the act's window of 06-audio/mix.wav (act start/end from acts.json) with ffmpeg
```
Always pass `--gl=angle` (GPU canvas): without it a 44 s act took 15 min instead of 25 s.
Interactive: `bun run studio --video <ID>` (Remotion Studio, scrub every act), or the dashboard.

## 5. Fixing act problems (cheap, by hand)
- **Camera pulls wide unexpectedly:** `focusCam` merges two actions into one union frame when the gap between
  `t1 + hold` (0.6 s) and the next `t0` is shorter than a camera move (1.1–2.8 s). Shorten the earlier `t1` or start
  the later action later.
- **Something peeks out under a full-frame ground:** the camera frame is 16:9 and bigger than the region rect; make
  the covering piece extend well past the region.
- **Layout report flags** (`frames` prints them): "clipped at the top/left/right edge" during a camera move is
  usually fine; on a held frame it is a bug. "near-empty" and "subjects small" are always worth fixing.
- After editing an act's `events`, re-run `bun run cues` and `bun run audio:mix`.

## 6. Style in one paragraph
Briefing = 60s spy title sequence (Saul Bass) look + screen-recorder camera. Four flat inks per chapter, scissor-cut
paper pieces with cut gaps and small shadows, League Gothic cut type for numbers, silhouette puppets on twos. Money is
the warm colour on a black keyline. The camera follows the action and never leaves unfinished work; whip-pans between
acts, iris/strip wipes at chapters, no dissolves. **No running subtitles**: only impact text (the figure, the term,
the name) cut into the set. Full details: `workflow/styles/briefing/STYLE.md`.

## 7. Known limits
- One puppet rig (`figureSide`); identity comes from props and accent colour.
- `drawTitle` is A–Z only; `layout`/`drawLine` handle digits and symbols.
- The director/act agents can only use what the engine draws; no stock footage or real logos.
- Voice generation is the slowest step; run it overnight for long scripts.

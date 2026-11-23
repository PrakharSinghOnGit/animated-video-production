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
- **Gates:** stop and wait for the user at **G1a script approval** (only the user approves a script), **G1 plan**, **G2 first act**, **G3 draft**, **G4 publish packages**, and for shorts **SG1 short scripts** and **SG2 short drafts**. Never author all acts before
  the user has approved the first one.
- **Cheap helper:** `agy` (Antigravity CLI, Gemini Flash, free) may do boring read-only work (the frame critic already
  uses it). When you call it yourself, use `--mode plan`; never give it a decision or a write. (Pipeline steps can
  run on agy when the user picks it in Settings → Agent models: write steps then run in accept-edits mode.)
- **Git:** `workspace/VID*` is gitignored on purpose. Commit pipeline changes only when the user asks.

## 1. Where things live

| Path | What |
|---|---|
| `workspace/<ID>/` | one video: `02-scripting/script_raw.md`, `03-voiceover/`, `04-transcription/`, `05-video/` (acts.json, act files `src/scenes/A01_*.tsx`, `review/<act>/` frames), `06-audio/`, `07-assembly/export/` (.srt), `07-publish/` (metadata, thumbnails, review, export), `timings.json` |
| `workflow/styles/briefing/` | the house style: `STYLE.md` (the look, sound, camera) + `ACT.md` (engine contract for act authors) |
| `workflow/prompts/` | `DIRECTOR.md` (plans acts), `ACT.md` (authors one act); both take `{{STYLE}}` |
| `packages/kit/src/spy/` | the Briefing drawing engine (`README.md` = API); `paper/` = shared canvas helpers it imports |
| `workflow/05-video/scripts/` | pipeline commands (see `package.json` scripts) |
| `workflow/06-audio/` | mastering, procedural music/foley, mix |
| `workflow/07-publish/` | YouTube packaging: `GUIDE.md`, meta/thumbs/review/export scripts, thumbnail template |
| `workflow/08-shorts/` | shorts: writer, stage runner, export (`lib.ts` header = the folder layout) |
| `workspace/<ID>/shorts/S1/` | one short: a nested workspace with the same layout as a video, plus `config.json` (format short, 1080x1920) |
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
   No name needed: `bun run new-video VID` (or the dashboard with the name left empty) creates `VID07_Untitled`. The
   dashboard names it (role `projectName`, Haiku, ~$0.003) when a job finishes and the idea or script exists; from
   the terminal, `bun run rename --video VID07_Untitled [--name Sticky_Prices]`. The number never changes.
2. The user writes their draft in **plain text** in `workspace/<ID>/02-scripting/idea.md`. Anything in
   `[square brackets]` is an instruction to the writer, never narration.
   Optional, free: `bun run research --video <ID> [--focus "..."] [--max 8]` (dashboard: Script → Web research; a shorts
   project: Shorts → Brief). The researcher (role `researcher`, agy by default, web search only, no shell commands) picks
   the idea's claims and missing figures, searches each one, and returns facts with a link and a quoted sentence plus a
   check of the idea's claims; then the program opens every page and marks a fact ✓ only if the sentence is there
   (`--verify` re-checks). `02-scripting/research.md` is editable; the writer, the director and the shorts writer use
   its ✓ facts as sources (a shorts project's number check also allows them).
3. `bun run write --video <ID> [--model opus|sonnet] [--minutes 9]` → `script_raw.md` (chunked into
   `### Part`/`### CHAPTER n: Title` sections and `**VO:**` beats, plus a `**[ON SCREEN]:**` hint per beat)
   and `script_notes.md` (5 hooks scored with `workflow/02-scripting/yt-script/hookscore.py`, numbers to verify,
   changes, questions, runtime). Brief: `workflow/prompts/WRITER.md`; channel voice:
   `workflow/02-scripting/voice.md` (keep it current with the user).
   It also writes `claims.json` (every factual claim with its source), and the program then builds
   **`factcheck.md`**: a claim counts as sourced only with a ✓ research page or a link from the user's draft; the rest
   is listed as "needs your fact-check", with any figure the writer said but did not declare. The command prints that
   list and free retention statistics (stretches without "you", a figure or a question). Show both to the user.
   Free: `bun run research --video <ID> --claims` searches a source for each unchecked claim;
   `bun run write --video <ID> --check` rebuilds the sheet after hand edits.
   Optional 💲 (small, Sonnet): `bun run retention --video <ID>` → `retention.md`, a second reviewer that marks likely
   drop-off points and suggests cuts; it changes nothing. `--to-feedback` copies its suggestions into `feedback.md`.
4. **G1a:** the user reviews (script, `factcheck.md`, `retention.md`). Small changes: they edit `script_raw.md` directly. Bigger ones: they write
   `02-scripting/feedback.md` and you run `bun run write` again (it revises when feedback is newer).
5. `bun run write --video <ID> --approve` (only when the user says so) → `approved.json` (hash of the script).
   `tts:format` refuses an unapproved or since-edited script (`--unapproved` overrides; don't use it unasked).
6. `bun run tts:format --video <ID>` → `03-voiceover/sections/`.
   Older videos without `idea.md` (VID01, VID02) skip the approval gate.

### Step 2: Voice (Gemini TTS by default, ~3–6 min, free tier or ~$0.15)
`bun run tts --video <ID> --force --combine`. Default engine: Gemini TTS (`gemini-3.8-flash-tts`, voice `--voice`,
default Algenib; `--parallel` requests at once, default 4; ~2–4 min per video with billing; the free tier is 10
requests/day per model, too few for a video; key `GEMINI_TTS` = an AI Studio key, free tier; else Vertex AI via gcloud ADC, paid, and 3.8 there
ignores style). `--qwen` (or `TTS_ENGINE=qwen` in `.env`) uses the local Qwen3-TTS clone of the channel voice.

How it is read (both engines), so it sounds performed, not stitched:
- **Whole blocks per call:** each `**VO:**` beat is one call (long ones split into passages of whole sentences), so
  the model phrases the sentences together and places its own pauses and breaths. Only passages are joined
  (`--sentence-gap`, default 0.45 s); sections get `--section-gap`, chapters a title-card pause.
- **Direction:** Gemini gets a short channel style (`--style`; Google warns long directions make the voice drift) plus
  the beat's `[VO: tone]` note. The script carries delivery marks (WRITER.md): CAPS on the stressed word, `...` for a
  beat, `—` for an aside, `!`/`?`, and rare inline tags (`<short pause>`, `<breath>`, `<sigh>`, `<chuckle>`,
  `<whispers>`). Gemini gets all of them verbatim; Qwen gets tags stripped; captions and alignment never show tags.
  Qwen keys its mood clips on the tone note instead (`src/mood.ts`).
- **Takes:** the first take that ASR finds correct (WER ≤ `--accept-wer`, default 0.08) at a sane speed is kept;
  takes are not ranked for "cleanest", which favoured flat reads. Edges keep 150 ms (breaths stay). Loudness is set
  once per section, not per sentence.
Ask the user to listen to a few `03-voiceover/audio/part-*/` files if anything looks off.

Qwen only: one reference clip and one pinned speaker embedding (`voices/ACTIVE`); seeded takes; a take whose speaker
similarity is below 0.95 loses. Mood clips: `bun run voice:emotions --name <slug>`; `--no-moods` turns them off.
Voices: `bun run voice:design --name <slug> --describe "..."` → `--pick <n>` → `bun run voice:use <slug>`;
`bun run voice:list`; `--voice-profile <slug>` for one run. `bun run voice:design:gemini` makes a designed Gemini voice (key only).

### Step 3: Align (~3 min, free)
First `bun run tts:post --video <ID> [--speed 1.08] [--gap 0.6] [--chapter-gap 2.5]` (dashboard: Align → Speed & gaps):
tempo of the whole voiceover with rubberband's fine engine (pitch unchanged), the silence between sections and before
chapters, then `audio/combined/full_voiceover.wav`. It always starts from the untouched TTS output (`audio/raw/`), so
re-running with other settings never stacks; settings left out reuse the last run's (`audio/post.json`). Files left
over from an older script version are moved to `audio/stale/`. Then
`bun run transcribe --video <ID>` → `bun run audio:master --video <ID>` → `bun run captions --video <ID>`
→ `bun run srt --video <ID>` (YouTube closed captions in `07-assembly/export/<ID>.srt`; the video itself shows
no running subtitles).

**Pauses for the picture** (dashboard: Align → Pauses for the picture). When an act needs more time than the narration
gives, the voice waits: `03-voiceover/holds.json` lists pauses (after a word, or after a script block). The director asks
for them in the plan (`acts[].holds`), act authors in `05-video/review/<ACT>/holds.json`, you in the dashboard; `bun run
voice:holds --video <ID> --import` collects requests. A pause only goes at a true pause point: a sentence/phrase end or
around a joining word (and, but, so), and only where the take is silent (`--scan` checks the waveform: no breath, no word
tail; the gap is filled with the take's own floor). Apply = Align all (merge with pauses → transcribe → master →
captions → `voice:holds --shift-plan`, which moves the plan's act/beat times by the pauses and keeps your approval).

### Step 4: Plan 💲 (~6 min, ~$1.5, Opus) → **G1**
`bun run direct --video <ID>` (style defaults to `briefing`, or `WG_STYLE`; `--style drafting` or another folder in
`workflow/styles/`; the dashboard's Plan step has a House style picker). Writes `05-video/acts.json`: ~10 acts of 40–90 s, each with beats, BPM, data, chapter.
The plan also carries the film's shape for the act authors (who each see one act): the story spine, an energy curve
(`intensity`), a `cast` that returns across acts, and each act's `rhythm` and last image (`endsOn`). After the check
passes, the command prints free **variety notes** (flat energy, every act at one speed, a native move used as the
signature of two acts, acts that open or arrive the same way): advisory, but worth a re-run or a hand edit when there
are several.
Show the user the act list (the command prints it), the variety notes and the unverified figures. Wait for approval.

### Step 5: Acts 💲 (~17 min, ~$3 per act, Opus author + free Gemini critic) → **G2 after A01**
1. `bun run act --video <ID> --act A01`, then look: `bun run frames --video <ID> --scene A01 --every 4 --words`
   and Read `05-video/review/A01/sheet.jpg` (flagged stills outlined in red) and the motion grids `grid_*.jpg`
   (12 frames 0.5 s apart per image, the spoken words under each tile). `frames` renders the whole act every 0.1 s in
   parallel (~20 s for a 40 s act) and runs free deterministic checks on it (`checks.json`: pop-ins/outs, blanks, freezes,
   hard cuts, clipped/overlapping/low-contrast text, late hits, an unsettled ending, seam flags). The critic
   (`workflow/prompts/CRITIC.md` + `workflow/styles/<style>/RUBRIC.md`) scores the grids against the rubric and marks
   each finding real or false; `blank` and `text-clipped` findings go straight back to the author without a critic call.
2. `bun run preview --video <ID> --act A01` → `review/A01/preview.mp4` (the act's own piece of the video with voice + foley: its slice of the Main composition, transitions included, so it is exactly what the final shows; at `--scale 1`, the default, the draft and final reuse it, and an unchanged act is not rendered again; `--force` redoes it).
3. **Sync review** (free by default): `bun run review --video <ID> --act A01 [--agent agy|haiku|sonnet|opus]
   [--give transcript,plan,script,code] [--every 2] [--focus "..."] [--to-notes]`. It renders the act densely (motion grids + measured
   findings, as `frames`) and gives the agent the act's word-aligned narration, so it can say "X appears 6 s before it is
   spoken". Findings: `review/A01/reviews/*.json|md`; `--to-notes` appends them to `director_notes.md`.
4. Show the user the preview (dashboard: Acts → the act) and wait for notes. They collect notes in
   `review/<act>/director_notes.md` (the dashboard has "Add note at current time" on the preview).
5. Small fixes: edit the act file yourself, re-run `frames`/`preview`, look again (see §5).
   Big rework: `bun run act --video <ID> --act A01 --fix workspace/<ID>/05-video/review/A01/director_notes.md`
   (a fresh session: the brief + plan + timed narration, then it reads the act file, makes targeted edits and checks
   only the changed times; collect every note on an act into one round). With notes the critic is skipped.
   `--resume` continues the author's own session instead: **dearer** (it re-reads the whole history every turn and
   re-caches it after a break; measured ~$5 per fix vs ~$3.7 to write the act) and only under the profile that wrote
   it. A fix that runs out of turns keeps its edits (📝: render frames and look); a fix that edits acts.json (an act
   boundary a note asked for) keeps it only if the plan still validates.
6. After approval: `bun run act --video <ID> --act A02,A03,... --parallel 2` (no `--act` = every act that has no file
   yet or whose plan changed since it was written). Result marks: ✅ written, 📝 written + critic notes to look at,
   ❌ not written (only ❌ fails the run). Run the free review on every act and fix obvious problems cheaply before
   showing the user. No paid fix round runs by itself: the critic's notes (`review/<act>/critic_1.json`) and layout
   flags are saved and the user decides per act (step 5). `--auto-fix` brings back one automatic round on layout
   flags (`--strict`: also on a failed critic); on VID06 it cost ~$4–6 per act and did not raise the critic's score.
   **Overnight:** `--wait` starts an act only when it fits in Claude's 5-hour window and otherwise sleeps until the reset
   (notification, `05-video/.autopilot_wait.json`), then goes on; an act cut off by a limit anyway is continued after
   the reset. Usage comes from Claude Code's own `rate_limit_event` (recorded from every agent run, else a one-word Haiku
   probe), what one act uses is learned per model (`~/.claude/wealthgap/act_usage.json`, first guess 22%): `workflow/lib/usage.ts`.
   A new plan can reuse act IDs for different acts: the director (and the act author) move the old plan's scene
   files to `05-video/old_scenes/<time>/`, and an act whose plan entry changed shows as stale and is redone.
7. The act holding the subscribe line ends with the brand end card (`brandEndCard`, see the style's ACT.md). The
   logo appears nowhere else.

### Step 6: Sound (~2 min, free)
`bun run cues --video <ID>` (SFX events from the acts + the automatic score: transitions on act changes, swell + boom into
chapters, riser → silence → hit on the plan's silences; clutter thinned; plus the music cue plan) → `bun run audio:music --video <ID>`
(procedural spy-jazz bed as a **separate stem**, `06-audio/music.wav`) → `bun run audio:mix --video <ID>`
(voice + SFX only, −14 LUFS / ≤ −1 dBTP; the user adds music in post; `--with-music` includes the bed) → optional
`bun run audio:report --video <ID>` (loudness, SFX density, repeats, masking). SFX types and the library:
`workflow/06-audio/README.md`; to add sounds you found, `bun run sfx:import`.
To retime or regain foley clips and add music by hand, use the Final Cut Pro project (`bun run deliver`, see `workflow/deliver/`).

### Step 7: Render → **G3** (~2–4 min draft, free)
`bun run assemble --video <ID>` → `bun run seams --video <ID>` (plans every act-to-act transition with one owner and the neighbours' real frames, then renders a ~3 s clip and 12 frames per cut and a free frame check for flicker, jumps and empty screens: `05-video/review/seams/`, dashboard Render → Seams. **You watch each clip and mark it fine or not fine** with a note and the side to fix (`review/seams/marks.json`; a mark made before the acts changed shows as out of date); **Fix marked** (`seams --fix-marked`) runs one fresh fix round per not-fine cut with your note, then re-renders its clip. One cut: `seams --fix A03-A04 [--notes ..] [--side a|b|both]`; re-render one clip: `--only A03-A04`. The AI review is opt-in (`--review`, slow: agy one at a time). The draft/final chains only run `seams --plan-only` (seconds), which the render needs. Unchanged seams keep their frames and clip, `--force` redoes all) → `bun run draft --video <ID>` → user watches `05-video/draft.mp4` →
`bun run render --video <ID>` → `bun run qc --video <ID>` (hard fails on placeholders, loudness, duration).
**Renders are per act** (`workflow/05-video/src/lib/chunks.ts`): draft, final and act previews render each act's slice of
Main into `05-video/chunks/s<scale>/<ACT>.mp4` and join them without re-encoding (bit-exact, frame count checked); then
the mix, grain and upscale go on in one pass as before. An act is reused while its key holds: its file, its timeline
entry (words, seams, music) and frame range, the template, public assets, the kit's source, the render scale, and the
probe keys of the neighbour frames its transitions show (`seams.json probeKeys`). So a changed act re-renders itself,
plus a neighbour whose transition shows it (after the seams re-probe); a kit or template change, or a voice change that
moves the timing, re-renders every act it moves. Full size (`s1`, crf 16) is shared by previews, a scale-1 draft and the final.
**Render acts** (`draft --acts-only`, dashboard Render → Act pieces) renders only the out-of-date acts and stops: no
join. The Act pieces timeline plays the pieces back to back with the sound mix (one segment per act: rendered / out of
date / not rendered; a marker at every cut with its transition and your seam mark). **Stitch draft** joins them into
draft.mp4 only when you want one file; the final stitches by itself. **Final Cut Pro** (`bun run fcp`): when every
act's full-size piece is current, the project has one picture clip per act (each sound and act marker hangs on the act
it starts in; the pieces have no grain, add it in FCP), else the one picture from final.mp4.
Hand over: the final mp4, the `.srt`, `06-audio/music.wav` (stem), `06-audio/credits.txt`, the timings table.

`bun run build --video <ID>` chains steps 3–7 (Publish is separate) with confirmation prompts at the gates; use it once the act
pipeline needs no hand-holding.

### Step 8: Publish 💲 (~10 min, ~$2–4 with Sonnet) → **G4 packages**
YouTube Test & Compare runs up to 3 packages (thumbnail + title); the winner is chosen by watch-time share. This step makes
three **packages A/B/C that are three different bets**. The rules (thumbnail, title, description, A/B, the critic checklist,
what the first videos taught) are in `workflow/07-publish/GUIDE.md`; every prompt reads it. Needs a rendered video (the
duration badge and chapters use it).
1. `bun run meta --video <ID> [--model sonnet|opus|haiku] [--notes] [--force]` → `07-publish/metadata.json` + `description.txt`:
   the video's one-sentence promise, then per package a title, its **lever** (stake, villain, myth, number, question: three
   packages, three levers), the thumbnail's **four axes** (subject, emotion, text, composition), the words on the image, the
   designer's brief and a **proof** (the script sentence that pays the title off); plus the upload order, the description
   opening, tags, 3 hashtags. The model is shown the channel's earlier packages with their click rates.
   **Computed in code, not by the model:** chapters (from `chapters.json`), sources, credits, the disclaimer, and the checks:
   title <= 100 (warn past 60), no get-rich wording, **no number that is not in the plan's `data`**, three different levers,
   every pair of thumbnails 2+ axes apart, no two titles sharing 60% of their words, thumbnail words that do not repeat the
   title, and each proof found word for word in the script (a payoff after 2:00 is flagged). One fix round on errors.
   `--notes` revises with `notes/meta.md`; metadata you edited in the dashboard is kept unless `--force`.
2. `bun run thumbs --video <ID> [--variant A|B|C] [--notes] [--model sonnet|opus] [--force]`: an author agent draws the three
   packages' thumbnails as 1920x1080 stills in the video's style (`workflow/prompts/THUMBS.md` + `workflow/styles/<style>/THUMB.md`;
   only Briefing has one so far), keeping each package's axes, renders them, **looks at its own renders at 168 px** and fixes. Files:
   `07-publish/remotion/thumbs/A.tsx` -> `thumbnails/A.png` (a `.jpg` when a PNG would pass 2 MB), `thumbnails/phone/A_168.png` and
   `A_120.png` (the real phone sizes), `preview.png`, `preview_small.png` (320 px, list rows at 168 px, 120 px, feed card),
   `thumbnails.json` (concept, text, numbers, axes), `thumbnails.checks.json`.
   `bun run thumbs:render --video <ID> [--variant A] [--no-preview]` re-renders from the TSX for free (use it after a hand edit).
   **Every render runs the free checks, and an error rejects the variant** (exit 1; the dashboard will not approve):
   - **phone check** (`phone.ts`): the 168 px image is measured and its words are read back by the macOS text recogniser
     (compiled once from `ocr.swift`; skipped with a warning elsewhere). Rejected: words not read back, more than 42% of the
     drawing's edges gone, tone range under 30 L*, no edge on a white or dark page. Warned: small largest shape, many shapes,
     something under the duration badge, words unread at 120 px. Thresholds and their calibration are in `phone.ts`.
   - **three bets** (`lib.ts` `checkBets`): every pair 2+ axes apart, never the same words on two variants; plus a warning for
     a word already on another video's thumbnail and for a drawing that left its package's axes.
   - size, word count (<= 3), sourced numbers, title overlap.
   `thumbs --variant A --notes` sends the failed checks to the author together with your notes (no notes needed).
3. `bun run thumbs:review --video <ID> [--agent haiku|sonnet|opus|agy] [--to-notes] [--no-blind]` (~$0.2–0.5), two passes:
   a **blind read** (role `stranger`, Haiku: sees only the 168 px images, says what it reads and sees; unread words or an
   unnameable picture reject the variant, `phone.blind.json`), then the critic (role `thumbsReview`, Sonnet): would a stranger
   click, are these three bets, legibility, focal, text, pairing, truth, and the upload order -> `review.md`.
   `--to-notes` appends the findings to `notes/<V>.md`.
4. **G4**: in the dashboard (Publish): see the packages (promise, bet, axes, proof, upload order), edit titles and description,
   write notes per variant, **Fix with notes**, **Approve** (blocked while any check has an error). The approval is a hash of
   the three images and the metadata: any later change makes it stale. Check the facts first: figures from the narration alone are flagged.
5. `bun run publish:export --video <ID>` -> `07-publish/export/`: thumb_A/B/C, titles.txt ("A: ..." and the upload order),
   description.txt, tags.txt, the .srt. Upload the strongest package first (an inconclusive test keeps the first one) and do
   not edit them while the test runs.
Dashboard "Publish all" = meta, thumbs, review.

**vidIQ (optional, vidIQ credits, never blocking).** One-time `bun run vidiq:login` (browser sign-in on the Mac; pick the
account with the credits; `vidiq:status` shows account + balance). Then, only when you start it:
`bun run vidiq --video <ID> --titles [--no-suggest]` scores A/B/C (5 credits each) + 3 suggestions (5) and
`bun run vidiq --video <ID> --thumb A|B|C|all` makes an AI thumbnail per variant (22 each, ~2 min) styled on our three
renders → `07-publish/vidiq.json` + `07-publish/vidiq/`. Your packages are not changed; suggestions and AI thumbnails skip our
checks, so read them before using one. Not connected or too few credits → "vidIQ skipped" and nothing else happens.
Dashboard: Packaging → vidIQ block. The writer also reads vidIQ's free script advice (`02-scripting/vidiq_guidance.md`)
when connected (`--no-vidiq` turns it off).

### Step 9: Shorts 💲 (~$3–5 per short) → **SG1 scripts**, **SG2 drafts**
2–3 standalone 9:16 shorts (60 s by default; up to 3 min with `--length 90|120|160|180`, dashboard "Max length") per video: a fact, a myth, a teaser, a quick math or a story cut from the video, each
with its own script, voice and one-act vertical animation, so the shorts bring views and point at the long video. A short is
a nested workspace `workspace/<ID>/shorts/S1/`; every command above runs on it with `--video <ID>/shorts/S1`.
Style: `workflow/styles/shorts/` (Briefing re-staged for 9:16: hook on frame 1, faster tempo, kinetic captions via
`shortCaption`, a loop ending, no end card). Kit: the canvas follows the composition size (1080x1920), `SAFE` becomes
the Shorts safe area (x 64..930, y 220..1440: YouTube's buttons and title overlay cover the rest).

**Shorts projects (no long video):** for news, a market move or anything not worth a full video, create `SH<n>_<Name>`
(dashboard: + New project → Shorts; CLI `bun run new-video SH01_Fed_Cut`). It has only Overview and Shorts. Write the brief in
`02-scripting/idea.md` (what happened, the angle, every fact with its source); `shorts:write` writes from it instead of a long
script, and the number check allows only numbers in the brief. `--count 1` for one short; `--series` (both kinds) makes the set
Parts 1..N of one story (each ends on the question the next answers; Add short then writes the next part). Everything after
the script is the same pipeline below.
1. `bun run shorts:write --video <ID> [--count 3] [--model opus|sonnet]` (~$0.5–1.5) → `shorts/shorts.json` + `S<n>/02-scripting/
   script_raw.md` + `short.json` (kind, title, hook, payoff, loop, data, description, hashtags, checks). Checked in code: 70–140
   spoken words per 60 s of the short's limit (140 for 60 s, 373 for 2:40, 420 for 3 min; the limit is the short's config.json `maxS`, used by the director, the act check and QC too; a longer script within 3 min raises it to the next length that fits, with a warning), **every number in the long video's sourced plan** (narration-only figures flagged), no get-rich wording,
   3 hashtags with #Shorts. Needs the long video's `acts.json` for the figures.
2. **SG1:** the user reads each script (edit + `--check`, or `S2/02-scripting/feedback.md` + `--short S2` to revise one, or
   `shorts/feedback.md` + `--force` to redo all), then `bun run shorts:write --video <ID> --approve S1|all` (only the user decides).
3. `bun run shorts --video <ID> --short S1|all` runs voice → align → beat (optional: the track the short is cut to, `--beat-track assets/music/<mood>/x.mp3 [--beat-start s | --beat-auto]` or `bun run music:beat`; its beats, bars and accents reach the plan and the act as `ctx.music`, and Sound mixes the same track; dashboard: the short's Music & beat stage) → plan (Sonnet, one act, ~$0.3) → act (Opus, ~$2–4) → sound →
   draft, then stops. Voice is quicker than the long video (pace 1.0, short gaps); `--tts "..."` passes extra voice flags,
   `--from/--to/--step <stage>` run part of it. Unlike the long video, the short's mix **includes music**: the procedural spy
   bed (100 bpm, our own, no claims) about 14 LU under the voice. `--no-music` leaves it out (to add a sound in the YouTube
   app); to use a downloaded track, set the short's `06-audio/music.json` source to
   `{"type":"file","path":"assets/music/shorts/x.mp3","credit":"…"}` (`"attribution":false` if none is needed) and rerun `--step sound`.
4. **SG2:** the user watches `S1/05-video/draft.mp4` (dashboard: Shorts). Fix cheaply by hand, or notes in
   `review/A01/director_notes.md` + `bun run act --video <ID>/shorts/S1 --act A01 --fix <notes>` (paid), then
   `bun run shorts --video <ID> --short S1 --step sound` if the act's events changed.
5. `bun run shorts --video <ID> --short S1 --step render` (final 1080x1920 + QC: 9:16, loudness, at most 3 min (an error); past the chosen length is only a warning), then
   `bun run shorts:export --video <ID>` → `shorts/export/`: S1.mp4, S1.txt (title, description with sources, credits,
   disclaimer, hashtags), S1.srt, upload.md. In Studio set each short's **Related video** to the long video.

## Changing the script after approval (only the changed part is redone)
1. Change it: edit lines in Script → Edit the full script, or write feedback and run Write script with
   **Only revise parts** (`bun run write --video <ID> --parts 2,4`: only those parts are rewritten; every other part
   is restored character for character). Approve again.
2. **Script → Apply script changes** (one button) = `tts:format` → `voice:sync --generate` (takes whose words are
   unchanged are kept and renamed if lines moved; only new or changed lines are voiced; deleted lines' takes go to
   `audio/stale/`) → Align all, which ends with `replan --auto`: the plan's acts and beats move to the new voice by
   their words (free, no model; refuses if more than half the narration changed; then plan again).
3. Acts whose words did not change keep their drawing. Acts whose narration changed are listed in
   `05-video/changed_acts.json` (Acts page: what was said before and now) → **Update changed acts**
   (`bun run act --video <ID> --changed`): one update round per drawn act (fresh session on the act file; `--resume` for the author's).
4. Re-run Sound (cues/mix) and render as usual. A tone-note change with the same words keeps the take (redo it in
   Voice → Review if it matters). Adding or removing a whole chapter is a new structure: plan again.
`replan` also covers a speed or gap change in Align (before, that needed a new plan).

## Downloads, SFX review and Final Cut Pro
- **SFX review** (dashboard Sound / Shorts → Sound): every SFX the acts declare, with play, remove/restore and gain. Edits
  live in `05-video/sfx_edits.json` (`{"off":[key],"gainDb":{key:dB}}`, key `A01@12.40:card_slap`); `bun run cues` applies
  them (`events_all.json` = everything + edits, `events.json` = what the mix plays) and they survive re-running cues as long
  as the act keeps that hit's time. Each event keeps its own seed, so removing one never changes the others' sounds.
  `bun run sfx:clips --video <ID>` renders one preview WAV per event (`06-audio/sfx_clips/`). Then mix (+ draft/render).
- **Downloads:** `bun run deliver --video <ID | ID/shorts/S1> [--only keys]` → `08-deliver/` + `deliver.json`: the final as
  rendered, picture only, picture + {voice+SFX+music, voice+SFX, voice+music, voice}, the same four as WAV, stems (voice,
  SFX, ducked music), every SFX clip (zip) and the music bed. ~10 s for a short, a few minutes for a long video.
- **Final Cut Pro:** `bun run fcp --video <ID> [--open]` → `08-deliver/fcp/<ID>.fcpxml` (FCPXML 1.11, checked against
  Apple's DTD): the picture, the voice (role Dialogue), every SFX as its own clip (role Effects, subrole per type, its gain
  on the clip) and the ducked music stem (role Music), act markers. It sounds like the auto mix out of the box; then fade,
  EQ, move, swap music in FCP (or File → Import → Timeline in DaVinci Resolve). The project uses files in `08-deliver/`
  and `06-audio/`: keep them while editing.

## Analytics and the learning loop (after upload)
Channel numbers feed lessons back into the prompts. Dashboard → **Analytics** (global page; click a video for its own page).
1. Once: `youtube_client.json` (Google Cloud OAuth Desktop client; YouTube Data v3 + Analytics + Reporting APIs enabled) at the
   repo root, then `bun run yt:auth` (or **Connect YouTube**). Read-only; token in `youtube_token.json` (gitignored). Testing-mode
   tokens expire after 7 days: reconnect.
2. When a video is live, link it: Analytics → *Link workspaces to uploads* (writes `07-publish/youtube.json`).
3. `bun run yt:fetch` (**Refresh**) → `workspace/_analytics/snapshot.json` (cache; ~3 Data API units). Impressions/CTR come only
   from the Reporting API's daily reach reports: the first fetch creates the job, reports start 1-2 days later, from then on.
4. `workflow/09-analytics/diagnose.ts` flags problems against the channel's medians (≥3 long videos) or YouTube's own references
   (relative retention 0.5; CTR 2-10%): low CTR → THUMBS/META, weak opening → WRITER, an act losing viewers → WRITER/DIRECTOR/ACT,
   good CTR + weak opening → META+WRITER (promise not paid off).
5. `bun run yt:review [--video <VID>] [--agent sonnet|opus|haiku|agy]` (**Run reviewer**, brief `workflow/prompts/ANALYTICS_REVIEW.md`)
   proposes 0-5 generic lessons into `workflow/learning/lessons.json`. **Nothing changes a prompt until the user approves it.**
6. Approved lessons are appended by `loadPrompt()` (`workflow/learning/lessons.ts`) to `workflow/prompts/<TARGET>.md` for every
   later run (max 10 per prompt); each video records the lessons it was made with in `lessons_used.json`. Retire = roll back;
   Restore re-activates; every change is versioned in lessons.json (git). `bun run yt:mock` writes invented data for testing
   (`snapshot.mock.json`, shown with a "mock data" badge, never mixed with the real snapshot).

## Housekeeping: compact a finished video
`bun run compact --video <ID>` (dry run: lists what it would delete and the space freed) → `--yes` deletes. Default removes only
caches and previews (05-video/node_modules with Remotion's cache and Chrome, review frames/sheets/previews, draft.mp4,
public/voiceover.wav, TTS takes, takes of an older script (audio/stale), act pieces, audition clips, openDAW leftovers, temp
files of an interrupted deliver); the final can still be re-rendered. `--deep` also drops the regenerable audio (raw takes, voice,
master, mix, music stem, sfx caches), `--fcp` the Final Cut Pro project's media (incl. act pieces it uses), `--final` final.mp4. **`--archive`** (a published video kept as a record) = `--deep --fcp` plus every log, the probe frames, each
short that is linked to its upload (its final and export; unlinked shorts stay), and the generated thumbnails once the real
one is saved from YouTube (`07-publish/thumbnails/youtube.jpg`; the Posted page uses it, and the shorts' frame strips). Downloads (every stem but the music one FCP plays) and SFX previews go by default (rebuildable). Scripts,
plans, act code, notes, reviews, metadata, thumbnails and exports are always kept; shorts are compacted with their
video; unfinished workspaces (no final.mp4, never compacted) are skipped unless `--force`. Typical result: 4–16 MB per
published video after `--archive --final`-style cleaning (act code, script, idea, plan, timings and costs, lessons, reviews,
notes, metadata, the real thumbnail), ~250–350 MB while its final.mp4 is kept. Run `bun install` before working on it again.
Never run it with `--yes` unless the user asked.

## Dashboard
**Autopilot** (dashboard, the bar under the step bar; `server/autopilot.ts`): walks research → script → voice → align →
plan → acts → act review → sound → draft → final → publish (+ export) → short scripts → shorts → downloads, each step in
the mode you pick: **Auto** (run, go on; the script and short scripts are approved for you, which counts as the user
saying so), **Review** (run, then wait: the step's own approval for script/plan/packages/short scripts, else Continue
in the bar; an OK holds for that output, a redone step asks again), **Me** (never started: waits until you did it),
**Off** (left out; a step needing it runs only if it is already done). Modes can be changed while it runs (Steps…).
Acts run `acts.all --wait`; shorts start at each short's first missing stage. Each step runs with the options saved on
its card; it notifies you when it needs you, waits for a reset, fails twice, or is done. State: `workspace/<ID>/autopilot.json`.

`bun run dashboard` → http://127.0.0.1:4600. Every step above with all its options as form controls, live logs,
duration/CPU/memory/GPU per run (history in `workspace/<ID>/dashboard_runs.json`), players for every audio/video
output, script editing and approval, per-act preview + reviews + notes, a Usage page (every provider's logs,
pipeline costs from `timings.json`), an Analytics page (YouTube numbers, reviewer, lessons gate) and a machine page. Prefer telling the user to use it for
reviews; you can run the same commands from the CLI.

**From anywhere (phone app):** `bun run dashboard:public` also serves the dashboard behind a password (`PWA_PASS` in
`.env`) on 127.0.0.1:4601 and publishes that port with Tailscale Funnel at a fixed https://<mac>.<tailnet>.ts.net;
it prints the link and a QR code. Port 4600 stays login-free on the Mac. Installable as an app (manifest, icons,
offline page in `workflow/dashboard/web/public/`). Sessions last 30 days; changing `PWA_PASS` signs every device
out. One-time setup: `brew install --cask tailscale-app`, open it and log in; the first run prints a link to allow Funnel.
Remotion Studio opens on the Mac only (they run on localhost).

## 4. Preview one act with sound (manual)
```bash
cd workflow/05-video
bunx remotion render ../../workspace/<ID>/05-video/src/index.ts A01 /tmp/A01.mp4 \
  --public-dir ../../workspace/<ID> --concurrency 6 --gl=angle
# then mux the act's window of 06-audio/mix.wav (act start/end from acts.json) with ffmpeg
```
Always pass `--gl=angle` (GPU canvas): without it a 44 s act took 15 min instead of 25 s.
Render speed: `bun run profile --video <ID>` shows, per act, the speed and where a frame's time goes (the act's drawing,
the blank-frame check, the costliest canvas calls); `--scene A10 --bench 1,3,5,8 [--audio]` times the full video at each
number of tabs (5 is best on the M2 Pro; 8 is no faster). Never read the visible canvas back every frame (getImageData on
it): Chrome then moves it to CPU drawing and heavy acts fall to ~1 fps; the blank-frame check reads an 8x8 copy instead.
Half-size output (`--scale 0.5`) does not speed up drawing: the acts still draw on full-size canvases. Renders run best on
an otherwise idle Mac.
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

## 6. Styles in one paragraph each
Drafting = one drawn line promoted through three inks: pencil on cream paper (hatching, blue grid), white wire on a
blueprint, cyan light on black (scan-line fills). Locked camera; every shot is made out of the previous one (morph,
press, tile, extrude, unfold), ink changes by a hard-edged flood or one scan line; Geist type; `FIG. nn — NAME` corner
labels; data-native moves (dashboards, gears, 3D bars, globe). Penny, the channel's coin character, guides
(`brand-assets/mascot/CHARACTER.md`, drawn only by `penny()`). Engine `packages/kit/src/draft/` (demo:
`bun run studio --style drafting`). Full details: `workflow/styles/drafting/STYLE.md`.

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

## Agent models (which model runs each step)
Every agent step goes through `workflow/05-video/src/lib/agent.ts`; the model is a spec `<provider>:<model>`
(`workflow/lib/models.ts`): `claude:opus` (default profile), `claude-iit:sonnet` (`CLAUDE_CONFIG_DIR=~/.claude-iit`),
`codex:gpt-6-luna` (codex exec, workspace-write sandbox), `opencode:opencode/glm-5.3-flash-free` (opencode run --auto),
`ollama:<model>` (local, through opencode with `workspace/.opencode-ollama.json`; needs a model with tool calling,
e.g. `ollama pull qwen3`), `agy:gemini-3.8-flash-medium` (free; review steps run read-only, write steps in accept-edits with only the step's commands allowed). Bare `opus`/`sonnet`/`haiku`
= the default Claude profile.
- Defaults per step: `workflow/models.json`, edited in the dashboard (Settings → Agent models) or
  `bun run models --set writer codex:gpt-6-luna` / `--reset writer`; `bun run models` lists steps and found models.
- A run's `--model` / `--agent` / `--critic` overrides for that run ("default" in the dashboard = the table).
- Codex and OpenCode cannot restrict tools per step like Claude's `--allowedTools`; they run sandboxed to the repo.
- Usage per provider: dashboard Usage page (Claude both profiles, Codex, OpenCode, agy logs + pipeline runs).

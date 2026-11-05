# Act author: draw a Wealth Gap short (9:16, one act)

You are the animator for a **YouTube Short**: one continuous vertical take of 20–60 s in the **{{STYLE}}** style. The director's
plan is below; the narration is recorded and its word timings are fixed.

## Read first (and only these)
1. `workflow/styles/{{STYLE}}/STYLE.md`: what a short changes from the house style (frame, hook, tempo, captions, loop).
2. `workflow/styles/{{STYLE}}/ACT.md`: the file template and engine overrides; it lists the engine files to read.
Don't explore the rest of the repo.

## Rules
- **Pure and deterministic.** Everything is a function of `ctx.t`; `seg(t, t0, t1)` + easing; seeded noise only. No
  `Math.random`, `Date`, timers or state between frames.
- **Timing from words.** Every hit via `ctx.word(text, n)`, complete at the word's start (anticipation 0.15–0.35 s earlier).
- **Frame 1 is the hook**: something is already landing at t = 0 (`open: "none"`). The end returns to the opening composition
  (`close: "none"`), so the short loops.
- **Vertical world.** Regions stacked top → bottom; the camera frames regions with `focusCam` (snap moves via `whip` sparingly).
  The camera never leaves unfinished work.
- **Readable on a phone.** Headline numbers ≥ 160 px cap height on screen, labels ≥ 40 px; impact text and key action above
  y 1250; nothing important right of x 930 or below y 1440. Kinetic captions via one `shortCaption` call in the overlay.
- **Pace.** A visual hit every 1.5–3 s; a pattern interrupt every 3–5 s; one stop-time or spotlight freeze at the payoff.
- **Music.** If the act brief lists a track, cut to it: pulse on beats, moves on downbeats, thumps on big accents (ACT.md "Cutting to the beat").
- **Data honesty.** Only the plan's `data` numbers with their units, a small source note beside each figure.
- **Sound.** Export `events(word)` with foley on every visible hit.
- Keep the file readable: small helper functions per beat, < ~800 lines.

## Process
1. Plan the vertical layout, the camera actions and the loop (short comment block at the top of the file).
2. Write the file.
3. `bun run assemble --video <ID>` (must pass), then `bun run frames --video <ID> --scene A01 --every 2 --words`. Fix every flag
   in the layout report (the Shorts overlay flags mean content a phone hides), then **Read** `review/A01/sheet.jpg`.
4. Fix what you see: tiny text, a hook that isn't visible in the first tile, captions over impact text, colour on the same colour,
   an end that doesn't match the start. Repeat step 3 at most 3 times.
5. Reply with 3 lines: what the short shows, what you are least sure about, and the frames to check.

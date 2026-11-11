# Act author: draw one act of a Wealth Gap video

You are the animator for **one act** (45–120 s, one continuous take) in the **{{STYLE}}** house style. The director's plan for this act is below; the narration is recorded and its word timings are fixed.

## Read first (and only these)
1. `workflow/styles/{{STYLE}}/STYLE.md`: the look, colour logic, motion and camera grammar. Follow it exactly.
2. `workflow/styles/{{STYLE}}/ACT.md`: the engine you draw with, the file template, act transitions and chapter acts. It lists the engine files to read.
Don't explore the rest of the repo; everything you need is there.

## Rules
- **Pure and deterministic.** Everything is a function of `ctx.t`. Use `seg(t, t0, t1)` + easing for every motion; seeded noise only. No `Math.random`, `Date`, timers or state between frames.
- **Timing from words.** Resolve every hit with `ctx.word(text, n)` (act-relative seconds). A hit is **complete at the word's start**: begin the motion 0.25–0.6 s earlier (anticipation, then action). Never hard-code times that should follow the voice.
- **One take, no cuts.** Something is always moving: an element being built, a figure acting, a shape turning into the next one. How the frame is composed comes from the style's ACT.md:
  - *Briefing*: a world of named regions framed by a moving camera (never raw coordinates); the camera never leaves unfinished work, arrives before a region's action and stays until it is complete and held; moves are calm.
  - *Drafting*: a locked camera; each beat is made out of the previous one's shapes (morph, press, unfold, extrude), centred inside the border.
- **Long-form pace.** One idea at a time; build it while it is explained, then hold while the narrator finishes. No move or reveal shorter than 0.4 s except a deliberate punch-in, whip or stop-time.
- **Layout.** Each beat's drawing stays inside its region (Briefing) or the border (Drafting). Text must be ≥ 30 px on screen (world size × camera zoom); headline numbers ≥ 90 px. One idea at a time; if it is crowded, split it. Follow the style's text rule (STYLE.md §4): no running subtitles in either style, only impact text staged in the scene.
- **Data honesty.** Only the plan's `data` numbers, with their units. Never invent a number to fill a chart: draw the empty slot. Sources go in the video description (added automatically from the plan), not on screen. Add a small on-screen source note only when a figure needs it to be believed (a surprising or contested number) and only in clear space where it touches nothing.
- **No boxes with text in them.** If a frame looks like a slide, restage it in the style's own terms (STYLE.md §8).
- **Your act is one part of a film.** You see only this act, so the plan carries what joins it to the others: `rhythm` (how the act moves in time: follow it, a sprint is not a slow build), `intensity` (its place in the video's rise and fall: a quiet act has few things, slow moves and room; the peak is dense and loud), `endsOn` (the exact last image: be on it, complete, before the act closes, because the next act arrives from it), and under "This act" the previous act's last image and the cast shared with other acts (draw cast members exactly as described). Where the plan has none of these, use your judgement.
- **Logos and icons.** Company logos and generic icons come from the kit's `logo()` (see the style's ACT.md); find names with `bun run icons <words>`. Never draw a company logo by hand.
- **Sound.** Export `events(word)` with foley for every visible action (types listed in the style's ACT.md), act-relative seconds.
- Keep the file readable: small helper functions per beat, < ~800 lines.
- **Not enough time for a visual? Ask for a pause, don't rush.** If the narration moves on before something can be shown properly (a crowd building, a long transform, a reveal that needs to land), write `05-video/review/<ACT>/holds.json` = `{"holds": [{"word": "orders.", "occurrence": 1, "ms": 1200, "why": "…"}]}`: the voice waits `ms` after that word (nth occurrence in this act). Only after a sentence/phrase end or around a joining word (and, but, so); 300–2000 ms; at most 3. The creator approves and applies them (the act then gets longer); until then the act must still work without them, so draw against the current word times and let the pause give extra room, never a missing piece.

## Process
1. Plan the layout and the actions for every beat (a short comment block at the top of the file).
2. Write the file.
3. `bun run assemble --video <ID>` (it must pass), then `bun run frames --video <ID> --scene <ACT> --every 4 --words`. It prints a **layout report** (measured, free): near-empty frames, content clipped at an edge, content in the subtitle band (ignore that flag when the style has no subtitles), subjects too small; then a **summary** (share of sparse frames, the longest stretch where the picture barely changes, an empty open or close) with **note:** lines, and **small:** lines for every text, figure or icon measured too small on screen. **Fix every flag, note and small line** (or be able to say why it is deliberate), then **Read the contact sheet** `review/<ACT>/sheet.jpg` for what numbers can't see.
4. Fix what you see: small subjects on an empty ground, a wide shot that turns everything into thumbnails, tiny text, overlaps, a hit that is not complete at its word, colour on the same colour, a camera that leaves too early (Briefing), a frame with nothing changing for more than 1.5 s (Drafting), anything that looks like a slide. Repeat step 3 at most 3 times.
5. Stop when the layout report is clean and the sheet reads as a polished film strip. Reply with 3 lines: what the act shows, what you are least sure about, and the frames to check.

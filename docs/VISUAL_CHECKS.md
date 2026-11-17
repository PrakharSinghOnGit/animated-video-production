# Visual checks and the critic

How a rendered act is reviewed before you see it at G2/G3, and how well each part works on the existing acts.

## The pipeline

`bun run frames --video <ID> --scene <ACT>` (the author runs it after every change, the critic and the reviewer run it first):

1. **Dense pass.** The whole act every 0.1 s, rendered in parallel (`renderFrames`, `--gl=angle`, half the cores).
   On the 65 existing acts: median **28 s per act for ~670 frames** (max 46 s, 1,150 frames). The old path rendered one
   still per beat: median 40 s for ~35 frames.
2. **Checks** (`workflow/05-video/scripts/act_checks.py`, free, ~5–15 s): every finding has a kind, a severity, a time
   and where on screen. Written to `review/<ACT>/checks.json`, printed with the layout report.
3. **Motion grids** `review/<ACT>/grid_NN.jpg`: 12 consecutive frames 0.5 s apart per image, the words spoken around
   each frame under its tile (hit words in yellow), flagged tiles outlined in red with the finding's number. A 90 s act
   is 15 images, ~180 frames, motion and sync visible at a glance.
4. **Contact sheet** `review/<ACT>/sheet.jpg`: the review stills (every N s, hit words, every medium/high finding),
   flagged tiles outlined in red, the findings listed under it.
5. **Critic** (`bun run act`) and **reviewer** (`bun run review`) get the grids, the sheet and the findings.

Load on the 65 existing acts after tuning: **median 3 medium/high findings per act** (mean 3.9, max 18; 10 acts have
none), plus lows for the critic to glance at.

## The checks

The first and last second of an act (its transitions) are not judged. "Camera taken out" = the pan and zoom between
every two frames are measured (phase correlation) and removed before looking for change.

| Kind | Fires when | Severity | Precision on existing acts |
|---|---|---|---|
| `blank` / `near-empty` | < 1.2 % content for ≥ 0.3 s / < 3 % for ≥ 1.5 s | high / medium | **6/6 real** (0.6–1.7 s of empty ground between beats) |
| `text-clipped` | measured text partly outside the frame for ≥ 0.5 s | high (type) / medium (label) | **~7/8 real** |
| `frozen` | nothing moves at all for ≥ 4 s | medium (high ≥ 8 s) | 2/2 real |
| `cut` | > 40 % of the picture changes in one step, no whip | medium | 1/1 real |
| `unsettled` | still changing in the last ~0.7 s before the transition out | medium | 1/1 real |
| `text-overlap` | two texts of similar size (≤ 2.5×) overlap ≥ 30 % for ≥ 0.5 s, not mid-transition | medium | ~1/7 before the size rule (giant set type behind labels is the style); 75 → 21 findings after it, not re-sampled |
| `contrast` | visible text with WCAG ratio < 3 (< 2 = high for type) | high / medium | ~half real (160M on a dark stack, a red label on lilac); misses are text under a card: for the critic to confirm |
| `pop` | something appears or vanishes in one 0.1 s step with the camera taken out, nothing changing near it just before or after, and the same pixels not changing again within 0.3 s | high ≥ 1.5 % of the frame, medium ≥ 0.5 % | **~25–40 % real**: candidates for the critic to confirm, never a gate |
| `late-hit`, `no-hit` | the visible change for a hit word comes mostly after it / nothing changes near it | low | 2/8 real: information only |
| `camera-jump` | the camera estimate jumps in one step | low | 0/5 real (landing letters and whips fool it) |
| `fast-entry`, `title-safe`, `contrast` (not visible) | something flies in from off frame; text outside 5 % margins; text measured but covered | low | information |

**Gate.** High `blank` and `text-clipped` findings go straight back to the author without a critic call
(`GATE_KINDS` in `workflow/05-video/src/lib/critic.ts`), like the old layout gate. Everything else goes to the critic, who
marks each finding real or false; false ones never reach the author.

## The critic

`workflow/prompts/CRITIC.md` (loaded with approved lessons) + `workflow/styles/<style>/RUBRIC.md`. Seven dimensions scored
1–5 (staging, motion, camera, sync, legibility, colour, data), each tied to STYLE.md sections; a verdict on every numbered
finding; at most 8 issues, each citing a dimension, tiles and a finding when one describes it. Caps are applied in code
(`applyCaps`): a confirmed high finding, a high issue or any 1 caps the score at 5; any 2 caps it at 6.

## What it catches of your notes (measured)

Ground truth: the timed, visible problems in `director_notes.md` across VID03–VID08. The act code as it was when you
wrote each note was rebuilt from the fix sessions' transcripts (replaying every edit reproduced the current files
exactly) and rendered with today's kit.

- 3 of the 11 noted problems no longer reproduce with today's kit (VID04 A03's blank, VID05 A06's clipped F, the
  VID05 A07 book, which now animates out with a stretch you disliked: taste, not a pop). They are not counted.
- Of the 8 left, the checks flag **3 at medium or high** (VID03 A04: the grey wave vanishing at 14 s and the columns
  at 67 s; VID05 A08: the people popping in, at 9.5 s in this render) and **2 more at low** (VID03 A04 26 s, 73 s).
  Missed: small things at the frame edge that the camera reveals or leaves (VID03 A04 52 s, 78 s) and a pose timing
  (VID05 A03 9.9 s).
- The new critic prompt, on 6 of these acts (free Gemini critic), names the VID03 A04 pops at 14, 67 and 76 s (old
  prompt: 67 s), the A08 people (old: no), the A06 end swipe to plum and VID05 A09's inconsistent zoom at 56 s (old: both
  too). Both score every act 4/10. The new prompt is slower (2.7–6 min vs 1.5–2.7 min per act) and reads up to ~5x the
  input tokens on long acts (the grids): free on agy, worth knowing before pointing it at a paid model. (The old prompt could also read checks.json in the review folder, so its run already
  benefited from the checks.)
- Neither critic prompt (old or new) catches drawing-quality notes (hands backwards, broken candle, mask not following
  the head, inverted $, the book blending into its ground, the truck). Those still need your eye.

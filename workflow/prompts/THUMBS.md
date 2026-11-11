# Thumbnails: draw three different bets

You design the thumbnails of one finished Wealth Gap video, as code. Read `workflow/07-publish/GUIDE.md` first: sections 2 (thumbnail rules), 4 (A/B testing), 6 (finance rules), 10 (what the channel's first thumbnails got wrong) and the **Thumbnail** and **A/B test** items of the checklist in section 8 are binding; where this brief and the guide differ, the guide wins. The style section at the end of this brief gives the drawing kit, the file skeleton and the character.

## The job
A thumbnail has one second, at the size of a postage stamp, in front of someone who has never heard of this channel and does not know the video's vocabulary. It must make that stranger feel "this is about me" or "wait, what?". It is **not** a diagram of the video's mechanism; the video explains, the thumbnail only opens the question.

YouTube's Test & Compare runs up to three packages (a thumbnail plus its title). The task below gives each variant its title, its **axes** (subject, emotion, text, composition), the words for the image and a brief. The axes are binding: they are what makes A, B and C three bets instead of one idea drawn three times. If you cannot make a variant work on its axes, change it and say so in `thumbnails.json`, but every pair of variants must still differ on at least two axes, no two may share a subject, and no two may carry the same words (the render checks all three).

## What each thumbnail must do
1. **One thing, big.** One subject fills the frame: 55% of the height or more, cropped by the edge if that makes it bigger (in a `scene` composition the big thing is what towers over the actor, and the actor is still a quarter of the height). At most one supporting element and the words. If you are drawing a third and a fourth thing, you are drawing a diagram: stop and pick the one that hurts.
2. **A stranger gets it.** No trading or finance jargon in the picture: no candlesticks, chart patterns, order-book lines or labels that need the video to decode. Draw the thing from the viewer's life (the house, the rent bill, the paycheque, the price tag, the door) or the person it happens to.
3. **Someone it happens to.** When the subject axis is `character`, the character is the biggest thing in the frame and its pose shows the feeling. A tiny figure standing in a scene is decoration.
4. **The gap stays open.** Thumbnail and title together must leave a question the video answers. Do not draw the answer. The words on the image never repeat the title: they are the stake or the feeling in the viewer's own words ("NOT YOUR FAULT", "103 YEARS", "$0"), not a label for the picture ("THE SPLIT", "FUEL") and not a word the channel has already used (listed in the task).
5. **True.** Only figures in the plan's `data` (listed in the task). Nothing the video never shows or states. List each number you draw in `thumbnails.json`.

The three axes values, so you draw what was asked:
- **subject**: `character` (the style's character dominates), `object` (one object from the viewer's life), `data` (one shape made of numbers: a gap, a line, two bars), `type` (the words are the image).
- **emotion**: `threat` (something is being taken from you), `curiosity` (something is hidden or does not add up), `payoff` (there is a way out, a fix, a relief).
- **text**: `none`, `word` (1-3 words), `number` (a sourced figure, with at most 2 words).
- **composition**: `close` (one thing, cropped tight), `scene` (a small actor in a big space, scale is the point), `split` (two sides against each other).

## Layout rules (the render measures them)
- Words: at most 3 (a number counts as a word). Height at least 12% of the image; in practice a quarter of the height or more for one or two words.
- Keep the **bottom-right corner clear** (the right 22% x bottom 18%: the duration badge), the bottom 6% and ~3% of every edge.
- A defined edge on a white page and on a #0f0f0f page (a border band in a tone that differs from the ground).
- At most three inks plus paper and ink, one accent. Flat, solid shapes. No hairlines, dashes or rows of small parts carrying meaning.
- The three variants should not share a ground colour.

## Self-review loop (required)
1. Write one variant, then render it: `bun run thumbs:render --video <ID> --variant A --no-preview`. It prints the checks. A line starting with `✗` **rejects** the thumbnail (for example: the words could not be read back at 168 px, the edges of the drawing are gone at 168 px, no edge on a dark page, two variants on the same axes). Fix every `✗` before moving on; read each `⚠` and fix it unless it is wrong.
2. **Look at the small one first**: Read `workspace/<ID>/07-publish/thumbnails/phone/A_168.png` (the real 168 x 94 px image, nothing else on screen). In one second: what is it, who is it about, what are the words? Then Read the full-size `thumbnails/A.png` (or .jpg) for clipping, overlap and empty areas. If the small one needs the big one to be understood, redesign, do not nudge.
3. When all variants exist, run `bun run thumbs:render --video <ID>` and Read `workspace/<ID>/07-publish/preview_small.png` (each variant in a feed card with its title, in a list row at 168 px, light and dark). Check that the three are obviously three different videos' worth of ideas, and that each title and thumbnail read as two halves.
4. At most 3 rounds per variant. Write `thumbnails.json`, run the full render once more, and finish with 3 lines, one per variant: the bet, the words, what you would change with another round.

## thumbnails.json
The shape (the content is an illustration, not a suggestion):
```json
{"A": {"concept": "you, locked out of your own street", "focal": "the Agent reaching for a door twice his size", "text": "NOT YOUR FAULT", "numbers": [],
       "axes": {"subject": "character", "emotion": "threat", "text": "word", "composition": "close"},
       "hypothesis": "a person and a personal stake beat a number", "clear": "bottom-right and bottom edge clear"},
 "B": {"concept": "...", "focal": "...", "text": "", "numbers": [], "axes": {"subject": "object", "emotion": "curiosity", "text": "none", "composition": "scene"}, "hypothesis": "...", "clear": "..."}}
```
`text` is exactly what is drawn (empty if nothing); `numbers` lists every figure that appears, written as it appears; `axes` is what you actually drew.

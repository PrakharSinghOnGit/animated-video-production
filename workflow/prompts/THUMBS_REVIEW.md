# Thumbnail review: would a stranger click, and are these three different bets?

You review the three packages (thumbnail + title: A, B, C) of one finished finance explainer. You have never seen the code that drew them. First read `workflow/07-publish/GUIDE.md`: section 2 (thumbnail rules), 3.7 (title and thumbnail pairing), 4 (A/B testing), 6 (finance rules), 10 (what the channel's first thumbnails got wrong), and the **Thumbnail** and **A/B test** items of the checklist in section 8.

Look at the images in the order the task lists them: the phone-size images first (`phone/<V>_168.png`: the real 168 x 94 px image), then each variant at full size, then the preview sheets (`preview_small.png`: each in a feed card with its title and in a list row, light and dark). **Judge on the small image.** The full size is only for finding out why something fails.

The task gives you three things to treat as facts: the measured phone checks (pixel measures and the words a text recogniser read back), the **blind read** (what a viewer who saw only the 168 px image, with no title and no context, said it shows), and the channel's earlier packages with their click rates.

## Per variant, in this order (most important first)
1. **click**: you are a stranger who has never heard of the channel or of the video's vocabulary. Thumbnail and title together, two seconds: is it about you or your money? Is there a question left open that you want answered? Or does it describe a mechanism, name a term you would have to look up, or give the answer away? Compare the blind read's `about` with what the video is really about: a blind viewer who says "unclear" or describes a chart is a failed thumbnail, however tidy it looks.
2. **legibility**: at 168 px is the subject identifiable in a second and every word readable? Use the measured read and the blind read; say what you can and cannot read yourself.
3. **focal**: one subject that dominates (about 55% of the height; a character that is the subject must be the biggest thing in the frame, not a small figure in a scene), at most one supporting element and the words. Count the things. A diagram (several small labelled parts, candlesticks, dashed levels) fails here.
4. **text**: at most 3 words (numbers count). Do the words repeat the title, label the picture, use jargon, or reuse a word from the channel's earlier thumbnails (listed in the task)?
5. **pairing**: thumbnail and title as two halves of one idea, no repeated words, promising only what the video delivers.
6. **contrast**, **safe-zone** (bottom-right 22% x 18% under the duration badge, bottom 6%, ~3% of each edge), **edge** (visible on the white page and on the #0f0f0f page).
7. **truth**: every number and object against the video's sourced data and acts (in the task): anything shown that the video never shows or states? Any number not in the data?

## Across the three: **distinct**
Are these three bets or one idea three times? Cover the titles and look at the three small images side by side: could they be three different videos? They must differ on at least two of subject, emotion, text and composition (the declared axes are in the task: check them against what you see), with three different subjects, different words, and preferably different grounds. The same object, metaphor or word in two variants is a `distinct` issue with severity high.

## Verdict
- `order`: the upload order, strongest first. A small channel's test often ends "Inconclusive", and YouTube then keeps the first one uploaded, so the first one matters most.
- Scores are for click-worthiness at phone size, not tidiness: 8 or more means upload as is; a clean, legible diagram a stranger would scroll past is a 4.

Only report what you can see; quote the text you read. Never guess about an image you did not open. If a variant is fine on an item, say nothing about it. Most important first, at most 8 issues per variant. Every `fix` is a concrete change the designer can make ("replace the candlestick chart with the Agent at 1.6 scale reaching for the tag"), not "improve the contrast".

Reply with ONLY this JSON object:
```json
{"overall": 1-10, "summary": "two sentences", "order": ["B", "A", "C"],
 "all": [{"kind": "distinct", "severity": "high|medium|low", "seen": "...", "fix": "..."}],
 "variants": {"A": {"score": 1-10, "stranger": "one sentence: what a stranger takes from thumbnail + title, and whether they would click",
   "issues": [{"kind": "click|legibility|focal|text|pairing|contrast|safe-zone|edge|truth", "severity": "high|medium|low", "seen": "what you see", "fix": "the concrete change"}]}, "B": {...}, "C": {...}}}
```
`all` holds issues about the set (distinctness, the same flaw in all three).

# Publish: titles, description and tags for a Wealth Gap video

You package one finished 8-10 minute finance explainer for YouTube. First read the guide: `workflow/07-publish/GUIDE.md`. Its rules (sections 3, 5, 6, 7 and the title/description/metadata checklist in section 8) are binding; where this brief and the guide differ, the guide wins.

## What you produce
YouTube's Test & Compare tests up to three packages (a thumbnail with its title). So you write **three packages, A, B and C**; a separate agent designs the thumbnail for each from your `thumbnail` brief.

- **Titles** (GUIDE.md section 3): at most 100 characters, the main promise inside the first 60, aim 35-55, key words first, one honest sentence, no emoji, at most one ALL-CAPS word. At least one package is `searchable` (names the subject plainly, with the topic keyword in the first 40 characters) and at least one is `curiosity` (a tension the video really answers). The third may be `number` (led by a sourced figure) or either of the other two. The three differ in angle, not wording. No get-rich wording (guaranteed, secret, overnight, never lose, get rich, "they don't want you to know"), no false urgency, nothing the video does not deliver.
- **Numbers**: a number may appear in a title only if it is in the sourced-figures list below (you may write 410 thousand as $410K, or 2190 as $2,190, but never round a figure into a different one). Figures marked "narration only, unverified" are allowed but flagged for the creator.
- **Pairing** (GUIDE.md 3.7): each package's `thumbnail` is one line saying what the thumbnail shows (one focal object, at most 3 words of text). The thumbnail carries the "what", the title the "why/how"; they must not repeat each other's words. Add a one-line `hypothesis`: what this package tests against the other two.
- **Description body** (GUIDE.md 5.1, 5.2): only the opening. Two lines (about 150 characters) holding the promise and the main keyword, no link, no hashtag, not a copy of a title; then 2-4 sentences on what the video covers and which data it uses (the date range of the data when the plan gives it). Mark any illustrative or modelled figure as an example. **Do not write** chapters, sources, credits, the disclaimer or hashtags: the code adds them (chapters from the narration timings, sources from sources.md or the plan, credits from 06-audio/credits.txt).
- **Tags** (GUIDE.md 5.5): at most 10, short: the channel name, the topic, common misspellings of tricky terms. No competitor names. Together under 400 characters.
- **Hashtags**: exactly 3, relevant, in the form `#PersonalFinance`.

## Inputs (read them; do not guess)
Paths and the figures list are in the task below. Read the script (the narration is what the video says), the plan's treatment and acts, and the sources. The title must be answered by the video within its first two minutes: check the script for where.

## Reply
Reply with ONLY this JSON object (no prose around it):
```json
{"packages": {
  "A": {"title": "...", "type": "searchable", "rationale": "one line: why this title", "thumbnail": "one line brief for the thumbnail", "hypothesis": "one line"},
  "B": {"title": "...", "type": "curiosity", "rationale": "...", "thumbnail": "...", "hypothesis": "..."},
  "C": {"title": "...", "type": "number", "rationale": "...", "thumbnail": "...", "hypothesis": "..."}},
 "descriptionBody": "...", "tags": ["..."], "hashtags": ["#...", "#...", "#..."]}
```

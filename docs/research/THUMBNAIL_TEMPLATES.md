# Reusable thumbnail templates: what the evidence says (2026-11-11)

Input for packaging work (docs/FABLE_PROMPTS.md prompt 4, `workflow/07-publish`, `workflow/styles/briefing/THUMB.md`).
The creator asked whether repeatable layouts other channels use (before/after, rich vs poor, versus) can be ours.

## Evidence, strongest first

1. **vidIQ, "What 500 breakout thumbnails reveal" (June–July 2026).** 500 videos that beat their channel's average,
   30 niches, channels with 10k+ subs, coded by hand. Faces: 69% of all, 80% of the top 50. High contrast: 56%
   overall, 46% in the top 50. Face *or* high contrast: 89–92%. Overlay text on 72%, median 5 words; 140 of 500 had no
   text. It did **not** measure split, before/after, versus or numbers, and reports nothing finance-specific.
   Correlational; vidIQ sells the tool the sample came from.
   https://vidiq.com/research/youtube-thumbnail-study/
2. **Practitioner guides** (vidIQ blog, 1of10, thumbnailtest.com and similar) list before/after, versus, one big
   number and a burning question as standard formats, with examples (WhiteBoard Finance "$0 to $100K" for the
   number; carwow for versus). None gives CTR data per format. Treat them as a menu, not proof.
   https://www.vidiq.com/blog/post/types-youtube-thumbnails · https://www.1of10.com/blog/types-of-thumbnails-for-youtube
3. Other numbers seen (a 38% CTR lift from high contrast; specific split ratios) come from unsourced vendor posts or
   other niches (song videos). Not used.

**Caution for finance:** a before/after that implies a result (net worth, returns) is a claim. It must be sourced
in the video, like a title.

## What this means for us (faceless, Penny and the Agent)

- No study says which *template* wins. The stable signals are: one dominant subject (a face in most breakouts),
  strong contrast, and few words. Whether Penny or the Agent works as our "face" is unproven; test it.
- Templates are still useful, because they make three A/B variants genuinely different bets, and they are cheap for
  us: thumbnails are code, so a template is a reusable layout function with slots.
- Candidate set mapped to the existing axes in `07-publish/lib.ts` (`composition: close | scene | split`):
  - **Split / two worlds** (split): before vs after, you vs the fund, the headline vs the shelf price. One difference
    only, both sides readable at phone size.
  - **The one number** (close, text: number): a single sourced figure dominates.
  - **The gap** (data): two bars or two lines pulling apart, the channel's name made visual.
  - **Character + object** (close/scene, subject: character): Penny or the Agent reacting to one object.
  - **The hidden thing** (scene): a small actor in a big space, something covered or behind glass.
- The only way to know what works here: YouTube Studio **Test & Compare** (up to 3 thumbnails per video) on every
  upload, logged per template, and the idea check's competitor outliers coded by template over time.

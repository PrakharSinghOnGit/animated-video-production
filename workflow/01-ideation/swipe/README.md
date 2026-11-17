# Swipe file: finance outliers

`outliers.json` (committed): 1,031 long-form videos from 46 finance / economics / business channels whose views are 2x or more the median of their 30 neighbouring uploads on the same channel, with visual tags. `RECIPES.md`: what they have in common and ten faceless structures. Used by `bun run concepts` (`../swipe.ts`) and summarised in `workflow/07-publish/GUIDE.md` section 12.

The thumbnails themselves stay in `workspace/_ideas/swipe/` (gitignored; the channels' copyright, for private study only), with `gallery.html` to browse them, `FINDINGS.md`, the control group and the measurements.

## Rebuilding (about 1,000 of the 10,000 daily YouTube API units, free)
1. `bun workflow/01-ideation/swipe/build/collect.ts`: full upload histories, local-median multiples → `workspace/_ideas/swipe/all.json` (edit the channel list at the top; per-channel cache in `ch/`).
2. Pick outliers (multiple ≥2, ≥100K views, ≥30 days old, a cap per channel to reach ~1,000) into `swipe.json` and a same-channel control group (0.5-1.2x); download the thumbnails into `img/` and `bimg/`.
3. Measure: `swiftc -O build/vis.swift -o vis` (OCR, faces), then `uv run --with pillow python -I build/feat.py <dir> swipe.json img img_vis.jsonl feat_out.json` (and the same for the control); `build/color.py` writes the numbered contact sheets.
4. Tag the contact sheets by eye (a vision model per 7 sheets, schema in the 2026-11-17 run: archetype, layout, palette, emotion, devices, facelessFit, idea), then write `outliers.json`.

Steps 2-4 were run by hand on 2026-11-17; turn them into one command if the file is rebuilt regularly.

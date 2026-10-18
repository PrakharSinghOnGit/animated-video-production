---
name: scene-review
description: Frame inspection and visual review loop protocol to catch overlap, contrast, and alignment issues before final render.
---

# Scene Review Skill

## The Review Loop Protocol
1. Render still frames at:
   - `enterAtFrame + 15`
   - `sceneMidpointFrame`
   - `exitAtFrame - 10`
   - Every `anchorFrame`
2. Run `npm run sheet` to tile frames into `contact-sheet.png`.
3. Inspect frames with checklist:
   - One clear focal point?
   - Any text or element clipping or collision?
   - Safe areas respected (80px sides, 100px top/bottom)?
   - Text legible (>30px at 1080p)?
   - Tabular figures for animated numbers?
   - Ambient motion active?
4. Fix issues and re-inspect (max 3 passes).

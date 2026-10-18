# 🎨 Visual Guidelines & Art Direction Standard

## The Wealth Gap Aesthetic
- **Visual References**: Vox Borders, Johnny Harris Explainers, Polymatter, MagnatesMedia.
- **Tone**: Authoritative, cinematic, investigative, dark modernism.
- **Primary Palette**:
  - Background: Deep Charcoal (`#0B0F14`)
  - Accent (Hero): Wealth Gold (`#F5B83D`)
  - Accent 2 (Comparison): Electric Teal (`#2EC4B6`)
  - Positive / Flow: Mint Green (`#3DDC97`)
  - Negative / Risk: Coral Crimson (`#FF5A5F`)
  - Text: Off-white crisp (`#F4F6F8`), Muted Silver (`#8A97A6`)

---

## ⏱️ Timing & Motion Standards

1. **Ambient Motion**:
   - Nothing should sit completely static on screen for more than 2.5 seconds.
   - Every scene incorporates the global camera push-in (`scale: 1.00 -> 1.04`) and ambient background grid drift.
2. **Animation Curves**:
   - Entrances: Exponential Ease-Out (`outExpo: cubic-bezier(0.16, 1, 0.3, 1)`). Snappy, modern, energetic.
   - Numerical grows & count-ups: Smooth Cubic Ease-Out (`outCubic`).
   - Exits: Half the entrance duration (`inCubic`).
3. **Word-Anchored Hits**:
   - Visual arrivals lead the spoken voice slightly by **150–250 ms** (5–8 frames at 30fps). A visual that arrives after the word feels sluggish and unpolished.

---

## 🏗️ 3-Layer Scene Architecture

Every scene in `scenes.json` follows this strict 3-tier layering:

1. **Background Layer**:
   - Ambient grid drift (`GridDrift`) with low-opacity vignette (`Vignette`) and micro-film grain (`Grain`).
2. **Midground Atmospheric Layer**:
   - Atmospheric focal lighting (`GlowBlobs`) softly highlighting the visual epicenter in Gold or Teal.
3. **Foreground Group**:
   - 1 or 2 focal elements only (`BigNumber`, `BarCompare`, `SizeCompare`, `Globe3D`, etc.).
   - Supporting citation badge (`SourceTag`) anchored to the bottom-right within safe bounds.
4. **Subtitle Layer**:
   - `CaptionBar` (bottom glass pill) for horizontal 16:9 videos.
   - `CaptionPop` (center punch) for vertical 9:16 shorts.

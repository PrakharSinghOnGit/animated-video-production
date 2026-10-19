# Benchmark Comparison Report: Reference Clip Rebuild (`_FX_shadow_clip`)

**Date:** 2026-10-19  
**Reference Clip:** `workflow/prompts/references/shadow_market.py` (Python Skia)  
**Rebuilt Implementation:** `workspace/_FX_shadow_clip/05-video/` (TypeScript / `@wealthgap/kit` / Remotion)  
**Audio Clip:** Spoken voiceover (11.59s, 348 frames at 30 fps)  
**Final Render Output:** [`workspace/_FX_shadow_clip/05-video/final.mp4`](file:///Users/prakharsingh/youtube/WealthGap/workspace/_FX_shadow_clip/05-video/final.mp4)  
**Draft Render Output:** [`workspace/_FX_shadow_clip/05-video/draft.mp4`](file:///Users/prakharsingh/youtube/WealthGap/workspace/_FX_shadow_clip/05-video/draft.mp4)

---

## 1. Side-by-Side Visual Comparison

Side-by-side comparison images generated from identical time codes ($t = 0.00, 1.00, 3.50, 7.90, 9.60, 11.14/11.50$s).  
*(Left: Python Skia Reference | Right: Rebuilt `@wealthgap/kit` Remotion)*

| Timestamp | Event / Choreography | Visual Comparison (Left: Ref, Right: Kit) |
|---|---|---|
| **$t = 0.00$s** | Macro opening tight on top-left luminous contour rim | [compare_t00.00.png](file:///Users/prakharsingh/youtube/WealthGap/workspace/_FX_shadow_clip/05-video/review/benchmark_stills/compare_t00.00.png) |
| **$t = 1.00$s** | Macro pull-back begins; `SHADOW MARKET` reveals | [compare_t01.00.png](file:///Users/prakharsingh/youtube/WealthGap/workspace/_FX_shadow_clip/05-video/review/benchmark_stills/compare_t01.00.png) |
| **$t = 3.50$s** | First swell; mint `STOCK MARKET` orb born on rim | [compare_t03.50.png](file:///Users/prakharsingh/youtube/WealthGap/workspace/_FX_shadow_clip/05-video/review/benchmark_stills/compare_t03.50.png) |
| **$t = 7.90$s** | Second swell; lavender bond squircle + peach crypto gem | [compare_t07.90.png](file:///Users/prakharsingh/youtube/WealthGap/workspace/_FX_shadow_clip/05-video/review/benchmark_stills/compare_t07.90.png) |
| **$t = 9.60$s** | Camera dive into gem; 7 pastel coins burst with sparkles | [compare_t09.60.png](file:///Users/prakharsingh/youtube/WealthGap/workspace/_FX_shadow_clip/05-video/review/benchmark_stills/compare_t09.60.png) |
| **$t = 11.14$s** | Plump stitched cushion slams down with squash-and-stretch | [compare_t11.14.png](file:///Users/prakharsingh/youtube/WealthGap/workspace/_FX_shadow_clip/05-video/review/benchmark_stills/compare_t11.14.png) |

---

## 2. Render Timing & Performance Benchmark

| Pipeline / Engine | Profile / Settings | Resolution | FPS | Total Duration | Render Time | Real-Time Factor |
|---|---|---|---|---|---|---|
| **Python Skia** | Direct Canvas C++ binding | 1920×1080 | 30 fps | 11.6s | **~8.5s** | ~1.36× real-time |
| **Remotion (Draft)** | Fast draft, crf=26, scale=0.5 | 960×540 | 30 fps | 11.6s | **11.8s** | ~0.98× real-time |
| **Remotion (Final)** | Broadcast quality, crf=16, scale=1.0 | 1920×1080 | 30 fps | 11.6s | **10.1s** | ~1.15× real-time |

> **Takeaway:** Remotion rendering speed in `@wealthgap/kit` is exceptionally competitive (~10-11 seconds for the full 11.6s broadcast 1080p video with audio, nearly matching raw C++ Skia rendering speeds).

---

## 3. Subjective Quality & Craft Evaluation

### Where `@wealthgap/kit` Excels
1. **Kinetic Typography:**
   - The React DOM-based `<Label />` primitive delivers far superior typography compared to Skia bitmap text rendering. Characters animate letter-by-letter with spring overshoots (`din = 0.45s`), clean tracking, clipped overflow masks, and dynamic accent underlines.
2. **Authoring Ergonomics & Modularity:**
   - Python Skia required hardcoded mathematical drawing functions and manual state arrays (`draw_blob`, `draw_coins`, `draw_cushion`). In `@wealthgap/kit`, scenes are authored with declarative, composable React primitives (`<Camera>`, `<MorphShape>`, `<Orb>`, `<Gem>`, `<Coin>`, `<Sparkle>`, `<Ring>`, `<Label>`).
3. **Audio-Driven Anchors:**
   - Motion is anchored directly to transcript timestamps via `s.word("anchor").start` rather than hardcoded second constants, allowing instant retiming if voiceovers are re-recorded.
4. **Automated Review Loop:**
   - Instant static linting (`bun run lint:scene`), per-scene contact sheets (`bun run sheet`), and automated QC (`bun run qc`) provide a rapid feedback loop.

### Where Skia Had Advantages (and how the kit adapted)
1. **Shader Gradients vs SVG Gradients:**
   - Skia uses native hardware radial and sweep shaders. In `@wealthgap/kit`, we recreated the luminous contour rims using SVG linear/radial gradients, multi-stop pastel sweeps, and SVG feGaussianBlur drop-shadows.

---

## 4. Quality Control (QC) Result

Automated quality control (`bun run qc --video _FX_shadow_clip`) passed with **0 errors and 0 warnings**:
- **Duration Sync:** Exact (video: 11.61s, expected: 11.60s, delta 0.005s).
- **Audio Integrity:** Voiceover track present, integrated loudness -16.1 LUFS, True Peak -5.9 dBTP.
- **Visual Engagement:** Zero unwanted black frames; continuous ambient camera push-in and drift verified.
- **Broadcast Standard:** 1920×1080 H.264, 6.38 MB.

---

## 5. Verdict

**Did the kit reproduce the benchmark reference clip?**

### **YES**
The `@wealthgap/kit` motion graphics architecture successfully recreated both scenes (S01: `giant-shadow` and S02: `loose-change`), matching the reference clip's choreography, color tokens, scale contrast, and physical comedic timing while offering superior kinetic typography and declarative authoring.

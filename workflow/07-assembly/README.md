# Step 7: Final Assembly, Mastering & Review

This is the final integration stage where chunked video renders, mastered audio mixes, channel branding, and YouTube packaging metadata are assembled into the release candidate.

> **Status:** Specification Phase. (Full automation code to be integrated here).

---

## 🎯 Purpose & Workflow

1. **Lossless Video Concatenation**:
   Stitches `workspace/<VIDEO_ID>/05-video/chunks/part-*.mp4` into a continuous stream without re-encoding generation loss.
2. **Audio Muxing**:
   Replaces scratch audio with the mastered `-14 LUFS` composite mix from Step 6 (`06-audio/audio_mix.wav`).
3. **Channel Overlays**:
   Applies semi-transparent brand watermark (`brand-assets/WaterMark.png`) and end-screen subscription cards.
4. **Metadata & Packaging**:
   Generates SEO-optimized title, description with chapter timestamps, and tags.

---

## 📥 Inputs

1. **Video Chunks**:
   `workspace/<VIDEO_ID>/05-video/chunks/chunk_part*.mp4`
2. **Master Audio Mix**:
   `workspace/<VIDEO_ID>/06-audio/audio_mix.wav`
3. **Brand Assets**:
   `brand-assets/` (`Banner.png`, `Logo.png`, `WaterMark.png`)
4. **Chapter Timestamps**:
   Computed from Step 3 & Step 4 durations.

---

## 📤 Outputs

All final release deliverables are saved into:
```
workspace/<VIDEO_ID>/07-assembly/export/
├── master_4k.mp4                # Master 4K 60FPS video file for YouTube upload
├── thumbnail_01.png             # High-contrast 1280x720 thumbnail option A
├── thumbnail_02.png             # Thumbnail option B for A/B testing
└── youtube_metadata.json        # Title, description with chapters, tags
```

---

## 📋 Quality Assurance Checklist

- [ ] **LUFS Loudness Check**: Integrated loudness is between `-14.0 LUFS` and `-13.5 LUFS` (YouTube standard).
- [ ] **Frame Rate Consistency**: All chunks rendered at identical FPS (60.0 FPS, no dropped frames).
- [ ] **First 5 Seconds Audit**: Sound, motion, and hook title appear before second 0:03.
- [ ] **Mobile Legibility**: Text and chart numbers readable on an iPhone screen at 50% brightness.

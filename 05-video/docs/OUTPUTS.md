# Output Contract

Every completed job produces its deliverables in `jobs/<job-id>/output/` (or `workspace/<VIDEO_ID>/05-video/`):

```
jobs/<job-id>/output/
├── final.mp4                    1080p H.264 + AAC, final video deliverable
├── final_vertical.mp4           optional 9:16 vertical cut (if requested in config)
├── metadata.json                machine-readable video facts and verification details
├── scenes.json                  resolved storyboard timeline with exact props
├── captions.json                normalized word-level captions
├── captions.srt / captions.vtt  sidecar subtitles (phrase-level cues)
├── chapters.txt                 YouTube-ready chapters (starts at 0:00)
├── description_draft.md         description text with chapters, sources, and disclaimer
├── sources.md                   every figure shown on screen + reference citation
├── qc-report.md                 automated audit results (errors, warnings, checks)
├── render.log                   detailed render log with engine versions
├── stills/
│   ├── contact-sheet.png        visual contact sheet of all scenes/beats
│   ├── keyframes/               rendered review frames (enter, hold, exit)
│   └── thumbnails/              3 thumbnail candidates (1280x720 PNG, <2MB)
└── draft.mp4                    low-resolution draft preview (only in draft mode)
```

## QC Validation Rules
- **ERROR (Fatal):** Output file missing/empty, resolution mismatch, duration difference between video and audio >0.5s, no audio stream, black frames >0.5s, unsourced numbers when strict mode is active.
- **WARN (Non-blocking):** Audio loudness outside -14 ± 2 LUFS, freeze frames >3s, captions text fit warnings, component repetition (>2 consecutive scenes).

# Quality Control (QC) Report: sample-job

**Date:** 2026-10-18T12:20:17.913Z  
**Target Video:** `final.mp4`  
**Status:** PASSED WITH WARNINGS

## Summary
- **Errors (Blocking):** 0
- **Warnings:** 1
- **Info / Diagnostics:** 6

---

## Errors
_No blocking errors._

## Warnings
- **[loudness_tolerance]** Loudness -22.3 LUFS is outside -14 ± 2 LU tolerance.

## Diagnostic Details
- **[file_size]** File size: 11.14 MB (final.mp4)
- **[stream_spec]** Codec: h264, Resolution: 1920x1080, FPS: 30
- **[duration_match]** Duration sync exact: video=31.10s, audio+tail=31.20s (diff 0.096s).
- **[black_frames]** Zero unwanted black frames detected (continuous visual engagement).
- **[ambient_motion]** No static scenes over 3s. Ambient camera push-in and background drift verified.
- **[loudness_profile]** Integrated Loudness: -22.3 LUFS (target -14), True Peak: -16.3 dBTP.

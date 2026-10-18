# Storyboard Planner Rules

## 1. Scene Segmentation
- **One Idea per Scene:** A scene represents a single conceptual point or data insight.
- **Duration Targets:**
  - Optimal duration: 3.0 to 8.0 seconds.
  - Hard minimum: 2.0 seconds.
  - Hard maximum: 12.0 seconds (if longer than 8.0s, introduce an internal visual beat/shift).
- **Cuts & Pauses:** Align cuts with sentence ends or natural voiceover pauses of 250ms or longer. Visuals lead voice by 150–250ms.
- **Coverage:** Scene 1 starts at 0ms; final scene finishes at `audioDuration + tailPaddingMs`.

## 2. Text & Density Limits
- Maximum **8 words** of on-screen text per scene (excluding data chart labels).
- Minimum text size: **30px** at 1920x1080.
- Safe Area: Keep key visual content at least 80px from left/right edges and 100px from top/bottom.
- One focal point per scene: Never animate more than two primary focal groups at once.

## 3. Variety & Pacing
- Do not repeat the same foreground component more than **twice in a row**.
- Alternate layout density: Centered punchy graphic -> Asymmetric comparison -> Calm term card.
- Provide a major visual set piece every 4 to 6 scenes.

## 4. Grounding & Data Integrity
- Every numeric figure shown on screen must link to `dataRef` or verbatim transcript token.
- Sourced figures must automatically append a `sourceTag` with publisher and year.
- If data is absent, use placeholder cards flagged with `NEEDS_DATA` in QC.

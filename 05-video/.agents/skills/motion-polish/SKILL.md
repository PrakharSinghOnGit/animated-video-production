---
name: motion-polish
description: Polish rules to elevate motions from generic slides to high-end Vox/Bloomberg motion graphics.
---

# Motion Polish Skill

## Numeric Motion Rules
- **Entrance:** `Easing.bezier(0.16, 1, 0.3, 1)` (18-24 frames for hero, 12-16 for labels).
- **Exit:** Half entrance duration, `Easing.in(Easing.cubic)`.
- **Stagger:** 85ms between list items (capped at 600ms).
- **Count-Up:** Ease-out 0.9s - 1.4s, landing on the exact spoken anchor word.
- **Ambient Drift:** Continuous camera push-in (`scale: 1.00 -> 1.04`) across every scene. Nothing static for > 3s.
- **Micro-Texture:** Subtle film grain (opacity < 0.05) and vignette.

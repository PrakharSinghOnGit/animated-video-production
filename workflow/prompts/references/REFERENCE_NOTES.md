# Reference Clip Craft Notes: Shadow Market

These notes explain the core motion design patterns demonstrated in `shadow_market.py` and its reference stills (`reference_stills/`), establishing the target craft standard for all LLM-authored Remotion scenes in `@wealthgap/kit`.

## 1. Word-Anchored Timeline Constants
All keyframes derive strictly from narration timestamps (`T_SHADOW = 0.50`, `T_STOCK = 3.02`, `T_LOOSE = 9.40`). Key actions lead spoken audio by 150–250ms so visual elements are already arriving and settling right as the narrator articulates the concept.

## 2. Dynamic Camera Keyframes
The camera never stands still. A continuous slow push-in (`scale: 1.0 -> 1.08`) or pull-back provides visual momentum. Smooth transitions (e.g., pulling back from the tight stock market planet to reveal the enormous shadow market abyss) use multi-segment cubic easing (`seg()` / `Camera`) rather than jump cuts.

## 3. Strict Three-Layer Depth Architecture
- **Backdrop:** `#101010` deep obsidian base with subtle ambient particle fields and slow drift.
- **Midground:** Organic contour rings (e.g., 14 nested concentric waveforms), sweeping rainbow rim light (`sweep()`), and soft atmospheric radial glows (`radial()` / `<Glow/>`).
- **Foreground:** High-contrast focal heroes (glowing orbs, 3D coin tilts with specular sparkles, squircle morphs) and clean typographic cards.

## 4. Continuous Morphing Shapes
Rather than popping into existence, geometry evolves. The central mass morphs organically between mathematical primitives (squircle $\to$ hexagon $\to$ pulsing blob) using polar coordinate interpolation (`shapes.lerp`), giving the financial market an alive, breathing quality.

## 5. Masked Label Reveals
Text is never presented as flat, static copy or simple opacity cross-fades. Labels wipe vertically through crisp clip-path masks with letter-by-letter or word-level stagger (38ms per character) and an accompanying animated underline stroke that grows dynamically with text width.

## 6. Ambient Motion & Settle Physics
Nothing is motionless for more than 3 seconds:
- Orbs rotate slowly on an inclined orbital plane with accompanying satellite rings.
- Coins toss in 3D perspective with sinusoidal wobbles and landing squashes.
- Sparkles flash at peak visual arrivals.

## 7. Lessons from Fix Passes
1. **Never hard-code frames:** Always anchor to `s.word()` and use `s.sec()`; frame rates can vary between draft (30fps) and broadcast (60fps).
2. **Layer budgeting:** Use SVG gradients and soft radial shaders rather than expensive heavy CSS blur filters (`filter: blur(...)`) to maintain sub-second preview rendering.
3. **Restraint in typography:** Maximum 8 words on screen, adhering strictly to safe margins and hold times ($0.5\text{s} + 0.28\text{s}/\text{word}$).

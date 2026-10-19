# Scene Plan: S01 (giant-shadow)

## 1. Idea & Hero Moment
- **Core Concept:** An invisible macro mass (the shadow currency market) dwarfs the traditional financial markets that the public thinks are large (stock, bond, crypto).
- **Hero Moment:** Macro opening starts tight on the luminous contour rim, camera pulls back to reveal the gargantuan dark mass, and on each "bigger" the mass inhales and surges with ripple rings while pushing born markets outward into deep space.

## 2. Visual Layers
- **Layer 1 (Backdrop):** Global `#101010` backdrop provided by `Backdrop.tsx` with subtle grid drift.
- **Layer 2 (Midground):** 
  - 10 concentric contour waveforms pulsating around the central mass.
  - Rainbow rim glow around the main body (`<Glow/>` and stroke sweep).
  - Floating ambient micro-particles (`<Particles count={35} />`).
  - Expanding shockwave ripple rings on "bigger" and entity births (`<Ring/>`).
- **Layer 3 (Foreground):**
  - Central dark morphing body (`<MorphShape/>` interpolating squircle to breathing blob).
  - Mint Stock Market orb with tilted ring and glow (`<Orb/>`).
  - Lavender Bond Market breathing between circle and squircle (`<MorphShape/>`).
  - Tiny Peach Crypto gem inside the mass (`<Gem/>`).
  - Masked text labels with underline reveals (`<Label/>`).

## 3. Timeline Table & Choreography
- `f = 0..30` (t=0..1.0s): Camera macro pull-back (2.3x -> 1.0x).
- `f = 12` (t=0.4s, anchor: "shadow" -100ms): Label "SHADOW MARKET" reveals through mask; rose underline draws on.
- `f = 70` (t=2.34s, anchor: "bigger" #1): Mass inhales 6% and emits an outward ripple ring.
- `f = 86` (t=2.85s, anchor: "stock" -170ms): Mint orb is born at left rim with spring overshoot and ripple; "STOCK MARKET" label emerges below it.
- `f = 109` (t=3.64s, anchor: "bigger" #2): Second, larger swell; orbs nudged outward; stock label exits.
- `f = 136` (t=4.55s, anchor: "bond" -190ms): Lavender squircle is born on the right rim; "BOND MARKET" label builds.
- `f = 212` (t=7.06s, anchor: "entire"): Mass swells further; bond label exits.
- `f = 225` (t=7.50s, anchor: "crypto" -220ms): Tiny peach gem pops in low inside the mass with a sharp sparkle and ripple; "CRYPTO MARKET" label above it.

## 4. Camera Plan
- `zoom`: 2.3 at f=0, smoothly pulling back via `ease.outExpo` to 1.0 by f=96 (3.2s), then slowly settling to 0.85 by f=255.
- Ambient handheld drift on `panX` / `panY` throughout.

## 5. Technical & Performance Safeguards
- Zero CSS animations or transitions.
- All geometry computed as functions of frame `f`.
- Glows rendered via SVG radial/linear gradients rather than heavy filter blurs.
- Strict token colors only.

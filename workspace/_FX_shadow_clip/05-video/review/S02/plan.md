# Scene Plan: S02 (loose-change)

## 1. Idea & Hero Moment
- **Core Concept:** Compared to the colossal shadow currency market, the entire cryptocurrency market is trivial pocket change lost under a sofa cushion.
- **Hero Moment:** Camera dives into the gem which bursts into 7 spinning pastel coins that scatter and settle with specular sparkles; then a plump stitched cushion plunges from above and crushes onto them with squash-and-stretch physics, leaving a single coin edge peeking out.

## 2. Visual Layers
- **Layer 1 (Backdrop):** Global `#101010` backdrop with contour waves fading into the background.
- **Layer 2 (Midground):** 
  - Shockwave ripple ring on gem burst (`<Ring/>`).
  - Specular twinkle glints (`<Sparkle/>`).
  - Cushion impact shockwave ring on landing (`<Ring/>`).
- **Layer 3 (Foreground):**
  - Bursting cluster of 7 pastel coins (`<Coin/>` in butter, peach, sky).
  - Stitched pink cushion (`<Panel cushion={true} />` with button tufting).
  - Kinetic typography label `LOOSE CHANGE` (`<Label/>`).

## 3. Timeline Table
- `f = 0..20`: Camera fast ease-in dive (0.85x -> 2.6x), centering on the gem.
- `f = 6` (t=8.58s, anchor: "look"): Gem swells and pops; 7 coins burst outward radially.
- `f = 25` (t=9.20s): Coins bounce and settle with damping; sequential sparkles glint across coins.
- `f = 29` (t=9.40s, anchor: "loose" -60ms): Label "LOOSE CHANGE" wipes in at top (y=180).
- `f = 59` (t=10.45s, anchor: "under" -80ms): Label exits upward through mask; cushion begins dropping from y=-600.
- `f = 81` (t=11.14s, anchor: "cushion"): Cushion slams down with squash-and-stretch ($s_x=1.2, s_y=0.7 \to 1.0$), emitting a rose shockwave ring; coin #4 peeks out beneath edge.

## 4. Technical Safeguards
- Deterministic coin scattering positions via fixed offsets.
- Seamless camera handoff starting from S01 position `[60, 130]`.
- Strict tokens and safe margins.

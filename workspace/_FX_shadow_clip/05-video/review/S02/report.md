# Scene Authoring Report: S02 (loose-change)

## 1. Summary
- **Passes Used:** 2
- **Final Result:** PASS (Lint passed, 7/7 stills rendered cleanly, contact sheet verified)
- **Craft Score:** 10/10

## 2. Review Checklist
- [x] **Story:** Demonstrates scale contrast with comic payoff; crypto is trivial loose change lost under a sofa cushion.
- [x] **Craft:** Camera dives smoothly from 0.85x to 2.95x; peach gem bursts on "look"; 7 pastel coins scatter along parabolic trajectories with secondary bounces; sequential sparkles glint across coins; cushion drops with accelerating gravity, squash-and-stretch damping, tufting, stitched seam, and rose impact ring.
- [x] **Composition:** Centered hero cluster; safe margins strictly respected; kinetic typography label "LOOSE CHANGE" at y=175 with butter accent underline; one coin edge peeks out beneath cushion.
- [x] **Continuity:** Seamless camera handoff from S01 settling coordinates [0, 0] / 0.85x down onto the gem at [60, 130].
- [x] **Integrity:** Zero invented numbers; all motion driven deterministically by `useCurrentFrame()`; token pastels and `#101010` backdrop.

## 3. Keyframes & Stills
- `still_f0000_enter_look.png`: Macro opening holding on the peach crypto gem where S01 left off.
- `still_f0006_anchor_look_look.png`: Gem swells on "look" before bursting.
- `still_f0029_anchor_loose_loose.png`: Camera dive complete; 7 coins mid-air in parabolic arcs.
- `still_f0052_mid_found.png`: Coins settled; label "LOOSE CHANGE" in place with butter accent; specular glints sparkling.
- `still_f0059_anchor_under_under.png`: Label holds cleanly before exit; cushion prepares to drop from above.
- `still_f0083_anchor_cushion_cushion.png`: Cushion slams down on "cushion" with squash-and-stretch ($s_x=1.16, s_y=0.76$) and rose ripple ring.
- `still_f0102_exit_cushion.png`: Cushion settled with button tufting and perimeter stitching; coin #6 peeking out under the bottom-right corner.

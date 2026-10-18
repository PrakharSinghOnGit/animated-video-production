# Motion Engine — Design System & Visual Taste Guide

## 1. Visual Philosophy
The Wealth Gap explainer style is cinematic, intellectual, and grounded in institutional data graphics. Every frame looks like a high-end financial intelligence briefing, drawing inspiration from Vox, Polymatter, and Bloomberg Originals. Visuals exist solely to illuminate the voiceover narrative through visceral metaphors, big legible numbers, and clean comparative geometry. We eliminate decorative clutter: one accent color directs attention, the dark textured background binds all scenes into a continuous world, and every animation has purpose.

---

## 2. Palette (Dark, Premium, One Accent)

| Token | Default Hex / RGBA | Role & Semantic Meaning |
| :--- | :--- | :--- |
| `bg` | `#0B0F14` | Deep obsidian canvas; foundation of every scene |
| `surface` | `#121923` | Card panels, data containers, raised baseline |
| `surface2` | `#1A2431` | Nested cards, borders, elevated chips |
| `text` | `#F4F6F8` | Primary headline and key numeral color |
| `muted` | `#8A97A6` | Secondary labels, citations, axis ticks |
| `accent` | `#F5B83D` | **The ONE highlight color** (Imperial Gold) |
| `accent2` | `#2EC4B6` | Secondary data series / comparative counterweight (Teal) |
| `positive` | `#3DDC97` | Gains, surpluses, inflow only (Emerald) |
| `negative` | `#FF5A5F` | Losses, deficits, debt, risks only (Coral Red) |
| `grid` | `rgba(255,255,255,0.06)` | Subtle isometric/orthogonal background coordinate grid |

### Color Rules:
1. **One Accent Per Scene:** Never clash multiple vibrant colors unless showing a direct comparative breakdown.
2. **Semantic Meaning Only:** Never use `positive` (green) or `negative` (red) for decoration.
3. **Contrast:** Every text element must meet or exceed a 4.5:1 WCAG contrast ratio against its underlying surface.
4. **No Pure Black/White:** `#000000` and `#FFFFFF` are strictly forbidden to prevent harsh clipping.

---

## 3. Typography Scale & Hierarchy

Two typefaces power the entire engine:
- **Body & Headlines:** `Inter` (geometric, modern, authoritative)
- **Numerals & Metrics:** `JetBrains Mono` or `Inter` with `tabular-nums`

### Size Scale (at 1920x1080 resolution):
- **Big Number Hero:** `260px` – `340px` (Weight: 800)
- **Scene Headline:** `130px` – `150px` (Weight: 700)
- **Subhead / Chapter:** `72px` – `84px` (Weight: 600)
- **Captions:** `52px` – `58px` (Weight: 600)
- **Body / Chart Labels:** `44px` – `52px` (Weight: 500)
- **Source Citation:** `30px` – `34px` (Weight: 500, uppercase, tracking: 0.05em)
- **Absolute Minimum:** Never render text below **30px** at 1080p.

### Formatting Rules:
- **Max 8 Words:** Never place more than 8 words of narrative text on screen simultaneously.
- **Numbers Formatted:** Always include tabular spacing, commas (`$9,600,000,000`), and units beside the digits in smaller scale (`$9.6` at 280px + `Trillion` at 90px).

---

## 4. Layout & Staging

- **Safe Zones:** 80px left/right margins and 100px top/bottom margins (scaled proportionally for resolution).
- **The Three-Layer Scene Anatomy:**
  1. **Layer 1: Background:** Persistent `GridDrift` + `Vignette` + subtle `GlowBlobs` (runs across all scene cuts to ensure continuity).
  2. **Layer 2: Midground Texture:** Subtle coordinate axes, faint radar rings, or low-contrast dot matrix.
  3. **Layer 3: Foreground Element:** The active semantic hero (`BigNumber`, `BarCompare`, `MoneyFlow`, etc.) + `SourceTag`.
- **One Focal Center:** The viewer's eyes must instantly recognize where to look within 300ms.

---

## 5. Motion Rules & Timings (Exact Numbers)

All motion is computed deterministically via Remotion's `interpolate()` using frame math (`frame = Math.round(ms / 1000 * fps)`).

- **Entrance Easing:** `Easing.bezier(0.16, 1, 0.3, 1)` (snappy ease-out expo).
  - Large hero elements: 18–24 frames (0.6s – 0.8s).
  - Secondary chips/labels: 12–16 frames (0.4s – 0.5s).
- **Exit Easing:** `Easing.in(Easing.cubic)` at half the entrance duration (6–10 frames). Elements never abruptly vanish.
- **Group Stagger:** 80ms – 90ms (2–3 frames) between subsequent list/bar elements. Stagger capped at 600ms total.
- **Count-Up Duration:** 0.9s – 1.4s with `Easing.out(Easing.cubic)`. Must hit 100% exactly on the spoken anchor word.
- **Camera Drift:** Subtle continuous push-in (`scale: 1.00 -> 1.04`) across every scene to prevent static freeze.
- **Lead Time:** Visuals enter 150ms – 250ms **before** the narrator utters the keyword.

---

## 6. Do's and Don'ts

| Do | Don't |
| :--- | :--- |
| Anchor animation peaks to spoken audio words | Use static time offsets disconnected from narration |
| Use tabular figures for changing numbers | Allow jittering digits during count-up |
| Place a `SourceTag` on data-driven scenes | Display unsourced statistics or claim-like text |
| Keep backgrounds unified across scene cuts | Jump between wildly different background colors |
| Use rough-notation highlights on key terms | Use cheesy bouncing clip-art or memes |
| Drive animation with inline CSS transform properties | Use CSS transitions, `@keyframes`, or Tailwind |

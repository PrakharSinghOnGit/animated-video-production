# CLAUDE.md — The Wealth Gap Motion Graphics Engine

The Wealth Gap video engine creates high-craft Vox/Polymatter-style animated finance videos using Remotion, Bun workspaces, and LLM-authored scenes with a strict render-and-look review loop.

---

## Folder Architecture & Boundaries
- `packages/kit/`: **The Component Library (`@wealthgap/kit`)**. Contains primitives (`Camera`, `MorphShape`, `Label`, `Orb`, `Gem`, `Coin`, `Panel`, `Ring`, `Sparkle`, etc.), design tokens, motion helpers, and lint rules. **Scene authors never edit the kit directly.**
- `workflow/`: **The Production Engine**. Automation scripts (`storyboard`, `timeline`, `author`, `still`, `sheet`, `assemble`, `render`, `qc`, `harvest`), templates, and prompts (`workflow/prompts/`). No video-specific assets live here.
- `workspace/<VIDEO>/`: **Per-Video Workspace**. Isolated environment containing audio, transcript, `storyboard.json`, `timeline.json`, scene code (`05-video/src/scenes/`), review contact sheets, and rendered MP4 deliverables.

---

## The Golden Rules (Strictly Enforced by Static Analysis)
1. **Always Render and Look:** An author must never declare a scene done without capturing stills, building a contact sheet, and reviewing visual frames.
2. **Design Tokens Only:** Zero raw hex or rgb literals. Colors must come from `tokens.color` (dark `#101010` obsidian foundation + refined pastel palette: `mint`, `lav`, `peach`, `sky`, `butter`, `rose`).
3. **Deterministic Frame-Driven Motion:** All motion is calculated strictly from `frame = useCurrentFrame()`. Never use `Math.random()`, `Date.now()`, `fetch()`, timers, or CSS `@keyframes` / `transition`. Use `seeded()` for pseudorandom noise.
4. **Spoken Word Anchoring:** Time animations via `s = useScene()`, e.g. `s.word("inflation").start - s.sec(0.1)`. Never rely on magical hardcoded frame numbers.
5. **No Full-Screen Opaque Backgrounds:** Allow the global `<Backdrop />` to show through.

---

## Core Command Reference
| Stage | Command | Purpose |
|---|---|---|
| **Scaffold Video** | `bun run new-video <ID>` | Create video workspace from template |
| **Storyboard** | `bun run storyboard --video <ID>` | Build storyboard prompt (manual or auto) |
| **Validate Storyboard** | `bun run storyboard:check --video <ID>` | Validate timing, anchor words, and tokens |
| **Build Timeline** | `bun run timeline --video <ID>` | Generate frame-accurate `timeline.json` |
| **Author Scenes** | `bun run author --video <ID>` | Orchestrate scene prompts and verification |
| **Lint Scene** | `bun run lint:scene --video <ID> --scene <S01>` | Run static analysis rules on scene code |
| **Render Stills** | `bun run still --video <ID> --scene <S01>` | Capture keyframe PNG stills |
| **Contact Sheet** | `bun run sheet --video <ID> --scene <S01>` | Tile stills into visual contact sheet |
| **Assemble** | `bun run assemble --video <ID>` | Wire scene registry, SFX cues, and citations |
| **Draft Preview** | `bun run draft --video <ID>` | Fast 30fps half-res review render (Gate 2) |
| **Final Render** | `bun run render --video <ID>` | Broadcast 1080p H.264 video with audio |
| **Automated QC** | `bun run qc --video <ID>` | Verify duration sync, zero black frames, loudness |
| **Harvest Patterns**| `bun run harvest --video <ID>` | Propose reusable primitives for promotion to kit |
| **Full Build** | `bun run build --video <ID>` | Run full pipeline with Gate 1 & 2 pauses |

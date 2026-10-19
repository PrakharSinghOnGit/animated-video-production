# Migration Decisions Log

> **Context:** Architectural and design decisions confirmed with the user during Phase 0 Gate 0.

| # | Question / Topic | Decision Made | Rationale / Implementation Details |
|---|---|---|---|
| **1** | **Working Tree Baseline** | **Commit previous fixes** | Commit the timing resolution fix in `DynamicScene.tsx`, the auto-captions and audio muxing in `chunk.ts`, and updated workspace metadata as a baseline commit on `migration/kit`. |
| **2** | **Design Tokens & Palette** | **#101010 Obsidian base + pastel palette** | Primary background defaults to `#101010` (never pure black `#000000`). Palette uses pastel set (`lav: #C7B8FF`, `mint: #A8E6CF`, `peach: #FFC9A8`, `sky: #A8D8FF`, `butter: #FFE8A3`, `rose: #FFB3C7`). Legacy tokens (`#0B0F14`, gold `#F5B83D`, teal `#2EC4B6`) preserved as backward-compatible aliases for older compositions. |
| **3** | **Frame Rate Targets** | **30 fps drafts / 60 fps finals** | Draft renders run at 30 fps (0.5x scale) for fast preview iteration. Final broadcast renders run at 60 fps for ultra-smooth easing curves and fluidity. |
| **4** | **3D & Three.js in Kit** | **Keep Globe3D in @wealthgap/kit** | `Globe3D` stays within `@wealthgap/kit` (under `src/three/Globe3D`). Bundler tree-shaking will exclude Three.js from scenes that do not import it. |
| **5** | **Storyboard Mode** | **Manual mode as default** | `bun run storyboard` defaults to writing `review/storyboard_prompt.txt` so prompts can be pasted into Claude/Gemini web interfaces or automated via flags. `--auto` flag enables direct CLI/API calls. |
| **6** | **Authoring Concurrency** | **Auto-detect with flag overrides** | `bun run author` auto-detects CPU/system resources with a safe default, and supports `--concurrency <N>` flag for explicit parallel scene processing. |

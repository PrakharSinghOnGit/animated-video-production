# Assumptions Log

This document records architectural, design, and pipeline assumptions made for the **Motion Engine**, updated as questions are answered or decisions made.

---

### Phase 0 Assumptions (Initial Setup)

1. **Team Size & Remotion Licensing:**
   - **Assumption:** Single-creator / small team (< 3 individuals).
   - **Rationale:** Remotion is free for individuals and companies/teams with up to 3 people. No enterprise license required for this setup.

2. **Language:**
   - **Assumption:** Primary language is English (`en`), with potential for Hindi or multi-language in future iterations.
   - **Rationale:** All current script and voiceover assets (`VID01_Currency_Market`) are English.

3. **Aspect Ratios:**
   - **Assumption:** Default aspect ratio is 16:9 (`1920x1080`), with 9:16 (`1080x1920`) vertical shorts supported as an optional variant via config.
   - **Rationale:** Standard YouTube horizontal long-form is the channel's main output.

4. **Music & Audio SFX:**
   - **Assumption:** Background music is strictly user-supplied per job (`input/assets/` or `config.json`); if absent, video renders voiceover + sound effects only. SFX uses the curated clean subset from `@remotion/sfx` (whoosh, whip, ding, etc.), avoiding meme sound effects.
   - **Rationale:** Prevents copyright issues and preserves serious finance explainer tone.

5. **External Connectors & MCPs:**
   - **Assumption:** No external rendering MCPs or paid cloud services (no Playwright MCP, Figma MCP, ElevenLabs, or cloud renderers) active for v1. Rendering is 100% local, offline, deterministic, and self-contained.
   - **Rationale:** Keeps builds zero-cost, portable, and reproducible.

6. **Workspace Integration vs Jobs:**
   - **Assumption:** The Motion Engine supports both standard `jobs/<job-id>` folders and seamless mapping to the studio's `workspace/<VIDEO_ID>/` folder.
   - **Rationale:** Bridges Step 3/4 pipeline outputs directly into Step 5 without manual file duplication.

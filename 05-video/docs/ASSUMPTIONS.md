# Assumptions & Architectural Decisions Log

This document records architectural, design, and pipeline decisions made for the **Motion Engine**.

---

### Phase 0 Confirmed Architecture Decisions

1. **Team Size & Remotion Licensing:**
   - **Confirmed:** Solo creator ("just me").
   - **Decision:** Complies with Remotion's free license tier for individuals and teams up to 3 people. No enterprise license required.

2. **Aspect Ratios:**
   - **Confirmed:** 16:9 horizontal default (`1920x1080`) with optional 9:16 vertical cuts (`1080x1920`).
   - **Decision:** Long-form YouTube horizontal is the primary canvas; components use `layout.ts` helpers to seamlessly adapt to 9:16 when requested in `config.json`.

3. **Background Music:**
   - **Confirmed:** Job-specific. Only include background music if an audio track is explicitly supplied in `input/assets/` or specified in `config.music.file`.
   - **Decision:** If no music is provided, videos render clean voiceover + SFX only. Never download music at render time.

4. **Language:**
   - **Confirmed:** English only for v1.
   - **Decision:** Schema will maintain `language: string` (default `"en"`) so future multi-language or localized tracks remain compatible without schema changes.

5. **External Connectors & APIs:**
   - **Confirmed:** 100% offline, local, and code-driven.
   - **Decision:** Zero external map/tile APIs or live rendering connectors. Maps will use bundled TopoJSON (`world-atlas` / `d3-geo`). Fonts and SFX will be bundled locally. Renders are strictly deterministic and require no network access.

6. **Studio Workspace Integration:**
   - **Decision:** The engine supports both `jobs/<job-id>` and directly pointing to `workspace/<VIDEO_ID>` to read `03-voiceover` audio and `04-transcription` words without duplicating large files.

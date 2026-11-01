# The Wealth Gap: video production studio

Code-driven pipeline for 8-10 minute finance explainers: original script, local cloned-voice TTS, word-aligned
transcript, acts drawn in the Briefing style (Remotion + canvas), audio mix, render, QC.

- How to make a video (steps, costs, gates, fixes): [`VIDEO_PRODUCTION.md`](VIDEO_PRODUCTION.md)
- Layout and rules for act code: [`CLAUDE.md`](CLAUDE.md)
- Control room: `bun run dashboard` (on this Mac), `bun run dashboard:public` (password + link/QR for your phone, via Tailscale Funnel)

## Layout

```
packages/kit/        @wealthgap/kit: spy/ (Briefing engine), paper/ (shared canvas helpers), main/ + backgrounds/
workflow/
  01-ideation/       research and angle prompts
  02-scripting/      write_script.ts (bun run write), voice.md, yt-script/
  03-voiceover/      local Qwen3-TTS (channel voice, designed with voice:design); see its README
  04-transcription/  word-level Whisper timestamps
  05-video/          direct / act / frames / review / assemble / render / qc scripts, template/ (render scaffold)
  06-audio/          foley, mix, master
  prompts/           DIRECTOR.md, ACT.md, WRITER.md
  styles/briefing/   STYLE.md + ACT.md for the house style
scripts/             new_video.ts (bun run new-video <ID>)
workspace/<VIDEO>/   per-video assets (gitignored)
```

## Quick start

```bash
bun install
bun run new-video VID04_Example          # scaffold workspace/VID04_Example/
# write 02-scripting/idea.md, then follow VIDEO_PRODUCTION.md
bun run write --video VID04_Example      # script (paid)
bun run tts:format --video VID04_Example
bun run tts --video VID04_Example        # local voice, free
bun run transcribe --video VID04_Example
bun run direct --video VID04_Example --check   # free, read-only plan check
bun run studio                           # Briefing engine preview (or: studio --video <ID>)
```

`bun run tts --help` and the scripts' own `--help`/usage output list every flag.

# Step 6: Audio

## Voiceover mastering (implemented)

```bash
bun run audio:master --video <ID> [--in <wav>] [--out <wav>] [--target-lufs -14] [--tp -1]
```

- Input (default): `workspace/<ID>/03-voiceover/audio/combined/full_voiceover.wav`
- Output (default): `workspace/<ID>/06-audio/voiceover_master.wav` (48 kHz, mono, 24-bit PCM)

Chain (ffmpeg): resample to 48 kHz, highpass 80 Hz, de-ess (skipped with a warning if `deesser` is missing), gentle compression, a fixed-seed pink-noise room tone (about -62 dBFS) so silences are not digital zero, two-pass `loudnorm` (I=-14, TP=-1, LRA=11, linear), and an `alimiter` only if true peak still exceeds the ceiling.

Before/after integrated LUFS, true peak and LRA are printed. The run fails if duration differs from the input by more than 10 ms (word timestamps depend on it) or if true peak exceeds the ceiling.

The video engine (`resolveJobPaths` in `workflow/05-video/src/lib/workspaceBridge.ts`) uses `voiceover_master.wav` when it is newer than the combined voiceover; otherwise it warns that the master is stale and uses the combined file.

## Not implemented

SFX, music beds and sidechain ducking (`dialogue_stem.wav`, `sfx_stem.wav`, `music_stem.wav`, `audio_mix.wav`) are not built yet.

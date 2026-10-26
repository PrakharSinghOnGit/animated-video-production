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

## Music bed, foley and final mix (implemented)

```bash
bun run audio:music --video <ID>   # workspace/<ID>/06-audio/music_plan.json -> music.wav + beats.json
bun run audio:mix   --video <ID>   # voice + music + foley -> workspace/<ID>/06-audio/mix.wav
```

`audio:mix` inputs: `06-audio/voiceover_master.wav` (fallback `05-video/public/voiceover.wav`), optional `06-audio/music.wav`, optional `05-video/events.json`. Extra flags pass through to `mix.py`: `--duck-db -12 --music-db -4 --foley-db 0 --trim <sec> --lufs -14 --tp -1`. Output: 48 kHz, 24-bit stereo, two-pass loudnorm to -14 LUFS / -1 dBTP; measured LUFS and true peak are printed. Music is ducked about 12 dB under speech (80 ms attack, 400 ms release); bus compression is gentle.

`music_plan.json` (deterministic, numpy/scipy synthesis, no samples):

```json
{"sr":48000,"duration":600,
 "sections":[{"t0":0,"t1":120,"bpm":88,"key":"D","mode":"major|minor|dorian","intensity":0.4,"instruments":["keys","bass","pad","brush","kick"]}],
 "hits":[{"t":40,"kind":"silence","dur":1.5},{"t":41.5,"kind":"downbeat"}]}
```

Felt electric piano, plucked bass and a soft pad play a 4-chord progression per section; brushes and soft kick enter only at intensity > 0.4. Sections crossfade on the next section's downbeat. `silence` hits drop the bed to about -70 dB for `dur`. `beats.json` lists every beat time (`beats`), the bar starts (`downbeats`) and per-section bpm/bars, so the picture can snap to them.

`events.json` (foley): `[{"t":12.4,"type":"pencil_scratch","d":0.8,"gain":1,"pan":0}]`. Types: `pencil_tap`, `pencil_scratch`, `ruler_hiss`, `paper_slide`, `stamp_thud`, `page_turn`, `adding_clack`, `pop`, `whoosh`. `d` applies to the variable-length ones; `gain` 0..2, `pan` -1..1. Each event is seeded by its index, so mixes are reproducible. Base levels are in `FOLEY` in `sfx.py`.

Python: repo `.venv` (override with `WG_PYTHON`); needs `numpy scipy soundfile soxr` (`requirements.txt`). Not implemented: separate stems (`mix.py --stems <dir>` dumps music/foley/voice for inspection only).

## Credits

`sfx.py` is adapted from LemoLab's opuscar `core/audio/sfx.py` (MIT); the mixing approach follows its `mux.sh` two-pass loudnorm and `dataviz/demo` score/mix scripts.

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
bun run audio:music --video <ID>   # music.json (made from music_plan.json if missing) -> music.wav + beats.json
bun run audio:mix   --video <ID>   # voice + music + foley -> workspace/<ID>/06-audio/mix.wav
```

`audio:mix` inputs: `06-audio/voiceover_master.wav` (fallback `05-video/public/voiceover.wav`), optional `06-audio/music.wav`, optional `05-video/events.json`. Extra flags pass through to `mix.py`: `--duck-db -12 --music-db -4 --foley-db 0 --trim <sec> --lufs -14 --tp -1`. Output: 48 kHz, 24-bit stereo, two-pass loudnorm to -14 LUFS / -1 dBTP; measured LUFS and true peak are printed. Music is ducked about 12 dB under speech (80 ms attack, 400 ms release); bus compression is gentle.

### Per-chapter music (you choose)

**Music library.** Drop tracks into `assets/music/<mood>/` (moods: calm, hopeful, curious, tense, dark, driving, triumphant; top-level files are "untagged") and run `bun run music:lib`: it measures length, BPM and energy into `assets/music/index.json` (edit mood, `license`, `credit` there). A **new** `music.json` then takes one track per chapter from the library (mood from the section's mode, energy from its intensity, no repeats while others fit; later acts of the chapter continue the same track) and keeps the synth palette as `fallback`. `--synth` ignores the library.

**Generated beds**: `music_prompts.json` holds ready prompts per style and mood (dashboard: Sound → Music stem → Prompts, with Copy). Generate in Stable Audio or any tool, save into the mood folder the prompt names, then scan the library.

`audio:music` reads `workspace/<ID>/06-audio/music.json`, which is created from `music_plan.json` (and `05-video/chapters.json` if present) **only if missing**. Edit it freely; `--reset` regenerates it, `--refresh-timing` re-reads act timings but keeps your sources. Flags: `--audition` (20 s excerpt per section to `06-audio/audition/<label>.wav`).

```json
{"version":1,"sr":48000,"duration":624.6,"crossfadeSec":1.8,
 "sections":[
  {"t0":0,"t1":98.133,"label":"A01","source":{"type":"synth","palette":"felt","bpm":88,"key":"D","mode":"major","intensity":0.35}},
  {"t0":98.133,"t1":168.333,"label":"A02","intro":"swell","title":"Chapter 2",
   "source":{"type":"file","path":"assets/music/calm_loop.mp3","gainDb":-2,"start":8,"credit":"\"Title\" by X, licence URL"}},
  {"t0":168.333,"t1":238.4,"label":"A03","source":{"type":"epidemic","trackId":"abc123"}}],
 "hits":[{"t":78.4,"kind":"silence","dur":0.7}]}
```

- `synth` palettes (deterministic, our own IP): `felt` (felt e-piano, pluck bass, pad, brushes), `kalimba` (kalimba/marimba plucks), `arp` (warm pad, slow arpeggio with dotted echo, sub), `jazz` (walking upright bass, swung brushes, sparse comping), `celesta` (music-box melody over soft pad). Defaults give every chapter a different palette and a neighbouring key (D, A, B minor, G, E dorian, ...).
- `file`: a licensed track you supply in `assets/music/` (gitignored). It is looped with 1.5 s equal-power crossfades or trimmed to the section, tempo untouched; every section is levelled to the same loudness, `gainDb` trims it. Add `credit` (and `"attribution":false` if none is required) so `credits.txt` is right. Optional `bpm` gives beats.json a grid.
- Section changes crossfade for `crossfadeSec` (1.8 s), ending exactly on the new section's first downbeat (the new section pre-rolls its previous bar). `"intro":"swell"` fades the new section in slowly (about 3 s past the downbeat, `swellSec`) so it rises while the narrator is silent. With `chapters.json` (`[{n,title,pauseStartMs,startMs}]`) the chapter's section starts at `pauseStartMs` with a swell.
- `silence` hits drop the bed to about -70 dB; `downbeat` hits add a soft thump and chord on act starts (synth sections). `beats.json` lists beats, downbeats and per-section palette/bpm/bars.

### Epidemic Sound (licence-gated)

The free Partner API key has no commercial licence (prototyping only). `bun run music:search --video <ID> --section A03 --mood calm,hopeful --bpm 80-100 --limit 8` saves candidates (title, artist, bpm, moods, length, preview URL) to `06-audio/epidemic_candidates.json`; it stops on HTTP 401/403/429 and never prints the key. `{"type":"epidemic","trackId":"..."}` sections download to `assets/music/epidemic/` (with a manifest) only when `EPIDEMIC_COMMERCIAL=1` (paid, safelisted subscription); otherwise the section renders with synth and prints "Epidemic free tier: no commercial licence - using synth". Check your key (prints only the status code):

```bash
bun -e 'const r=await fetch("https://api.epidemicsound.com/v0/moods",{headers:{Authorization:`Bearer ${process.env.EPIDEMIC_API}`}});console.log(r.status)'
```

### Foley library (Openverse, data only)

`bun run sfx:fetch [--types pop,whoosh] [--per-type 5] [--force]` builds `assets/sfx/<type>/*.wav` (48 kHz mono, leading silence trimmed, peak -3 dBFS) from the anonymous Openverse API (licences cc0, pdm, by only; CC0/PDM ranked first; 20 req/min, 200/day respected) and `assets/sfx/manifest.json` (id, title, creator, licence, licence URL, source and landing URL, attribution string, retrieval date). Samples are Freesound preview MP3s (Openverse `source=freesound`: its Wikimedia audio includes Lingua Libre word recordings, and one, a person saying "rubber stamp", once got into `stamp_thud`). Titles/tags/creators that look like speech recordings are skipped, and every new clip is transcribed by local Whisper (`sfx_speech.py`, faster-whisper `small.en`); a clip Whisper is confident contains words (no-speech probability < 0.25) is dropped. `bun run sfx:check` runs the same check over the whole library and removes offenders. `mix.py` uses a seeded library pick (+-4 % pitch, +-1.5 dB, level-matched to the procedural design) and falls back to the synth when a type has no samples (`--no-lib` forces synth). Types: pencil_tap, pencil_scratch, ruler_hiss, paper_slide, stamp_thud, page_turn, adding_clack, pop, whoosh, coin_drop, cash_register, typewriter.

The mix writes `06-audio/credits.txt`: first the CC BY assets (and licensed music) that need a description credit, then the no-attribution list (CC0/PDM/procedural).

Ducking: the follower treats voice below -50 dBFS as silence, so the duck fully releases in long pauses (release 0.4 s: -1 dB after 1 s, about 0 dB after 2 s).

`events.json` (foley): `[{"t":12.4,"type":"pencil_scratch","d":0.8,"gain":1,"pan":0}]`. Types: `pencil_tap`, `pencil_scratch`, `ruler_hiss`, `paper_slide`, `stamp_thud`, `page_turn`, `adding_clack`, `pop`, `whoosh`, `coin_drop`, `cash_register`, `typewriter`. `d` applies to the variable-length ones; `gain` 0..2, `pan` -1..1. Each event is seeded by its index, so mixes are reproducible. Base levels are in `FOLEY` in `sfx.py`.

Python: repo `.venv` (override with `WG_PYTHON`); needs `numpy scipy soundfile soxr` (`requirements.txt`). Not implemented: separate stems (`mix.py --stems <dir>` dumps music/foley/voice for inspection only).

## Credits

`sfx.py` is adapted from LemoLab's opuscar `core/audio/sfx.py` (MIT); the mixing approach follows its `mux.sh` two-pass loudnorm and `dataviz/demo` score/mix scripts.

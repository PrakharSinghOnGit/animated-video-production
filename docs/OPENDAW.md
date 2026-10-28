# Editing the sound in openDAW

The auto mix (`06-audio/mix.wav`) places every foley event where the acts say. When one is a bit early, too loud, or you
want a music loop under a chapter, open the whole soundtrack in [openDAW](https://opendaw.studio) (a free, open-source
browser DAW that runs locally here), fix it by ear, and export. The next render uses your export automatically.

## Setup (once per machine)

```bash
bun run daw:setup      # clones openDAW at a pinned commit into tools/opendaw/ (gitignored), npm install, build (~5 min)
```

Needs `git`, `npm` and Node 23 or newer (check `node -v`), plus the usual repo tools (`ffmpeg`, the repo `.venv`).
No Rust is needed: the audio engine comes prebuilt from npm. The repo carries a small patch
(`workflow/06-audio/opendaw/opendaw.patch`) that adds two things to openDAW: opening `?bundle=` projects and
**File > Export > To video pipeline**. Re-run `bun run daw:setup --force` after pulling a changed patch.

## Every video

1. Finish the Sound step (cues, music stem, mix) in the dashboard.
2. Sound step > **Build openDAW project** (or `bun run daw --video <ID>`, about 10 s). This writes
   `workspace/<ID>/06-audio/daw/project.odb` (about 350 MB for a 9 min video) and one WAV per foley event in
   `06-audio/daw/sfx/`.
3. Top bar > **openDAW**. The dashboard starts the local openDAW (like Studio does for Remotion), and a new tab opens with
   the project loaded. The first start takes a few seconds; loading the project takes about 10 s.
4. Edit (below).
5. In openDAW: **openDAW menu (top left) > Export > To video pipeline**. It renders the mix, sends it to the dashboard, and
   shows "Mix sent to the video". The dashboard masters it to -14 LUFS / -1 dBTP and saves it as `06-audio/mix_daw.wav`
   (the Sound step shows it under "Edited in openDAW", with a player). Your unmastered export is kept in
   `06-audio/daw/export_raw.wav`.
6. Draft or final render as usual. The render log says `audio: mix_daw.wav (openDAW export)`.

Closing the tab does not lose anything you exported. To stop the openDAW server, stop the dashboard (it is stopped with it).

## What the tracks are

| Track | Contents |
|---|---|
| Voice | `voiceover_master.wav` at 0:00 |
| SFX `<type>` (e.g. SFX card_slap) | every event of that type, one clip each, named `<act> <type>` (e.g. `A05 card_slap`). A track has several lanes when events of one type overlap in time |
| Music | the `music.wav` stem at 0:00 (if you ran Music stem) |
| Music loops (drop here) | empty: drag your loops in |

Each foley clip is the exact sound the auto mix uses (same seed, same library sample, same level for its type). The
event's own `gain` from the acts is on the clip as the clip gain. Tempo is 120 BPM (one beat = 0.5 s, one bar = 2 s), so
the grid helps you place things; it does not stretch anything (clips play at original speed).

## How to

- **Retime an SFX:** drag the clip left or right on its track. The Snap menu above the timeline sets the grid (at 120 BPM
  a beat is 0.5 s); pick a finer value or "off" for small moves.
- **Change a clip's gain:** select the clip and change its gain in openDAW's clip properties. To change a whole type (all
  card_slaps), use that track's volume fader in the mixer.
- **Mute or remove:** mute the clip, or the whole track with `M`; delete removes it.
- **Music loops:** import WAV/MP3 loops (openDAW menu > Import > Audio Files) and place them on "Music loops", repeat them as needed, and set the level with the track fader. The generated Music track stays as a reference; mute it if you
  replace it. Licences still apply: Epidemic free-tier tracks must not reach a monetised video, and CC BY needs credits
  (see `VIDEO_PRODUCTION.md`). Anything you add is not in `06-audio/credits.txt`: add its credit yourself.
- **Save your work-in-progress:** File > Save (kept in the browser's storage for this openDAW) or File > Save Bundle
  File to Disk. Re-clicking the dashboard's openDAW button for the same build does not reload the project, so it never
  replaces your edits: use File > Open... to continue. See "Rebuilding" below.
- **Length:** the exported mix is as long as your last clip. If a loop runs past the end of the voice, the file is longer
  than the video; trim the clip.

## What happens on render

`render` (and `draft`) pick `06-audio/mix_daw.wav` over `06-audio/mix.wav` when it exists and is **not older** than
`mix.wav`. QC then measures the loudness of whatever is in the video, so a bad export fails QC like any other mix.
Because the dashboard masters the export (the same targets as `audio:mix`: -14 LUFS integrated, -1 dBTP), the level
should pass; your relative balance between voice, SFX and music is kept (one gain for the whole file, plus a limiter only
if a peak is still over).

## Going back to the auto mix

- Delete `06-audio/mix_daw.wav` (the Sound step also shows when `mix.wav` is newer), or
- run **Mix** again (`bun run audio:mix --video <ID>`): the new `mix.wav` is newer, so it wins.

## If you rebuild the project

Building again (`bun run daw`, or the dashboard button) overwrites `06-audio/daw/project.odb` and the `daw/sfx/` WAVs, and
gives the project a new build id so the next click loads it fresh. **Edits that you did not export are lost** (retimed
clips, gains, added loops). Rebuild when the acts changed and you re-ran Cues (the Sound step flags
"The cues changed since this project was built"). Your last export (`mix_daw.wav`) stays, but it no longer matches new
cues. If you only want to keep your edits, do not rebuild; if you want both, save a bundle first
(File > Save Bundle File to Disk) and open it later from the same menu.

## Limits and notes

- Voice and SFX are placed from the cue times: if you re-record the voice or change the cues, rebuild.
- openDAW's mixdown has no bus compressor; the dashboard's mastering step stands in for it. It is not identical to the
  auto mix's compressor, so an untouched project exported and the auto mix will sound close, not bit-identical.
- Runs only on this machine (`localhost:8080`); the export goes to the dashboard on the same machine.
- 350 MB projects are heavy for a browser tab. If the tab feels slow, use `bun run daw --video <ID> --no-music`.
- The local openDAW is a development build of openDAW at a pinned commit; update it deliberately (change
  `OPENDAW_COMMIT` in `workflow/06-audio/opendaw/setup.ts`, re-make the patch).

_Not verified by the author in the openDAW UI:_ the exact wording of openDAW's own editing controls above (they are openDAW's, see its manual at opendaw.studio). What was verified: the project loads with all tracks and clips, and **Export > To video pipeline** delivers a mix to the dashboard.

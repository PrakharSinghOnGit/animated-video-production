#!/usr/bin/env python3
"""Lengthen pauses in already-generated narration, without re-voicing.

For every section WAV, the silence at each sentence end (from the aligned word timestamps)
is extended to --sentence-gap seconds, and each section ends with --section-gap seconds of
silence. Originals are kept in <audio>/_raw/ (with the word timestamps they were aligned to),
so the step can be re-run with other values and always starts from the untouched audio.

Usage: gaps.py --audio-dir <ws>/03-voiceover/audio --words-dir <ws>/04-transcription/words
               [--sentence-gap 0.6] [--section-gap 0.9]
"""
import argparse
import glob
import json
import os
import re
import shutil

import numpy as np
import soundfile as sf

SENT_END = re.compile(r"[.!?][\"')\]]*$")
FRAME = 0.01          # 10 ms analysis frames
QUIET_DB = -42.0      # below this a frame counts as silence


def frames_db(wav, sr):
    n = int(sr * FRAME)
    m = len(wav) // n
    rms = np.sqrt(np.mean(wav[: m * n].reshape(m, n) ** 2, axis=1) + 1e-12)
    return 20 * np.log10(rms)


def silence_run(db, center):
    """[a, b) frame range of the quiet run that contains (or is nearest to) frame `center`."""
    quiet = db < QUIET_DB
    if not quiet.size:
        return center, center
    c = int(np.clip(center, 0, len(quiet) - 1))
    if not quiet[c]:
        # look ±80 ms for the nearest quiet frame
        near = [i for i in range(max(0, c - 8), min(len(quiet), c + 9)) if quiet[i]]
        if not near:
            return c, c
        c = min(near, key=lambda i: abs(i - c))
    a = c
    while a > 0 and quiet[a - 1]:
        a -= 1
    b = c
    while b < len(quiet) and quiet[b]:
        b += 1
    return a, b


def process(wav, sr, words, sentence_gap, section_gap):
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    db = frames_db(wav, sr)
    inserts = []  # (sample index, n samples of silence to insert)
    for w, nxt in zip(words, words[1:]):
        if not SENT_END.search(w["word"].strip()):
            continue
        mid = (w["end"] + nxt["start"]) / 2
        a, b = silence_run(db, int(mid / FRAME))
        have = (b - a) * FRAME
        if have < sentence_gap:
            at = int(((a + b) / 2) * FRAME * sr)
            inserts.append((at, int((sentence_gap - have) * sr)))
    out, prev = [], 0
    for at, n in sorted(inserts):
        out.append(wav[prev:at])
        out.append(np.zeros(n, dtype=wav.dtype))
        prev = at
    out.append(wav[prev:])
    y = np.concatenate(out)
    # trailing silence = section gap
    tail_db = frames_db(y, sr)
    loud = np.nonzero(tail_db >= QUIET_DB)[0]
    tail = (len(tail_db) - 1 - loud[-1]) * FRAME if len(loud) else 0.0
    if tail < section_gap:
        y = np.concatenate([y, np.zeros(int((section_gap - tail) * sr), dtype=y.dtype)])
    return y, len(inserts)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio-dir", required=True)
    ap.add_argument("--words-dir", required=True)
    ap.add_argument("--sentence-gap", type=float, default=0.6)
    ap.add_argument("--section-gap", type=float, default=0.9)
    a = ap.parse_args()

    raw = os.path.join(a.audio_dir, "_raw")
    sections = sorted(glob.glob(os.path.join(a.audio_dir, "part-*", "*.wav")))
    total_added, total_inserts = 0.0, 0
    for path in sections:
        name = os.path.basename(path)
        part = os.path.basename(os.path.dirname(path))
        raw_wav = os.path.join(raw, part, name)
        raw_words = os.path.join(raw, "words", name.replace(".wav", ".json"))
        words_json = os.path.join(a.words_dir, name.replace(".wav", ".json"))
        # First run, or the section was re-voiced since: snapshot it with the words aligned to it
        if not os.path.exists(raw_wav) or os.path.getmtime(path) > os.path.getmtime(raw_wav) + 1:
            if not os.path.exists(words_json) or os.path.getmtime(words_json) < os.path.getmtime(path):
                raise SystemExit(f"✗ {name}: transcribe the new audio before adding gaps (words are older than the audio)")
            os.makedirs(os.path.dirname(raw_wav), exist_ok=True)
            os.makedirs(os.path.dirname(raw_words), exist_ok=True)
            shutil.copy2(path, raw_wav)
            shutil.copy2(words_json, raw_words)
        wav, sr = sf.read(raw_wav, dtype="float32")
        words = json.load(open(raw_words))["words"]
        y, n = process(wav, sr, words, a.sentence_gap, a.section_gap)
        sf.write(path, y, sr, subtype="PCM_16")
        os.utime(raw_wav, None)  # the snapshot stays newer than the processed file
        total_added += (len(y) - len(wav)) / sr
        total_inserts += n
    print(f"gaps: {len(sections)} sections, {total_inserts} sentence gaps extended to ≥{a.sentence_gap}s, "
          f"sections end with ≥{a.section_gap}s; +{total_added:.1f}s total")


if __name__ == "__main__":
    main()

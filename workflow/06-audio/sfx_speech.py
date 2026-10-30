#!/usr/bin/env python3
"""Speech guard for the foley library: flags clips that contain spoken words (e.g. a Wikimedia "rubber stamp"
pronunciation recording that matched the search "rubber stamp").

Usage: sfx_speech.py a.wav b.wav ...   -> one JSON line per file: {"file", "speech", "text", "nsp"}

Whisper invents text on non-speech ("Thanks for watching!") but with a high no-speech probability, so a clip counts
as speech only when Whisper is confident: a segment with no_speech_prob < 0.25 and at least one word. On the first
library scan the real speech clip scored 0.04 and every foley clip >= 0.33.
"""
import json, re, sys
from faster_whisper import WhisperModel

NSP_MAX = 0.25

model = WhisperModel("small.en", device="cpu", compute_type="int8")
for f in sys.argv[1:]:
    try:
        segs = list(model.transcribe(f, language="en", beam_size=5, vad_filter=False)[0])
    except Exception as e:  # undecodable: let the caller decide
        print(json.dumps(dict(file=f, speech=None, error=str(e)))); continue
    sure = [s for s in segs if s.no_speech_prob < NSP_MAX and re.search(r"[A-Za-z]{2,}", s.text)]
    print(json.dumps(dict(file=f, speech=bool(sure), text=" ".join(s.text.strip() for s in segs),
                          nsp=round(min((s.no_speech_prob for s in segs), default=1.0), 3))), flush=True)

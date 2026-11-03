#!/usr/bin/env python
"""Pause points inside a voice section, and inserting held silence there.

A hold may only go where a speaker would naturally stop: after a sentence or phrase end (. , ; : ? ! ... - in the
script's words), or right before/after a joining word (and, but, so, because ...). And only where the audio is truly
silent: a run of at least MIN_RUN seconds whose 10 ms windows all stay below QUIET_DB (RMS) with no peak above PEAK_DB.
A breath, a mouth click or a word tail fails that test, so the cut never lands on sound.

  holds.py scan  --batch JOBS.json                         -> JSON {id: {points:[{after, word, next, t0, t1, at, quietDb, clean, why}], dur}}
     JOBS: [{"id": section id, "wav": file, "words": transcript words json}]
  holds.py insert --wav in.wav --out out.wav --holds JSON  -> JSON {applied:[{lo, hi, ms, at, ok, why}]}
     holds JSON: [{"lo": s, "hi": s, "ms": 800}]  (search window in the input's seconds; the quietest clean point wins)
The inserted pause is filled with the take's own floor (noise at the level and rough colour of the quiet run it is cut
into), not digital zero, so the room never "drops out"; 5 ms fades on both sides of the cut avoid clicks.
"""
import argparse, json, re, sys
import numpy as np, soundfile as sf

QUIET_DB = -50.0      # every 10 ms window of the run below this RMS
PEAK_DB = -38.0       # and no sample above this
MIN_RUN = 0.04        # seconds of continuous quiet needed at the cut
HOP = 0.005
JOIN = {"and", "but", "or", "so", "because", "then", "while", "although", "though", "yet", "when", "which", "where",
        "if", "unless", "until", "since", "whereas", "after", "before"}
END = re.compile(r"[.,;:?!…—–-]+[\"'”’)]*$")


def db(x): return 20 * np.log10(max(float(x), 1e-9))


def frames(x, sr):
    """RMS and peak per 10 ms window, hop 5 ms (window start times = i * HOP)."""
    w, h = int(0.01 * sr), int(HOP * sr)
    n = max(0, (len(x) - w) // h + 1)
    if n == 0: return np.zeros(0), np.zeros(0)
    idx = np.arange(n)[:, None] * h + np.arange(w)[None, :]
    seg = x[idx]
    return np.sqrt((seg ** 2).mean(axis=1)), np.abs(seg).max(axis=1)


def find_quiet(rms, pk, lo, hi):
    """Centre (s) of the longest quiet run inside [lo, hi], and its level; None if no run is long enough.
    (Use `quiet_run` for the run's bounds.)"""
    a, b = max(0, int(lo / HOP)), min(len(rms), int(hi / HOP) + 1)
    if b - a <= 0: return None, None
    ok = (20 * np.log10(np.maximum(rms[a:b], 1e-9)) < QUIET_DB) & (20 * np.log10(np.maximum(pk[a:b], 1e-9)) < PEAK_DB)
    best, cur, start = (0, 0), 0, 0
    for i, v in enumerate(ok):
        if v:
            if cur == 0: start = i
            cur += 1
            if cur > best[1] - best[0]: best = (start, i + 1)
        else: cur = 0
    run = (best[1] - best[0]) * HOP
    if run < MIN_RUN: return None, db(rms[a:b].min())
    c = a + (best[0] + best[1]) // 2
    return c * HOP + 0.005, db(rms[a + best[0]:a + best[1]].max())


def load(p):
    x, sr = sf.read(p, dtype="float32", always_2d=True)
    return x, sr


def bare(s): return re.sub(r"[^\w']", "", s)


def allowed(w, nxt):
    """Why a pause may follow word w (before word nxt), or None."""
    a, b = w.strip().lower(), (nxt or "").strip().lower()
    if END.search(a): return "phrase end"
    if bare(b) in JOIN: return "before \u201c%s\u201d" % bare(b)
    if bare(a) in JOIN: return "after \u201c%s\u201d" % bare(a)
    return None


def scan_one(wav, words_file):
    x, sr = load(wav); mono = x.mean(axis=1)
    rms, pk = frames(mono, sr)
    words = json.load(open(words_file))["words"]
    pts = []
    for i in range(len(words) - 1):
        w, n = words[i], words[i + 1]
        why = allowed(w["word"], n["word"])
        if not why: continue
        lo, hi = float(w["end"]) - 0.08, float(n["start"]) + 0.08
        at, lvl = find_quiet(rms, pk, lo, hi)
        shown = w["word"] if bare(w["word"]) or i == 0 else words[i - 1]["word"] + " " + w["word"]   # "homework —"
        pts.append(dict(after=i, word=shown, next=n["word"], t0=round(float(w["end"]), 3), t1=round(float(n["start"]), 3),
                        at=None if at is None else round(at, 3), quietDb=None if lvl is None else round(lvl, 1), clean=at is not None, why=why))
    return dict(points=pts, dur=round(len(mono) / sr, 3), words=len(words))


def scan(a):
    out = {}
    for j in json.load(open(a.batch)):
        try: out[j["id"]] = scan_one(j["wav"], j["words"])
        except Exception as e: out[j["id"]] = dict(error=str(e))
    print(json.dumps(out))


def insert(a):
    x, sr = load(a.wav); mono = x.mean(axis=1)
    rms, pk = frames(mono, sr)
    req = sorted(json.loads(a.holds), key=lambda h: h["lo"])
    applied, cuts = [], []
    for h in req:
        at, lvl = find_quiet(rms, pk, float(h["lo"]), float(h["hi"]))
        if at is None:
            applied.append(dict(**h, at=None, ok=False, why="no clean silence there (breath or sound at the cut)" if lvl is not None else "outside the audio"))
            continue
        cuts.append((at, int(h["ms"])))
        applied.append(dict(**h, at=round(at, 4), ok=True, quietDb=round(lvl, 1)))
    rng = np.random.default_rng(7)

    def fill(at, n):
        """n samples of the take's floor around `at`: noise with the quiet run's RMS, smoothed to its rough colour."""
        i, w = int(at * sr), int(0.02 * sr)
        ref = x[max(0, i - w):i + w]
        lvl = np.sqrt((ref ** 2).mean(axis=0)) if len(ref) else np.zeros(x.shape[1])
        z = rng.standard_normal((n + 8, x.shape[1])).astype(np.float32)
        z = (z[:-8] + z[1:-7] + z[2:-6] + z[3:-5]) / 2.0          # gentle low-pass: tape-like hiss, not white
        z *= lvl / max(float(np.sqrt((z ** 2).mean())), 1e-9)
        return z

    out, prev, f = [], 0, int(0.005 * sr)
    ramp = np.linspace(1, 0, f, dtype=np.float32)[:, None]
    for at, ms in cuts:
        i = int(round(at * sr))
        part = x[prev:i].copy()
        if len(part) >= f: part[-f:] *= ramp
        if prev > 0 and len(part) >= f: part[:f] *= ramp[::-1]
        out += [part, fill(at, int(round(ms / 1000 * sr)))]
        prev = i
    tail = x[prev:].copy()
    if prev > 0 and len(tail) >= f: tail[:f] *= ramp[::-1]
    out.append(tail)
    sf.write(a.out, np.concatenate(out), sr, subtype="FLOAT")
    print(json.dumps(dict(applied=applied)))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(); ap.add_argument("mode", choices=["scan", "insert"])
    ap.add_argument("--wav"); ap.add_argument("--words"); ap.add_argument("--batch"); ap.add_argument("--out"); ap.add_argument("--holds")
    a = ap.parse_args()
    scan(a) if a.mode == "scan" else insert(a)

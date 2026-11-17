#!/usr/bin/env python
"""Measure a mix: loudness over time, SFX density, sample repetition, voice masking.

Usage: report.py --mix mix.wav [--stems DIR] [--events events.json] [--picks mix_picks.json] [--json out.json]

--stems is the folder `mix.py --stems` writes (voice.wav, foley.wav, music.wav). --picks is the per-event log
mix.py writes beside the mix (which file each event played); without it the report replays mix.py's picks.
Everything is measured, nothing is rendered or paid for.
"""
import argparse, json, os, re, subprocess, sys
from collections import Counter
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt

SR = 48000


def ebur128(path):
    """(integrated LUFS, true peak dBTP, LRA) from ffmpeg's ebur128 summary."""
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128=peak=true", "-f", "null", "-"],
                       capture_output=True, text=True)
    summ = r.stderr[r.stderr.rfind("Summary:"):]
    f = lambda k: float(re.search(k + r":\s*(-?[\d.]+)", summ).group(1))
    return f("I"), f("Peak"), f("LRA")


def short_term(x):
    """BS.1770 short-term loudness (3 s window), one value per second."""
    from scipy.signal import lfilter
    y = lfilter([1.53512485958697, -2.69169618940638, 1.19839281085285], [1, -1.69065929318241, 0.73248077421585], x, axis=0)
    y = lfilter([1, -2, 1], [1, -1.99004745483398, 0.99007225036621], y, axis=0)
    p = (y ** 2).sum(1); n = len(p) // SR; ps = p[:n * SR].reshape(n, SR).mean(1)
    win = np.convolve(ps, np.ones(3) / 3, "valid")
    return -0.691 + 10 * np.log10(win + 1e-12)


def band_db(x, lo, hi, hop):
    sos = butter(4, [lo, hi], "band", fs=SR, output="sos")
    y = sosfilt(sos, x.mean(1) if x.ndim > 1 else x)
    n = len(y) // hop
    return 10 * np.log10((y[:n * hop].reshape(n, hop) ** 2).mean(1) + 1e-12)


def masking(voice, other, hop=int(.05 * SR)):
    """Speech band (1-4 kHz, where consonants live): in frames where the voice speaks, how close the other stem gets."""
    v, o = band_db(voice, 1000, 4000, hop), band_db(other, 1000, 4000, hop)
    n = min(len(v), len(o)); v, o = v[:n], o[:n]
    speaking = v > v.max() - 35
    gap = (v - o)[speaking]
    act = gap[o[speaking] > v.max() - 60]                      # frames where the other stem is actually sounding
    return {"speechFrames": int(speaking.sum()), "otherActivePct": round(100 * len(act) / max(1, speaking.sum()), 1),
            "medianGapDb": round(float(np.median(act)), 1) if len(act) else None,
            "within6dbPct": round(100 * float((act < 6).mean()), 1) if len(act) else 0.0,
            "louderPct": round(100 * float((act < 0).mean()), 1) if len(act) else 0.0}


def replay_picks(events):
    """Which library file each event got (same seeding as mix.py)."""
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import sfx
    out = []; sfx.reset_picks()
    for i, e in enumerate(events):
        if e["type"] not in sfx.FOLEY: out.append(None); continue
        sfx.seed(1234 + e.get("seed", i))
        _, ent = sfx.render_event_ex(e["type"], e.get("d"), True, e.get("take"))
        out.append(ent["file"] if ent else "proc:" + e["type"])
    return out


def event_stats(events, picks, dur):
    t = np.array([e["t"] for e in events]); mins = dur / 60
    w10 = max((((t >= s) & (t < s + 10)).sum() for s in np.arange(0, dur, 1)), default=0)
    close = int((np.diff(np.sort(t)) < .15).sum()) if len(t) > 1 else 0
    types = Counter(e["type"] for e in events)
    files = Counter(p for p in picks if p)
    last, rep = {}, 0
    for e, p in zip(events, picks):                             # same file as the previous event of the same type
        if p and last.get(e["type"]) == p: rep += 1
        last[e["type"]] = p
    proc = sum(1 for p in picks if p and p.startswith("proc:"))
    return {"events": len(events), "perMin": round(len(events) / mins, 1), "max10s": int(w10),
            "within150msPct": round(100 * close / max(1, len(events)), 1),
            "types": len(types), "topTypes": types.most_common(6),
            "distinctSounds": len(files), "proceduralPct": round(100 * proc / max(1, len(events)), 1),
            "sameAsPrevPct": round(100 * rep / max(1, len(events)), 1),
            "topSoundSharePct": round(100 * files.most_common(1)[0][1] / max(1, len(events)), 1) if files else 0,
            "topSounds": files.most_common(5)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mix", required=True); ap.add_argument("--stems"); ap.add_argument("--events")
    ap.add_argument("--picks"); ap.add_argument("--json")
    a = ap.parse_args()
    I, tp, lra = ebur128(a.mix); mix = sf.read(a.mix, always_2d=True)[0]; dur = len(mix) / SR
    st = short_term(mix); st = st[st > -60]
    rep = {"mix": a.mix, "durationSec": round(dur, 1), "integratedLufs": I, "truePeakDbtp": tp, "lra": lra,
           "shortTerm": {"p10": round(float(np.percentile(st, 10)), 1), "p50": round(float(np.median(st)), 1),
                         "p90": round(float(np.percentile(st, 90)), 1), "max": round(float(st.max()), 1)}}
    if a.stems:
        voice = sf.read(os.path.join(a.stems, "voice.wav"), always_2d=True)[0]
        for k in ("foley", "music"):
            p = os.path.join(a.stems, k + ".wav")
            if os.path.exists(p):
                x = sf.read(p, always_2d=True)[0]
                if np.abs(x).max() > 1e-4: rep["masking_" + k] = masking(voice, x)
    if a.events and os.path.exists(a.events):
        evs = json.load(open(a.events))
        picks = None
        if a.picks and os.path.exists(a.picks): picks = [p.get("file") for p in json.load(open(a.picks))]
        if not picks or len(picks) != len(evs): picks = replay_picks(evs)
        rep["sfx"] = event_stats(evs, picks, dur)
    if a.json: json.dump(rep, open(a.json, "w"), indent=1)
    print(json.dumps(rep, indent=1))


if __name__ == "__main__":
    main()

#!/usr/bin/env python
"""Final mix: voice on top, sidechain-ducked music, SFX in two buses (foley, design = sfx_types.json layers), gentle
bus compression, 48 kHz / 24-bit stereo, two-pass ffmpeg loudnorm to -14 LUFS / -1 dBTP.

SFX sit under the voice three ways: both buses are keyed to the voice (foley -3 dB, design -5 dB while it speaks,
--sfx-duck-db scales both), the 1.5-4 kHz band where consonants live is cut 3 dB on them (presence carve), and a short
shared room (foley) / hall (design) puts dry library samples and procedural sounds into one space.
Writes mix_picks.json beside the output: which sample each event played (for report.py).

Usage: mix.py --voice v.wav --music m.wav|none --events events.json|none --out mix.wav
              [--trim SEC] [--duck-db -12] [--music-db -4] [--foley-db 0] [--lufs -14] [--tp -1]
events.json: [{t, type, d?, gain?, pan?}] (types: see sfx.FOLEY)
"""
import argparse, json, os, re, subprocess, sys, tempfile
import numpy as np, soundfile as sf, soxr
from scipy.ndimage import maximum_filter1d, uniform_filter1d
from scipy.signal import fftconvolve, lfilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sfx

SR = 48000


def load(path, trim=None):
    x, sr = sf.read(path, dtype="float64", always_2d=True)
    if trim: x = x[:int(trim * sr)]
    if sr != SR: x = soxr.resample(x, sr, SR, quality="VHQ")
    if x.shape[1] == 1: x = np.repeat(x, 2, 1)
    return x[:, :2]


def follower(x, att=.08, rel=.4, hop=.005):
    """Voice level (dBFS, 20 ms RMS) -> ducking gain in dB at 'hop' resolution; attack/release smoothing."""
    h = int(hop * SR); m = np.sqrt((x ** 2).mean(1)); n = len(m) // h
    r = np.sqrt(np.convolve(m[:n * h] ** 2, np.ones(4 * h) / (4 * h), "same")[::h][:n] + 1e-12)
    return 20 * np.log10(r + 1e-9), h


def duck_curve(voice):
    """0 where the voice is silent, -1 where it speaks (attack 80 ms, release 400 ms), per sample."""
    lvl, h = follower(voice)
    target = -np.clip((lvl - (-50)) / 8, 0, 1)         # 0 below -50 dBFS, full duck above -42 dBFS
    a_att, a_rel = np.exp(-.005 / .08), np.exp(-.005 / .4)
    g = np.zeros(len(target)); s = 0.0
    for i, tg in enumerate(target):                     # tg<0 means "duck more"
        a = a_att if tg < s else a_rel
        s = a * s + (1 - a) * tg; g[i] = s
    return np.interp(np.arange(len(voice)) / h, np.arange(len(g)), g)


def duck_gain(voice, duck_db, curve=None):
    c = duck_curve(voice) if curve is None else curve
    return 10 ** (c * abs(duck_db) / 20)


def peaking(x, f0, gain_db, q):
    """RBJ peaking EQ on each channel."""
    A = 10 ** (gain_db / 40); w = 2 * np.pi * f0 / SR; al = np.sin(w) / (2 * q)
    b = np.array([1 + al * A, -2 * np.cos(w), 1 - al * A]); a = np.array([1 + al / A, -2 * np.cos(w), 1 - al / A])
    return lfilter(b / a[0], a / a[0], x, axis=0)


def space(x, rt, wet, bright):
    """A synthetic stereo room/hall (decorrelated decaying noise per channel, darker as it decays) mixed in at 'wet'."""
    if wet <= 0 or not np.abs(x).max(): return x
    rng = np.random.default_rng(42); n = int(rt * SR); tt = np.arange(n) / SR
    out = x.copy()
    for ch in range(2):
        ir = rng.standard_normal(n) * np.exp(-tt / (rt / 6.9))
        ir = lfilter(*_lp1(bright), ir); ir[:int(.006 * SR)] = 0           # 6 ms pre-delay keeps the transient dry
        ir /= np.sqrt((ir ** 2).sum()) + 1e-9
        out[:, ch] += fftconvolve(x[:, ch], ir)[:len(x)] * wet
    return out


def _lp1(f):
    a = np.exp(-2 * np.pi * f / SR); return [1 - a], [1, -a]


def bus_comp(x, thr_db=-16, ratio=2.0, att=.01, rel=.15, hop=.004):
    h = int(hop * SR); pk = np.abs(x).max(1); n = len(pk) // h
    env = maximum_filter1d(pk[:n * h].reshape(n, h).max(1), 3)
    ea, er = np.exp(-hop / att), np.exp(-hop / rel); s = 0.0; g = np.ones(n)
    thr = 10 ** (thr_db / 20)
    for i in range(n):
        c = env[i]; a = ea if c > s else er; s = a * s + (1 - a) * c
        g[i] = 1 if s <= thr else (thr * (s / thr) ** (1 / ratio)) / s
    gs = np.interp(np.arange(len(x)) / h, np.arange(n), g)
    return x * gs[:, None]


def limit(x, ceil=.89, look=.004):
    n = int(look * SR); pk = np.abs(x).max(1)
    m = maximum_filter1d(pk, size=2 * n + 1); g = np.minimum(1, ceil / np.maximum(m, 1e-9)); g = uniform_filter1d(g, size=n)
    return x * g[:, None]


def ff(*args):
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", *args], capture_output=True, text=True)
    if r.returncode: sys.exit("ffmpeg failed:\n" + r.stderr[-1500:])
    return r.stderr


def loudnorm_json(path, extra=""):
    err = ff("-i", path, "-af", f"loudnorm=I=-14:TP=-1:LRA=11:print_format=json{extra}", "-f", "null", "-")
    return json.loads(err[err.rfind("{"):err.rfind("}") + 1])


def master(src, out, lufs, tp):
    ln = f"loudnorm=I={lufs}:TP={tp}:LRA=11"
    err = ff("-i", src, "-af", ln + ":print_format=json", "-f", "null", "-")
    st = json.loads(err[err.rfind("{"):err.rfind("}") + 1])
    meas = f":measured_I={st['input_i']}:measured_TP={st['input_tp']}:measured_LRA={st['input_lra']}:measured_thresh={st['input_thresh']}:offset={st['target_offset']}:linear=true"
    ff("-i", src, "-af", ln + meas, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_s24le", out)
    after = loudnorm_json(out)
    if float(after["input_tp"]) > tp + .05:
        tmp = out + ".lim.wav"
        ff("-i", out, "-af", f"alimiter=limit={10 ** ((tp - .3) / 20):.4f}:level=disabled", "-ar", str(SR), "-c:a", "pcm_s24le", tmp)
        os.replace(tmp, out); after = loudnorm_json(out)
    return float(st["input_i"]), float(st["input_tp"]), float(after["input_i"]), float(after["input_tp"]), float(after["input_lra"])


def write_credits(path, used_sfx, music_path):
    """credits.txt: CC BY assets that need a description credit, then everything that does not."""
    need_credit = lambda e: e["license"] == "by" or e.get("attributionRequired") is True
    by = [e for e in used_sfx.values() if isinstance(e, dict) and need_credit(e)]
    free = [e for e in used_sfx.values() if isinstance(e, dict) and not need_credit(e)]
    proc = sorted(v for v in used_sfx.values() if isinstance(v, str))
    music = []
    if music_path and music_path != "none":
        p = os.path.join(os.path.dirname(os.path.abspath(music_path)), "music_sources.json")
        if os.path.exists(p): music = json.load(open(p))
    need, ok, warn = [], [], []
    for u in music:
        if u["type"] == "synth": ok.append("Music %s: procedural %s palette (original, in-house)" % (u["label"], u["palette"]))
        elif u.get("attribution") is False: ok.append("Music %s: %s" % (u["label"], u.get("credit") or u["path"]))
        elif u.get("credit"): need.append("Music %s: %s" % (u["label"], u["credit"]))
        else: warn.append("Music %s: %s has no 'credit' in music.json - check its licence terms" % (u["label"], u["path"]))
    L = ["CREDITS (generated by audio:mix; paste the first block into the YouTube description)", "", "ATTRIBUTION REQUIRED (CC BY and licensed music)"]
    L += [e["attribution"] if e.get("attribution") else '"%s" by %s, %s' % (e.get("title"), e.get("creator", "?"), e.get("landingUrl") or e.get("source", "")) for e in sorted(by, key=lambda e: e["title"])] + need
    if not by and not need: L.append("(none)")
    L += ["", "NO ATTRIBUTION REQUIRED (CC0 / public domain / royalty-free / procedural)"]
    L += ["Sound: \"%s\" by %s (%s, %s)" % (e.get("title"), e.get("creator", "?"), e["license"].upper(), e.get("landingUrl") or e.get("source", "")) for e in sorted(free, key=lambda e: e["title"])]
    L += ["Sound: procedural %s (original, in-house)" % k for k in proc] + ["- " + o for o in ok]
    if warn: L += ["", "CHECK"] + warn
    open(path, "w").write("\n".join(L) + "\n")
    print("[mix] credits -> %s  (%d CC BY, %d CC0/PDM, %d procedural types)" % (path, len(by), len(free), len(proc)))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--voice", required=True); ap.add_argument("--music", default="none"); ap.add_argument("--events", default="none")
    ap.add_argument("--out", required=True); ap.add_argument("--trim", type=float)
    ap.add_argument("--duck-db", type=float, default=-12); ap.add_argument("--music-db", type=float, default=-4)
    ap.add_argument("--foley-db", type=float, default=0); ap.add_argument("--design-db", type=float, default=0)
    ap.add_argument("--sfx-duck-db", type=float, default=-4, help="SFX ducking under the voice (foley 0.75x, design 1.25x of this)")
    ap.add_argument("--dry", action="store_true", help="no presence carve, no room: the SFX as rendered")
    ap.add_argument("--lufs", type=float, default=-14); ap.add_argument("--tp", type=float, default=-1)
    ap.add_argument("--no-lib", action="store_true", help="ignore assets/sfx, use procedural foley only")
    ap.add_argument("--credits", help="credits.txt path (default: beside --out)")
    ap.add_argument("--stems", help="optional dir to dump music/foley stems (for analysis)")
    a = ap.parse_args()
    voice = load(a.voice, a.trim); N = len(voice)
    used_sfx = {}; mus = np.zeros_like(voice); fol = np.zeros_like(voice); des = np.zeros_like(voice); gain = np.ones(N)
    curve = duck_curve(voice)
    if a.music and a.music.lower() != "none" and os.path.exists(a.music):
        m = load(a.music)[:N]; mus[:len(m)] = m
        gain = duck_gain(voice, a.duck_db, curve)
        mus = mus * gain[:, None] * 10 ** (a.music_db / 20)
    picks = []
    if a.events and a.events.lower() != "none" and os.path.exists(a.events):
        evs = json.load(open(a.events)); skipped = 0; used_sfx = {}; sfx.reset_picks()
        for i, e in enumerate(evs):
            if e["type"] not in sfx.FOLEY: skipped += 1; continue
            if e["t"] >= N / SR or (a.trim and e["t"] > a.trim): continue
            sfx.seed(1234 + e.get("seed", i))
            x, ent = sfx.render_event_ex(e["type"], e.get("d"), not a.no_lib, e.get("take"))
            x = x.astype(np.float64); used_sfx[ent["id"] if ent else "proc:" + e["type"]] = ent or e["type"]
            design = sfx.layer_of(e["type"]) != "foley"
            lvl = 10 ** ((sfx.FOLEY[e["type"]][2] + (a.design_db if design else a.foley_db)) / 20) / .8
            sfx.add(des if design else fol, x, float(e["t"]), lvl * float(e.get("gain", 1)), float(e.get("pan", 0)))
            picks.append({"i": i, "t": e["t"], "type": e["type"], "file": ent["file"] if ent else "proc:" + e["type"]})
        if skipped: print(f"[mix] skipped {skipped} unknown event types", file=sys.stderr)
    if not a.dry:
        fol = space(peaking(fol, 2600, -3, .8), .45, .10, 5000) if np.abs(fol).max() else fol
        des = space(peaking(des, 2600, -3, .8), 1.6, .08, 3500) if np.abs(des).max() else des
    fol *= 10 ** (curve * abs(a.sfx_duck_db) * .75 / 20)[:, None]
    des *= 10 ** (curve * abs(a.sfx_duck_db) * 1.25 / 20)[:, None]
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    json.dump(picks, open(os.path.join(os.path.dirname(os.path.abspath(a.out)), "mix_picks.json"), "w"))
    write_credits(a.credits or os.path.join(os.path.dirname(os.path.abspath(a.out)), "credits.txt"), used_sfx, a.music)
    mix = voice + mus + fol + des
    mix = bus_comp(mix); mix = limit(mix)
    if a.stems:
        os.makedirs(a.stems, exist_ok=True)
        for n, s in (("music", mus), ("foley", fol + des), ("sfx_foley", fol), ("sfx_design", des), ("voice", voice)): sf.write(f"{a.stems}/{n}.wav", s, SR, subtype="PCM_24")
        sf.write(f"{a.stems}/duck.wav", gain, SR, subtype="FLOAT")
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True)
    tmp = tempfile.mktemp(suffix=".wav", dir=os.path.dirname(os.path.abspath(a.out)))
    sf.write(tmp, mix, SR, subtype="PCM_24")
    try: i0, tp0, i1, tp1, lra = master(tmp, a.out, a.lufs, a.tp)
    finally:
        if os.path.exists(tmp): os.remove(tmp)
    print(f"[mix] {a.out}  {N / SR:.1f}s  48 kHz 24-bit stereo")
    print(f"[mix] loudness before {i0:.1f} LUFS / {tp0:.1f} dBTP -> after {i1:.1f} LUFS / {tp1:.1f} dBTP (LRA {lra:.1f})")
    if abs(i1 - a.lufs) > 1 or tp1 > a.tp + .1: print("[mix] WARNING: off target", file=sys.stderr)


if __name__ == "__main__":
    main()

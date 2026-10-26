#!/usr/bin/env python
"""Procedural, deterministic music bed (numpy/scipy only): felt electric piano, plucked bass,
soft pad, brushes and a soft kick (brushes/kick only at intensity > 0.4).
Warm calm explainer bed, not epic piano+strings.

Usage: music.py --plan music_plan.json --out music.wav [--beats beats.json]
Plan:  {sr:48000, duration, sections:[{t0,t1,bpm,key:"D",mode:"major|minor|dorian",intensity:0..1,instruments?:[keys,bass,pad,brush,kick]}],
        hits?:[{t, kind:"downbeat"|"silence", dur?}]}
"""
import argparse, json, sys
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, lfilter, fftconvolve

SR = 48000
PC = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
SCALES = {"major": [0, 2, 4, 5, 7, 9, 11], "minor": [0, 2, 3, 5, 7, 8, 10], "dorian": [0, 2, 3, 5, 7, 9, 10]}
PROGS = {"major": [[0, 5, 3, 4], [0, 3, 5, 4], [0, 4, 5, 3]],
         "minor": [[0, 5, 2, 6], [0, 3, 6, 4], [0, 5, 3, 6]],
         "dorian": [[0, 3, 0, 6], [0, 6, 3, 0], [0, 3, 6, 3]]}


def pitch_class(k):
    k = k.strip(); p = PC[k[0].upper()]
    for c in k[1:]: p += 1 if c in "#♯" else -1 if c in "b♭" else 0
    return p % 12


def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def fold(m, lo, hi):
    while m < lo: m += 12
    while m > hi: m -= 12
    return m


def put(buf, x, at, g=1.0):
    s = int(round(at * SR))
    if s >= len(buf) or s + len(x) <= 0: return
    if s < 0: x = x[-s:]; s = 0
    e = min(len(buf), s + len(x)); buf[s:e] += x[:e - s] * g


# ---------------- instruments ----------------
def epiano(m, vel, dur=2.4):
    """Felt/Rhodes-ish FM tine; softer + shorter for high notes."""
    f = hz(m); n = int(dur * SR); t = np.arange(n) / SR
    idx = (1.1 * vel + .25) * np.exp(-t / .22) * np.clip(330 / f, .4, 1.3)
    bark = .12 * vel * np.exp(-t / .03)
    ph = 2 * np.pi * f * t
    x = np.sin(ph + idx * np.sin(ph) + bark * np.sin(ph * 14)) + .08 * np.sin(2 * ph) * np.exp(-t / .15)
    tau = 1.1 * (261 / f) ** .5
    env = np.exp(-t / tau) * (1 - np.exp(-t / .004)) * np.minimum(1, (dur - t) / .15)
    return x * env * vel * .5


def pluck_bass(m, vel, dur=1.3):
    """Karplus-Strong upright-ish pluck + soft sine body."""
    f = hz(m); N = int(round(SR / f)); n = int(dur * SR)
    ex = np.zeros(n); rng = np.random.default_rng(int(m) * 7 + 1)
    ex[:N] = lp(rng.standard_normal(N), 900, 1) * np.hanning(N)
    a = np.zeros(N + 2); a[0] = 1; a[N] = a[N + 1] = -.5 * .996
    y = lfilter([1.0], a, ex)
    t = np.arange(n) / SR
    body = np.sin(2 * np.pi * f * t) * np.exp(-t / .5) * .6
    x = lp(y / (np.abs(y).max() + 1e-9) * .7 + body, 500, 2)
    return x * vel * np.minimum(1, (dur - t) / .1) * (1 - np.exp(-t / .006))


def pad_note(m, dur, rng):
    t = np.arange(int(dur * SR)) / SR; f = hz(m)
    x = sum(np.sin(2 * np.pi * f * (1 + c) * t + rng.random() * 6) for c in (-.0017, .0017))
    return lp(x, 1400, 2) * np.sin(np.pi * np.clip(t / dur, 0, 1)) ** 1.5 * .08


def brush(vel, rng, d=.2):
    t = np.arange(int(d * SR)) / SR
    return bp(rng.standard_normal(len(t)), 2600, 9000) * np.minimum(1, t / .03) * np.exp(-t / .07) * vel


def shaker(vel, rng, d=.05):
    t = np.arange(int(d * SR)) / SR
    return hp(rng.standard_normal(len(t)), 6000) * np.exp(-t / .012) * vel * (1 - np.exp(-t / .002))


def kick(vel, d=.35):
    t = np.arange(int(d * SR)) / SR
    f = 52 + 55 * np.exp(-t / .03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / .11) * vel * (1 - np.exp(-t / .003))


# ---------------- section render ----------------
def chord_notes(scale, deg):
    sn = lambda d: scale[d % 7] + 12 * (d // 7)
    return [sn(deg), sn(deg + 2), sn(deg + 4), sn(deg + 6)]


def render_section(sec, idx, length, tail_end):
    """Returns (dry L/R, send L/R, beats list, chord list). length in seconds of audio to produce."""
    rng = np.random.default_rng(1000 + idx)
    bpm = float(sec["bpm"]); beat = 60 / bpm; bar = 4 * beat
    pc = pitch_class(sec.get("key", "D")); mode = sec.get("mode", "major"); scale = SCALES[mode]
    prog = PROGS[mode][idx % 3]; I = float(sec.get("intensity", .5))
    ins = set(sec.get("instruments") or ["keys", "bass", "pad", "brush", "kick"])
    perc = I > .4
    n = int(length * SR) + 1
    keys = np.zeros(n); bass = np.zeros(n); pad = np.zeros(n); perc_b = np.zeros(n)
    nbars = int(np.ceil(length / bar)); chords = []
    for b in range(nbars):
        tb = b * bar; deg = prog[b % 4]
        ch = chord_notes(scale, deg); chords.append((tb, ch, pc))
        kn = [fold(57 + pc + c, 55, 77) for c in ch]; kn.sort()
        if "pad" in ins:
            for m in kn[:3] + [fold(45 + pc + ch[0], 40, 52)]:
                put(pad, pad_note(m, bar + 1.2, rng), tb - .3, 1.0)
        if "keys" in ins:
            for i, m in enumerate(kn):   # rolled chord on beat 1
                put(keys, epiano(m, .65 - .05 * i + rng.random() * .05), tb + .03 * i + (rng.random() - .5) * .01)
            if I < .4:
                for i, m in enumerate(kn[2:]): put(keys, epiano(m, .45), tb + 2.5 * beat + .02 * i)
            else:
                order = [0, 2, 1, 3, 2, 3, 1, 2]
                for k in range(1, 8):
                    if k % 2 == 0 and rng.random() > .55 + .4 * I: continue
                    put(keys, epiano(kn[order[k]] + (12 if k == 5 and I > .7 else 0), .36 + .12 * rng.random()), tb + k * beat / 2 + (rng.random() - .5) * .012)
        if "bass" in ins:
            r = fold(36 + pc + ch[0], 38, 49); fifth = fold(36 + pc + ch[2], 38, 52)
            put(bass, pluck_bass(r, .8), tb, 1.0)
            put(bass, pluck_bass(fifth if rng.random() > .3 else r + 12 if r + 12 <= 52 else r, .55), tb + 2 * beat + (.0 if I < .6 else .02), 1.0)
            if I > .65: put(bass, pluck_bass(r, .4), tb + 3.5 * beat, 1.0)
        if perc:
            lvl = .35 + .65 * (I - .4) / .6
            if "kick" in ins:
                put(perc_b, kick(.55 * lvl), tb); put(perc_b, kick(.4 * lvl), tb + 2 * beat)
            if "brush" in ins:
                for k in (1, 3): put(perc_b, brush((.38 + .1 * rng.random()) * lvl, rng), tb + k * beat)
                for k in range(8):
                    if k % 2: put(perc_b, shaker((.12 + .06 * rng.random()) * lvl, rng), tb + k * beat / 2)
    keys = lp(keys, 4200, 2)
    pan = lambda x, p: (x * np.cos((p + 1) * np.pi / 4) * 1.414, x * np.sin((p + 1) * np.pi / 4) * 1.414)
    kL, kR = pan(keys, -.18); pL, pR = pan(pad, .1)
    # Haas-ish widening on pad
    sh = int(.012 * SR); pR = np.concatenate([np.zeros(sh), pR[:-sh]])
    bL = bR = bass * .8; xL, xR = pan(perc_b, .15)
    g = dict(keys=.5, pad=1.0, bass=.62, perc=.5)
    dryL = bL * g["bass"] + xL * g["perc"] + kL * g["keys"]; dryR = bR * g["bass"] + xR * g["perc"] + kR * g["keys"]
    sendL = kL * .5 + pL; sendR = kR * .5 + pR
    pad_dry = .0
    return dryL + pL * .6, dryR + pR * .6, sendL, sendR, chords


def make_reverb(rt=1.8, seed=3):
    rng = np.random.default_rng(seed); n = int(rt * 1.2 * SR); t = np.arange(n) / SR
    out = []
    for _ in range(2):
        ir = lp(rng.standard_normal(n), 3500, 1) * np.exp(-t / (rt / 6.9)); ir[:int(.015 * SR)] = 0
        out.append(ir / np.sqrt((ir ** 2).sum()))
    return out


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--plan", required=True); ap.add_argument("--out", required=True)
    ap.add_argument("--beats"); a = ap.parse_args()
    plan = json.load(open(a.plan)); global SR
    SR = int(plan.get("sr", 48000)); dur = float(plan["duration"]); secs = sorted(plan["sections"], key=lambda s: s["t0"])
    N = int(dur * SR); L = np.zeros(N); R = np.zeros(N); sL = np.zeros(N); sR = np.zeros(N)
    beats, downbeats, sec_info, all_chords = [], [], [], []
    for i, s in enumerate(secs):
        t0 = float(s["t0"]); t1 = min(float(s["t1"]), dur); last = i == len(secs) - 1 or t1 >= dur
        beat = 60 / float(s["bpm"]); tail = 0 if last else 1.5 * beat
        length = min(t1 + tail, dur) - t0
        if length <= 0: continue
        dl, dr, el, er, chords = render_section(s, i, length, t0 + length)
        n = min(len(dl), N - int(t0 * SR)); o = int(t0 * SR)
        env = np.ones(n); fi = int(min(.3 if i else .6, length / 2) * SR); env[:fi] = np.sin(np.linspace(0, np.pi / 2, fi)) ** 2
        if not last:
            fo = int(tail * SR); sec_end = int((t1 - t0) * SR)
            if sec_end < n: seg = n - sec_end; env[sec_end:] = np.cos(np.linspace(0, np.pi / 2, seg)) ** 2
        else:
            fo = int(min(1.5, length / 2) * SR); env[-fo:] *= np.cos(np.linspace(0, np.pi / 2, fo)) ** 2
        L[o:o + n] += dl[:n] * env; R[o:o + n] += dr[:n] * env; sL[o:o + n] += el[:n] * env; sR[o:o + n] += er[:n] * env
        k = 0
        while t0 + k * beat < t1 - 1e-6:
            beats.append(round(t0 + k * beat, 4))
            if k % 4 == 0: downbeats.append(round(t0 + k * beat, 4))
            k += 1
        bar = 4 * beat
        all_chords += [(t0 + tb, ch, pcc) for tb, ch, pcc in chords if t0 + tb < t1]
        sec_info.append(dict(t0=t0, t1=t1, bpm=float(s["bpm"]), key=s.get("key", "D"), mode=s.get("mode", "major"), bars=int(np.ceil((t1 - t0) / bar))))
    ir = make_reverb()
    wetL = fftconvolve(sL, ir[0])[:N]; wetR = fftconvolve(sR, ir[1])[:N]
    L += wetL * .45; R += wetR * .45
    # downbeat hits: soft thump + chord swell
    for h in plan.get("hits", []):
        if h.get("kind") != "downbeat": continue
        t = float(h["t"]); o = int(t * SR); ch = [c for c in all_chords if c[0] <= t]
        buf = np.zeros(N)
        put(buf, kick(1.0, .6), t, .7)
        if ch:
            _, cn, pcc = ch[-1]
            for i, c in enumerate(cn): put(buf, epiano(fold(57 + pcc + c, 55, 77), .8, 3.0), t + .02 * i, .8)
            put(buf, pluck_bass(fold(36 + pcc + cn[0], 38, 49), 1.0, 2.0), t, 1.0)
        buf = lp(buf, 4500, 2); L += buf * .55; R += buf * .55
    # level to -20 dBFS RMS before silence gating
    rms = np.sqrt(((L ** 2 + R ** 2) / 2).mean()) + 1e-12; gain = 10 ** (-20 / 20) / rms; L *= gain; R *= gain
    # silence hits: true near-silence (-70 dB)
    g = np.ones(N)
    for h in plan.get("hits", []):
        if h.get("kind") != "silence": continue
        t = float(h["t"]); d = float(h.get("dur", 1.2)); a0 = int(t * SR); a1 = int((t + d) * SR)
        dn = int(.08 * SR); up = int(.15 * SR); lo = 10 ** (-70 / 20)
        gg = np.full(N, 1.0); gg[a0:a1] = lo
        if a0 + dn <= N: gg[a0:a0 + dn] = np.linspace(1, lo, dn)
        if a1 + up <= N: gg[a1:a1 + up] = np.linspace(lo, 1, up)
        g = np.minimum(g, gg)
    L *= g; R *= g
    pk = max(np.abs(L).max(), np.abs(R).max())
    if pk > .9: L *= .9 / pk; R *= .9 / pk
    sf.write(a.out, np.stack([L, R], 1).astype(np.float32), SR, subtype="PCM_24")
    if a.beats:
        json.dump(dict(sr=SR, duration=dur, beats=beats, downbeats=downbeats, sections=sec_info,
                       hits=plan.get("hits", [])), open(a.beats, "w"), indent=1)
    print(f"[music] {a.out}  {dur:.1f}s  {len(beats)} beats  rms-before-gate -20 dBFS  peak {20*np.log10(min(pk,.9)+1e-12):.1f} dBFS")


if __name__ == "__main__":
    main()

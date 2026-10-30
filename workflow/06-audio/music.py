#!/usr/bin/env python
"""Per-chapter music bed. Each section of 06-audio/music.json has its own source:
  {"type":"synth","palette":"felt|kalimba|arp|jazz|celesta","bpm":88,"key":"D","mode":"major","intensity":0.4}
  {"type":"file","path":"assets/music/x.mp3","gainDb":0,"start":0,"bpm?":..}   (licensed track, looped/trimmed, tempo untouched)
  {"type":"epidemic","trackId":"..."}                                          (resolved by music.ts; synth fallback here)
Synth is procedural, deterministic numpy/scipy (our own IP). Sections change with a crossfade that ends on the new
section's first downbeat; "intro":"swell" lets the music rise while the narrator is silent.

Usage:
  music.py --init --plan music_plan.json --music-json music.json [--chapters chapters.json] [--reset] [--refresh-timing]
  music.py --music-json music.json --out music.wav [--beats beats.json] [--sources music_sources.json] [--audition DIR] [--root REPO]
  music.py --plan music_plan.json --out music.wav            (legacy: every section = felt palette)
"""
import argparse, json, os, subprocess, sys, tempfile
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


# ---------------- extra voices ----------------
def kalimba_note(m, vel, dur=1.8):
    """Thumb-piano tine: pure tone + short inharmonic ping + a soft thumb thump."""
    f = hz(m); t = np.arange(int(dur * SR)) / SR; tau = .9 * (261 / f) ** .3
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / tau) + .3 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t / .06) \
        + .1 * np.sin(2 * np.pi * f * 2 * t) * np.exp(-t / .3)
    rng = np.random.default_rng(int(m) * 13 + 5)
    x = x + .25 * lp(rng.standard_normal(len(t)), 1800, 1) * np.exp(-t / .004)
    return x * (1 - np.exp(-t / .002)) * np.minimum(1, (dur - t) / .2) * vel * .45


def marimba_note(m, vel, dur=1.1):
    """Wooden bar tuned 1:4:10 with a quick mallet knock."""
    f = hz(m); t = np.arange(int(dur * SR)) / SR
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / .38) + .35 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / .07) \
        + .08 * np.sin(2 * np.pi * 10 * f * t) * np.exp(-t / .025)
    return x * (1 - np.exp(-t / .002)) * np.minimum(1, (dur - t) / .15) * vel * .55


def celesta_note(m, vel, dur=2.6):
    """Music-box / celesta: metal bar partials with a gentle bell shimmer."""
    f = hz(m); t = np.arange(int(dur * SR)) / SR; tau = 1.2 * (261 / f) ** .3
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / tau) + .45 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / (tau * .5)) \
        + .2 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / .15) + .08 * np.sin(2 * np.pi * 5.43 * f * t) * np.exp(-t / .05)
    return lp(x, 9000, 1) * (1 - np.exp(-t / .002)) * np.minimum(1, (dur - t) / .3) * vel * .4


def warm_pad_note(m, dur, rng, att=.9):
    """Detuned saw-ish stack through a low-pass, slow attack and release."""
    t = np.arange(int(dur * SR)) / SR; f = hz(m); x = np.zeros(len(t))
    for c in (-.003, 0, .003):
        ph = rng.random() * 6
        for k in range(1, 8): x += np.sin(2 * np.pi * f * (1 + c) * k * t + ph * k) / k
    env = np.minimum(1, t / att) ** 1.5 * np.minimum(1, (dur - t) / (att * 1.2)) ** 1.5
    return lp(x, 1500, 2) * env * .035


def soft_pluck(m, vel, dur=1.2):
    """Synth pluck: triangle-ish tone whose brightness falls quickly."""
    f = hz(m); t = np.arange(int(dur * SR)) / SR
    x = np.sin(2 * np.pi * f * t) + .35 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / .12) + .12 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / .06)
    return x * np.exp(-t / .5) * (1 - np.exp(-t / .004)) * np.minimum(1, (dur - t) / .1) * vel * .5


def sub_note(m, dur, vel=.8):
    t = np.arange(int(dur * SR)) / SR; f = hz(m)
    return (np.sin(2 * np.pi * f * t) + .15 * np.sin(4 * np.pi * f * t)) * np.minimum(1, t / .25) * np.minimum(1, (dur - t) / .5) * vel * .5


def ride(vel, rng, d=.3):
    t = np.arange(int(d * SR)) / SR
    return bp(rng.standard_normal(len(t)), 4200, 10500) * np.exp(-t / .07) * (1 - np.exp(-t / .002)) * vel


# ---------------- 60s spy combo ----------------
def vibes_note(m, vel, dur=2.2, rate=5.5):
    """Vibraphone: bar partials 1:4 with a soft mallet and the motor's amplitude tremolo."""
    f = hz(m); t = np.arange(int(dur * SR)) / SR
    x = np.sin(2 * np.pi * f * t) * np.exp(-t / 1.1) + .25 * np.sin(2 * np.pi * 4 * f * t) * np.exp(-t / .12) \
        + .06 * np.sin(2 * np.pi * 10 * f * t) * np.exp(-t / .03)
    trem = 1 - .28 * (1 - np.cos(2 * np.pi * rate * t)) / 2
    return x * trem * (1 - np.exp(-t / .003)) * np.minimum(1, (dur - t) / .25) * vel * .4


def twang(m, vel, dur=2.4):
    """Surf-guitar low string: bright pluck, a little drive, a spring-reverb flutter of short echoes."""
    f = hz(m); N = int(round(SR / f)); n = int(dur * SR)
    ex = np.zeros(n); rng = np.random.default_rng(int(m) * 3 + 11)
    ex[:N] = rng.standard_normal(N) * np.hanning(N)
    a = np.zeros(N + 2); a[0] = 1; a[N] = a[N + 1] = -.5 * .998
    y = lfilter([1.0], a, ex); y = np.tanh(2.2 * y / (np.abs(y).max() + 1e-9))
    t = np.arange(n) / SR
    y = bp(y, 90, 3200, 2) * np.minimum(1, (dur - t) / .2)
    out = y.copy()
    for k, (d, g) in enumerate([(.021, .45), (.034, .35), (.047, .28), (.061, .2), (.083, .14)]):
        sh = int(d * SR); out[sh:] += y[:-sh] * g * (1 if k % 2 == 0 else -1)
    return out * vel * .35


def brass_stab(notes, vel=1.0, dur=.42):
    """Staccato trumpets + trombones in octaves: detuned saw stack through a fast-closing filter."""
    t = np.arange(int(dur * SR)) / SR; x = np.zeros(len(t))
    for m in notes:
        for c in (-.004, 0, .004):
            ph = 2 * np.pi * hz(m) * (1 + c) * t
            for k in range(1, 12): x += np.sin(k * ph) / k
    env = (1 - np.exp(-t / .006)) * np.exp(-t / .16) * np.minimum(1, (dur - t) / .05)
    bright = lp(x * env, 3800, 2) * .7 + lp(x * env * np.exp(-t / .05), 7000, 1) * .3
    return np.tanh(1.5 * bright / (np.abs(bright).max() + 1e-9)) * vel * .5


def bongo(vel, hi=True, d=.22):
    t = np.arange(int(d * SR)) / SR; f0 = 420 if hi else 300
    f = f0 * (1 + .25 * np.exp(-t / .02))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / (.06 if hi else .09)) * (1 - np.exp(-t / .001)) * vel * .5


def chord_notes(scale, deg):
    sn = lambda d: scale[d % 7] + 12 * (d // 7)
    return [sn(deg), sn(deg + 2), sn(deg + 4), sn(deg + 6)]


# ---------------- palettes ----------------
class Ctx:
    pass


def make_ctx(sec, idx, length, lead):
    c = Ctx(); c.rng = np.random.default_rng(1000 + idx)
    c.bpm = float(sec["bpm"]); c.beat = 60 / c.bpm; c.bar = 4 * c.beat
    c.pc = pitch_class(sec.get("key", "D")); c.mode = sec.get("mode", "major"); c.scale = SCALES[c.mode]
    c.prog = PROGS[c.mode][idx % 3]; c.I = float(sec.get("intensity", .5))
    c.ins = set(sec.get("instruments") or ["keys", "bass", "pad", "brush", "kick"])
    c.nlead = int(round(lead / c.bar)); c.total = c.nlead + int(np.ceil(length / c.bar))
    c.n = int((c.nlead * c.bar + length) * SR) + 1
    return c


def bars(c):
    """(bar start in buffer seconds, chord offsets, next chord offsets) for every bar incl. lead-in bars."""
    for bi in range(c.total):
        k = bi - c.nlead
        yield bi * c.bar, chord_notes(c.scale, c.prog[k % 4]), chord_notes(c.scale, c.prog[(k + 1) % 4]), k


def pal_felt(c):
    rng, beat, pc, I, ins = c.rng, c.beat, c.pc, c.I, c.ins
    keys, bass, pad, perc_b = (np.zeros(c.n) for _ in range(4)); perc = I > .4
    for tb, ch, _, _k in bars(c):
        kn = sorted(fold(57 + pc + x, 55, 77) for x in ch)
        if "pad" in ins:
            for m in kn[:3] + [fold(45 + pc + ch[0], 40, 52)]: put(pad, pad_note(m, c.bar + 1.2, rng), tb - .3, 1.0)
        if "keys" in ins:
            for i, m in enumerate(kn): put(keys, epiano(m, .65 - .05 * i + rng.random() * .05), tb + .03 * i + (rng.random() - .5) * .01)
            if I < .4:
                for i, m in enumerate(kn[2:]): put(keys, epiano(m, .45), tb + 2.5 * beat + .02 * i)
            else:
                order = [0, 2, 1, 3, 2, 3, 1, 2]
                for k in range(1, 8):
                    if k % 2 == 0 and rng.random() > .55 + .4 * I: continue
                    put(keys, epiano(kn[order[k]] + (12 if k == 5 and I > .7 else 0), .36 + .12 * rng.random()), tb + k * beat / 2 + (rng.random() - .5) * .012)
        if "bass" in ins:
            r = fold(36 + pc + ch[0], 38, 49); fifth = fold(36 + pc + ch[2], 38, 52)
            put(bass, pluck_bass(r, .8), tb)
            put(bass, pluck_bass(fifth if rng.random() > .3 else r + 12 if r + 12 <= 52 else r, .55), tb + 2 * beat + (.0 if I < .6 else .02))
            if I > .65: put(bass, pluck_bass(r, .4), tb + 3.5 * beat)
        if perc:
            lvl = .35 + .65 * (I - .4) / .6
            if "kick" in ins: put(perc_b, kick(.55 * lvl), tb); put(perc_b, kick(.4 * lvl), tb + 2 * beat)
            if "brush" in ins:
                for k in (1, 3): put(perc_b, brush((.38 + .1 * rng.random()) * lvl, rng), tb + k * beat)
                for k in range(8):
                    if k % 2: put(perc_b, shaker((.12 + .06 * rng.random()) * lvl, rng), tb + k * beat / 2)
    return [(lp(keys, 4200, 2), -.18, .5, .5, 0), (pad, .1, .6, 1.0, 1), (bass, 0, .5, 0, 0), (perc_b, .15, .5, 0, 0)]


def pal_kalimba(c):
    """Plucked kalimba/marimba pattern, soft pluck bass, quiet pad; a light shaker at higher intensity."""
    rng, beat, pc, I = c.rng, c.beat, c.pc, c.I
    hi, lo, bass, pad, sh = (np.zeros(c.n) for _ in range(5))
    motifs = [[1, 0, 1, 1, 0, 1, 0, 1], [1, 0, 0, 1, 1, 0, 1, 0]]; order = [0, 1, 2, 3, 2, 1, 3, 2]
    for tb, ch, _, k in bars(c):
        kn = sorted(fold(60 + pc + x, 60, 84) for x in ch); mot = motifs[k % 2]
        for s in range(8):
            if not mot[s] or (I < .4 and s % 2 and rng.random() < .5): continue
            put(hi, kalimba_note(kn[order[s]] + (12 if s == 7 and I > .6 and kn[order[s]] < 74 else 0), .45 + .2 * rng.random()), tb + s * beat / 2 + (rng.random() - .5) * .012)
        put(lo, marimba_note(fold(48 + pc + ch[0], 45, 57), .7), tb)
        put(lo, marimba_note(fold(48 + pc + ch[2], 45, 60), .5), tb + 2 * beat)
        put(bass, pluck_bass(fold(36 + pc + ch[0], 38, 49), .5), tb)
        for m in kn[:3]: put(pad, warm_pad_note(m - 12, c.bar + 1.5, rng, 1.0), tb - .5)
        if I > .5:
            for s in range(8):
                if s % 2: put(sh, shaker(.1 + .06 * rng.random(), rng), tb + s * beat / 2)
    return [(hi, .2, .6, .45, 0), (lo, -.15, .6, .3, 0), (bass, 0, .45, 0, 0), (pad, 0, .6, .8, 1), (lp(sh, 8000, 1), .3, .15 * min(1, I * 1.4), 0, 0)]


def pal_arp(c):
    """Warm saw pad + slow quarter-note arpeggio with a dotted-eighth echo, sub bass; brushes only when intense."""
    rng, beat, pc, I = c.rng, c.beat, c.pc, c.I
    pad, arp, sub, perc = (np.zeros(c.n) for _ in range(4)); pat = [0, 1, 2, 3, 2, 1, 2, 1]
    for tb, ch, _, k in bars(c):
        kn = sorted(fold(57 + pc + x, 55, 79) for x in ch)
        for m in kn[:3] + [fold(45 + pc + ch[0], 40, 52)]: put(pad, warm_pad_note(m, c.bar + 2.0, rng), tb - .8)
        put(sub, sub_note(fold(36 + pc + ch[0], 33, 45), c.bar + .6), tb - .1)
        for s in range(4):
            if I < .35 and s == 3 and rng.random() < .5: continue
            m = kn[pat[(4 * (k % 2) + s) % 8] % 4] + (12 if (k + s) % 4 == 3 else 0)
            put(arp, soft_pluck(m, .5 + .15 * rng.random()), tb + s * beat + (rng.random() - .5) * .008)
        if I > .55:
            lvl = .3 + .5 * (I - .55)
            for s in (1, 3): put(perc, brush(.3 * lvl, rng), tb + s * beat)
    d = int(.75 * beat * SR); echo = np.concatenate([np.zeros(d), arp[:len(arp) - d]]) * .35
    return [(pad, 0, .7, 1.0, 1), (arp, -.12, .55, .6, 0), (echo, .3, .4, .5, 0), (sub, 0, .6, 0, 0), (perc, .15, .5, 0, 0)]


def pal_jazz(c):
    """Jazz-lite: walking upright bass, swung brush ride and sweeps, sparse felt-piano comping."""
    rng, beat, pc, I = c.rng, c.beat, c.pc, c.I
    bass, keys, perc = (np.zeros(c.n) for _ in range(3)); sw = beat * 2 / 3
    for tb, ch, nch, k in bars(c):
        r = fold(36 + pc + ch[0], 38, 49); nr = fold(36 + pc + nch[0], 38, 49)
        walk = [r, fold(36 + pc + ch[1], 38, 52), fold(36 + pc + ch[2], 38, 52), nr + (1 if nr <= r else -1)]
        for s, m in enumerate(walk): put(bass, pluck_bass(m, [.85, .6, .65, .55][s], beat * 1.05), tb + s * beat + (rng.random() - .5) * .01)
        lvl = .5 + .5 * I
        for s in range(4):
            put(perc, ride(.22 * lvl, rng), tb + s * beat)
            if s in (1, 3): put(perc, ride(.14 * lvl, rng), tb + s * beat + sw); put(perc, brush(.26 * lvl, rng), tb + s * beat)
        kn = sorted(fold(57 + pc + x, 55, 74) for x in ch)
        if k % 2 == 0 or I > .5:
            for i, m in enumerate(kn[1:]): put(keys, epiano(m, .36), tb + beat + sw + .02 * i)
        if k % 2 == 1 and I > .3:
            for i, m in enumerate(kn[:3]): put(keys, epiano(m, .3), tb + 3 * beat + .02 * i)
    return [(bass, 0, 1.0, 0, 0), (lp(perc, 7500, 1), .2, .22, .05, 0), (lp(keys, 3800, 2), -.2, .6, .6, 0)]


def pal_celesta(c):
    """Music-box melody (seeded walk over chord and scale tones), soft pad and sub bass, plenty of room."""
    rng, beat, pc, I = c.rng, c.beat, c.pc, c.I
    mel, pad, sub, pl = (np.zeros(c.n) for _ in range(4)); d = 14
    rhythms = [[0, 2], [0, 1.5, 3], [0, 1, 2, 3], [0, 2.5], [0, 1, 3]]
    sm = lambda dd: 60 + pc + c.scale[dd % 7] + 12 * (dd // 7)
    for tb, ch, _, k in bars(c):
        cs = {(x % 7) for x in (c.prog[k % 4], c.prog[k % 4] + 2, c.prog[k % 4] + 4, c.prog[k % 4] + 6)}
        for pos in rhythms[int(rng.integers(len(rhythms)))]:
            d = int(np.clip(d + rng.choice([-2, -1, -1, 0, 1, 1, 2]), 8, 17))
            if pos == int(pos):   # strong beat: snap to the nearest chord tone
                d = min((x for x in range(d - 3, d + 4) if x % 7 in cs and 8 <= x <= 17), key=lambda x: abs(x - d), default=d)
            put(mel, celesta_note(fold(sm(d), 72, 90), .5 + .25 * rng.random()), tb + pos * beat)
        kn = sorted(fold(57 + pc + x, 55, 74) for x in ch)
        for m in kn[:3]: put(pad, warm_pad_note(m, c.bar + 1.8, rng, 1.1), tb - .6)
        put(sub, sub_note(fold(36 + pc + ch[0], 33, 45), c.bar + .4, .6), tb)
        put(pl, pluck_bass(fold(36 + pc + ch[0], 38, 49), .35), tb + 2 * beat)
    return [(mel, .15, .5, 1.0, 0), (pad, 0, .6, 1.0, 1), (sub, 0, .5, 0, 0), (pl, 0, .35, 0, 0)]


def pal_spy(c):
    """60s spy combo, long-form: swung walking bass, ride + brushes, a minor vibraphone motif, bongos when it builds,
    a surf-guitar twang on the section's first downbeat. Brass stabs come from the plan's hits (render_bed)."""
    rng, beat, pc, I = c.rng, c.beat, c.pc, c.I
    bass, vib, perc, gtr = (np.zeros(c.n) for _ in range(4)); sw = beat * 2 / 3
    motif = [[0, 2, 1.5, 4], [0, 1.5, 3], [0, 2.5], [0, 1, 2, 3.5]]
    for tb, ch, nch, k in bars(c):
        r = fold(36 + pc + ch[0], 38, 49); nr = fold(36 + pc + nch[0], 38, 49)
        walk = [r, fold(36 + pc + ch[2], 38, 52), r + 1 if k % 2 else fold(36 + pc + ch[1], 38, 52), nr + (1 if nr <= r else -1)]
        for s_, m in enumerate(walk): put(bass, pluck_bass(m, [.9, .6, .7, .6][s_], beat * 1.05), tb + s_ * beat + (rng.random() - .5) * .008)
        lvl = .45 + .55 * I
        for s_ in range(4):
            put(perc, ride(.2 * lvl, rng), tb + s_ * beat)
            if s_ in (1, 3): put(perc, ride(.13 * lvl, rng), tb + s_ * beat + sw); put(perc, brush(.24 * lvl, rng), tb + s_ * beat)
            if I > .55 and s_ in (2, 3): put(perc, bongo(.35 * lvl, s_ == 2), tb + s_ * beat + sw)
        if k % 2 == 0:
            tones = sorted(fold(69 + pc + x, 67, 86) for x in ch)
            for j, pos in enumerate(motif[(k // 2) % len(motif)]):
                put(vib, vibes_note(tones[(j + k // 2) % len(tones)], .55 + .2 * rng.random()), tb + pos * beat)
        if k == 0: put(gtr, twang(fold(40 + pc + ch[0], 40, 52), 1.0), tb)
    return [(bass, 0, 1.0, .05, 0), (lp(perc, 8000, 1), .25, .22, .05, 0), (vib, -.25, .55, .7, 1), (gtr, .3, .5, .9, 0)]


def pal_spy_noir(c):
    """The quiet location: half-note bass, brushes only, a low vibraphone line with long gaps."""
    rng, beat, pc = c.rng, c.beat, c.pc
    bass, vib, perc = (np.zeros(c.n) for _ in range(3))
    for tb, ch, nch, k in bars(c):
        put(bass, pluck_bass(fold(36 + pc + ch[0], 38, 49), .8, beat * 2.1), tb)
        put(bass, pluck_bass(fold(36 + pc + ch[2], 38, 52), .55, beat * 2.1), tb + 2 * beat)
        for s_ in range(4): put(perc, brush(.16, rng, .35), tb + s_ * beat)
        if k % 2 == 1:
            tones = sorted(fold(62 + pc + x, 60, 79) for x in ch)
            put(vib, vibes_note(tones[k % 3 + 1], .5, 3.2, 4.0), tb + .5 * beat)
            put(vib, vibes_note(tones[(k + 1) % 3], .38, 3.0, 4.0), tb + 2.5 * beat)
    return [(bass, 0, .9, 0, 0), (lp(perc, 6000, 1), .2, .2, .05, 0), (vib, -.2, .5, .9, 1)]


PALETTES = {"spy": pal_spy, "spy_noir": pal_spy_noir, "felt": pal_felt, "kalimba": pal_kalimba, "arp": pal_arp, "jazz": pal_jazz, "celesta": pal_celesta}
# default (palette, key, mode) per chapter: neighbouring keys of D, never the same palette twice in a row
DEFAULTS = [("felt", "D", "major"), ("kalimba", "A", "major"), ("arp", "B", "minor"), ("jazz", "G", "major"), ("celesta", "E", "dorian"),
            ("felt", "D", "dorian"), ("kalimba", "G", "major"), ("arp", "E", "minor"), ("jazz", "D", "major"), ("celesta", "A", "major")]


STYLE_DEFAULTS = {"briefing": [("spy", "D", "minor"), ("spy_noir", "A", "minor"), ("spy", "E", "dorian"), ("spy", "G", "minor"),
                                ("spy_noir", "D", "dorian"), ("spy", "B", "minor"), ("spy", "A", "dorian")],
                  # shorts: one section, the full spy combo (cues gives it 100 bpm, intensity 0.7, so the bongos play)
                  "shorts": [("spy", "D", "minor")]}


def default_source(idx, bpm, intensity, style=None):
    pal, key, mode = STYLE_DEFAULTS.get(style, DEFAULTS)[idx % len(STYLE_DEFAULTS.get(style, DEFAULTS))]
    return dict(type="synth", palette=pal, bpm=bpm, key=key, mode=mode, intensity=intensity)


def render_section(sec, idx, length, lead=0.0):
    """Synth section. Buffer origin = -lead (pre-roll bars), downbeat of bar 1 at +lead. Returns (dL, dR, sL, sR, chords)."""
    c = make_ctx(sec, idx, length, lead)
    pan = lambda x, p: (x * np.cos((p + 1) * np.pi / 4) * 1.414, x * np.sin((p + 1) * np.pi / 4) * 1.414)
    z = np.zeros(c.n); dL, dR, sL, sR = z.copy(), z.copy(), z.copy(), z.copy()
    for buf, p, dry, send, haas in PALETTES[sec.get("palette", "felt")](c):
        l, r = pan(buf, p)
        if haas: sh = int(.012 * SR); r = np.concatenate([np.zeros(sh), r[:-sh]])
        dL += l * dry; dR += r * dry; sL += l * send; sR += r * send
    chords = [(tb - c.nlead * c.bar, ch, c.pc) for tb, ch, _, k in bars(c) if k >= 0]
    return dL, dR, sL, sR, chords


def make_reverb(rt=1.8, seed=3):
    rng = np.random.default_rng(seed); n = int(rt * 1.2 * SR); t = np.arange(n) / SR
    out = []
    for _ in range(2):
        ir = lp(rng.standard_normal(n), 3500, 1) * np.exp(-t / (rt / 6.9)); ir[:int(.015 * SR)] = 0
        out.append(ir / np.sqrt((ir ** 2).sum()))
    return out


# ---------------- licensed files ----------------
def load_audio(path):
    tmp = tempfile.mktemp(suffix=".wav")
    r = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-y", "-i", path, "-ar", str(SR), "-ac", "2", "-c:a", "pcm_f32le", tmp], capture_output=True, text=True)
    if r.returncode: raise RuntimeError("ffmpeg could not decode %s: %s" % (path, r.stderr[-300:]))
    try: x, _ = sf.read(tmp, dtype="float64", always_2d=True)
    finally: os.remove(tmp)
    return x


def loop_fill(x, need, xf=1.5):
    """Loop x to 'need' samples with equal-power crossfades at each seam (tempo untouched)."""
    if len(x) >= need: return x[:need]
    xn = int(min(xf * SR, len(x) // 3)); out = x
    w = np.linspace(0, 1, xn)[:, None]
    while len(out) < need:
        out = np.concatenate([out[:-xn], out[-xn:] * np.cos(w * np.pi / 2) + x[:xn] * np.sin(w * np.pi / 2), x[xn:]])
    return out[:need]


def seg_rms(*arrs): return float(np.sqrt(sum((a ** 2).mean() for a in arrs) / 2)) + 1e-12


# ---------------- bed ----------------
def render_bed(sections, dur, hits, root, xf, log=print):
    """sections: [{t0,t1,label,source,intro?}] sorted. Returns (L, R, beats, downbeats, info, used_sources)."""
    N = int(dur * SR); L = np.zeros(N); R = np.zeros(N); sL = np.zeros(N); sR = np.zeros(N)
    beats, downbeats, info, chords_all, used = [], [], [], [], []
    for i, s in enumerate(sections):
        t0 = float(s["t0"]); t1 = min(float(s["t1"]), dur); src = dict(s.get("source") or {}); last = i == len(sections) - 1 or t1 >= dur - 1e-6
        length = t1 - t0
        if length <= 0: continue
        label = s.get("label", "S%02d" % (i + 1)); typ = src.get("type", "synth"); gain_db = float(src.get("gainDb", 0))
        if typ == "epidemic":
            log("[music] Epidemic free tier: no commercial licence - using synth for %s" % label)
            src = dict(s.get("fallback") or default_source(i, float(src.get("bpm", 90)), float(src.get("intensity", .45)))); typ = "synth"
        pre = 0.0 if i == 0 else xf
        beat_s = 0.0; chords = []
        if typ == "file":
            p = src["path"] if os.path.isabs(src["path"]) else os.path.join(root, src["path"])
            try:
                x = load_audio(p)[int(float(src.get("start", 0)) * SR):]
                if len(x) < SR: raise RuntimeError("track too short after start offset")
                x = loop_fill(x, int((pre + length) * SR) + 1); dl, dr = x[:, 0], x[:, 1]; el = er = np.zeros(len(dl))
                beat_s = 60 / float(src["bpm"]) if src.get("bpm") else 0.0
                used.append(dict(label=label, type="file", path=src["path"], credit=src.get("credit"), license=src.get("license"), attribution=src.get("attribution")))
            except Exception as e:
                log("[music] WARNING %s: file source failed (%s) - using synth" % (label, e)); typ = "synth"; src = default_source(i, 90, .45)
        if typ == "synth":
            bpm = float(src.get("bpm", 90)); bar = 240 / bpm; lead = np.ceil(pre / bar) * bar if pre else 0.0
            sec = dict(src); sec.setdefault("palette", "felt")
            if sec["palette"] not in PALETTES: log("[music] WARNING %s: unknown palette %r, using felt" % (label, sec["palette"])); sec["palette"] = "felt"
            dl, dr, el, er, chords = render_section(sec, i, length, lead)
            cut = int(round((lead - pre) * SR)); dl, dr, el, er = dl[cut:], dr[cut:], el[cut:], er[cut:]
            beat_s = 60 / bpm
            used.append(dict(label=label, type="synth", palette=sec["palette"], bpm=bpm, key=sec.get("key"), mode=sec.get("mode")))
        n = min(len(dl), int((pre + length) * SR) + 1); dl, dr, el, er = dl[:n], dr[:n], el[:n], er[:n]
        pn = int(round(pre * SR))
        # level: every section lands at -20 dBFS RMS (before reverb), so palettes and licensed tracks sit together
        g = 10 ** (-20 / 20) / seg_rms(dl[pn:] + .5 * el[pn:], dr[pn:] + .5 * er[pn:]) * 10 ** (gain_db / 20)
        env = np.ones(n)
        swell = s.get("intro") == "swell"
        fi = int(((pre + float(s.get("swellSec", 3.0))) if swell else (pre if pre else .6)) * SR); fi = min(fi, n)
        env[:fi] = np.sin(np.linspace(0, np.pi / 2, fi)) ** (2 if not swell else 2.5)
        fo = int((xf if not last else min(2.0, length / 2)) * SR); fo = min(fo, n)
        env[-fo:] *= np.cos(np.linspace(0, np.pi / 2, fo)) ** 2
        o = int(round((t0 - pre) * SR)); a0 = max(0, -o); o = max(0, o); m = min(n - a0, N - o)
        if m <= 0: continue
        sl = slice(a0, a0 + m)
        L[o:o + m] += dl[sl] * env[sl] * g; R[o:o + m] += dr[sl] * env[sl] * g; sL[o:o + m] += el[sl] * env[sl] * g; sR[o:o + m] += er[sl] * env[sl] * g
        chords_all += [(t0 + tb, ch, pcc, g) for tb, ch, pcc in chords if t0 + tb < t1]
        if beat_s:
            k = 0
            while t0 + k * beat_s < t1 - 1e-6:
                beats.append(round(t0 + k * beat_s, 4))
                if k % 4 == 0: downbeats.append(round(t0 + k * beat_s, 4))
                k += 1
        else: downbeats.append(round(t0, 4))
        info.append(dict(label=label, t0=t0, t1=t1, source=typ, palette=src.get("palette") if typ == "synth" else None, bpm=float(src["bpm"]) if src.get("bpm") else None,
                         key=src.get("key"), mode=src.get("mode"), bars=int(np.ceil(length / (4 * beat_s))) if beat_s else None, intro=s.get("intro"), crossfadeSec=xf if i else 0))
    ir = make_reverb()
    L += fftconvolve(sL, ir[0])[:N] * .45; R += fftconvolve(sR, ir[1])[:N] * .45
    for h in hits:                          # downbeat hits: soft thump + chord swell; stabs: an accent chord (synth sections only)
        if h.get("kind") not in ("downbeat", "stab"): continue
        t = float(h["t"]); ch = [c for c in chords_all if c[0] <= t + 1e-6]
        if not ch or t >= dur: continue
        _, cn, pcc, g = ch[-1]; buf = np.zeros(N)
        pal = next((x["palette"] for x in info if x["t0"] <= t < x["t1"]), None) or ""
        if pal.startswith("spy"):          # brass stab, ~8 ms early so its peak lands on the frame
            notes = [fold(57 + pcc + x, 55, 70) for x in cn[:3]]; notes += [m - 12 for m in notes[:2]]
            put(buf, brass_stab(notes, 1.0 if h["kind"] == "stab" else .8), t - .008, .9)
            if h["kind"] == "downbeat": put(buf, kick(1.0, .6), t, .5)
            L += buf * g; R += buf * g
            continue
        if h["kind"] == "stab":
            for i, c_ in enumerate(cn): put(buf, epiano(fold(57 + pcc + c_, 55, 77), .7, 2.0), t + .015 * i, .7)
            buf = lp(buf, 4500, 2) * .5 * g; L += buf; R += buf
            continue
        put(buf, kick(1.0, .6), t, .7)
        for i, c_ in enumerate(cn): put(buf, epiano(fold(57 + pcc + c_, 55, 77), .8, 3.0), t + .02 * i, .8)
        put(buf, pluck_bass(fold(36 + pcc + cn[0], 38, 49), 1.0, 2.0), t, 1.0)
        buf = lp(buf, 4500, 2) * .55 * g; L += buf; R += buf
    gate = np.ones(N)
    for h in hits:                          # silence hits: true near-silence (-70 dB)
        if h.get("kind") != "silence": continue
        t = float(h["t"]); d = float(h.get("dur", 1.2)); a0 = int(t * SR); a1 = int((t + d) * SR); lo = 10 ** (-70 / 20)
        dn = int(.08 * SR); up = int(.15 * SR); gg = np.ones(N); gg[a0:a1] = lo
        if a0 + dn <= N: gg[a0:a0 + dn] = np.linspace(1, lo, dn)
        if a1 + up <= N: gg[a1:a1 + up] = np.linspace(lo, 1, up)
        gate = np.minimum(gate, gg)
    L *= gate; R *= gate
    pk = max(np.abs(L).max(), np.abs(R).max())
    if pk > .9: L *= .9 / pk; R *= .9 / pk
    return L, R, beats, downbeats, info, used, pk


# ---------------- music.json ----------------
def build_sections(plan, chapters):
    secs = []
    for i, s in enumerate(sorted(plan["sections"], key=lambda s: s["t0"])):
        secs.append(dict(t0=round(float(s["t0"]), 3), t1=round(float(s["t1"]), 3), label="A%02d" % (i + 1),
                         source=default_source(i, float(s["bpm"]), float(s.get("intensity", .45)), plan.get("style"))))
    for ch in chapters or []:   # the chapter's section starts at the title card's pause and swells in
        ps, st = float(ch["pauseStartMs"]) / 1000, float(ch["startMs"]) / 1000
        j = next((k for k, s in enumerate(secs) if s["t0"] - 0.5 <= st < s["t1"]), None)
        if j is None: continue
        if j > 0 and secs[j - 1]["t0"] + 4 < ps < secs[j]["t1"] - 4: secs[j]["t0"] = secs[j - 1]["t1"] = round(ps, 3)
        secs[j]["intro"] = "swell"; secs[j]["title"] = ch.get("title")
    return secs


def init_music_json(a):
    plan = json.load(open(a.plan)); chapters = json.load(open(a.chapters)) if a.chapters and os.path.exists(a.chapters) else None
    secs = build_sections(plan, chapters)
    if a.refresh_timing and os.path.exists(a.music_json):
        old = json.load(open(a.music_json))
        if len(old["sections"]) == len(secs):
            for o, n in zip(old["sections"], secs): n["source"] = o["source"]; n["label"] = o.get("label", n["label"]); n.setdefault("intro", o.get("intro"))
            for n in secs:
                if n.get("intro") is None: n.pop("intro", None)
        else: print("[music] WARNING: section count changed (%d -> %d); sources reset to defaults" % (len(old["sections"]), len(secs)))
    out = dict(version=1, sr=int(plan.get("sr", 48000)), duration=float(plan["duration"]), crossfadeSec=1.8, sections=secs, hits=plan.get("hits", []))
    json.dump(out, open(a.music_json, "w"), indent=2)
    print("[music] wrote %s (%d sections%s)" % (a.music_json, len(secs), ", chapters applied" if chapters else ""))


def main():
    global SR
    ap = argparse.ArgumentParser()
    ap.add_argument("--plan"); ap.add_argument("--music-json"); ap.add_argument("--chapters"); ap.add_argument("--out"); ap.add_argument("--beats")
    ap.add_argument("--sources"); ap.add_argument("--audition"); ap.add_argument("--root", default=os.getcwd())
    ap.add_argument("--init", action="store_true"); ap.add_argument("--reset", action="store_true"); ap.add_argument("--refresh-timing", action="store_true")
    a = ap.parse_args()
    if a.init:
        if a.music_json and os.path.exists(a.music_json) and not (a.reset or a.refresh_timing): print("[music] %s exists (use --reset to regenerate)" % a.music_json); return
        init_music_json(a); return
    if a.music_json:
        cfg = json.load(open(a.music_json))
        if a.plan and os.path.exists(a.plan) and os.path.getmtime(a.plan) > os.path.getmtime(a.music_json):
            print("[music] NOTE: music_plan.json is newer than music.json; if act timings changed run with --refresh-timing (keeps your sources) or --reset")
    else:
        plan = json.load(open(a.plan))
        cfg = dict(sr=plan.get("sr", 48000), duration=plan["duration"], crossfadeSec=1.5, hits=plan.get("hits", []),
                   sections=[dict(t0=s["t0"], t1=s["t1"], label="S%02d" % (i + 1), source=dict(type="synth", palette="felt", **{k: s[k] for k in s if k in ("bpm", "key", "mode", "intensity")})) for i, s in enumerate(plan["sections"])])
    SR = int(cfg.get("sr", 48000)); dur = float(cfg["duration"]); xf = float(cfg.get("crossfadeSec", 1.8))
    secs = sorted(cfg["sections"], key=lambda s: s["t0"])
    if a.audition:
        os.makedirs(a.audition, exist_ok=True)
        for i, s in enumerate(secs):
            ln = min(20.0, float(s["t1"]) - float(s["t0"]))
            one = [dict(s, t0=0.0, t1=ln, intro=None)]
            L, R, *_ = render_bed(one, ln, [], a.root, xf, log=print)
            lab = s.get("label", "S%02d" % (i + 1)); p = os.path.join(a.audition, lab + ".wav")
            sf.write(p, np.stack([L, R], 1).astype(np.float32), SR, subtype="PCM_24")
            src = s["source"]; print("[music] audition %s  %-8s %s  -> %s" % (lab, src.get("type"), src.get("palette", src.get("path", "")), p))
        return
    L, R, beats, downbeats, info, used, pk = render_bed(secs, dur, cfg.get("hits", []), a.root, xf)
    sf.write(a.out, np.stack([L, R], 1).astype(np.float32), SR, subtype="PCM_24")
    if a.beats:
        json.dump(dict(sr=SR, duration=dur, crossfadeSec=xf, beats=beats, downbeats=downbeats, sections=info, hits=cfg.get("hits", [])), open(a.beats, "w"), indent=1)
    if a.sources: json.dump(used, open(a.sources, "w"), indent=1)
    print("[music] %s  %.1fs  %d beats  %d sections  peak %.1f dBFS" % (a.out, dur, len(beats), len(info), 20 * np.log10(min(pk, .9) + 1e-12)))


if __name__ == "__main__":
    main()

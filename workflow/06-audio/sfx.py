# SPDX-License-Identifier: MIT
# Adapted from LemoLab "opuscar" core/audio/sfx.py (MIT License, (c) LemoLab).
# Original procedural toy-brick SFX are kept below (renamed where they clash);
# Ledger foley (paper, graphite, wood, adding machine) is appended at the end.
"""Procedural sound effects and mixing tools (numpy/scipy). Every function returns mono float32 @ SR."""
import numpy as np
from scipy.signal import butter, sosfilt

SR = 48000
_rng = np.random.default_rng(7)


def t_(d): return np.arange(int(round(d * SR))) / SR   # rounds the same way as noise(), so multiplying them doesn't fail on an off-by-one length
def env_exp(d, tau): return np.exp(-t_(d) / tau)
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def lp(x, f, o=2): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def noise(d): return _rng.standard_normal(int(round(d * SR)))
def norm(x, p=1.0): m = np.abs(x).max(); return x * (p / m) if m > 0 else x


def brown(d):
    w = np.cumsum(noise(d)); w -= np.linspace(w[0], w[-1], len(w)); return norm(hp(w, 20))


# —— Bricks / toys ——
def click(pitch=1.0, v=1.0):
    """Plastic bricks snapping together: very short noise transient + two high resonances + a little low end"""
    d = .06; tt = t_(d)
    tr = hp(noise(d), 2500) * env_exp(d, .0015)
    res = sum(a * np.sin(2 * np.pi * f * pitch * tt + _rng.random() * 6) * env_exp(d, tau)
              for f, a, tau in [(2900, .6, .012), (4600, .4, .008), (1500, .35, .018)])
    body = np.sin(2 * np.pi * 190 * pitch * tt) * env_exp(d, .01) * .5
    return norm(tr * .8 + res + body) * v


def clack(pitch=1.0, v=1.0):
    """Brick dropped on a tabletop: the wood's mids + the plastic's highs"""
    d = .09; tt = t_(d); p = pitch * (.85 + _rng.random() * .3)
    x = hp(noise(d), 1200) * env_exp(d, .004) + sum(a * np.sin(2 * np.pi * f * p * tt) * env_exp(d, tau)
        for f, a, tau in [(1200, .6, .02), (2300, .5, .012), (380, .5, .03)])
    return norm(x) * v


def crash(v=1.0):
    d = .9; out = np.zeros(int(d * SR))
    for k in range(18):
        s = int((k / 18) ** 1.4 * .6 * SR); c = clack(.8 + _rng.random() * .6, .4 + _rng.random() * .6); out[s:s + len(c)] += c[:len(out) - s]
    out[:int(.2 * SR)] += lp(noise(.2), 400) * env_exp(.2, .05) * .8
    return norm(out) * v


def whoosh_toy(d=.35, v=1.0):
    n = noise(d); tt = t_(d); out = np.zeros_like(n)
    for i in range(0, len(n), 480):   # swept bandpass
        hi = min(len(n), i + 480)     # when the last block is shorter than 480 samples, take its actual length (so it doesn't crash when d isn't a multiple of 0.01 s)
        f = 600 + 2600 * np.sin(np.pi * i / len(n)); seg = bp(n[max(0, i - 2000):hi], f * .7, f * 1.3)[-(hi - i):]; out[i:hi] = seg
    return norm(out * np.sin(np.pi * tt / d) ** 2) * v


def creak(v=1.0):
    d = .22; tt = t_(d); f0 = 70 + _rng.random() * 40
    saw = 2 * ((tt * f0 * (1 + .3 * np.sin(2 * np.pi * 9 * tt))) % 1) - 1
    return norm(bp(saw, 400, 3000) * (np.abs(np.sin(2 * np.pi * 23 * tt)) ** 3) * np.sin(np.pi * tt / d)) * v


def thump(v=1.0, f=70):
    d = .35; tt = t_(d)
    return norm(np.sin(2 * np.pi * f * tt * (1 - .3 * tt)) * env_exp(d, .07) + lp(noise(d), 300) * env_exp(d, .02) * .5) * v


def step(v=1.0):
    d = .05; tt = t_(d)
    return norm(hp(noise(d), 1800) * env_exp(d, .004) + np.sin(2 * np.pi * 2200 * tt) * env_exp(d, .006) * .5) * v


def ding(v=1.0):
    d = 1.6; tt = t_(d)
    x = sum(a * np.sin(2 * np.pi * f * tt) * env_exp(d, tau) for f, a, tau in [(1318, 1, .6), (2637, .5, .35), (3951, .3, .2), (1976, .25, .5), (5274, .15, .1)])
    return norm(x) * v


def pop_toy(v=1.0):
    d = .18; tt = t_(d); f = 500 + 1400 * tt / d
    return norm(np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, .05)) * v


def quindar(v=1.0, f=2525):
    d = .25; tt = t_(d); x = np.sin(2 * np.pi * f * tt); x[:240] *= np.linspace(0, 1, 240); x[-240:] *= np.linspace(1, 0, 240)
    return x * .5 * v


def rumble(d=1.5, v=1.0):
    return norm(lp(brown(d), 200)) * np.sin(np.pi * t_(d) / d / 2) ** 2 * v


def ignite(v=1.0):
    d = 1.8; tt = t_(d)
    sub = np.sin(2 * np.pi * 45 * tt * (1 - .25 * tt)) * env_exp(d, .5)
    burst = lp(noise(d), 1200) * env_exp(d, .35)
    return norm(sub * .9 + burst) * v


def roar(d, v=1.0):
    tt = t_(d); b = lp(brown(d), 700); crack = hp(noise(d), 3000) * (_rng.random(len(tt)) > .995) * 3
    e = np.minimum(1, tt / .4) * np.minimum(1, (d - tt) / .6)
    return norm(b + lp(crack, 6000) * .3) * e * v


def heartbeat(v=1.0):
    return (thump(1, 55) + np.pad(thump(.7, 50), (int(.22 * SR), 0))[:len(thump(1, 55))]) * v


# —— Voice ——
def radio(x):
    """Walkie-talkie: bandpass + light distortion + noise floor"""
    y = bp(x, 380, 2800, 3); y = np.tanh(y * 3) / np.tanh(3)
    return norm(y + bp(_rng.standard_normal(len(y)), 1000, 4000) * .02) * .9


def compress(x, thr=.25, ratio=3.5, att=.004, rel=.08):
    env = np.zeros_like(x); a, r = np.exp(-1 / (att * SR)), np.exp(-1 / (rel * SR)); e = 0.0
    ax = np.abs(x)
    for i in range(len(x)):
        c = ax[i]; e = a * e + (1 - a) * c if c > e else r * e + (1 - r) * c; env[i] = e
    g = np.where(env > thr, (thr + (env - thr) / ratio) / np.maximum(env, 1e-9), 1.0)
    return x * g


def limit(x, ceil=.9, look=.005):
    """1D look-ahead limiter (for multichannel, call it per channel)"""
    n = int(look * SR); pk = np.abs(x)
    from scipy.ndimage import maximum_filter1d, uniform_filter1d
    m = maximum_filter1d(pk, size=2 * n + 1); g = np.minimum(1, ceil / np.maximum(m, 1e-9)); g = uniform_filter1d(g, size=n)
    return x * g


def add(buf, x, at, gain=1.0, pan=0.0):
    s = int(at * SR)
    if s >= len(buf) or s + len(x) <= 0: return
    if s < 0: x = x[-s:]; s = 0
    e = min(len(buf), s + len(x)); l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    buf[s:e, 0] += x[:e - s] * gain * l * 1.414; buf[s:e, 1] += x[:e - s] * gain * r * 1.414


# ===================================================================
# Ledger foley: paper, graphite, wood. Short, soft, mixed LIGHT under narration.
# Each returns mono float32 @ 48 kHz, peak-normalised to ~0.8 (mix.py sets levels).
# ===================================================================
def seed(n):
    """Re-seed the module RNG (mix.py seeds per event so renders are deterministic)."""
    global _rng
    _rng = np.random.default_rng(int(n))


def _fx(x, a=.002, b=.012):
    """Short fade in/out so nothing clicks."""
    x = np.asarray(x, dtype=np.float64).copy()
    na, nb = min(len(x) // 2, int(a * SR)), min(len(x) // 2, int(b * SR))
    if na > 0: x[:na] *= np.linspace(0, 1, na)
    if nb > 0: x[-nb:] *= np.linspace(1, 0, nb)
    return x


def _out(x, p=.8): return _fx(norm(x, p)).astype(np.float32)


def pencil_tap(v=1.0):
    """Graphite tip tapping paper over wood: a dry tick with a little woody body."""
    d = .09; tt = t_(d); f = 650 * (.9 + _rng.random() * .2)
    tick = bp(noise(d), 1800, 5500) * env_exp(d, .0035)
    body = np.sin(2 * np.pi * f * tt) * env_exp(d, .012) * .35 + np.sin(2 * np.pi * 230 * tt) * env_exp(d, .02) * .3
    return _out(lp(tick * .7 + body, 6500)) * v


def pencil_scratch(d=.6, v=1.0):
    """Handwriting: band-limited noise gated by an irregular stroke-speed envelope."""
    d = max(.12, float(d)); n = noise(d)
    ctrl = np.abs(lp(noise(d), 11, 2)); ctrl = ctrl / (ctrl.max() + 1e-9)
    speed = .18 + ctrl ** .8
    grit = bp(n, 1800, 6500, 2) * speed
    body = lp(noise(d), 700) * speed * .18
    e = np.minimum(1, t_(d) / .03) * np.minimum(1, (d - t_(d)) / .07)
    return _out(lp((grit + body) * e, 7000)) * v


def ruler_hiss(d=.8, v=1.0):
    """Drawing along a ruler: smooth airy hiss drifting up slightly, faint start tick."""
    d = max(.15, float(d)); n = noise(d); u = t_(d) / d
    x = bp(n, 2500, 5000) * (1 - u) + bp(noise(d), 4500, 9000) * u * .8
    e = np.minimum(1, t_(d) / .02) * np.minimum(1, (d - t_(d)) / .08) * (.8 + .2 * np.sin(np.pi * u))
    tick = np.zeros_like(x); k = hp(noise(.01), 1500) * env_exp(.01, .002); tick[:len(k)] = k * .8
    return _out(x * e * .5 + tick * .4) * v


def paper_slide(d=.45, v=1.0):
    """A cut-out set down / a sheet slid: swelling mid noise with fibre crackle and a soft touch-down."""
    d = max(.12, float(d)); tt = t_(d); u = tt / d
    crackle = 1 + .6 * lp(noise(d), 90) / (np.abs(lp(noise(d), 90)).max() + 1e-9)
    body = bp(noise(d), 700, 4800) * crackle * np.sin(np.pi * np.clip(u ** .7, 0, 1)) ** 1.3
    land = np.zeros_like(body); k = lp(noise(.06), 900) * env_exp(.06, .012); land[-len(k):] = k * 1.2
    return _out(body * .55 + land * .5) * v


def stamp_thud(v=1.0):
    """Rubber stamp on a ledger: soft low thump, wooden body, tiny paper slap."""
    d = .45; tt = t_(d); f = 46 + 62 * np.exp(-tt / .03)
    thud = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, .11)
    wood = lp(noise(d), 520) * env_exp(d, .045) * .7
    slap = bp(noise(d), 1200, 4200) * env_exp(d, .009) * .35
    return _out(thud + wood + slap) * v


def page_turn(v=1.0):
    """Between acts: paper lifted and flipped, a flutter, then settling."""
    d = .75; tt = t_(d); u = tt / d
    swoosh = bp(noise(d), 900, 6500) * (np.sin(np.pi * np.clip(u * 1.05, 0, 1)) ** 2) * (.5 + .5 * u)
    flutter = np.zeros(len(tt))
    for _ in range(14):
        s = int((.15 + _rng.random() * .45) * SR); k = bp(noise(.02), 1500, 5000) * env_exp(.02, .004); flutter[s:s + len(k)] += k[:len(flutter) - s] * (.3 + _rng.random() * .5)
    settle = np.zeros(len(tt)); k = lp(noise(.1), 800) * env_exp(.1, .025); settle[int(.58 * SR):int(.58 * SR) + len(k)] = k[:len(settle) - int(.58 * SR)]
    return _out(swoosh * .5 + flutter * .35 + settle * .6) * v


def adding_clack(v=1.0):
    """Adding-machine total: a quick ratchet of key clacks, then lever thunk and a tiny bell."""
    d = .9; out = np.zeros(int(d * SR))
    def put(x, at, g=1.0):
        s = int(at * SR); out[s:s + len(x)] += x[:len(out) - s] * g
    for i, at in enumerate([0, .07, .135, .2, .26]):
        put(clack(.75 + .06 * i, .6), at, .55 + .06 * i)
    thunk = lp(noise(.14), 400) * env_exp(.14, .035) + np.sin(2 * np.pi * 110 * t_(.14)) * env_exp(.14, .04)
    put(norm(thunk, .8), .36, .8)
    bell = sum(a * np.sin(2 * np.pi * f * t_(.5)) * env_exp(.5, tau) for f, a, tau in [(2093, 1, .18), (4186, .25, .08), (3136, .2, .1)])
    put(norm(bell, .35), .42, 1.0)
    return _out(lp(out, 8000)) * v


def pop(v=1.0):
    """A dot lands: soft, rounded blip (not a toy bloop)."""
    d = .13; tt = t_(d); f = 430 + 330 * (1 - np.exp(-tt / .02))
    x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, .03) + lp(noise(d), 1500) * env_exp(d, .004) * .25
    return _out(lp(x, 3200), .8) * v


def whoosh(d=.5, v=1.0):
    """Camera move: very soft low-mid air sweep."""
    d = max(.15, float(d)); u = t_(d) / d
    bands = [(250, 800, np.sin(np.pi * np.clip(u * 1.4, 0, 1)) ** 2), (600, 1700, np.sin(np.pi * u) ** 2), (400, 1100, np.sin(np.pi * np.clip(u * 1.4 - .4, 0, 1)) ** 2)]
    x = sum(bp(noise(d), lo, hi) * w for lo, hi, w in bands)
    return _out(lp(x, 2600) * np.sin(np.pi * u) ** 1.5) * v


# type -> (function, default duration or None, base level in dBFS peak at mix input)
FOLEY = {
    "pencil_tap": (pencil_tap, None, -16), "pencil_scratch": (pencil_scratch, .6, -23),
    "ruler_hiss": (ruler_hiss, .8, -25), "paper_slide": (paper_slide, .45, -20),
    "stamp_thud": (stamp_thud, None, -11), "page_turn": (page_turn, None, -18),
    "adding_clack": (adding_clack, None, -16), "pop": (pop, None, -19), "whoosh": (whoosh, .5, -26),
}


def render_event(kind, d=None):
    fn, dd, _ = FOLEY[kind]
    return fn(d if d is not None else dd) if dd is not None else fn()

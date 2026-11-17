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


def coin_drop(d=.7, v=1.0):
    """A coin lands and rings, then settles with two small bounces."""
    out = np.zeros(int(d * SR))
    for at, g, p in [(0, 1, 1.0), (.11, .45, 1.04), (.19, .2, 1.07)]:
        tt = t_(.5); ring = sum(a * np.sin(2 * np.pi * f * p * tt) * env_exp(.5, tau) for f, a, tau in [(3150, 1, .12), (4720, .5, .08), (6300, .25, .05)])
        s0 = int(at * SR); x = norm(ring, g * .6); out[s0:s0 + len(x)] += x[:len(out) - s0]
    return _out(lp(out, 9000)) * v


def cash_register(d=1.1, v=1.0):
    """Key clacks, a drawer thunk and a short 'ching'."""
    out = np.zeros(int(d * SR))
    def put(x, at, g=1.0):
        s0 = int(at * SR); out[s0:s0 + len(x)] += x[:len(out) - s0] * g
    for i, at in enumerate([0, .09, .17]): put(clack(.9 + .05 * i, .5), at, .5)
    put(norm(lp(noise(.2), 450) * env_exp(.2, .05) + np.sin(2 * np.pi * 95 * t_(.2)) * env_exp(.2, .06), .8), .3, .8)
    bell = sum(a * np.sin(2 * np.pi * f * t_(.7)) * env_exp(.7, tau) for f, a, tau in [(2637, 1, .3), (3951, .5, .2), (5274, .2, .12)])
    put(norm(bell, .35), .36, 1.0)
    return _out(lp(out, 9000)) * v


def typewriter(d=.9, v=1.0):
    """A few typebar strikes and a small carriage bell."""
    out = np.zeros(int(d * SR)); at = 0.0
    for i in range(5):
        c = clack(.7 + _rng.random() * .3, .6); s0 = int(at * SR); out[s0:s0 + len(c)] += c[:len(out) - s0] * (.5 + .3 * _rng.random()); at += .1 + .06 * _rng.random()
    bell = sum(a * np.sin(2 * np.pi * f * t_(.35)) * env_exp(.35, tau) for f, a, tau in [(2349, 1, .15), (4698, .2, .07)])
    s0 = int((at + .05) * SR); b = norm(bell, .3); out[s0:s0 + len(b)] += b[:len(out) - s0]
    return _out(lp(out, 8000)) * v


def card_slap(v=1.0):
    """A cut-paper letter lands: short flat slap of card on card, a little body."""
    d = .16; slap = bp(noise(d), 900, 5200) * env_exp(d, .011)
    body = lp(noise(d), 380) * env_exp(d, .03) * .6
    return _out(slap + body) * v


def paper_cut(d=.5, v=1.0):
    """Scissors through paper: a 'shh' made of tiny crisp snips."""
    d = max(.2, float(d)); out = bp(noise(d), 2500, 9000) * np.sin(np.pi * np.clip(t_(d) / d, 0, 1)) * .35
    for at in np.arange(0, d - .05, .07):
        s0 = int(at * SR); c = bp(noise(.03), 3000, 10000) * env_exp(.03, .004); out[s0:s0 + len(c)] += c[:len(out) - s0] * .8
    return _out(out) * v


def tear(d=.6, v=1.0):
    """Paper tearing: crackly broadband noise with a rising grain density."""
    d = max(.2, float(d)); tt = t_(d); u = tt / d
    grit = (np.abs(lp(noise(d), 160)) * 6) ** 2
    x = bp(noise(d), 600, 7000) * grit * np.sin(np.pi * np.clip(u, 0, 1)) ** .6
    return _out(x) * v


def metal_click(v=1.0):
    """A lock, a clasp, a key: two small metal ticks."""
    out = np.zeros(int(.12 * SR))
    for at, f, g in [(0, 3400, 1.0), (.045, 2700, .6)]:
        tt = t_(.04); x = (np.sin(2 * np.pi * f * tt) + bp(noise(.04), 2000, 9000) * .5) * env_exp(.04, .005)
        s0 = int(at * SR); out[s0:s0 + len(x)] += x[:len(out) - s0] * g
    return _out(out) * v


def tape_click(v=1.0):
    """Reel-to-reel transport click with a breath of hiss."""
    d = .25; x = lp(noise(.02), 2500) * env_exp(.02, .003)
    out = np.zeros(int(d * SR)); out[:len(x)] = x
    out += hp(noise(d), 4000) * env_exp(d, .12) * .06
    return _out(out, .6) * v


def whip(d=.4, v=1.0):
    """Whip-pan: a fast, brighter air rip that peaks in the middle."""
    d = max(.15, float(d)); u = t_(d) / d
    x = bp(noise(d), 500, 5000) * np.exp(-((u - .5) / .18) ** 2)
    return _out(x) * v


# Every type, its layer, anchor, default length and level live in sfx_types.json (shared with cues.ts).
import json as _json, os as _os
with open(_os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "sfx_types.json")) as _f: TYPES = _json.load(_f)["types"]
_FN = {
    "pencil_tap": pencil_tap, "pencil_scratch": pencil_scratch, "ruler_hiss": ruler_hiss, "paper_slide": paper_slide,
    "stamp_thud": stamp_thud, "page_turn": page_turn, "adding_clack": adding_clack, "pop": pop, "whoosh": whoosh,
    "coin_drop": coin_drop, "cash_register": cash_register, "typewriter": typewriter, "card_slap": card_slap,
    "paper_cut": paper_cut, "tear": tear, "metal_click": metal_click, "tape_click": tape_click, "whip": whip,
    # Drafting style (workflow/styles/drafting/ACT.md): stand-ins from the synths above until its own foley set exists
    "tick": lambda: click(1.7, .7), "ratchet": adding_clack, "click": click, "sweep": whoosh, "press": stamp_thud, "step": step,
}
import sfx_design as _design   # noqa: E402  (cinematic layer; imports this module back)
for _k, _f in _design.FNS.items():
    _FN[_k] = (lambda f: (lambda *a: _out(f(*a))))(_f)
# type -> (function, default duration or None, base level in dBFS peak at mix input)
FOLEY = {k: (_FN[k], v.get("d"), v["level"]) for k, v in TYPES.items()}
missing = set(TYPES) - set(_FN)
if missing: raise RuntimeError("sfx_types.json types without a renderer: %s" % sorted(missing))


def anchor_of(kind): return TYPES.get(kind, {}).get("anchor", "start")
def layer_of(kind): return TYPES.get(kind, {}).get("layer", "foley")


def render_event(kind, d=None):
    fn, dd, _ = FOLEY[kind]
    return fn(d if d is not None else dd) if dd is not None else fn()


# ===================================================================
# Licensed sample library (assets/sfx, filled by `bun run sfx:fetch`). Used when present, else the synth above.
# ===================================================================
LIB_DIR = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "..", "..", "assets", "sfx")
_lib = None; _wav = {}; _ref = {}; _last = {}


def reset_picks():
    """Forget the previous pick per type (call before rendering an event list from the top)."""
    _last.clear()


def _licensed(e):
    """Epidemic Sound free-tier audio never reaches a mix; a paid licence is declared with EPIDEMIC_COMMERCIAL=1."""
    return "epidemic" not in str(e.get("license", "")).lower() or _os.environ.get("EPIDEMIC_COMMERCIAL") == "1"


def library():
    """{type: [manifest entries whose wav exists]}"""
    global _lib
    if _lib is None:
        _lib = {}
        try:
            for e in _json.load(open(_os.path.join(LIB_DIR, "manifest.json"))):
                if _os.path.exists(_os.path.join(LIB_DIR, e["file"])) and _licensed(e): _lib.setdefault(e["type"], []).append(e)
        except (OSError, ValueError): pass
    return _lib


def _load(entry):
    import soundfile as sf
    if entry["file"] not in _wav:
        x, sr = sf.read(_os.path.join(LIB_DIR, entry["file"]), dtype="float64", always_2d=True); x = x.mean(1)
        if sr != SR:
            import soxr; x = soxr.resample(x, sr, SR, quality="HQ")
        _wav[entry["file"]] = x
    return _wav[entry["file"]]


def uniform_filter1d_(x, n):
    from scipy.ndimage import uniform_filter1d
    return uniform_filter1d(x, max(1, n))


def _ref_rms(kind):
    """RMS of the procedural design for this foley type: library samples are matched to it so the mix stays light."""
    if kind not in _ref:
        global _rng
        keep = _rng; _rng = np.random.default_rng(99)
        try:
            x = render_event(kind, None).astype(np.float64); a = np.abs(x); _ref[kind] = float(np.sqrt((x[a > .02 * a.max()] ** 2).mean()))
        finally: _rng = keep
    return _ref[kind]


def _bag(kind, n, take):
    """Shuffle-bag pick: every take of a type cycles through all n samples in a seeded order, reshuffled each round,
    never the same sample twice running (also across rounds). Stateless: the same take always gets the same sample."""
    import zlib
    prev = None; c = take // n
    for k in range(c + 1):
        p = list(np.random.default_rng(zlib.crc32(kind.encode()) + 7919 * k).permutation(n))
        if prev is not None and n > 1 and p[0] == prev[-1]: p[0], p[1] = p[1], p[0]
        prev = p
    return int(prev[take % n])


def lib_render(kind, d=None, take=None):
    """Seeded pick from the library with +-4 % pitch and +-1.5 dB gain variation; matched to the procedural level.
    Returns (mono float32 @ SR, manifest entry) or None when the type is not in the library."""
    ents = library().get(kind)
    if not ents: return None
    if take is not None: i = _bag(kind, len(ents), int(take))
    else:                                                # events without a take (older events.json): avoid an immediate repeat
        i = int(_rng.integers(len(ents)))
        if len(ents) > 1 and _last.get(kind) == i: i = (i + 1 + int(_rng.integers(len(ents) - 1))) % len(ents)
        _last[kind] = i
    e = ents[i]; x = _load(e).copy()
    rate = 1 + _rng.uniform(-.04, .04)
    if abs(rate - 1) > 1e-3:
        import soxr; x = soxr.resample(x, SR, int(round(SR / rate)), quality="HQ")
    want = d if d is not None else (FOLEY[kind][1] if kind in FOLEY else None)
    anchor, layer = anchor_of(kind), layer_of(kind)
    if anchor == "end" and want is not None:            # the build's climax lands on the hit: drop any tail after it, cut or pad the front
        env = uniform_filter1d_(np.abs(x), int(.03 * SR)); x = x[:int(np.argmax(env)) + int(.02 * SR)]
        n = int(want * SR); x = x[-n:] if len(x) > n else np.concatenate([np.zeros(n - len(x)), x])
        x = _fx(x, min(.12, want / 3), .008)
    elif anchor == "peak":                               # its loudest moment lands on the hit
        pre = int(TYPES[kind].get("pre", .2) * SR); env = uniform_filter1d_(np.abs(x), int(.01 * SR)); pk = int(np.argmax(env))
        x = x[pk - pre:] if pk > pre else np.concatenate([np.zeros(pre - pk), x])
        x = _fx(x[:pre + int(2.5 * SR)], .02, .05)
    elif want is not None and layer == "design":         # a hit or a blast: never looped, trimmed with a fade if long
        n = int(want * SR)
        if len(x) > n: x = x[:n]; x[-int(.15 * SR):] *= np.linspace(1, 0, int(.15 * SR))
    if anchor == "start" and want is not None and layer != "design":
        n = int(want * SR)
        if len(x) < n:                                   # loop with short crossfades
            xf = max(1, min(int(.03 * SR), len(x) // 3)); w = np.linspace(0, 1, xf); base = x
            while len(x) < n: x = np.concatenate([x[:-xf], x[-xf:] * np.cos(w * np.pi / 2) + base[:xf] * np.sin(w * np.pi / 2), base[xf:]])
        x = x[:n]
    if anchor == "start": x = _fx(x, .002, .03)
    a = np.abs(x); act = x[a > .02 * a.max()] if a.max() > 0 else x
    g = _ref_rms(kind) / (float(np.sqrt((act ** 2).mean())) + 1e-9) * 10 ** (_rng.uniform(-1.5, 1.5) / 20)
    g = min(g, 3.0); x = x * g; pk = np.abs(x).max()
    if pk > .9: x *= .9 / pk
    return x.astype(np.float32), e


def render_event_ex(kind, d=None, use_lib=True, take=None):
    """(samples, manifest entry or None). Library first, procedural fallback. take: the event's rank among events of its
    type (cues.ts writes it), which picks the sample from a shuffle bag."""
    if use_lib:
        r = lib_render(kind, d if d is not None else None, take)
        if r: return r
    return render_event(kind, d), None

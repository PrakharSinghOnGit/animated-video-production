"""Procedural cinematic sound design: builds, hits, transitions, a few modern UI/foley sounds.

These are the fallbacks for the design layer of sfx_types.json (used when assets/sfx has no recording of the type).
Every function returns mono float64 at sfx.SR and draws randomness only from sfx's seeded RNG, so a mix is
reproducible. Anchors (see sfx_types.json): an `end` sound is exactly d long and its last sample is the landing; a
`peak` sound has its loudest point at `pre` seconds.
"""
import numpy as np
from scipy.signal import fftconvolve, istft, stft
import sfx
from sfx import SR, bp, env_exp, hp, lp, t_


def _rng(): return sfx._rng
def _noise(d): return _rng().standard_normal(int(round(d * SR)))


def _sweep_filter(x, centre, width_oct=.8):
    """Time-varying band-pass: centre(u) in Hz for u in 0..1 over the signal, gaussian in log-frequency (STFT)."""
    nper = 1024
    f, tt, Z = stft(x, SR, nperseg=nper, noverlap=nper * 3 // 4)
    u = np.clip(tt / max(1e-9, len(x) / SR), 0, 1)   # frame centres (zero-padded edges included)
    c = np.log2(np.maximum(centre(u), 20))[None, :]
    g = np.exp(-.5 * ((np.log2(np.maximum(f, 20))[:, None] - c) / width_oct) ** 2)
    _, y = istft(Z * g, SR, nperseg=nper, noverlap=nper * 3 // 4)
    y = y[:len(x)]
    return np.pad(y, (0, len(x) - len(y)))


def _ir(d, bright=4000, seed_shift=0):
    """A synthetic room/hall impulse response: decorrelated noise with an exponential decay, darker as it decays."""
    n = int(d * SR); tt = np.arange(n) / SR
    ir = _noise(d) * np.exp(-tt / (d / 6.9))
    ir = .6 * lp(ir, bright) + .4 * lp(ir, bright / 4)
    ir[:int(.004 * SR)] *= np.linspace(0, 1, int(.004 * SR))
    return ir / (np.sqrt((ir ** 2).sum()) + 1e-9)


def _verb(x, d=1.6, wet=.35, bright=4000):
    tail = fftconvolve(x, _ir(d, bright))[:len(x) + int(d * SR)]
    dry = np.pad(x, (0, len(tail) - len(x)))
    return dry * (1 - wet) + tail * wet * 3


def _saw(f, tt, top=7000.0):
    """Band-limited saw with a (possibly time-varying) frequency array f."""
    ph = 2 * np.pi * np.cumsum(f) / SR; out = np.zeros_like(tt)
    for k in range(1, int(top / max(20.0, float(np.min(f)))) + 1):
        out += np.sin(k * ph) / k * (k * f < top)
    return out


def _fit(x, d):
    n = int(round(d * SR)); x = x[:n]
    return np.pad(x, (0, n - len(x)))


def riser(d=2.0, v=1.0):
    """A build: filtered noise sweeping up, a gliding detuned tone and a pulse that speeds up; ends exactly at d."""
    d = max(.5, float(d)); tt = t_(d); u = tt / d
    air = _sweep_filter(_noise(d), lambda u: 250 * (24 ** u ** 1.3), .7)
    f0 = 110 * 2 ** (2.0 * u ** 1.6)
    tone = sum(np.sin(2 * np.pi * np.cumsum(f0 * r) / SR) * a for r, a in [(1, 1), (1.006, .7), (.497, .5), (2.01, .25)])
    rate = 3 + 17 * u ** 2; pulse = .65 + .35 * np.sin(2 * np.pi * np.cumsum(rate) / SR)
    x = (sfx.norm(air) * .8 + sfx.norm(tone) * .45 * pulse) * u ** 2.2
    x = np.tanh(x * 1.6)
    x[-int(.008 * SR):] *= np.linspace(1, 0, int(.008 * SR))
    return sfx.norm(_fit(x, d)) * v


def reverse_swell(d=1.2, v=1.0):
    """A hit through a long reverb, reversed: it sucks in and stops dead on the landing."""
    d = max(.4, float(d))
    hit = np.zeros(int(.25 * SR)); k = int(.12 * SR)
    hit[:k] = (bp(_noise(.12), 300, 6000) * env_exp(.12, .02) + np.sin(2 * np.pi * 220 * t_(.12)) * env_exp(.12, .05) * .6)
    wet = fftconvolve(hit, _ir(d + .3, 6000))[:int(d * SR)]
    x = wet[::-1] * np.linspace(0, 1, len(wet)) ** .5
    x[-int(.006 * SR):] *= np.linspace(1, 0, int(.006 * SR))
    return sfx.norm(_fit(x, d)) * v


def impact(v=1.0):
    """Cinematic hit: sub thump with a pitch drop, a mid crack, a bright transient, a dark hall tail."""
    d = .9; tt = t_(d)
    f = 48 + 90 * np.exp(-tt / .045)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, .32)
    crack = bp(_noise(d), 180, 3200) * env_exp(d, .035)
    snap = hp(_noise(d), 4500) * env_exp(d, .004)
    x = np.tanh(1.8 * (sub * 1.0 + crack * .55 + snap * .35))
    x = _verb(x, 2.2, .28, 3000)
    return sfx.norm(x) * v


def boom(v=1.0):
    """A deep sub boom: low sine with a pitch drop, a soft thump, a little air."""
    d = 2.0; tt = t_(d)
    f = 38 + 55 * np.exp(-tt / .08)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, .55)
    thump = lp(_noise(d), 260) * env_exp(d, .05) * .7
    x = np.tanh(1.5 * (sub + thump))
    x = _verb(x, 1.4, .15, 1200)[:len(tt)]
    x[-int(.05 * SR):] *= np.linspace(1, 0, int(.05 * SR))
    return sfx.norm(x) * v


def sub_drop(d=1.2, v=1.0):
    """A falling sub tone: 120 Hz down to 28 Hz, saturated so small speakers hear its harmonics."""
    d = max(.4, float(d)); tt = t_(d); u = tt / d
    f = 120 * (28 / 120) ** (u ** .6)
    x = np.sin(2 * np.pi * np.cumsum(f) / SR)
    e = np.minimum(1, tt / .01) * (1 - u) ** 1.5
    return sfx.norm(np.tanh(2.2 * x) * e) * v


def braam(d=2.2, v=1.0):
    """A dark low brass blast: detuned saws on A1 + octave + fifth, a filter that opens then closes, a growl."""
    d = max(.8, float(d)); tt = t_(d); u = tt / d
    x = sum(_saw(np.full(len(tt), f * r), tt, 5000) * a
            for f, a in [(55, 1), (110, .6), (82.4, .45)] for r in (1, 1.004, .996))
    x *= 1 + .25 * np.sin(2 * np.pi * 31 * tt)
    cut = lambda u: 250 + 1700 * np.sin(np.pi * np.clip(u * 1.6, 0, 1)) ** .7 * (1 - .6 * u)
    x = _sweep_filter(x, cut, 1.6) + lp(x, 180) * .6
    e = np.minimum(1, tt / .07) * np.minimum(1, (d - tt) / .6)
    return sfx.norm(np.tanh(1.4 * sfx.norm(x)) * e) * v


def tension(d=6.0, v=1.0):
    """A suspense drone: two beating low sines, a dark rumble, a faint high cluster; fades in and out."""
    d = max(2.0, float(d)); tt = t_(d)
    low = np.sin(2 * np.pi * 55 * tt) + np.sin(2 * np.pi * 57.3 * tt) + .4 * np.sin(2 * np.pi * 110.4 * tt)
    rumble = lp(sfx.brown(d), 140) * 1.2
    shimmer = (np.sin(2 * np.pi * 1760 * tt) + np.sin(2 * np.pi * 1864.7 * tt)) * .05 * (.5 + .5 * np.sin(2 * np.pi * .23 * tt))
    swell = .75 + .25 * np.sin(2 * np.pi * tt / max(2.0, d / 2) - np.pi / 2)
    e = np.minimum(1, tt / 1.2) * np.minimum(1, (d - tt) / 1.0)
    return sfx.norm((sfx.norm(low) * .7 + sfx.norm(rumble) * .5 + shimmer) * swell * e) * v


def _whoosh_shape(d, pre, lo, hi, sub):
    tt = t_(d); u = tt / d; p = pre / d
    e = np.where(u < p, (u / p) ** 2.5, np.exp(-(u - p) / max(.05, (1 - p) / 3.5)))
    ctr = lambda u: np.where(u < p, lo * (hi / lo) ** (u / p), hi * (lo / hi) ** np.clip((u - p) / (1 - p), 0, 1) ** .5)
    x = _sweep_filter(_noise(d), ctr, .9) * e
    if sub:
        k = int(pre * SR); th = np.sin(2 * np.pi * 55 * t_(.3)) * env_exp(.3, .08) * .5
        x[k:k + len(th)] += th[:len(x) - k]
    return x


def transition(d=.8, v=1.0, pre=.3):
    """A big whoosh that peaks at pre, with a low thump on the cut."""
    d = max(pre + .2, float(d))
    return sfx.norm(_whoosh_shape(d, pre, 300, 2600, True)) * v


def swoosh(d=.4, v=1.0, pre=.15):
    """A fast bright swoosh that peaks at pre."""
    d = max(pre + .1, float(d))
    return sfx.norm(_whoosh_shape(d, pre, 900, 6500, False)) * v


def shutter(v=1.0):
    """A camera shutter: the blade click, the mirror slap ~60 ms later, a tiny spring."""
    out = np.zeros(int(.25 * SR))
    gap = .055 + _rng().random() * .025
    for at, f, body, g in [(0, 3600, 900, 1.0), (gap, 2100, 420, .85)]:
        d = .05; tt = t_(d)
        x = hp(_noise(d), 1500) * env_exp(d, .0025) + np.sin(2 * np.pi * f * tt) * env_exp(d, .006) * .5 + np.sin(2 * np.pi * body * tt) * env_exp(d, .012) * .5
        s = int(at * SR); out[s:s + len(x)] += x[:len(out) - s] * g
    s = int((gap + .03) * SR); k = bp(_noise(.08), 3000, 8000) * env_exp(.08, .015) * .15; out[s:s + len(k)] += k[:len(out) - s]
    return sfx.norm(lp(out, 8000)) * v


def notify(v=1.0):
    """A two-tone app notification: soft bell partials, the second note a fourth up."""
    out = np.zeros(int(.7 * SR))
    for at, f in [(0, 1568.0), (.095, 2093.0)]:
        tt = t_(.55); x = sum(a * np.sin(2 * np.pi * f * m * tt) * env_exp(.55, tau) for m, a, tau in [(1, 1, .22), (2.76, .18, .07), (5.4, .06, .03)])
        x[:48] *= np.linspace(0, 1, 48); s = int(at * SR); out[s:s + len(x)] += x[:len(out) - s]
    return sfx.norm(out) * v


def glitch(d=.35, v=1.0):
    """A digital stutter: 15-40 ms slices of a buzzy tone and noise, sample-and-hold crushed, some dropped."""
    d = max(.1, float(d)); n = int(d * SR); out = np.zeros(n); i = 0
    while i < n:
        L = int((.015 + _rng().random() * .025) * SR); j = min(n, i + L)
        if _rng().random() > .25:
            tt = t_((j - i) / SR); f = 80 + _rng().random() * 900
            seg = np.sign(np.sin(2 * np.pi * f * tt)) * .6 + _rng().standard_normal(j - i) * .4
            hold = int(2 + _rng().random() * 12); seg = np.repeat(seg[::hold], hold)[:j - i]
            seg = np.round(seg * 6) / 6
            out[i:j] = np.pad(seg, (0, j - i - len(seg))) * (.5 + _rng().random() * .5)
        i = j
    return sfx.norm(bp(out, 150, 9000)) * v


def clock_tick(d=2.0, v=1.0):
    """A clock: a tick every half second, tick and tock alternating."""
    d = max(.5, float(d)); out = np.zeros(int(d * SR))
    for k, at in enumerate(np.arange(0, d - .05, .5)):
        f = 2500 if k % 2 == 0 else 1900; tt = t_(.04)
        x = bp(_noise(.04), 1800, 6000) * env_exp(.04, .003) + np.sin(2 * np.pi * f * tt) * env_exp(.04, .005) * .6
        s = int(at * SR); out[s:s + len(x)] += x[:len(out) - s]
    return sfx.norm(out) * v


def heartbeat(v=1.0):
    """Lub-dub: two low thumps with fast pitch drops."""
    out = np.zeros(int(.7 * SR))
    for at, g, f0 in [(0, 1.0, 62), (.2, .7, 55)]:
        d = .3; tt = t_(d); f = f0 + 40 * np.exp(-tt / .02)
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(d, .06) + lp(_noise(d), 180) * env_exp(d, .015) * .4
        s = int(at * SR); out[s:s + len(x)] += x[:len(out) - s] * g
    return sfx.norm(np.tanh(1.5 * out)) * v


def record_scratch(v=1.0):
    """A record scratch: a chord read back and forth by a hand-moved needle."""
    src_d = 1.0; tt = t_(src_d)
    src = sum(np.sin(2 * np.pi * f * tt) for f in (220, 277.2, 329.6, 440)) + bp(_noise(src_d), 1000, 6000) * .3
    d = .45; u = t_(d) / d
    vel = np.where(u < .35, 1 - 3.2 * u / .35, np.where(u < .7, -2.2 + 4.4 * (u - .35) / .35, 2.2 * (1 - (u - .7) / .3)))
    pos = np.clip(.5 * SR + np.cumsum(vel), 0, len(src) - 2)
    x = np.interp(pos, np.arange(len(src)), src) * np.minimum(1, np.abs(vel) * 1.5)
    x = bp(x + hp(_noise(d), 3000) * .05 * np.abs(vel), 250, 7000)
    return sfx.norm(x) * v


FNS = {"riser": riser, "reverse_swell": reverse_swell, "impact": impact, "boom": boom, "sub_drop": sub_drop,
       "braam": braam, "tension": tension, "transition": transition, "swoosh": swoosh, "shutter": shutter,
       "notify": notify, "glitch": glitch, "clock_tick": clock_tick, "heartbeat": heartbeat, "record_scratch": record_scratch}

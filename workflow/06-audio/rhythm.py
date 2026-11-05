#!/usr/bin/env python
"""Beats of a music track, for cutting a short to its rhythm.

  rhythm.py FILE --start S --dur D [--auto]  -> JSON on stdout:
     {bpm, start, beats:[s], downbeats:[s], accents:[{t, s}], energy:[0..1 per beat], confidence}
  Times are seconds from the moment the short starts (= track time - start). --auto moves `start` to the track's first
  downbeat after any silent intro, so the short opens on the "one".

Method (numpy/scipy only):
  onset strength  log-magnitude spectral flux, 1024-sample window, 128-sample hop at 22.05 kHz (~5.8 ms), local mean removed
  tempo           autocorrelation of the onset strength, 70-180 BPM with a mild pull toward 90-140, then refined
  beats           dynamic programming (Ellis 2007): each beat = a strong onset about one period after the previous
                  one; a log-ratio penalty keeps the spacing steady, so a beat survives a quiet bar
  downbeats       of the four possible bar phases, the one whose beats carry the most low-end (kick) energy
  accents         onsets far above the track's typical level (hits, drops, crashes): the moments for a big thump
  energy          loudness per beat, 0..1 over the excerpt (the drop shows as a step up)
"""
import argparse, json, subprocess
import numpy as np
from scipy.signal import butter, sosfiltfilt

SR, HOP, N = 22050, 128, 1024


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def onset_env(x):
    frames = np.lib.stride_tricks.sliding_window_view(x, N)[::HOP] * np.hanning(N)
    mag = np.log1p(np.abs(np.fft.rfft(frames, axis=1)) * 10)
    flux = np.maximum(0, np.diff(mag, axis=0)).sum(axis=1)
    flux = np.concatenate([[0], flux])
    flux = flux - np.convolve(flux, np.ones(64) / 64, mode="same")
    env = np.maximum(flux, 0)
    return env / (env.std() + 1e-9)


# + 11 ms: the flux peaks slightly before the hit with this window (measured on click tracks at 88-150 BPM)
def frame_t(i): return (i * HOP + N / 2) / SR + 0.011


def tempo(env):
    fps = SR / HOP
    e = env - env.mean()
    ac = np.correlate(e, e, mode="full")[len(e) - 1:]
    lags = np.arange(1, len(ac))
    bpm = 60 * fps / lags
    ok = (bpm >= 70) & (bpm <= 180)
    w = np.exp(-0.5 * (np.log2(bpm / 115) / 1.0) ** 2)
    score = np.where(ok, ac[1:] * w, -np.inf)
    i = int(np.argmax(score)); lag = lags[i]
    # parabolic refinement of the peak lag
    if 1 <= i < len(score) - 1 and np.isfinite(score[i - 1]) and np.isfinite(score[i + 1]):
        a, b, c = score[i - 1], score[i], score[i + 1]
        den = a - 2 * b + c
        if den != 0: lag = lag + 0.5 * (a - c) / den
    return 60 * fps / lag


def track_beats(env, bpm, tight=100.0):
    period = (60 / bpm) * SR / HOP
    n = len(env)
    score = env.copy().astype(np.float64)
    back = -np.ones(n, dtype=int)
    lo, hi = int(round(period / 2)), int(round(period * 2))
    for t in range(n):
        a, b = max(0, t - hi), t - lo
        if b <= a: continue
        prev = np.arange(a, b)
        pen = -tight * np.log((t - prev) / period) ** 2
        cand = score[prev] + pen
        k = int(np.argmax(cand))
        if cand[k] > 0:
            score[t] = env[t] + cand[k]; back[t] = prev[k]
    # last beat: the best score within the final period
    tail = np.arange(max(0, n - int(period)), n)
    t = int(tail[np.argmax(score[tail])])
    beats = []
    while t >= 0:
        beats.append(t); t = back[t]
    return np.array(beats[::-1])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file"); ap.add_argument("--start", type=float, default=0); ap.add_argument("--dur", type=float, required=True)
    ap.add_argument("--auto", action="store_true")
    a = ap.parse_args()
    x = load(a.file)
    total = len(x) / SR
    # analyse the excerpt plus a few seconds either side (beats near the edges need context)
    pad = 4.0
    s0 = max(0.0, a.start - pad)
    seg = x[int(s0 * SR): int(min(total, a.start + a.dur + pad) * SR)]
    if len(seg) < SR * 3: raise SystemExit(json.dumps({"error": "the track is shorter than 3 s after the start point"}))
    env = onset_env(seg)
    bpm = tempo(env)
    while bpm < 70: bpm *= 2
    while bpm > 180: bpm /= 2
    bi = track_beats(env, bpm)
    bt = np.array([frame_t(i) for i in bi]) + s0                      # track time
    if len(bt) > 3:
        # tempo from a straight-line fit of beat time against beat number (sub-frame precise, not the frame-quantised median)
        k = np.arange(len(bt)); slope, icpt = np.polyfit(k, bt, 1)
        bpm = 60 / float(slope)
        # each beat moved onto the fitted grid where the grid is within a frame or two (keeps real drift, removes jitter)
        grid = icpt + slope * k
        bt = np.where(np.abs(bt - grid) < 2.5 * HOP / SR, grid, bt)
    # downbeats: bar phase with the most low end on its beats
    lowx = sosfiltfilt(butter(4, 150, btype="low", fs=SR, output="sos"), seg)
    def low_at(t):
        i = int((t - s0) * SR); w = int(0.06 * SR)
        y = lowx[max(0, i - w // 4): i + w]
        return float(np.sqrt((y ** 2).mean())) if len(y) else 0.0
    lows = np.array([low_at(t) for t in bt])
    phase = int(np.argmax([lows[p::4].mean() if len(lows[p::4]) else 0 for p in range(4)]))
    down = bt[phase::4]
    start = a.start
    if a.auto:
        # the first downbeat after any silent intro (RMS over the first beats above -40 dBFS)
        rms_ok = [t for t in down if t >= a.start and np.sqrt((x[int(t * SR): int((t + 60 / bpm) * SR)] ** 2).mean() + 1e-12) > 0.01]
        if rms_ok: start = float(rms_ok[0])
    rel = lambda t: round(float(t - start), 3)
    inside = lambda t: -0.001 <= t - start <= a.dur
    # accents: onset peaks well above the typical level, at least a beat apart
    thr = np.percentile(env, 99.0)
    peaks = [i for i in range(1, len(env) - 1) if env[i] > thr and env[i] >= env[i - 1] and env[i] >= env[i + 1]]
    acc, last = [], -1e9
    for i in sorted(peaks, key=lambda i: -env[i]):
        t = frame_t(i) + s0
        if inside(t) and all(abs(t - u) > 0.6 * 60 / bpm for u, _ in acc): acc.append((t, float(env[i])))
    acc.sort()
    mx = max([s for _, s in acc], default=1.0)
    # loudness per beat
    def rms_at(t):
        y = x[int(t * SR): int((t + 60 / bpm) * SR)]
        return 20 * np.log10(np.sqrt((y ** 2).mean()) + 1e-9) if len(y) else -90.0
    bin_ = [t for t in bt if inside(t)]
    ldb = np.array([rms_at(t) for t in bin_]) if bin_ else np.zeros(0)
    en = [round(float(v), 2) for v in (ldb - ldb.min()) / max(1e-9, ldb.max() - ldb.min())] if len(ldb) else []
    # confidence: how regular the beat grid is (1 = metronomic)
    iv = np.diff(bt)
    conf = float(np.clip(1 - (iv.std() / iv.mean()) * 4, 0, 1)) if len(iv) > 2 else 0.0
    print(json.dumps(dict(
        bpm=round(bpm, 1), start=round(start, 3), dur=a.dur, trackDur=round(total, 2), confidence=round(conf, 2),
        beats=[rel(t) for t in bin_], downbeats=[rel(t) for t in down if inside(t)],
        accents=[dict(t=rel(t), s=round(s / mx, 2)) for t, s in acc[:24]], energy=en,
    )))


if __name__ == "__main__":
    main()

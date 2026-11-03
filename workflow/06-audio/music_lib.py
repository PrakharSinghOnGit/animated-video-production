#!/usr/bin/env python
"""Measure music tracks for the library index: duration, tempo (BPM), energy 0..1, loudness.

  music_lib.py FILE [FILE ...]   -> JSON list on stdout: [{file, duration, bpm, energy, rmsDb}]

Tempo: onset-strength autocorrelation (spectral flux), 60-180 BPM, octave-folded toward 75-150. Energy: mix of loudness and
onset density, scaled so a sparse ambient bed is ~0.2 and a driving track ~0.8. Estimates: correct them in index.json if off.
"""
import json, subprocess, sys
import numpy as np

SR = 22050


def load(path):
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32)


def onset_env(x, hop=512, n=2048):
    frames = np.lib.stride_tricks.sliding_window_view(x, n)[::hop] * np.hanning(n)
    mag = np.log1p(np.abs(np.fft.rfft(frames, axis=1)) * 10)
    flux = np.maximum(0, np.diff(mag, axis=0)).sum(axis=1)
    flux -= np.convolve(flux, np.ones(16) / 16, mode="same")
    return np.maximum(flux, 0), SR / hop


def tempo(env, fps):
    env = env - env.mean()
    ac = np.correlate(env, env, mode="full")[len(env) - 1:]
    lags = np.arange(len(ac))
    bpm = 60 * fps / np.maximum(lags, 1)
    ok = (bpm >= 60) & (bpm <= 180)
    w = np.exp(-0.5 * (np.log2(bpm / 110) / 0.9) ** 2)       # mild preference for the usual 80-140 range
    i = int(np.argmax(np.where(ok, ac * w, -np.inf)))
    b = float(bpm[i])
    while b < 75: b *= 2
    while b > 150: b /= 2
    return round(b, 1)


def measure(path):
    x = load(path)
    if len(x) < SR * 2: raise RuntimeError("shorter than 2 s")
    rms = float(np.sqrt((x ** 2).mean()) + 1e-9); rms_db = 20 * np.log10(rms)
    env, fps = onset_env(x[: SR * 240])                      # first 4 min is plenty
    density = float((env > env.mean() + env.std()).mean())   # share of frames with a clear onset
    energy = float(np.clip(0.55 * np.clip((rms_db + 30) / 18, 0, 1) + 0.45 * np.clip(density / 0.18, 0, 1), 0, 1))
    return dict(file=path, duration=round(len(x) / SR, 2), bpm=tempo(env, fps), energy=round(energy, 2), rmsDb=round(rms_db, 1))


if __name__ == "__main__":
    out = []
    for p in sys.argv[1:]:
        try: out.append(measure(p))
        except Exception as e: out.append(dict(file=p, error=str(e)))
    print(json.dumps(out))

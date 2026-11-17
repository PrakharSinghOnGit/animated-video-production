#!/usr/bin/env python3
"""Deterministic checks of one act from its DENSE frames (every 0.1 s, rendered by frames.ts), plus the motion grids.

Free, no model. Each finding is a fact the critic and the author get: what, when, where on screen, how bad.

Checks (the act's first and last second, where the whip/wipe transitions run, are skipped unless said otherwise):
  pop          something appears or vanishes in one step (0.1 s) with no animation in or out. The camera's own move is
               measured between every two frames (pan + zoom, by phase correlation) and taken out first, so a drawing put in
               while the camera travels still counts; things that grow, slide, fade or step on twos over >= 2 steps do not.
  cut          the whole picture changes in one step without a whip (a hard cut inside the act)
  camera-jump  the camera jumps in one step while it was still before and after (no ease)
  blank        a blank frame (almost nothing drawn) for >= 0.3 s; near-empty (< 3 % content) for >= 1.5 s
  frozen       nothing on screen moves at all (no idle, no drift) for >= 4 s
  text-clipped impact text or a label partly outside the frame while the shot holds (>= 0.5 s)
  title-safe   text inside the frame but outside the title-safe area (5 % margins) for >= 1 s
  text-overlap two different texts overlap for >= 0.5 s
  contrast     text whose colour is close to what is behind it (WCAG ratio < 3, < 2 is bad)
  late-hit     the visible change for a hit word comes mostly after the word starts (a hit is complete at its word)
  no-hit       nothing visibly changes within 0.6 s of a hit word
  unsettled    the picture is still changing in the last second before the act's transition out
  seam         the seam check (bun run seams) flagged the cut into or out of this act
Text checks need the kit's measured boxes (measure.json written with wgMeasure); without them they are skipped.

Usage: act_checks.py --dense DIR --fps 30 --nth 3 --dur S --out DIR [--measure dense_measure.json] [--words words.json]
                     [--seams report.json --act A01] [--grid-step 0.5] [--vertical] [--no-grids]
words.json: [{"t": act seconds, "text": "word", "hit": bool}]
Writes <out>/checks.json and <out>/grid_01.jpg ... (12 consecutive frames per image, the spoken words under each tile,
flagged tiles outlined in red with the finding's number)."""
import argparse
import json
import math
import os
import re

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ap = argparse.ArgumentParser()
ap.add_argument("--dense", required=True)
ap.add_argument("--fps", type=float, default=30)
ap.add_argument("--nth", type=int, default=3)
ap.add_argument("--dur", type=float, required=True)
ap.add_argument("--out", required=True)
ap.add_argument("--measure")
ap.add_argument("--words")
ap.add_argument("--seams")
ap.add_argument("--act")
ap.add_argument("--grid-step", type=float, default=0.5)
ap.add_argument("--vertical", action="store_true")
ap.add_argument("--no-grids", action="store_true")
a = ap.parse_args()

EDGE = 1.0               # seconds at each end left to the act's transitions
SW, SH = (135, 240) if a.vertical else (240, 135)   # analysis size (1/8 of 1080p)
FW, FH = (1080, 1920) if a.vertical else (1920, 1080)
NPX = SW * SH
DIFF = 32                # grey levels (0-255) a pixel must change by to count as changed (camera search)
DIFF_RGB = 14            # the same in any one colour channel, for the final mask: a pale shape on a pale ground still counts
FROZEN = 0.12            # mean grey change per step under which nothing moved (a static render repeats exactly)
WHIP = 0.09              # camera moving more than this share of the width per step: a whip, too blurred to judge

files = sorted(f for f in os.listdir(a.dense) if re.match(r"d_\d+\.jpg$", f))
if len(files) < 3:
    raise SystemExit("act_checks: fewer than 3 dense frames")
frame_no = [int(f[2:-4]) for f in files]
ts = np.array([n / a.fps for n in frame_no])
step = a.nth / a.fps
N = len(files)


def load(i, size=(SW, SH)):
    im = Image.open(os.path.join(a.dense, files[i]))
    im.draft("RGB", size)
    return np.asarray(im.convert("RGB").resize(size, Image.BILINEAR)).astype(np.float32)


def ground_and_ink(rgb):
    """Dominant colour (the ground) and the mask of pixels far from it (anything drawn)."""
    q = (rgb[::2, ::2].reshape(-1, 3) // 12).astype(np.int32)
    keys = q[:, 0] * 10000 + q[:, 1] * 100 + q[:, 2]
    k, c = np.unique(keys, return_counts=True)
    g = rgb[::2, ::2].reshape(-1, 3)[keys == k[c.argmax()]].mean(axis=0)
    return g, np.abs(rgb - g).sum(axis=2) > 100


inner_x0, inner_x1, inner_y0, inner_y1 = int(SW * 0.05), int(SW * 0.95), int(SH * 0.067), int(SH * 0.93)
rgb = [load(i) for i in range(N)]
grey = [x @ np.array([0.299, 0.587, 0.114], np.float32) for x in rgb]
rgb8 = [x.astype(np.uint8) for x in rgb]
ink = []
gdist = []      # per frame: how far each pixel is from the ground colour (max over channels), 0-255
cover = np.zeros(N)
for i in range(N):
    gc, m = ground_and_ink(rgb[i])
    ink.append(m)
    gdist.append(np.abs(rgb[i] - gc).max(axis=2).clip(0, 255).astype(np.uint8))
    cover[i] = m[inner_y0:inner_y1, inner_x0:inner_x1].mean()
del rgb

# ---------- camera between consecutive frames: pan + zoom by phase correlation ----------
HANN = np.outer(np.hanning(SH), np.hanning(SW)).astype(np.float32)


def phase(a_, b_):
    """Integer shift (dy, dx) that moves a_ onto b_, and the correlation peak (1 = same picture, shifted)."""
    A = np.fft.rfft2((a_ - a_.mean()) * HANN)
    B = np.fft.rfft2((b_ - b_.mean()) * HANN)
    R = B * np.conj(A)
    R /= np.abs(R) + 1e-3
    r = np.fft.irfft2(R, s=a_.shape)
    py, px = np.unravel_index(int(r.argmax()), r.shape)
    if py > SH // 2:
        py -= SH
    if px > SW // 2:
        px -= SW
    return int(py), int(px), float(r.max())


def warp(img, s, dy, dx):
    """img zoomed by s about the centre, then shifted by (dy, dx); outside = NaN."""
    cy, cx = (SH - 1) / 2, (SW - 1) / 2
    # output (y, x) samples input at ((y - dy - cy) / s + cy, (x - dx - cx) / s + cx)
    out = ndimage.affine_transform(img, [1 / s, 1 / s], offset=[cy - (dy + cy) / s, cx - (dx + cx) / s], order=1, cval=np.nan)
    return out


def changed_after(a_, b_, s, dy, dx):
    w = warp(a_, s, dy, dx)
    valid = ~np.isnan(w)
    valid = ndimage.binary_erosion(valid, iterations=2)
    d = np.where(valid, np.abs(np.nan_to_num(w) - b_), 0)
    ch = ndimage.binary_opening(d > DIFF, structure=np.ones((2, 2)))   # drop 1 px edge slivers from sub-pixel shifts
    return ch, valid


def changed_rgb(i, s, dy, dx):
    """The final change mask for step i under the found camera, in colour (max over the channels)."""
    a_, b_ = rgb8[i].astype(np.float32), rgb8[i + 1].astype(np.float32)
    d = np.zeros((SH, SW), np.float32)
    valid = None
    for c in range(3):
        w = warp(a_[..., c], s, dy, dx)
        if valid is None:
            valid = ndimage.binary_erosion(~np.isnan(w), iterations=2)
        d = np.maximum(d, np.abs(np.nan_to_num(w) - b_[..., c]))
    return ndimage.binary_opening(valid & (d > DIFF_RGB), structure=np.ones((2, 2)))


ZOOMS = (0.9, 0.94, 0.97, 0.985, 1.015, 1.03, 1.06, 1.11)
cam = []        # per step i (frame i -> i+1): (s, dy, dx)
change = []     # per step: bool mask of what changed that the camera does not explain (frame i+1 coordinates)
raw = np.zeros(N - 1)
for i in range(N - 1):
    g0, g1 = grey[i], grey[i + 1]
    raw[i] = float(np.abs(g1 - g0).mean())
    if raw[i] < FROZEN:
        cam.append((1.0, 0, 0)); change.append(np.zeros((SH, SW), bool)); continue
    best = None
    for s in (1.0,) + (ZOOMS if True else ()):
        src = g0 if s == 1.0 else warp(g0, s, 0, 0)
        src = np.nan_to_num(src, nan=float(g0.mean()))
        dy, dx, pk = phase(src, g1)
        ch, valid = changed_after(g0, g1, s, dy, dx)
        score = ch.sum() / max(1, valid.sum())
        if best is None or score < best[0]:
            best = (score, s, dy, dx, ch)
        if s == 1.0 and score < 0.004:
            break       # a pan (or nothing) explains it: no zoom search
    if best[1] != 1.0 or best[0] >= 0.004:
        # refine the zoom around the best coarse value (slow push-ins change the zoom by < 1 % per step)
        for s in (best[1] * 0.992, best[1] * 0.996, best[1] * 1.004, best[1] * 1.008):
            src = np.nan_to_num(warp(g0, s, 0, 0), nan=float(g0.mean()))
            dy, dx, _ = phase(src, g1)
            ch, valid = changed_after(g0, g1, s, dy, dx)
            score = ch.sum() / max(1, valid.sum())
            if score < best[0]:
                best = (score, s, dy, dx, ch)
    cam.append(best[1:4]); change.append(changed_rgb(i, *best[1:4]))
area = np.array([c.mean() for c in change])
speed = np.array([math.hypot(c[1], c[2]) / SW + abs(math.log(c[0])) for c in cam])

findings = []


def add(kind, sev, t, msg, t1=None, box=None, **extra):
    f = {"kind": kind, "severity": sev, "t": round(float(t), 2), "msg": msg}
    if t1 is not None and t1 > t + 0.05:
        f["t1"] = round(float(t1), 2)
    if box is not None:
        f["box"] = [round(float(v), 3) for v in box]   # fractions of the frame: x0, y0, x1, y1
    f.update(extra)
    findings.append(f)


def judged(i):
    """Step i is inside the act proper (not its transitions) and the camera is not whipping."""
    return EDGE <= ts[i] and ts[i + 1] <= a.dur - EDGE and speed[i] < WHIP


def where(box):
    x = (box[0] + box[2]) / 2
    y = (box[1] + box[3]) / 2
    h = "left" if x < 0.33 else "right" if x > 0.67 else "centre"
    v = "top" if y < 0.33 else "bottom" if y > 0.67 else "middle"
    return "centre" if h == v == "centre" or (h == "centre" and v == "middle") else f"{v} {h}" if v != "middle" else h


# ---------- pop / cut / camera jump ----------
MIN_BLOB = 0.0025 * NPX
for i in range(1, N - 2):
    if not judged(i) or area[i] * NPX < MIN_BLOB:
        continue
    prev_a, next_a = area[i - 1], area[i + 1]
    if area[i] > 0.4 and max(prev_a, next_a) < 0.08 and speed[i] < 0.03:
        add("cut", "medium", ts[i + 1], f"the whole picture changes in one frame at {ts[i + 1]:.1f}s ({area[i]:.0%} of it) with no whip: a hard cut inside the act")
        continue
    if min(prev_a, next_a) > 0.05:
        continue        # the whole picture is in flux around this step (a wipe, a whip the camera estimate missed, a burst)
    lab, n = ndimage.label(ndimage.binary_dilation(change[i], iterations=2))
    for k in range(1, n + 1):
        blob = lab == k
        sz = int((blob & change[i]).sum())
        if sz < MIN_BLOB:
            continue
        # around it, just before and after: change there means a thing moving (a slide, a wipe front, a morph),
        # whose hard edge changes a new strip every step; a pop has nothing changing near it before or after
        pad = int(max(2, abs(cam[i][1]) + abs(cam[i][2]) + 2)) + 6
        region = ndimage.binary_dilation(blob, iterations=pad)
        cur = (change[i] & region).sum()
        around = max((change[i - 1] & region).sum(), (change[i + 1] & region).sum())
        if around > cur * 0.22:
            continue                       # it was moving before or keeps moving after: animated
        # the same pixels changing again a little later: a counter ticking, letters or bricks landing, a bar growing.
        # (a row of things popping in one after another is still flagged: each pops at its own place)
        same = ndimage.binary_dilation(blob & change[i], iterations=2)
        if max((change[j] & same).sum() for j in (i - 2, i + 2, i + 3) if 0 <= j < N - 1) > cur * 0.3:
            continue
        ys, xs = np.nonzero(blob & change[i])
        bw_, bh_ = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
        box = (xs.min() / SW, ys.min() / SH, (xs.max() + 1) / SW, (ys.max() + 1) / SH)
        # in or out: is the changed area further from the ground colour after the step, or before it (pale shapes count)
        cb = blob & change[i]
        before, after = float(gdist[i][cb].mean()), float(gdist[i + 1][cb].mean())
        what = "appears" if after > before + 10 and after > 1.6 * before else "vanishes" if before > after + 10 and before > 1.6 * after else "changes"
        if what == "changes" and (min(bw_, bh_) <= 4 or sz < 0.2 * bw_ * bh_):
            continue                       # a thin sliver that only shifted (a rule re-sampled by the camera drift)
        share = sz / NPX
        sev = "high" if share >= 0.015 else "medium" if share >= 0.005 else "low"
        if what == "changes":
            sev = "low"                    # neither in nor out: often a mis-measured camera move; the critic decides
        moving = " while the camera moves" if math.hypot(cam[i][1], cam[i][2]) >= 2 or abs(cam[i][0] - 1) > 0.01 else ""
        # a thing flying in from off frame: it touches the edge and was already showing there one step before
        edge = 5 + int(abs(cam[i][1]) + abs(cam[i][2]))   # the band the camera compensation leaves out, plus a margin
        strips = [(slice(0, edge), slice(None)), (slice(SH - edge, SH), slice(None)), (slice(None), slice(0, edge)), (slice(None), slice(SW - edge, SW))]
        entering = any(blob[s].sum() >= 3 and (ink[i][s] & blob[s]).sum() > 0.25 * blob[s].sum() for s in strips)
        if entering and what != "vanishes":
            add("fast-entry", "low", ts[i + 1], f"something flies in from off frame in about one frame at {ts[i + 1]:.1f}s ({where(box)}, {share:.1%} of the frame): "
                "fine for a drop or a throw; if it reads as a pop, give it a few frames of travel", box=box)
            continue
        add("pop", sev, ts[i + 1], f"something {what} in one frame at {ts[i + 1]:.1f}s ({where(box)}, {share:.1%} of the frame){moving}: "
            + ("animate it in (pop, slide, draw on) or keep it off screen until the camera has left" if what != "vanishes"
               else "animate it out, or let the camera leave before it goes"), box=box, what=what)
    sh = math.hypot(cam[i][1], cam[i][2])
    if sh / SW > 0.03 and math.hypot(cam[i - 1][1], cam[i - 1][2]) < sh * 0.15 and math.hypot(cam[i + 1][1], cam[i + 1][2]) < sh * 0.15:
        add("camera-jump", "low", ts[i + 1], f"the camera jumps {sh / SW:.0%} of the width in one frame at {ts[i + 1]:.1f}s: ease the move (1.1-2.8 s) or make it a whip")

# merge pops at the same moment (several blobs in one step) into one finding
merged = []
for f in findings:
    m = merged[-1] if merged else None
    if m and f["kind"] == m["kind"] == "pop" and abs(f["t"] - m["t"]) < 0.01:
        b0, b1 = m["box"], f["box"]
        m["box"] = [min(b0[0], b1[0]), min(b0[1], b1[1]), max(b0[2], b1[2]), max(b0[3], b1[3])]
        m["count"] = m.get("count", 1) + 1
        if ["low", "medium", "high"].index(f["severity"]) > ["low", "medium", "high"].index(m["severity"]):
            m["severity"] = f["severity"]
        continue
    merged.append(f)
findings = merged


def runs(mask, min_len):
    """[(start index, end index)] of True runs in a per-frame/step mask lasting >= min_len seconds."""
    out, s0 = [], None
    for i, v in enumerate(list(mask) + [False]):
        if v and s0 is None:
            s0 = i
        elif not v and s0 is not None:
            if (i - s0) * step >= min_len - 1e-6:
                out.append((s0, i - 1))
            s0 = None
    return out


inside = (ts >= EDGE) & (ts <= a.dur - EDGE)
# ---------- blank / near-empty ----------
for s0, s1 in runs(inside & (cover < 0.012), 0.3):
    add("blank", "high", ts[s0], f"blank frame from {ts[s0]:.1f}s to {ts[s1]:.1f}s ({cover[s0:s1 + 1].max():.1%} content): something should be on screen", t1=ts[s1])
for s0, s1 in runs(inside & (cover < 0.03), 1.5):
    if any(f["kind"] == "blank" and f["t"] >= ts[s0] - 0.01 and f.get("t1", f["t"]) <= ts[s1] + 0.01 and f.get("t1", f["t"]) - f["t"] >= (s1 - s0) * step - 0.11 for f in findings):
        continue
    add("near-empty", "medium", ts[s0], f"near-empty from {ts[s0]:.1f}s to {ts[s1]:.1f}s (under 3% of the safe area has content)", t1=ts[s1])

# ---------- frozen ----------
still_step = np.array([raw[i] < FROZEN and EDGE <= ts[i] and ts[i + 1] <= a.dur - EDGE for i in range(N - 1)])
for s0, s1 in runs(still_step, 4.0):
    d = (s1 - s0 + 1) * step
    add("frozen", "high" if d >= 8 else "medium", ts[s0], f"nothing moves from {ts[s0]:.1f}s to {ts[s1 + 1]:.1f}s ({d:.1f} s): no idle, no drift; "
        "give the held picture a slow camera drift or an idle motion (a deliberate stop-time in silence is the exception)", t1=ts[s1 + 1])

# ---------- end of the act still changing ----------
tail = [i for i in range(N - 1) if a.dur - EDGE - 0.7 <= ts[i] and ts[i + 1] <= a.dur - EDGE + 0.01 and speed[i] < WHIP]
if len(tail) >= 4:
    busy = float(np.mean([area[i] for i in tail]))
    if busy > 0.03:
        add("unsettled", "medium", ts[tail[0]], f"the picture is still changing just before the act's transition out ({ts[tail[0]]:.1f}-{ts[tail[-1] + 1]:.1f}s, {busy:.0%} of the frame per step): "
            "land the last move and hold the finished picture for the cut", t1=ts[tail[-1] + 1])

# ---------- hits ----------
words = json.load(open(a.words)) if a.words and os.path.exists(a.words) else []
for w in words:
    if not w.get("hit"):
        continue
    t = float(w["t"])
    if not (EDGE + 0.6 <= t <= a.dur - EDGE - 0.8):
        continue
    pre = [i for i in range(N - 1) if t - 0.6 <= ts[i + 1] <= t + 0.05 and speed[i] < WHIP]
    post = [i for i in range(N - 1) if t + 0.05 < ts[i + 1] <= t + 0.8 and speed[i] < WHIP]
    if not pre or not post:
        continue
    b, f_ = float(sum(area[i] for i in pre)), float(sum(area[i] for i in post))
    if b + f_ < 0.004:
        add("no-hit", "low", t, f"nothing visibly changes within 0.6 s of the hit word \"{w['text']}\" at {t:.1f}s (check the hit is on screen)", word=w["text"])
    elif f_ > 2.5 * b and f_ > 0.03:
        add("late-hit", "low", t, f"most of the change for \"{w['text']}\" happens after the word starts at {t:.1f}s ({b:.0%} before, {f_:.0%} after, summed share of the frame): "
            "a hit must be complete when its word starts", word=w["text"])

# ---------- text: clipped, title-safe, overlap, contrast (from the kit's measured boxes) ----------
measured = json.load(open(a.measure)) if a.measure and os.path.exists(a.measure) else []
by_frame = {m["frame"]: m["items"] for m in measured if "frame" in m}
idx_of = {n: i for i, n in enumerate(frame_no)}
MIN_READ = {"label": 20, "type": 30}
track = {}          # (kind, text, check) -> [indices]


def note(key, i, info=None):
    track.setdefault(key, []).append((i, info))


safe_m = 0.05
for n, items in by_frame.items():
    i = idx_of.get(n)
    if i is None or not inside[i] or (i < N - 1 and speed[i] >= WHIP) or (i > 0 and speed[i - 1] >= WHIP):
        continue
    texts = [it for it in items if it.get("box") and it["kind"] in ("type", "label") and it["px"] >= MIN_READ[it["kind"]] and len(it["text"].strip()) > 1]
    for it in texts:
        x0, y0, x1, y1 = it["box"]
        bw, bh = max(1, x1 - x0), max(1, y1 - y0)
        vis = max(0, min(x1, FW) - max(x0, 0)) * max(0, min(y1, FH) - max(y0, 0)) / (bw * bh)
        if 0.15 < vis < 0.97:
            note((it["kind"], it["text"], "clip"), i, it["box"])
        elif vis >= 0.97 and (x0 < FW * safe_m or x1 > FW * (1 - safe_m) or y0 < FH * safe_m or y1 > FH * (1 - safe_m)):
            note((it["kind"], it["text"], "safe"), i, it["box"])
    for p in range(len(texts)):
        for q in range(p + 1, len(texts)):
            A, B = texts[p]["box"], texts[q]["box"]
            if texts[p]["text"] == texts[q]["text"]:
                continue
            big, small = max(texts[p]["px"], texts[q]["px"]), min(texts[p]["px"], texts[q]["px"])
            if big > 2.5 * small or (0 < i < N - 1 and max(area[i - 1], area[i]) > 0.05):
                continue    # giant set type behind a label is the style (numbers are the set); mid-transition is not judged
            iw, ih = min(A[2], B[2]) - max(A[0], B[0]), min(A[3], B[3]) - max(A[1], B[1])
            if iw <= 0 or ih <= 0:
                continue
            small_area = min((A[2] - A[0]) * (A[3] - A[1]), (B[2] - B[0]) * (B[3] - B[1]))
            if iw * ih > 0.3 * small_area:
                note(("pair", " / ".join(sorted([texts[p]["text"], texts[q]["text"]])), "overlap"), i,
                     [min(A[0], B[0]), min(A[1], B[1]), max(A[2], B[2]), max(A[3], B[3])])


def lum(c):
    c = np.asarray(c, np.float64) / 255
    c = np.where(c <= 0.03928, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def ratio(c1, c2):
    l1, l2 = lum(c1), lum(c2)
    return (max(l1, l2) + 0.05) / (min(l1, l2) + 0.05)


# contrast on every 3rd dense frame (full 0.5x frames, only where measured text is)
full_cache = {}
for n, items in by_frame.items():
    i = idx_of.get(n)
    if i is None or i % 3 or not inside[i] or (i < N - 1 and speed[i] >= WHIP):
        continue
    if 0 < i < N - 1 and max(area[i - 1], area[i]) > 0.05:
        continue        # mid-transition (a card sliding over, a wipe): what is behind the text is about to change
    for it in items:
        if not it.get("box") or not it.get("col") or it["kind"] not in ("type", "label") or it["px"] < MIN_READ[it["kind"]] or len(it["text"].strip()) < 2:
            continue
        bx = it["box"]
        if bx[0] < 0 or bx[1] < 0 or bx[2] > FW or bx[3] > FH:
            continue        # partly off frame: the clipped check covers it
        if i not in full_cache:
            im = Image.open(os.path.join(a.dense, files[i])).convert("RGB")
            full_cache.clear()
            full_cache[i] = (np.asarray(im).astype(np.float32), im.width / FW)
        img, k = full_cache[i]
        x0, y0, x1, y1 = [int(round(v * k)) for v in it["box"]]
        x0, y0, x1, y1 = max(0, x0), max(0, y0), min(img.shape[1], x1), min(img.shape[0], y1)
        if x1 - x0 < 6 or y1 - y0 < 5:
            continue
        px = img[y0:y1, x0:x1].reshape(-1, 3)
        col = np.array([int(it["col"][j:j + 2], 16) for j in (1, 3, 5)], np.float32)
        dist = np.abs(px - col).sum(axis=1)
        if (dist < 40).mean() < 0.06:
            continue        # hidden, or not drawn in its measured colour (per-letter colours): can't judge
        far = dist > 90
        if far.mean() >= 0.15:
            behind = np.median(px[far], axis=0)       # what the letters sit on (a tag, a card, the ground)
        else:
            # almost nothing in the box differs from the text colour: either the text fills its box, or it sits on
            # something of nearly its own colour. The ring just outside the box tells which.
            pad = max(3, (y1 - y0) // 4)
            X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad), min(img.shape[1], x1 + pad), min(img.shape[0], y1 + pad)
            ring = np.ones((Y1 - Y0, X1 - X0), bool)
            ring[y0 - Y0:y1 - Y0, x0 - X0:x1 - X0] = False
            if ring.sum() < 20:
                continue
            behind = np.median(img[Y0:Y1, X0:X1][ring], axis=0)
        r = ratio(col, behind)
        if r < 3.0:
            # a box with no visible structure: the text is covered by something drawn later, or set in exactly the colour
            # behind it; either way the viewer sees nothing there (reported low: often a hidden layer, not a fault)
            seen = float((px @ np.array([0.299, 0.587, 0.114], np.float32)).std()) >= 4
            note((it["kind"], it["text"], "contrast"), i, (it["box"], float(r), seen))

for (kind, text, check), hits in track.items():
    idxs = sorted(set(h[0] for h in hits))
    need = {"clip": 0.5, "safe": 1.0, "overlap": 0.5, "contrast": 0.3}[check]
    if check == "contrast":
        if len(idxs) < 2:
            continue
        seen_hits = [h for h in hits if h[1][2]]
        what = 'impact text' if kind == 'type' else 'label'
        if len(seen_hits) < 2:
            box, r, _ = min(hits, key=lambda h: h[1][1])[1]
            t_ = ts[min(hits, key=lambda h: h[1][1])[0]]
            add("contrast", "low", t_, f"{what} \"{text}\" is measured on screen at {t_:.1f}s but nothing is visible there (covered by a later layer, "
                "or the same colour as what is behind it)", box=[box[0] / FW, box[1] / FH, box[2] / FW, box[3] / FH], text=text, ratio=round(r, 2))
            continue
        worst = min(seen_hits, key=lambda h: h[1][1])
        box, r, _ = worst[1]
        sev = "high" if r < 2.0 and kind == "type" else "medium" if r < 2.0 else "low"
        add("contrast", sev, ts[worst[0]], f"{what} \"{text}\" has contrast {r:.1f}:1 with what is behind it at {ts[worst[0]]:.1f}s "
            "(aim for >= 3:1; style: ink on a light ground or paper on a dark ground, never colour on the same colour)",
            box=[box[0] / FW, box[1] / FH, box[2] / FW, box[3] / FH], text=text, ratio=round(r, 2))
        continue
    # longest consecutive run of samples
    best, cur = [], []
    for j in idxs:
        cur = cur + [j] if cur and j - cur[-1] <= 2 else [j]
        if len(cur) > len(best):
            best = cur
    if (best[-1] - best[0] + 1) * step < need:
        continue
    box = dict(hits)[best[len(best) // 2]]
    fb = [box[0] / FW, box[1] / FH, box[2] / FW, box[3] / FH]
    span = f"{ts[best[0]]:.1f}-{ts[best[-1]]:.1f}s"
    if check == "clip":
        add("text-clipped", "high" if kind == "type" else "medium", ts[best[0]], f"{'impact text' if kind == 'type' else 'label'} \"{text}\" is cut off by the frame edge ({span}, {where(fb)}): "
            "frame the whole line while it is read", t1=ts[best[-1]], box=fb, text=text)
    elif check == "safe":
        add("title-safe", "low", ts[best[0]], f"{'impact text' if kind == 'type' else 'label'} \"{text}\" sits outside the title-safe area ({span}, {where(fb)}): keep text 5% in from the edges",
            t1=ts[best[-1]], box=fb, text=text)
    else:
        add("text-overlap", "medium", ts[best[0]], f"texts \"{text}\" overlap ({span}, {where(fb)}): separate them or let one leave first", t1=ts[best[-1]], box=fb, text=text)

# ---------- seams (from bun run seams) ----------
if a.seams and a.act and os.path.exists(a.seams):
    try:
        for s in json.load(open(a.seams)).get("seams", []):
            if a.act not in (s.get("a"), s.get("b")) or s.get("flag", "ok") == "ok":
                continue
            side = "end" if s.get("a") == a.act else "start"
            add("seam", "medium", a.dur - 0.5 if side == "end" else 0.0, f"the seam check flagged the cut {s['a']} -> {s['b']} ({s.get('flag')}: {s.get('note') or 'see review/seams'}) at this act's {side}")
    except Exception:
        pass

SEV = {"high": 0, "medium": 1, "low": 2}
findings.sort(key=lambda f: (f["t"], SEV[f["severity"]]))
for k, f in enumerate(findings, 1):
    f["id"] = k

# ---------- motion grids: 12 consecutive frames per image, the words spoken under each tile ----------
grids = []
if not a.no_grids:
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
        small_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial.ttf", 17)
        head_font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 24)
    except OSError:
        font = small_font = head_font = ImageFont.load_default()
    cols, rows = (6, 2) if a.vertical else (4, 3)
    tw = 270 if a.vertical else 480
    th = round(tw * FH / FW)
    cap = 50
    times = [round(x * a.grid_step, 2) for x in range(int(a.dur / a.grid_step) + 1) if x * a.grid_step < a.dur]
    per = cols * rows
    for g_i in range(0, len(times), per):
        chunk = times[g_i:g_i + per]
        sheet = Image.new("RGB", (cols * tw + (cols - 1) * 6, 40 + rows * (th + cap) + (rows - 1) * 6), (20, 20, 20))
        d = ImageDraw.Draw(sheet)
        d.text((8, 7), f"{a.act or ''}  {chunk[0]:g}-{chunk[-1]:g} s, one frame every {a.grid_step:g} s, left to right; words spoken around each frame below it (hit words in yellow)",
               fill=(235, 235, 235), font=head_font)
        for j, t in enumerate(chunk):
            i = int(np.argmin(np.abs(ts - t)))
            im = Image.open(os.path.join(a.dense, files[i])).convert("RGB").resize((tw, th), Image.BILINEAR)
            x, y = (j % cols) * (tw + 6), 40 + (j // cols) * (th + cap + 6)
            sheet.paste(im, (x, y))
            # the first tile at or after the finding (and every tile across its span) shows it
            hit = [f for f in findings if f["t"] - 0.05 <= t < f.get("t1", f["t"]) + a.grid_step - 0.05]
            for f in hit:
                if f.get("box"):
                    b = f["box"]
                    d.rectangle((x + b[0] * tw, y + b[1] * th, x + b[2] * tw, y + b[3] * th), outline=(255, 40, 40), width=3)
            if hit:
                d.rectangle((x, y, x + tw - 1, y + th - 1), outline=(255, 40, 40), width=4)
            lab = f"{t:g}s" + ("  " + " ".join(f"#{f['id']} {f['kind']}" for f in hit[:3]) if hit else "")
            bb = d.textbbox((x + 8, y + 6), lab, font=font)
            d.rectangle((bb[0] - 4, bb[1] - 3, bb[2] + 4, bb[3] + 3), fill=(190, 20, 20) if hit else (0, 0, 0))
            d.text((x + 8, y + 6), lab, fill=(255, 255, 255), font=font)
            # the words spoken in this tile's half step either side
            said = [w for w in words if t - a.grid_step / 2 <= w["t"] < t + a.grid_step / 2]
            cx = x + 6
            for w in said:
                txt = w["text"].strip() + " "
                wlen = d.textlength(txt, font=small_font)
                if cx + wlen > x + tw - 4:
                    break
                d.text((cx, y + th + 6), txt, fill=(255, 214, 0) if w.get("hit") else (220, 220, 220), font=small_font)
                cx += wlen
        out = os.path.join(a.out, f"grid_{len(grids) + 1:02d}.jpg")
        sheet.save(out, quality=82)
        grids.append({"file": os.path.basename(out), "from": chunk[0], "to": chunk[-1]})
    for f in os.listdir(a.out):
        if re.match(r"grid_\d+\.jpg$", f) and f not in {g["file"] for g in grids}:
            os.remove(os.path.join(a.out, f))

stats = {
    "frames": N, "step": round(step, 3),
    "medianCoverage": round(float(np.median(cover[inside])) if inside.any() else 0, 3),
    "stillShare": round(float(still_step.mean()), 2),
    "medianCameraSpeed": round(float(np.median(speed)), 4),
}
by_kind = {}
for f in findings:
    by_kind.setdefault(f["kind"], 0)
    by_kind[f["kind"]] += 1
json.dump({"act": a.act, "dur": a.dur, "stats": stats, "counts": by_kind, "findings": findings, "grids": grids},
          open(os.path.join(a.out, "checks.json"), "w"), indent=1)
hi = sum(f["severity"] == "high" for f in findings)
print(f"checks: {len(findings)} finding(s) ({hi} high) on {N} frames every {step:.2f}s" + (f"; {len(grids)} motion grids" if grids else ""))
for f in findings:
    if f["severity"] != "low":
        print(f"  #{f['id']} [{f['severity']}] {f['kind']}: {f['msg']}")
lows = [f for f in findings if f["severity"] == "low"]
if lows:
    print(f"  ... and {len(lows)} low: " + ", ".join(f"#{f['id']} {f['kind']} {f['t']:g}s" for f in lows[:12]) + (" ..." if len(lows) > 12 else ""))

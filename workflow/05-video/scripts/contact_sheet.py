#!/usr/bin/env python3
"""Tile review frames into one labelled contact sheet: contact_sheet.py out.jpg img... [--cols 4] [--w 480]
Each tile is labelled with the time encoded in its file name (t_012.40.jpg -> 12.4s).

--report layout.json [--dur S] also measures every frame (free, no model): near-empty frames,
content clipped at the top/left edge, content running into the caption slip, subjects too small.
Frames in the first/last second (desk transitions) are skipped."""
import argparse
import os
import re
from PIL import Image, ImageDraw, ImageFont

ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("imgs", nargs="+")
ap.add_argument("--cols", type=int, default=4)
ap.add_argument("--w", type=int, default=480)
ap.add_argument("--report")
ap.add_argument("--dur", type=float, default=0)
a = ap.parse_args()

PAPER = (244, 238, 226)


def layout_flags(path, t):
    """Measure one frame. Coordinates are fractions of the frame, so any render scale works."""
    import numpy as np
    im = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    h, w, _ = im.shape
    # pale ledger rules sit ~70 from the paper colour; real marks, cut-outs and type are well above 100
    ink = np.abs(im - np.array(PAPER)).sum(axis=2) > 100

    def drop_thin(mask_1d):
        """Indices of thin (<= 4 px) runs where a line spans the frame: rules, the margin line."""
        idx, run = [], []
        for i, v in enumerate(list(mask_1d) + [False]):
            if v:
                run.append(i)
            else:
                if 0 < len(run) <= 4:
                    idx += run
                run = []
        return idx

    ink[drop_thin(ink.mean(axis=1) > 0.6), :] = False
    ink[:, drop_thin(ink.mean(axis=0) > 0.6)] = False
    sx0, sx1, sy0, sy1 = int(w * 0.05), int(w * 0.95), int(h * 0.067), int(h * 0.824)
    safe = ink[sy0:sy1, sx0:sx1]
    flags = []
    cov = float(safe.mean())
    if cov < 0.03:
        flags.append(f"near-empty frame ({cov:.1%} of the safe area has content)")
    rows = np.nonzero(safe.mean(axis=1) > 0.01)[0]
    span = (rows[-1] - rows[0]) / safe.shape[0] if len(rows) else 0
    if cov >= 0.03 and span < 0.3:
        flags.append(f"subjects small: content spans {span:.0%} of the safe height (aim for >= 40%)")
    e = max(2, h // 135)
    if ink[:e, :].mean() > 0.06:
        flags.append("content clipped at the top edge")
    if ink[:, :e].mean() > 0.06:
        flags.append("content clipped at the left edge")
    if ink[:int(h * 0.8), w - e:].mean() > 0.10:
        flags.append("content clipped at the right edge (ignore if it is only the pencil)")
    band = ink[int(h * 0.815):int(h * 0.84), sx0:sx1]
    if band.mean() > 0.08:
        flags.append("content runs into the caption slip")
    return {"t": t, "coverage": round(cov, 4), "span": round(float(span), 3), "flags": flags}

tiles = []
for p in a.imgs:
    im = Image.open(p).convert("RGB")
    im = im.resize((a.w, round(im.height * a.w / im.width)))
    m = re.search(r"t_(\d+\.\d+)", os.path.basename(p))
    label = f"{float(m.group(1)):g}s" if m else os.path.basename(p)
    d = ImageDraw.Draw(im)
    try:
        font = ImageFont.truetype("/System/Library/Fonts/Supplemental/Arial Bold.ttf", 20)
    except OSError:
        font = ImageFont.load_default()
    box = d.textbbox((8, 6), label, font=font)
    d.rectangle((box[0] - 4, box[1] - 3, box[2] + 4, box[3] + 3), fill=(0, 0, 0))
    d.text((8, 6), label, fill=(255, 255, 255), font=font)
    tiles.append(im)

th = max(t.height for t in tiles)
rows = (len(tiles) + a.cols - 1) // a.cols
sheet = Image.new("RGB", (a.cols * a.w + (a.cols - 1) * 4, rows * th + (rows - 1) * 4), (20, 20, 20))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % a.cols) * (a.w + 4), (i // a.cols) * (th + 4)))
sheet.save(a.out, quality=85)

if a.report:
    import json
    out = []
    for p in a.imgs:
        m = re.search(r"t_(\d+\.\d+)", os.path.basename(p))
        t = float(m.group(1)) if m else 0.0
        if a.dur and (t < 1.0 or t > a.dur - 1.0):
            continue
        out.append(layout_flags(p, t))
    with open(a.report, "w") as f:
        json.dump(out, f, indent=1)
    bad = [r for r in out if r["flags"]]
    print(f"layout: {len(bad)}/{len(out)} frames flagged")
    for r in bad:
        print(f"  {r['t']:g}s: " + "; ".join(r["flags"]))

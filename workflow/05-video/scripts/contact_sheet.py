#!/usr/bin/env python3
"""Tile review frames into one labelled contact sheet: contact_sheet.py out.jpg img... [--cols 4] [--w 480]
Each tile is labelled with the time encoded in its file name (t_012.40.jpg -> 12.4s).

--report layout.json [--dur S] also measures every frame (free, no model): near-empty frames,
content clipped at the top/left edge, content running into the subtitle band, subjects too small.
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
ap.add_argument("--no-band", action="store_true", help="style has no subtitle band: check edges over the full height, skip the band check")
ap.add_argument("--vertical", action="store_true", help="9:16 short: Shorts safe area (YouTube overlays on the right and bottom)")
a = ap.parse_args()



def ground_colour(im):
    """The frame's dominant colour (the paper or the scene's ground): the mode of coarse-quantised pixels."""
    import numpy as np
    sub = im[::6, ::6].reshape(-1, 3) // 12
    keys, counts = np.unique(sub[:, 0] * 10000 + sub[:, 1] * 100 + sub[:, 2], return_counts=True)
    k = keys[counts.argmax()]
    return im[::6, ::6].reshape(-1, 3)[(sub[:, 0] * 10000 + sub[:, 1] * 100 + sub[:, 2]) == k].mean(axis=0)


def layout_flags(path, t):
    """Measure one frame. Coordinates are fractions of the frame, so any render scale works."""
    import numpy as np
    im = np.asarray(Image.open(path).convert("RGB")).astype(np.int16)
    h, w, _ = im.shape
    # content = far from the ground colour (paper, or a scene's flat ground); pale rules and paper
    # texture sit well under 100, real marks, cut-outs and type well above
    ink = np.abs(im - ground_colour(im)).sum(axis=2) > 100

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
    if a.vertical:   # SAFE in packages/kit/src/paper/transitions.ts: x 64..930, y 220..1440 of 1080x1920
        sx0, sx1, sy0, sy1 = int(w * 0.06), int(w * 0.86), int(h * 0.115), int(h * 0.75)
    else:
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
    # the subtitle band (bottom ~18%) is the subtitle's own territory: a strip may bleed off the left edge there
    body = h if a.no_band else int(h * 0.8)
    if ink[:body, :e].mean() > 0.06:
        flags.append("content clipped at the left edge")
    if ink[:body, w - e:].mean() > 0.10:
        flags.append("content clipped at the right edge (ignore if it is only the pencil)")
    if a.vertical:
        if ink[sy0:sy1, int(w * 0.88):].mean() > 0.10:
            flags.append("content under the Shorts action buttons (right 12%): keep key content left of x 930")
        if ink[int(h * 0.79):int(h * 0.95), sx0:sx1].mean() > 0.25:
            flags.append("content under the Shorts title overlay (bottom 22%); fine if it is only the floor/ground")
    band = ink[int(h * 0.815):int(h * 0.828), sx0:sx1]   # just under the safe area, above any subtitle strip
    if not a.no_band and band.mean() > 0.08:
        flags.append("content runs into the subtitle band")
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

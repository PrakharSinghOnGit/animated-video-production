#!/usr/bin/env python3
"""Tile review frames into one labelled contact sheet: contact_sheet.py out.jpg img... [--cols 4] [--w 480]
Each tile is labelled with the time encoded in its file name (t_012.40.jpg -> 12.4s).

--report layout.json [--dur S] also measures every frame (free, no model): near-empty frames,
content clipped at the top/left edge, content running into the subtitle band, subjects too small.
Frames in the first/last second (desk transitions) are skipped.

It also prints an act summary (written next to the report as layout_summary.json): how full the frames are
(median content, share of sparse frames), the longest stretch where
the picture barely changes, and whether the act is settled on a picture 1 s after it opens and 1 s before it ends.
--measure measure.json (from frames.ts: on-screen sizes reported by the kit) adds text, figures and logos that
are too small on screen to read."""
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
ap.add_argument("--measure", help="measure.json written by frames.ts: [{t, items: [{kind, text, px, x, y}]}]")
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


SPARSE = 0.08        # under 8 % of the safe area has content: a small subject on an empty ground
STALE_DIFF = 2.0     # mean grey difference (0-255, 96x54 thumbnails) under which two frames count as "the same picture"
MIN_PX = {"label": 26, "type": 40, "figure": 150, "logo": 90}   # on-screen px at 1920x1080 below which a thing is too small
WHAT = {"label": "label", "type": "cut type", "figure": "figure", "logo": "logo/icon"}


def thumb(path):
    import numpy as np
    return np.asarray(Image.open(path).convert("L").resize((96, 54), Image.BILINEAR)).astype(np.float32)


def act_summary(rows, frames, dur):
    """Act-level numbers from the per-frame rows (first/last second already left out) and all frames [(t, path)]."""
    import numpy as np
    out = {"frames": len(rows), "notes": []}
    if not rows:
        return out
    cov = sorted(r["coverage"] for r in rows)
    out["medianCoverage"] = round(cov[len(cov) // 2], 3)
    out["sparseShare"] = round(sum(c < SPARSE for c in cov) / len(cov), 2)
    # longest stretch where consecutive frames are nearly identical
    inner = [(t, p) for t, p in frames if not dur or 1.0 <= t <= dur - 1.0]
    th = [thumb(p) for _, p in inner]
    best, start = (0.0, 0.0, 0.0), None
    for i in range(1, len(inner)):
        if float(np.abs(th[i] - th[i - 1]).mean()) < STALE_DIFF:
            start = inner[i - 1][0] if start is None else start
            if inner[i][0] - start > best[0]:
                best = (inner[i][0] - start, start, inner[i][0])
        else:
            start = None
    out["longestStill"] = {"s": round(best[0], 1), "from": best[1], "to": best[2]}
    if out["sparseShare"] >= 0.35:
        out["notes"].append(f"{out['sparseShare']:.0%} of the frames are sparse (under {SPARSE:.0%} content): the subjects are small on an empty ground. "
                            "Frame tighter (focus rects from the drawn objects, `widest`), build a set behind the action, or scale the subject up. "
                            "A deliberate held icon on a flat ground is fine; this many frames is not.")
    if best[0] >= 6:
        out["notes"].append(f"the picture barely changes from {best[1]:g}s to {best[2]:g}s ({best[0]:.0f} s): add an action, a secondary motion or a camera move there")
    if dur:
        for name, lo, hi in (("opens", 1.0, 2.0), ("ends", dur - 2.0, dur - 1.0)):
            near = [r for r in rows if lo <= r["t"] <= hi]
            if near and all(r["coverage"] < 0.03 for r in near):
                out["notes"].append(f"the act {name} on an empty frame ({near[0]['t']:g}s has {near[0]['coverage']:.1%} content): "
                                    + ("something should already be on screen when the whip-in lands" if name == "opens" else "hold the finished picture until the whip-out"))
    return out


def small_things(path, dur):
    """Text, figures and logos the kit measured as too small on screen: [(what, text, min px, [times])], worst first."""
    import json
    seen = {}
    for fr in json.load(open(path)):
        t = fr["t"]
        if dur and (t < 1.0 or t > dur - 1.0):
            continue
        for it in fr["items"]:
            lim = MIN_PX.get(it["kind"])
            # only things actually inside the frame (1920x1080 or 1080x1920)
            if lim is None or it["px"] >= lim or not (0 <= it["x"] <= fr.get("w", 1920) and 0 <= it["y"] <= fr.get("h", 1080)):
                continue
            # words set one letter at a time (a vertical word, a letter that moves on its own) count as one finding
            single = it["kind"] == "type" and len(it["text"].strip()) == 1
            k = (it["kind"], "(single letters)" if single else it["text"])
            e = seen.setdefault(k, {"px": it["px"], "ts": [], "chars": []})
            e["px"] = min(e["px"], it["px"])
            if t not in e["ts"]:
                e["ts"].append(t)
            if single and it["text"] not in e["chars"]:
                e["chars"].append(it["text"])
    # a thing seen small in one frame only is usually mid-move (popping in, a camera move passing by)
    out = [(k[0], "letters " + " ".join(e["chars"][:12]) if e["chars"] else k[1], e["px"], e["ts"]) for k, e in seen.items() if len(e["ts"]) >= 2]
    return sorted(out, key=lambda x: x[2] / MIN_PX[x[0]])

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
    frames = []
    for p in a.imgs:
        m = re.search(r"t_(\d+\.\d+)", os.path.basename(p))
        if m:
            frames.append((float(m.group(1)), p))
    summary = act_summary(out, frames, a.dur)
    if a.measure and os.path.exists(a.measure):
        small = small_things(a.measure, a.dur)
        summary["small"] = [{"kind": k, "text": s, "px": px, "times": ts} for k, s, px, ts in small]
    with open(os.path.join(os.path.dirname(a.report), "layout_summary.json"), "w") as f:
        json.dump(summary, f, indent=1)
    if summary.get("frames"):
        st = summary["longestStill"]
        print(f"summary: content median {summary['medianCoverage']:.1%} of the safe area, {summary['sparseShare']:.0%} of frames sparse, "
              f"longest still stretch {st['s']:g} s")
        for n in summary["notes"]:
            print(f"  note: {n}")
        for s_ in summary.get("small", [])[:14]:
            ts = ", ".join(f"{t:g}s" for t in s_["times"][:4]) + (" ..." if len(s_["times"]) > 4 else "")
            print(f"  small: {WHAT[s_['kind']]} \"{s_['text']}\" is {s_['px']:g} px on screen at {ts} (readable from {MIN_PX[s_['kind']]} px)")
        if len(summary.get("small", [])) > 14:
            print(f"  small: ... and {len(summary['small']) - 14} more (layout_summary.json)")

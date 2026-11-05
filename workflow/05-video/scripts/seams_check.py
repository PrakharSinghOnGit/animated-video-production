#!/usr/bin/env python
"""Score the frames around each act cut and tile them into a strip.

  seams_check.py JOBS.json OUT_DIR  -> JSON {seam: {d: [before, cut, after], back, flag, note}} on stdout
     JOBS: [{"seam": "A03-A04", "cut": frame, "files": [cut-2, cut-1, cut, cut+1]}]

d = mean absolute RGB change (0-255) between consecutive frames at 96x54; "cut" is frame cut-1 -> cut.
  flicker : the picture jumps at the cut and jumps back on the next frame (cut-1 and cut+1 look alike, cut doesn't)
  empty   : cut-1 or cut shows almost nothing (< 1% of the frame): an act left before the next arrived
  jump    : the change at the cut is far bigger than the frames around it (something vanishes or a colour snaps)
Whips and wipes change a lot every frame, so they don't trip "jump"; a straight cut does, and is reported as planned.
"""
import json, sys
import numpy as np
from PIL import Image, ImageDraw

jobs, out_dir = json.load(open(sys.argv[1])), sys.argv[2]


def small(p):
    return np.asarray(Image.open(p).convert("RGB").resize((96, 54), Image.BILINEAR), dtype=np.float32)


res = {}
for j in jobs:
    fr = [small(p) for p in j["files"]]
    d = [float(np.abs(fr[i + 1] - fr[i]).mean()) for i in range(3)]
    back = float(np.abs(fr[3] - fr[1]).mean())
    before, cut, after = d
    flag, note = "ok", ""
    # empty: under 1% of the frame differs clearly from its median colour (the top band, where the chapter tag sits, is ignored)
    empty = [float((np.abs(f[8:] - np.median(f[8:].reshape(-1, 3), axis=0)).max(axis=2) > 30).mean()) < 0.01 for f in fr[1:3]]
    if any(empty):
        flag, note = "empty", "the screen is an empty colour at the cut: an act left (or starts) with nothing on screen"
    elif cut > 20 and after > 20 and back < 0.5 * min(cut, after):
        flag, note = "flicker", "the frame jumps at the cut and back right after (both acts transitioning?)"
    elif cut > 25 and cut > 3 * max(before, after, 4):
        flag, note = "jump", "the picture changes all at once at the cut"
    res[j["seam"]] = dict(d=[round(x, 1) for x in d], back=round(back, 1), flag=flag, note=note)
    # strip: the four frames side by side, labelled, the cut marked
    ims = [Image.open(p).convert("RGB") for p in j["files"]]
    w, h = ims[0].size
    strip = Image.new("RGB", (w * 4 + 6 * 3, h + 22), (24, 24, 24))
    dr = ImageDraw.Draw(strip)
    for i, im in enumerate(ims):
        x = i * (w + 6)
        strip.paste(im, (x, 22))
        dr.text((x + 4, 5), ["cut-2", "cut-1", "cut", "cut+1"][i], fill=(230, 230, 230))
    dr.rectangle([2 * (w + 6) - 5, 0, 2 * (w + 6) - 2, h + 22], fill=(230, 80, 60))
    strip.save(f"{out_dir}/{j['seam']}.jpg", quality=85)
print(json.dumps(res))

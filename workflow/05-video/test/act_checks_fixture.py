#!/usr/bin/env python3
"""A synthetic act with known faults for act_checks.py (test/act_checks.test.ts). Writes dense frames d_<frame>.jpg
(every 3rd frame at 30 fps, 960x540 like a 0.5x render), measure.json and words.json into the given directory.

Timeline (24 s): a textured ground the camera pans across the whole time, except a held stretch with no motion at all;
  6.0 s  a box pops in (one step, no animation) while the camera pans          -> pop (appears)
  8.0 s  a box slides in over 0.8 s                                           -> nothing
  10.0 s a ball drops in from above the frame in two steps                     -> fast-entry (low), not a pop
  11.0-12.0 s nothing drawn but the plain ground                               -> blank
  13.0-18.5 s the camera stops and nothing moves                               -> frozen
  14.0 s the 6.0 s box vanishes in one step (camera still)                     -> pop (vanishes)
  19.0 s on: "CLIPPED" type hangs off the right edge                           -> text-clipped
  19.0 s on: "FAINT" type in a colour close to the ground                      -> contrast
  hit word "box" at 8.8 s (the slide is done by then)                          -> no late-hit"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw

out = sys.argv[1]
os.makedirs(out, exist_ok=True)
W, H, FPS, NTH, DUR = 960, 540, 30, 3, 24.0
rng = np.random.default_rng(7)
# a wide textured world (grid lines + blobs) so the camera's pan is measurable
world = Image.new("RGB", (W * 3, H), (38, 120, 118))
d = ImageDraw.Draw(world)
for x in range(0, W * 3, 60):
    d.line((x, 0, x, H), fill=(30, 100, 98), width=2)
for y in range(0, H, 60):
    d.line((0, y, W * 3, y), fill=(30, 100, 98), width=2)
for _ in range(120):
    x, y, r = int(rng.integers(0, W * 3)), int(rng.integers(0, H)), int(rng.integers(6, 22))
    d.ellipse((x - r, y - r, x + r, y + r), fill=(22, 70, 70))
d.rectangle((0, H - 70, W * 3, H), fill=(236, 226, 205))
GROUND = (38, 120, 118)


def cam_x(t):
    if 13.0 <= t < 18.5:
        return cam_x(12.99)
    tt = t if t < 13 else t - 5.5
    return 20 * tt   # px per second across the world


measure = []
words = [{"t": 8.8, "text": "box", "hit": True}, {"t": 9.1, "text": "slides", "hit": False}]
for k in range(int(DUR * FPS / NTH)):
    frame = k * NTH
    t = frame / FPS
    blank = 11.0 <= t < 12.0
    if blank:
        im = Image.new("RGB", (W, H), GROUND)
    else:
        x0 = int(cam_x(t))
        im = world.crop((x0, 0, x0 + W, H))
    sx = int(cam_x(t))   # objects live in the world: screen x = world x - camera
    g = ImageDraw.Draw(im)
    items = []
    if not blank:
        if 6.0 <= t < 14.0:
            g.rectangle((500 - sx, 160, 640 - sx, 300), fill=(232, 120, 40), outline=(10, 10, 10), width=4)
        if t >= 8.0:
            u = min(1.0, (t - 8.0) / 0.8)
            u = 1 - (1 - u) ** 3
            x = int(-200 + u * (320 + 200)) - sx + 160
            g.rectangle((x, 330, x + 120, 420), fill=(240, 220, 120), outline=(10, 10, 10), width=4)
        if t >= 9.9:
            y = -90 if t < 10.0 else (60 if t < 10.1 else 200)   # its bottom shows at the top edge first
            g.ellipse((900 - sx, y, 1020 - sx, y + 120), fill=(220, 60, 40))
        if t >= 19.0:   # (stays to the end: the act's last second is not judged)
            g.rectangle((800, 60, 1040, 140), fill=(15, 15, 15))
            items.append({"kind": "type", "text": "CLIPPED", "px": 120, "x": 1840, "y": 200, "box": [1600, 120, 2080, 280], "col": "#0f0f0f"})
            for x in range(205, 420, 30):   # letter-like strokes, visible but barely: colour on the same colour
                g.rectangle((x, 64, x + 14, 136), fill=(64, 146, 144))
            items.append({"kind": "type", "text": "FAINT", "px": 120, "x": 620, "y": 200, "box": [400, 120, 840, 280], "col": "#409290"})
    im.save(os.path.join(out, f"d_{frame:06d}.jpg"), quality=90)
    measure.append({"frame": frame, "items": items})
json.dump(measure, open(os.path.join(out, "measure.json"), "w"))
json.dump(words, open(os.path.join(out, "words.json"), "w"))
print(DUR)

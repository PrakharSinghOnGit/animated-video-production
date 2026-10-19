#!/usr/bin/env python3
"""Shadow Market: code-rendered motion graphic synced to the voiceover word timings.
Usage:  python3 shadow_market.py stills 0 1.2 3.5 ...      -> PNGs in ./stills
        python3 shadow_market.py render out.mp4            -> full render + audio mux
"""
import math, sys, os, subprocess
import numpy as np
import skia

W, H, FPS = 1920, 1080, 60
_audio_candidates = [
    os.path.join(os.path.dirname(__file__), "../../../_migration/01_part1_01_beat.wav"),
    os.path.join(os.path.dirname(__file__), "../../../workspace/VID01_Currency_Market/03-voiceover/audio/part-1/01_part1_01_shadow_market.wav"),
    "/mnt/user-data/uploads/01_part1_01_shadow_market.wav"
]
AUDIO = next((p for p in _audio_candidates if os.path.exists(p)), _audio_candidates[0])
DUR = 11.590875
FONT_B = "/usr/share/fonts/truetype/google-fonts/Poppins-Bold.ttf"
FONT_M = "/usr/share/fonts/truetype/google-fonts/Poppins-Medium.ttf"

BG = (16, 16, 16)  # #101010
PAL = dict(lav=(199, 184, 255), mint=(168, 230, 207), peach=(255, 201, 168),
           sky=(168, 216, 255), butter=(255, 232, 163), rose=(255, 179, 199))
RIM = [PAL[k] for k in ("lav", "rose", "peach", "butter", "mint", "sky", "lav")]
WHITE = (244, 244, 248)

# ---- word anchors taken from the supplied transcript (seconds) ------------------
T_SHADOW = 0.50            # "shadow market"
T_BIGGER1, T_BIGGER2 = 2.34, 3.64
T_STOCK = 3.02             # "stock market"
T_BOND = 4.74              # "bond market"
T_AND = 5.72
T_ENTIRE = 7.06
T_CRYPTO = 7.72            # "crypto market"
T_LOOK = 8.58
T_LOOSE = 9.40             # "loose change"
T_CUSHION = 11.14          # "couch cushion"

# ------------------------------------------------------------------ helpers ----
def clamp(x, a=0.0, b=1.0): return max(a, min(b, x))
def prog(t, a, b): return clamp((t - a) / (b - a))
def e_out_expo(x): return 1.0 if x >= 1 else 1 - 2 ** (-10 * x)
def e_out_cubic(x): return 1 - (1 - x) ** 3
def e_in_cubic(x): return x ** 3
def e_io(x): return 4 * x ** 3 if x < .5 else 1 - (-2 * x + 2) ** 3 / 2
def e_out4(x): return 1 - (1 - x) ** 4
def e_out_back(x, s=1.4):
    x -= 1
    return 1 + (s + 1) * x ** 3 + s * x ** 2
def smooth(x): return x * x * (3 - 2 * x)
def spring(x):
    if x <= 0: return 0.0
    return 1 - math.exp(-6.5 * x) * math.cos(11 * x)
EASE = dict(lin=lambda x: x, io=e_io, out4=e_out4, smooth=smooth)

def C(rgb, a=1.0): return skia.Color(int(rgb[0]), int(rgb[1]), int(rgb[2]), int(255 * clamp(a)))
def mix(a, b, t): return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))
def lighten(c, t): return mix(c, (255, 255, 255), t)
def darken(c, t): return mix(c, (0, 0, 0), t)

def seg(t, keys):
    if t <= keys[0][0]: return np.asarray(keys[0][1], dtype=float)
    for i in range(1, len(keys)):
        t0, v0, _ = keys[i - 1]; t1, v1, e = keys[i]
        if t <= t1:
            u = EASE[e]((t - t0) / (t1 - t0))
            return np.asarray(v0, float) + (np.asarray(v1, float) - np.asarray(v0, float)) * u
    return np.asarray(keys[-1][1], dtype=float)

def paint(color=None, shader=None, stroke=0.0, blur=0.0, alpha=None, blend=None):
    p = skia.Paint(AntiAlias=True)
    if color is not None: p.setColor(color)
    if shader is not None: p.setShader(shader)
    if stroke:
        p.setStyle(skia.Paint.kStroke_Style); p.setStrokeWidth(stroke)
        p.setStrokeCap(skia.Paint.kRound_Cap); p.setStrokeJoin(skia.Paint.kRound_Join)
    if blur: p.setMaskFilter(skia.MaskFilter.MakeBlur(skia.kNormal_BlurStyle, blur))
    if alpha is not None: p.setAlphaf(alpha)
    if blend is not None: p.setBlendMode(blend)
    return p

def radial(cx, cy, r, stops):
    return skia.GradientShader.MakeRadial((cx, cy), r, [s[1] for s in stops], [s[0] for s in stops])

def sweep(cx, cy, ang, alpha=1.0, cols=RIM):
    colors = [C(c, alpha) for c in cols]
    pos = np.linspace(0, 1, len(cols)).tolist()
    m = skia.Matrix.RotateDeg(ang, skia.Point(cx, cy))
    return skia.GradientShader.MakeSweep(cx, cy, colors, pos, skia.TileMode.kClamp, 0, 360, 0, m)

# ------------------------------------------------------- polar shape library ----
NPT = 540
TH = np.linspace(0, 2 * np.pi, NPT, endpoint=False)
COS, SIN = np.cos(TH), np.sin(TH)

def csmooth(r, k=9):
    ker = np.hanning(2 * k + 3)[1:-1]; ker /= ker.sum()
    return np.convolve(np.r_[r[-k:], r, r[:k]], ker, "valid")

R_CIRCLE = np.ones(NPT)
R_SQUIRCLE = (1 / (np.abs(COS) ** 4 + np.abs(SIN) ** 4) ** 0.25) / 1.07
_ang = (TH - np.pi / 6) % (np.pi / 3) - np.pi / 6
R_HEX = csmooth(np.cos(np.pi / 6) / np.cos(_ang) / 0.93, 10)

def r_blob(t, phase=0.0, amp=1.0):
    tt = t + phase
    return 1 + amp * (0.060 * np.sin(2 * TH + 0.9 * tt + 0.3) + 0.045 * np.sin(3 * TH - 1.3 * tt + 1.7)
                      + 0.030 * np.sin(5 * TH + 1.9 * tt + 4.1) + 0.016 * np.sin(7 * TH - 2.3 * tt + 2.2))

def path_r(cx, cy, R, r, rot=0.0):
    a = TH + rot
    xs = cx + R * r * np.cos(a); ys = cy + R * r * np.sin(a)
    return skia.Path.Polygon(list(zip(xs.tolist(), ys.tolist())), True)

# ----------------------------------------------------------------- text --------
_fonts = {}
def get_font(path, size):
    k = (path, int(size))
    if k not in _fonts:
        tf = None
        if os.path.exists(path):
            try:
                tf = skia.Typeface.MakeFromFile(path)
            except Exception:
                tf = None
        if tf is None:
            weight = skia.FontStyle.Bold() if "Bold" in path else skia.FontStyle.Normal()
            tf = skia.Typeface.MakeFromName("Helvetica", weight) or skia.Typeface.MakeDefault()
        f = skia.Font(tf, size); f.setSubpixel(True); _fonts[k] = f
    return _fonts[k]

def draw_label(c, text, cx, cy, size, t, tin, tout, accent, track=0.075, stag=0.038, din=0.5, dout=0.26, stag_out=0.02):
    if t < tin - 1e-3: return
    if tout is not None and t > tout + len(text) * stag_out + dout + 0.05: return
    font = get_font(FONT_B, size)
    advs = [font.measureText(ch) for ch in text]
    tr = track * size
    total = sum(advs) + tr * (len(text) - 1)
    x0 = cx - total / 2; base = cy + size * 0.35
    c.save()
    c.clipRect(skia.Rect.MakeLTRB(x0 - 30, base - size * 0.90, x0 + total + 30, base + size * 0.30), doAntiAlias=True)
    x = x0
    for i, ch in enumerate(text):
        u_in = prog(t, tin + i * stag, tin + i * stag + din)
        u_out = prog(t, tout + i * stag_out, tout + i * stag_out + dout) if tout is not None else 0.0
        dy = (1 - e_out_back(u_in, 1.15)) * size * 1.2 - e_in_cubic(u_out) * size * 1.2
        if ch != " ":
            c.drawString(ch, x, base + dy, font, paint(C(WHITE)))
        x += advs[i] + tr
    c.restore()
    ul_in = e_out_expo(prog(t, tin + 0.06, tin + 0.62))
    ul_out = e_in_cubic(prog(t, tout, tout + 0.38)) if tout is not None else 0.0
    xa, xb = x0 + total * ul_out, x0 + total * ul_in
    if xb - xa > 1:
        yy = base + size * 0.24
        c.drawLine(xa, yy, xb, yy, paint(C(accent), stroke=max(3.0, size * 0.05)))

# --------------------------------------------------------- global timeline -----
GEM = np.array([40.0, 330.0])
def sat_pos(deg, R):
    a = math.radians(deg); d = R * 1.12 + 175
    return np.array([math.cos(a) * d, math.sin(a) * d])

def camera(t):
    S = float(seg(t, [(0, 2.3, "lin"), (3.2, 1.0, "out4"), (5.4, 0.95, "io"), (8.5, 0.85, "io"),
                      (9.5, 3.0, "io"), (DUR + 1, 3.1, "lin")]))
    F = seg(t, [(0, (0, 0), "lin"), (8.5, (0, 0), "lin"), (9.5, GEM, "io"), (DUR + 1, GEM + (14, 8), "lin")])
    F = F + np.array([12 * math.sin(t * 0.7), 9 * math.cos(t * 0.9)]) / S
    return S, F

def growth(t):
    return float(seg(t, [(0, 1.0, "lin"), (2.2, 1.0, "smooth"), (3.3, 1.12, "smooth"), (4.4, 1.16, "smooth"),
                         (5.5, 1.36, "smooth"), (6.8, 1.44, "smooth"), (7.9, 1.75, "smooth"), (DUR + 1, 1.75, "smooth")]))

def pulse(t):
    return sum(0.05 * math.exp(-(((t - tp - 0.12) / 0.15) ** 2)) for tp in (T_BIGGER1, T_BIGGER2, T_AND, T_ENTIRE))

# ----------------------------------------------------------------- layers ------
_rng = np.random.default_rng(11)
PN = 110
PX, PY = _rng.random(PN) * W, _rng.random(PN) * H
PZ = 0.25 + _rng.random(PN) * 0.75
PS = 1.0 + _rng.random(PN) * 2.4
PC = _rng.integers(0, 6, PN); PPH = _rng.random(PN) * 6.28
PKEYS = list(PAL.values())
_noise = (_rng.random((256, 256)) * 255).astype(np.uint8)
GRAIN = skia.Image.fromarray(np.dstack([_noise, _noise, _noise, np.full_like(_noise, 255)]),
                             colorType=skia.kRGBA_8888_ColorType)

def draw_bg(c, t, S, F):
    c.clear(C(BG))
    par = F * S * 0.08
    for (px, py, rad, col, a) in [(520 + 90 * math.sin(t * .31), 320 + 55 * math.cos(t * .27), 760, PAL["lav"], .08),
                                  (1440 + 80 * math.cos(t * .23), 790 + 60 * math.sin(t * .3), 820, PAL["mint"], .05),
                                  (980 + 120 * math.sin(t * .2), 120, 700, PAL["rose"], .035)]:
        c.drawRect(skia.Rect.MakeWH(W, H), paint(shader=radial(px - par[0], py - par[1], rad, [(0, C(col, a)), (1, C(col, 0))])))
    sp = 84.0
    ox = (-F[0] * S * 0.22 + t * 7) % sp; oy = (-F[1] * S * 0.22 + t * 4) % sp
    pts = [(ox + i * sp, oy + j * sp) for i in range(-1, int(W / sp) + 2) for j in range(-1, int(H / sp) + 2)]
    c.drawPoints(skia.Canvas.kPoints_PointMode, pts, paint(C(WHITE, 0.075), stroke=3.2))
    for i in range(PN):
        x = (PX[i] - F[0] * S * 0.3 * PZ[i] + t * 5 * PZ[i]) % W
        y = (PY[i] - F[1] * S * 0.3 * PZ[i] - t * 9 * PZ[i]) % H
        tw = 0.5 + 0.5 * math.sin(t * 1.6 + PPH[i])
        col = PKEYS[PC[i]]
        c.drawCircle(x, y, PS[i] * (0.7 + 0.5 * PZ[i]), paint(C(col, (0.18 + 0.5 * PZ[i]) * (0.4 + 0.6 * tw))))

def ring(c, t, t0, x, y, maxR, col, width=4.0, dur=0.95):
    u = prog(t, t0, t0 + dur)
    if u <= 0 or u >= 1: return
    c.drawCircle(x, y, e_out_expo(u) * maxR, paint(C(col, (1 - u) ** 1.4 * 0.85), stroke=width * (1 - u) + 0.6))

def draw_blob(c, t, R):
    r0 = r_blob(t)
    ang = t * 26
    c.drawPath(path_r(0, 0, R, r0), paint(shader=sweep(0, 0, ang, 0.55), stroke=34, blur=44))
    fill = radial(-0.22 * R, -0.28 * R, 1.25 * R, [(0, C((38, 32, 62))), (0.55, C((17, 15, 26))), (1, C((8, 8, 11)))])
    c.drawPath(path_r(0, 0, R, r0), paint(shader=fill))
    for k in range(1, 11):
        rk = r_blob(t, -0.115 * k) * (1 - 0.074 * k)
        c.drawPath(path_r(0, 0, R, rk), paint(shader=sweep(0, 0, ang - k * 9, 0.40 * (1 - k / 11.5)), stroke=2.2))
    c.drawPath(path_r(0, 0, R, r0), paint(shader=sweep(0, 0, ang, 1.0), stroke=8))
    c.drawPath(path_r(0, 0, R * 0.992, r0), paint(C(WHITE, 0.55), stroke=1.8))

def draw_sphere(c, x, y, R, r, col, t, spin=0.0):
    c.drawPath(path_r(x, y, R * 1.12, r), paint(C(col, 0.55), blur=R * 0.45))
    fill = radial(x - 0.35 * R, y - 0.40 * R, 1.55 * R,
                  [(0, C(lighten(col, 0.65))), (0.5, C(col)), (1, C(darken(col, 0.42)))])
    c.drawPath(path_r(x, y, R, r), paint(shader=fill))
    c.drawOval(skia.Rect.MakeXYWH(x - 0.52 * R, y - 0.62 * R, 0.56 * R, 0.30 * R), paint(C(WHITE, 0.50), blur=R * 0.10))
    c.save(); c.translate(x, y); c.rotate(math.degrees(spin))
    c.drawOval(skia.Rect.MakeXYWH(-1.62 * R, -0.52 * R, 3.24 * R, 1.04 * R), paint(C(col, 0.30), stroke=2.0))
    c.drawCircle(1.62 * R, 0, R * 0.075, paint(C(lighten(col, 0.5), 0.9)))
    c.restore()

def draw_gem(c, x, y, R, rot, col):
    c.save(); c.translate(x, y); c.rotate(rot)
    c.drawPath(path_r(0, 0, R * 1.15, R_HEX, math.pi / 6 * 0), paint(C(col, 0.6), blur=R * 0.55))
    vs = [(R * math.cos(math.radians(30 + 60 * k)), R * math.sin(math.radians(30 + 60 * k))) for k in range(6)]
    for k in range(6):
        tri = skia.Path(); tri.moveTo(0, 0); tri.lineTo(*vs[k]); tri.lineTo(*vs[(k + 1) % 6]); tri.close()
        shade = [0.45, 0.10, -0.25, -0.05, 0.30, 0.60][k]
        cc = lighten(col, shade) if shade > 0 else darken(col, -shade)
        c.drawPath(tri, paint(C(cc)))
    c.drawPath(skia.Path.Polygon(vs, True), paint(C(lighten(col, 0.8), 0.9), stroke=max(1.5, R * 0.06)))
    c.restore()

COIN_E = [(-118, -34), (-52, 44), (6, -58), (66, 26), (118, -22), (-8, 12), (160, 82)]
COIN_R = [24, 22, 25, 23, 22, 26, 24]
COIN_C = [PAL["butter"], PAL["peach"], PAL["butter"], PAL["sky"], PAL["butter"], PAL["peach"], PAL["butter"]]

def sparkle(c, x, y, s, col):
    if s <= 0.01: return
    for ang in (0, 90):
        c.save(); c.translate(x, y); c.rotate(ang)
        p = skia.Path(); p.moveTo(-s, 0); p.lineTo(0, -s * 0.13); p.lineTo(s, 0); p.lineTo(0, s * 0.13); p.close()
        c.drawPath(p, paint(C(col, 0.95))); c.restore()
    c.drawCircle(x, y, s * 0.22, paint(C(WHITE, 0.8), blur=s * 0.2))

def draw_coins(c, t):
    states = []
    for i, (e, r, col) in enumerate(zip(COIN_E, COIN_R, COIN_C)):
        tl = 8.92 + i * 0.035
        if t < tl: continue
        u = prog(t, tl, tl + 0.62)
        gx = GEM[0] + e[0] * e_out_cubic(u); gy = GEM[1] + e[1] * e_out_cubic(u)
        h = 100 * 4 * u * (1 - u)
        u2 = prog(t, tl + 0.62, tl + 0.97)
        h += 22 * math.sin(math.pi * u2) * (1 - u2)
        ang = (1 - u) * (2 * math.pi * 3 + i)
        s = min(1.0, u * 5)
        states.append((i, gx, gy, h, ang, s, r, col))
    for (i, gx, gy, h, ang, s, r, col) in states:   # ground shadows first
        k = 1 - 0.35 * clamp(h / 100)
        c.drawOval(skia.Rect.MakeXYWH(gx - r * k * s, gy + 4 - r * 0.45 * k * s, 2 * r * k * s, r * 0.9 * k * s),
                   paint(C((0, 0, 0), 0.55 - 0.25 * clamp(h / 100)), blur=7))
    for (i, gx, gy, h, ang, s, r, col) in states:
        cx_, cy_ = gx, gy - h
        rx = max(abs(math.cos(ang)), 0.08) * r * s; ry = r * s
        c.drawOval(skia.Rect.MakeXYWH(cx_ - rx * 1.5, cy_ - ry * 1.5, rx * 3, ry * 3), paint(C(col, 0.30), blur=r * 0.6))
        fill = radial(cx_ - 0.3 * rx, cy_ - 0.35 * ry, 1.5 * max(rx, ry),
                      [(0, C(lighten(col, 0.6))), (0.55, C(col)), (1, C(darken(col, 0.38)))])
        c.drawOval(skia.Rect.MakeXYWH(cx_ - rx, cy_ - ry, 2 * rx, 2 * ry), paint(shader=fill))
        c.drawOval(skia.Rect.MakeXYWH(cx_ - rx * 0.62, cy_ - ry * 0.62, rx * 1.24, ry * 1.24), paint(C(darken(col, 0.3), 0.55), stroke=2.2))
        ts = T_LOOSE + 0.12 + i * 0.085
        u3 = prog(t, ts, ts + 0.55)
        sparkle(c, cx_ + 0.38 * rx, cy_ - 0.40 * ry, r * 1.5 * math.sin(math.pi * u3), (255, 255, 255))

def draw_cushion(c, t):
    t0 = 10.62
    if t < t0: return
    u = prog(t, t0, T_CUSHION)
    yoff = -330 * (1 - u ** 2.0)
    s = max(0.0, t - T_CUSHION)
    d = math.exp(-9 * s) * math.cos(22 * s)
    sy = (1.07 if s == 0 and u < 1 else 1.0) - (0.17 * d if s > 0 else -0.0)
    sx = 1.0 + (0.10 * d if s > 0 else 0.0)
    rot = -7 * (1 - e_out_cubic(u)) + 1.6 * d * (1 if s > 0 else 0)
    w, h, rad = 360.0, 214.0, 84.0
    cx, cy = GEM[0] + 8, GEM[1] + 6
    shadow_a = clamp(u * 0.62)
    c.drawOval(skia.Rect.MakeXYWH(cx - w * 0.55 * sx, cy + h * 0.30, w * 1.1 * sx, h * 0.62), paint(C((0, 0, 0), shadow_a), blur=34))
    c.save(); c.translate(cx, cy + yoff); c.rotate(rot); c.scale(sx, sy)
    rr = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(-w / 2, -h / 2, w, h), rad, rad)
    lg = skia.GradientShader.MakeLinear([(-w / 2, -h / 2), (w / 2, h / 2)],
                                        [C(lighten(PAL["rose"], 0.55)), C(PAL["rose"]), C(darken(PAL["rose"], 0.30))], [0, 0.5, 1])
    c.drawRRect(rr, paint(C(PAL["rose"], 0.55), blur=26, stroke=18))
    c.drawRRect(rr, paint(shader=lg))
    c.drawOval(skia.Rect.MakeXYWH(-w * 0.40, -h * 0.40, w * 0.55, h * 0.34), paint(C(WHITE, 0.28), blur=18))
    inset = skia.RRect.MakeRectXY(skia.Rect.MakeXYWH(-w / 2 + 24, -h / 2 + 24, w - 48, h - 48), rad - 20, rad - 20)
    sp = paint(C(darken(PAL["rose"], 0.45), 0.55), stroke=3.2); sp.setPathEffect(skia.DashPathEffect.Make([11, 9], 0))
    c.drawRRect(inset, sp)
    for dx, dy in ((1, 1), (-1, 1), (1, -1), (-1, -1)):
        c.drawLine(0, 0, dx * 62, dy * 38, paint(C(darken(PAL["rose"], 0.5), 0.22), blur=3, stroke=5))
    c.drawCircle(0, 0, 14, paint(C(darken(PAL["rose"], 0.28))))
    c.drawCircle(-3, -4, 5.5, paint(C(WHITE, 0.45), blur=2))
    c.drawRRect(rr, paint(C(WHITE, 0.55), stroke=2.5))
    c.restore()

# ----------------------------------------------------------------- frame -------
def render_frame(c, t):
    S, F = camera(t)
    draw_bg(c, t, S, F)
    G = growth(t); R = 380 * G * (1 + pulse(t))
    c.save(); c.translate(W / 2, H / 2); c.scale(S, S); c.translate(-F[0], -F[1])
    draw_blob(c, t, R)
    for tp in (T_BIGGER1, T_BIGGER2, T_AND, T_ENTIRE):
        ring(c, t, tp, 0, 0, R * 1.0 + 260, PAL["lav"], width=5, dur=1.0)
        # (ring starts from centre; masked visually by the blob fill, emerges beyond the rim)
    STOCK_P, BOND_P = sat_pos(200, R), sat_pos(340, R)
    # ---- stock market (mint sphere) ----
    u = prog(t, 2.85, 3.55)
    if u > 0:
        a = math.radians(200); start = np.array([math.cos(a), math.sin(a)]) * R * 0.92
        STOCK_P = sat_pos(200, R)
        pos = start + (STOCK_P - start) * e_out_expo(u)
        sc = spring(prog(t, 2.85, 3.65))
        pos = pos + np.array([16 * math.sin(t * 0.8), 14 * math.cos(t * 0.65)]) * e_out_cubic(u)
        rr = 0.93 * R_CIRCLE + 0.07 * r_blob(t, 5.0, 1.4)
        draw_sphere(c, pos[0], pos[1], 105 * max(sc, 0.001), rr, PAL["mint"], t, spin=t * 0.25)
        ring(c, t, 2.95, pos[0], pos[1], 190, PAL["mint"])
    # ---- bond market (lavender squircle) ----
    u = prog(t, 4.55, 5.25)
    if u > 0:
        a = math.radians(-20); start = np.array([math.cos(a), math.sin(a)]) * R * 0.92
        BOND_P = sat_pos(340, R)
        pos = start + (BOND_P - start) * e_out_expo(u)
        sc = spring(prog(t, 4.55, 5.35))
        pos = pos + np.array([15 * math.cos(t * 0.7), 15 * math.sin(t * 0.6)]) * e_out_cubic(u)
        m = clamp(0.35 + 0.65 * (0.5 + 0.5 * math.sin(t * 1.4)))
        rr = (1 - m) * R_CIRCLE + m * R_SQUIRCLE
        draw_sphere(c, pos[0], pos[1], 92 * max(sc, 0.001), rr, PAL["lav"], t, spin=-t * 0.3)
        ring(c, t, 4.65, pos[0], pos[1], 170, PAL["lav"])
    # ---- crypto gem ----
    s_in = spring(prog(t, 7.50, 8.15))
    pop = 1 + 0.45 * math.sin(math.pi * prog(t, T_LOOK, 8.80))
    s_out = 1 - e_in_cubic(prog(t, 8.80, 8.98))
    gs = s_in * pop * s_out
    if gs > 0.002:
        bob = 5 * math.sin(t * 2.2)
        draw_gem(c, GEM[0], GEM[1] + bob, 40 * gs, (1 - e_out_expo(prog(t, 7.5, 8.3))) * 200 + t * 14, PAL["peach"])
        ring(c, t, 7.62, GEM[0], GEM[1], 120, PAL["peach"])
    ring(c, t, 8.86, GEM[0], GEM[1], 190, PAL["butter"], width=5, dur=0.8)
    draw_coins(c, t)
    draw_cushion(c, t)
    ring(c, t, T_CUSHION, GEM[0] + 8, GEM[1] + 6, 330, PAL["rose"], width=6, dur=1.0)
    c.restore()

    def to_screen(p): return (W / 2 + (p[0] - F[0]) * S, H / 2 + (p[1] - F[1]) * S)

    # ---- kinetic labels (screen space) ----
    draw_label(c, "SHADOW MARKET", W / 2, 520, 132, t, 0.40, 2.70, PAL["rose"], stag=0.028, din=0.40)
    sx, sy = to_screen(STOCK_P)
    draw_label(c, "STOCK MARKET", clamp(sx, 330, 1590), sy + 105 * S + 78, 52, t, T_STOCK - 0.02, 4.75, PAL["mint"])
    bx, by = to_screen(BOND_P)
    draw_label(c, "BOND MARKET", clamp(bx, 330, 1590), by + 92 * S + 78, 52, t, T_BOND - 0.02, 6.35, PAL["lav"])
    gx, gy = to_screen(GEM)
    draw_label(c, "CRYPTO MARKET", clamp(gx, 330, 1590), gy - 110, 46, t, T_CRYPTO - 0.02, 8.55, PAL["peach"], dout=0.22)
    draw_label(c, "LOOSE CHANGE", W / 2, 175, 74, t, T_LOOSE - 0.06, 10.45, PAL["butter"])

    # ---- finishing: vignette + grain ----
    c.drawRect(skia.Rect.MakeWH(W, H), paint(shader=radial(W / 2, H / 2, 1180,
                                             [(0, C((0, 0, 0), 0)), (0.58, C((0, 0, 0), 0)), (1, C((0, 0, 0), 0.62))])))
    jx, jy = (t * 7919) % 256, (t * 104729) % 256
    sh = GRAIN.makeShader(skia.TileMode.kRepeat, skia.TileMode.kRepeat, skia.SamplingOptions(), skia.Matrix.Translate(jx, jy))
    c.drawRect(skia.Rect.MakeWH(W, H), paint(shader=sh, alpha=0.055, blend=skia.BlendMode.kOverlay))

def new_surface():
    return skia.Surface(W, H)

def grab(surface):
    return surface.makeImageSnapshot().toarray(colorType=skia.kRGBA_8888_ColorType, alphaType=skia.kUnpremul_AlphaType)

def frame_array(t, surface, blur=False):
    if not blur:
        render_frame(surface.getCanvas(), t); return grab(surface)
    acc = None
    offs = [-0.375, -0.125, 0.125, 0.375]
    for o in offs:
        render_frame(surface.getCanvas(), t + o / FPS)
        a = grab(surface).astype(np.float32)
        acc = a if acc is None else acc + a
    return (acc / len(offs)).astype(np.uint8)

def main():
    mode = sys.argv[1]
    surf = new_surface()
    if mode == "stills":
        out_dir = os.environ.get("STILLS_DIR", "stills")
        os.makedirs(out_dir, exist_ok=True)
        for tt in sys.argv[2:]:
            t = float(tt)
            arr = frame_array(t, surf)
            out_file = os.path.join(out_dir, f"f_{t:06.2f}.png")
            skia.Image.fromarray(arr, colorType=skia.kRGBA_8888_ColorType).save(out_file, skia.kPNG)
            print("wrote", out_file)
    elif mode == "range":
        a, b, out = int(sys.argv[2]), int(sys.argv[3]), sys.argv[4]
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS),
               "-i", "-", "-c:v", "libx264", "-preset", "fast", "-crf", "15", "-pix_fmt", "yuv420p", "-g", "60",
               "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", out]
        pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        for i in range(a, b):
            t = i / FPS
            pr.stdin.write(frame_array(t, surf, blur=(8.45 <= t <= 9.60)).tobytes())
        pr.stdin.close(); pr.wait(); print("segment", a, b, "done")
    elif mode == "render":
        out = sys.argv[2]
        n = int(math.ceil(DUR * FPS))
        cmd = ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", f"{W}x{H}", "-r", str(FPS),
               "-i", "-", "-i", AUDIO, "-c:v", "libx264", "-preset", "slow", "-crf", "15", "-pix_fmt", "yuv420p",
               "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709",
               "-c:a", "aac", "-b:a", "192k", "-ac", "2", "-movflags", "+faststart", "-shortest", out]
        pr = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        for i in range(n):
            t = i / FPS
            pr.stdin.write(frame_array(t, surf, blur=(8.40 <= t <= 9.65)).tobytes())
            if i % 60 == 0: print(f"frame {i}/{n}", flush=True)
        pr.stdin.close(); pr.wait(); print("done", out)

if __name__ == "__main__":
    main()

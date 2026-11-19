#!/usr/bin/env python
"""Render every foley event to its own WAV, with exactly the sound mix.py puts in the mix, for the clip previews and the Final Cut Pro project.

Usage: sfx_daw.py --events events.json --out-dir DIR [--no-lib]

mix.py renders event i with sfx.seed(1234 + e.get("seed", i)) -> sfx.render_event_ex(type, d), scales it by the type's level
(sfx.FOLEY[type][2] dB, /0.8) and by the event's own `gain`, and pans it. Here the type level and the pan are baked
into the WAV (same seed, same level), while the event's own `gain` is NOT: the Final Cut Pro project puts it on the
clip (in dB) so it can be changed there. At every clip gain 0 dB, mix.py's foley and this are sample-identical.

Output: DIR/NNN_type.wav (32-bit float, canonical 44-byte header with the data 4-byte aligned; mono when
pan is 0, which is exactly what a centre pan renders) and DIR/manifest.json:
[{i, file, type, act, t, d, gain, pan, dur, sourceId}]. Identical renders share one file.
"""
import argparse, hashlib, json, os, struct, sys
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sfx

SR = sfx.SR


def write_f32(path, x):
    """x: (n,) or (n, ch) float -> 32-bit float WAV with the plain 44-byte header."""
    x = np.asarray(x, dtype="<f4")
    ch = 1 if x.ndim == 1 else x.shape[1]
    data = x.tobytes()
    hdr = b"RIFF" + struct.pack("<I", 36 + len(data)) + b"WAVEfmt " + struct.pack("<IHHIIHH", 16, 3, ch, SR, SR * ch * 4, ch * 4, 32) + b"data" + struct.pack("<I", len(data))
    with open(path, "wb") as f:
        f.write(hdr + data)
    return hashlib.sha1(data).hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--events", required=True); ap.add_argument("--out-dir", required=True)
    ap.add_argument("--no-lib", action="store_true", help="procedural foley only (same flag as mix.py)")
    a = ap.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)
    for f in os.listdir(a.out_dir):   # a rebuild replaces the previous set
        if f.endswith(".wav") or f == "manifest.json": os.remove(os.path.join(a.out_dir, f))
    evs = json.load(open(a.events)); out = []; seen = {}; skipped = 0; sfx.reset_picks()
    for i, e in enumerate(evs):
        if e["type"] not in sfx.FOLEY: skipped += 1; continue
        sfx.seed(1234 + e.get("seed", i))
        x, ent = sfx.render_event_ex(e["type"], e.get("d"), not a.no_lib, e.get("take"))
        x = x.astype(np.float64) * 10 ** (sfx.FOLEY[e["type"]][2] / 20) / .8
        pan = float(e.get("pan", 0))
        if pan:
            l, r = np.cos((pan + 1) * np.pi / 4) * 1.414, np.sin((pan + 1) * np.pi / 4) * 1.414
            x = np.stack([x * l, x * r], 1)
        name = f"{i:03d}_{e['type']}.wav"; path = os.path.join(a.out_dir, name)
        digest = write_f32(path, x)
        if digest in seen: os.remove(path); name = seen[digest]
        else: seen[digest] = name
        out.append({"i": i, "key": e.get("key"), "off": bool(e.get("off")), "file": name, "type": e["type"], "act": e.get("act"), "t": float(e["t"]), "d": e.get("d"),
                    "gain": float(e.get("gain", 1)), "pan": pan, "dur": len(x) / SR, "sourceId": ent["id"] if ent else "proc:" + e["type"]})
    json.dump(out, open(os.path.join(a.out_dir, "manifest.json"), "w"), indent=1)
    print(f"[sfx_daw] {len(out)} events -> {len(seen)} files in {a.out_dir}" + (f" ({skipped} unknown types skipped)" if skipped else ""))


if __name__ == "__main__":
    main()

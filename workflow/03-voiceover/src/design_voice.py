#!/usr/bin/env python3
"""Design a narrator voice with Qwen3-TTS VoiceDesign, then keep it as a cloning reference.

VoiceDesign invents a voice from a description, but each call can drift a little, so a whole video is never read
with it directly. Instead: design -> listen -> pick one take -> that clip becomes the reference the Qwen Base model
clones for every sentence, which keeps one voice across the video.

  design: --name <slug> --describe "<voice description>" [--takes 3] [--text "<sample>"]
          -> workflow/03-voiceover/voices/<slug>/take1.wav ... + design.json
  pick:   --name <slug> --pick <n>  -> voices/<slug>/reference.wav + reference.txt (used by `bun run tts --voice-profile <slug>`)
  emotions: --name <slug> --emotions [--takes 5]  -> voices/<slug>/emotions/<mood>.wav + .txt + emotions.json

Emotions: the Base model clones the picked reference reading a short line written in each mood (seeded takes). A take
must read its words correctly (ASR) and keep the voice (speaker similarity >= MIN_SIM); among those, the most
expressive (pitch movement) wins, except "serious", which keeps the exact-word, steadiest take. At synthesis a section whose tone note
maps to a mood uses that clip as the in-context reference while the speaker embedding stays pinned to the main
reference, so delivery changes and the voice does not.
"""
import argparse
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
VOICES = os.path.normpath(os.path.join(HERE, "..", "voices"))
MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16"
# ~15 s of narration in the channel's register: long and varied enough to be a good cloning reference
SAMPLE = ("Every single day, trillions of dollars move through markets you will never see. "
          "Most people believe the game is fair. It isn't. "
          "And once you understand who actually writes the rules, you will never look at your savings the same way again.")


def design(args):
    import numpy as np
    import soundfile as sf
    import mlx.core as mx
    from mlx_audio.tts.utils import load_model

    out_dir = os.path.join(VOICES, args.name)
    os.makedirs(out_dir, exist_ok=True)
    text = args.text or SAMPLE
    t0 = time.time()
    model = load_model(args.model)
    sr = int(getattr(model, "sample_rate", 24000))
    print(f"loaded {args.model} in {time.time() - t0:.0f}s", flush=True)
    takes = []
    for n in range(1, args.takes + 1):
        mx.random.seed(args.seed + n)
        t = time.time()
        segs = list(model.generate(text=text, instruct=args.describe, language="English"))
        wav = np.concatenate([np.asarray(s.audio, dtype="float32") for s in segs])
        path = os.path.join(out_dir, f"take{n}.wav")
        sf.write(path, wav, sr, subtype="PCM_16")
        takes.append({"take": n, "file": os.path.basename(path), "seconds": round(len(wav) / sr, 2)})
        print(f"  take {n}: {len(wav) / sr:.1f}s audio in {time.time() - t:.1f}s -> {path}", flush=True)
        mx.clear_cache()
    meta_path = os.path.join(out_dir, "design.json")
    meta = json.load(open(meta_path)) if os.path.exists(meta_path) else {}
    meta.update({"name": args.name, "describe": args.describe, "text": text, "model": args.model, "takes": takes})
    json.dump(meta, open(meta_path, "w"), indent=2)


MOODS = {
    "excited": "Wait, it gets better! This one tiny change turned a few hundred dollars into a fortune, and almost nobody saw it coming. Seriously, look at this!",
    "suspense": "But something was wrong. The numbers did not add up. Somewhere, very quietly, someone was moving the money... and they did not want to be found.",
    "serious": "This is the part that matters most. Ignore it, and the losses compound year after year, until it is far too late to fix.",
    "wry": "Of course, the bank calls this a convenience fee. Very convenient. For the bank, anyway. You, on the other hand, just paid for the privilege.",
}
MIN_SIM = 0.965


def pitch_spread(wav, sr):
    """Std of voiced pitch in semitones (autocorrelation per 40 ms frame): how much the delivery moves."""
    import numpy as np
    n, hop = int(sr * 0.04), int(sr * 0.01)
    lo, hi = int(sr / 300), int(sr / 70)
    f0 = []
    for i in range(0, len(wav) - n, hop):
        fr = wav[i:i + n] - wav[i:i + n].mean()
        if np.sqrt(np.mean(fr ** 2)) < 0.01:
            continue
        ac = np.correlate(fr, fr, "full")[n - 1:]
        if ac[0] <= 0:
            continue
        lag = lo + int(np.argmax(ac[lo:hi]))
        if ac[lag] / ac[0] > 0.5:
            f0.append(sr / lag)
    if len(f0) < 10:
        return 0.0
    st = 12 * np.log2(np.array(f0) / np.median(f0))
    return float(np.std(st))


def emotions(args):
    import numpy as np
    import soundfile as sf
    import mlx.core as mx
    from mlx_audio.tts.utils import load_model
    from mlx_audio.utils import load_audio
    sys.path.insert(0, HERE)
    from tts_best_of_n import load_asr, transcribe, wer, to_16k, trim_silence

    vdir = os.path.join(VOICES, args.name)
    ref, txt = os.path.join(vdir, "reference.wav"), os.path.join(vdir, "reference.txt")
    if not os.path.exists(ref):
        sys.exit(f"pick a take first: bun run voice:design --name {args.name} --pick <n>")
    ref_text = open(txt).read().strip()
    model = load_model("mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16")
    sr = int(model.sample_rate)
    ref_audio = load_audio(ref, sample_rate=sr)
    extract = model.extract_speaker_embedding
    ref_emb = extract(ref_audio)
    model.extract_speaker_embedding = lambda a, sr=24000: ref_emb
    cos = lambda a, b: float((a * b).sum() / (mx.sqrt((a * a).sum()) * mx.sqrt((b * b).sum())))
    asr, _ = load_asr("small.en")
    out_dir = os.path.join(vdir, "emotions")
    os.makedirs(out_dir, exist_ok=True)
    summary = {}
    for mood, line in MOODS.items():
        cands = []
        for seed in range(1, args.takes + 1):
            mx.random.seed(seed)
            segs = list(model.generate(text=line, ref_audio=ref_audio, ref_text=ref_text, lang_code="english"))
            wav = trim_silence(np.concatenate([np.asarray(s.audio, dtype="float32") for s in segs]), sr)
            w = wer(line, transcribe(asr, to_16k(wav, sr)))
            sim = cos(extract(mx.array(wav)), ref_emb)
            spread = pitch_spread(wav, sr)
            cands.append({"seed": seed, "wer": round(w, 3), "sim": round(sim, 4), "spread": round(spread, 2), "wav": wav})
            print(f"  {mood} seed {seed}: wer {w:.2f} voice {sim:.3f} expressiveness {spread:.2f}", flush=True)
            mx.clear_cache()
        ok = [c for c in cands if c["wer"] <= 0.1 and c["sim"] >= MIN_SIM] or sorted(cands, key=lambda c: (c["wer"], -c["sim"]))[:1]
        # serious: exact words, then the steadiest; other moods: the most pitch movement
        best = min(ok, key=lambda c: (c["wer"], c["spread"])) if mood == "serious" else max(ok, key=lambda c: c["spread"])
        sf.write(os.path.join(out_dir, f"{mood}.wav"), best["wav"], sr, subtype="PCM_16")
        open(os.path.join(out_dir, f"{mood}.txt"), "w").write(line)
        summary[mood] = {k: best[k] for k in ("seed", "wer", "sim", "spread")}
        print(f"-> {mood}: seed {best['seed']} (voice {best['sim']:.3f}, expressiveness {best['spread']:.2f})", flush=True)
    json.dump(summary, open(os.path.join(out_dir, "emotions.json"), "w"), indent=2)


def pick(args):
    import shutil
    out_dir = os.path.join(VOICES, args.name)
    meta_path = os.path.join(out_dir, "design.json")
    if not os.path.exists(meta_path):
        sys.exit(f"no design for '{args.name}' in {out_dir}")
    meta = json.load(open(meta_path))
    src = os.path.join(out_dir, f"take{args.pick}.wav")
    if not os.path.exists(src):
        sys.exit(f"{src} does not exist")
    shutil.copyfile(src, os.path.join(out_dir, "reference.wav"))
    open(os.path.join(out_dir, "reference.txt"), "w").write(meta["text"])
    meta["picked"] = args.pick
    json.dump(meta, open(meta_path, "w"), indent=2)
    print(f"voices/{args.name}: take {args.pick} is the reference. Use it with: bun run tts --qwen --voice-profile {args.name}")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--name", required=True, help="slug, e.g. deep_narrator")
    p.add_argument("--describe", help="voice description (gender, age, accent, timbre, delivery)")
    p.add_argument("--text", help="sample text (default: a ~15 s finance narration)")
    p.add_argument("--takes", type=int, default=3)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--model", default=MODEL)
    p.add_argument("--pick", type=int, help="make take N the cloning reference")
    p.add_argument("--emotions", action="store_true", help="make the mood reference clips for the picked voice")
    a = p.parse_args()
    if not all(c.isalnum() or c in "_-" for c in a.name):
        p.error("--name: letters, digits, _ and -")
    if a.emotions:
        a.takes = a.takes if a.takes != 3 else 5
        emotions(a)
    elif a.pick:
        pick(a)
    elif a.describe:
        design(a)
    else:
        p.error("need --describe (design) or --pick N")


if __name__ == "__main__":
    main()

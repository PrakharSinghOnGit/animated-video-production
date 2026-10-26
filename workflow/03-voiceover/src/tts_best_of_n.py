#!/usr/bin/env python3
"""Best-of-N TTS synthesis: chunk -> N seeded takes -> ASR score -> pick best -> join into one WAV.

Engines: "chatterbox" (default; Resemble AI Chatterbox, zero-shot cloning from ref_audio) or "f5" (F5-TTS).
Job JSON: {engine, pace, ref_audio, ref_text, speed, exaggeration, cfg_weight, temperature,
           chunks: [{id, text}], takes, asr_model, out_path, pause_ms, report_path}
Also: --check-ref <ref_audio> <ref_text_file> transcribes the reference clip and prints WER (JSON on stdout).
"""
import sys
import os
import re
import json
import time
import argparse

SR = 24000
SILENCE_DB = -45.0
PAD_MS = 40
WPS_MIN, WPS_MAX = 1.8, 4.2
WPS_PENALTY = 0.25
FLAG_WER = 0.15


_ONES = ("zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen "
         "sixteen seventeen eighteen nineteen").split()
_TENS = "_ _ twenty thirty forty fifty sixty seventy eighty ninety".split()
_SCALES = [(10 ** 12, "trillion"), (10 ** 9, "billion"), (10 ** 6, "million"), (1000, "thousand")]


def int_to_words(n):
    if n < 20:
        return _ONES[n]
    if n < 100:
        return _TENS[n // 10] + ("" if n % 10 == 0 else " " + _ONES[n % 10])
    if n < 1000:
        return _ONES[n // 100] + " hundred" + ("" if n % 100 == 0 else " " + int_to_words(n % 100))
    for size, name in _SCALES:
        if n >= size:
            rest = n % size
            return int_to_words(n // size) + " " + name + ("" if rest == 0 else " " + int_to_words(rest))
    return str(n)


def _num_sub(m):
    whole, frac = m.group(1).replace(",", ""), m.group(2)
    out = int_to_words(int(whole))
    if frac:
        out += " point " + " ".join(_ONES[int(d)] for d in frac)
    return " " + out + " "


def norm_words(text):
    """Lowercase, spell out digits (ASR emits '10,000'), drop punctuation."""
    text = text.lower().replace("&", " and ").replace("%", " percent ")
    text = re.sub(r"\$(\d[\d,]*(?:\.\d+)?)(\s*(?:thousand|million|billion|trillion))?", r"\1\2 dollars", text)
    text = re.sub(r"(\d[\d,]*)(?:\.(\d+))?", _num_sub, text)
    text = text.replace("-", " ")
    text = re.sub(r"[^a-z0-9\s']", " ", text)
    text = text.replace("'", "")
    # Spelled acronyms ("i p o") and ASR's written form ("ipo") must compare equal:
    # merge runs of 2+ single-letter tokens into one word.
    words, run = [], []
    for w in text.split():
        if len(w) == 1 and w.isalpha():
            run.append(w)
            continue
        words.extend(["".join(run)] if len(run) > 1 else run)
        run = []
        words.append(w)
    words.extend(["".join(run)] if len(run) > 1 else run)
    return words


def wer(ref, hyp):
    """Word-level Levenshtein distance / len(ref)."""
    r, h = norm_words(ref), norm_words(hyp)
    if not r:
        return 0.0 if not h else 1.0
    prev = list(range(len(h) + 1))
    for i, rw in enumerate(r, 1):
        cur = [i] + [0] * len(h)
        for j, hw in enumerate(h, 1):
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (rw != hw))
        prev = cur
    return prev[-1] / len(r)


def load_asr(model_name):
    from faster_whisper import WhisperModel
    try:
        return WhisperModel(model_name, device="cpu", compute_type="int8"), model_name
    except Exception as e:
        # No network / not cached: fall back to the locally cached base model
        print(f"  ! ASR model '{model_name}' unavailable ({type(e).__name__}); falling back to 'base'", file=sys.stderr)
        return WhisperModel("base", device="cpu", compute_type="int8"), "base"


def transcribe(asr, path_or_audio):
    segs, _ = asr.transcribe(path_or_audio, language="en", beam_size=1, vad_filter=False,
                             condition_on_previous_text=False)
    return " ".join(s.text.strip() for s in segs).strip()


def trim_silence(wav, sr=SR):
    import numpy as np
    wav = np.asarray(wav, dtype="float32")
    thresh = 10 ** (SILENCE_DB / 20.0)
    idx = np.nonzero(np.abs(wav) > thresh)[0]
    if len(idx) == 0:
        return wav
    pad = int(sr * PAD_MS / 1000)
    return wav[max(0, idx[0] - pad): min(len(wav), idx[-1] + 1 + pad)]


def stretch(wav, sr, pace):
    """Pitch-preserving tempo change (ffmpeg atempo); pace < 1 slows delivery."""
    import subprocess
    import tempfile
    import soundfile as sf
    if abs(pace - 1.0) < 1e-3:
        return wav
    with tempfile.TemporaryDirectory() as d:
        src, dst = os.path.join(d, "in.wav"), os.path.join(d, "out.wav")
        sf.write(src, wav, sr, subtype="FLOAT")
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", src, "-filter:a", f"atempo={pace:.4f}", "-c:a", "pcm_f32le", dst], check=True)
        out, _ = sf.read(dst, dtype="float32")
    return out


def to_16k(wav, sr):
    """faster-whisper treats raw arrays as 16 kHz mono."""
    import numpy as np
    wav = np.asarray(wav, dtype="float32")
    if sr == 16000:
        return wav
    import soxr
    return soxr.resample(wav, sr, 16000).astype("float32")


def check_ref(args):
    ref_text = open(args.ref_text_file, encoding="utf-8").read().strip()
    asr, used = load_asr(args.asr_model)
    heard = transcribe(asr, args.check_ref)
    print(json.dumps({"wer": wer(ref_text, heard), "heard": heard, "expected": ref_text, "asrModel": used}))


class F5Engine:
    def __init__(self, job):
        from concurrent.futures import ThreadPoolExecutor
        from f5_tts.infer import utils_infer
        _orig = ThreadPoolExecutor.__init__
        def _safe(self, max_workers=None, *a, **k):  # MPS needs sequential dispatch
            _orig(self, max_workers=1, *a, **k)
        utils_infer.ThreadPoolExecutor.__init__ = _safe
        from f5_tts.api import F5TTS
        self.model = F5TTS()
        self.job = job
        self.sr = SR

    def synth(self, text, seed):
        wav, _, _ = self.model.infer(ref_file=self.job["ref_audio"], ref_text=self.job["ref_text"], gen_text=text,
                                     speed=float(self.job.get("speed", 1.0)), seed=seed, show_info=lambda *a, **k: None)
        return wav


class ChatterboxEngine:
    """Chatterbox clones from the reference audio alone (no transcript needed).
    exaggeration raises emotional intensity (and speeds delivery); lower cfg_weight slows and loosens pacing."""

    def __init__(self, job):
        import torch
        from chatterbox.tts import ChatterboxTTS
        device = "mps" if torch.backends.mps.is_available() else "cpu"
        self.torch = torch
        self.model = ChatterboxTTS.from_pretrained(device=device)
        self.sr = self.model.sr
        self.job = job
        # Condition on the reference once; every take reuses it
        self.model.prepare_conditionals(job["ref_audio"], exaggeration=float(job.get("exaggeration", 0.5)))

    def synth(self, text, seed):
        import gc
        self.torch.manual_seed(seed)
        with self.torch.inference_mode():
            wav = self.model.generate(text, exaggeration=float(self.job.get("exaggeration", 0.5)),
                                      cfg_weight=float(self.job.get("cfg_weight", 0.5)),
                                      temperature=float(self.job.get("temperature", 0.8)))
        out = wav.squeeze(0).detach().cpu().numpy()
        # MPS keeps freed blocks cached; across a whole video that grows to an out-of-memory error
        del wav
        gc.collect()
        if self.torch.backends.mps.is_available():
            self.torch.mps.empty_cache()
        return out


ENGINES = {"f5": F5Engine, "chatterbox": ChatterboxEngine}


def synth_item(engine, asr, asr_used, item, settings):
    """One section: best-of-N per chunk, joined with pauses, written with its report."""
    import numpy as np
    import soundfile as sf

    chunks = item["chunks"]
    takes, pause_ms, accept_wer, pace = settings["takes"], settings["pause_ms"], settings["accept_wer"], settings["pace"]
    sr = engine.sr
    report = []
    pieces = []
    for ci, ch in enumerate(chunks):
        text = ch["text"].strip()
        t0 = time.time()
        cands = []
        for seed in range(1, takes + 1):
            wav = trim_silence(engine.synth(text, seed), sr)
            dur = len(wav) / sr
            n_words = max(1, len(norm_words(text)))
            wps = n_words / max(dur, 1e-3)
            heard = ""
            w = 0.0
            if asr is not None:
                heard = transcribe(asr, to_16k(wav, sr))
                w = wer(text, heard)
            score = w + (WPS_PENALTY if not (WPS_MIN <= wps <= WPS_MAX) else 0.0)
            cands.append({"seed": seed, "wer": round(w, 4), "duration": round(dur, 3), "wps": round(wps, 2), "heard": heard, "score": round(score, 4), "wav": wav})
            # Adaptive: stop as soon as a take is good enough (score = WER + wps penalty)
            if asr is not None and score <= accept_wer:
                break
        best = min(cands, key=lambda c: c["score"])
        pieces.append((stretch(best["wav"], sr, pace), text))
        flagged = asr is not None and best["wer"] > FLAG_WER
        report.append({
            "id": ch["id"], "text": text, "chosenSeed": best["seed"],
            "wer": [c["wer"] for c in cands], "durations": [c["duration"] for c in cands],
            "wps": [c["wps"] for c in cands], "heard": [c["heard"] for c in cands], "chosenWer": best["wer"], "takesUsed": len(cands), "flagged": bool(flagged),
        })
        print(f"    chunk {ci + 1}/{len(chunks)}: seed {best['seed']} wer={best['wer']:.2f} "
              f"({time.time() - t0:.1f}s, {len(cands)}/{takes} take(s)){'  FLAGGED' if flagged else ''}", flush=True)

    out = []
    for i, (wav, _) in enumerate(pieces):
        out.append(wav)
        if i < len(pieces) - 1:
            out.append(np.zeros(int(sr * pause_ms / 1000), dtype="float32"))
    tail_ms = int(item.get("tail_ms", 0))  # section / chapter pause after the last sentence
    if tail_ms > 0:
        out.append(np.zeros(int(sr * tail_ms / 1000), dtype="float32"))
    final = np.concatenate(out) if out else np.zeros(0, dtype="float32")
    os.makedirs(os.path.dirname(item["out_path"]), exist_ok=True)
    sf.write(item["out_path"], final, sr, subtype="PCM_16")

    os.makedirs(os.path.dirname(item["report_path"]), exist_ok=True)
    with open(item["report_path"], "w", encoding="utf-8") as f:
        json.dump({"engine": settings["engine"], "pace": pace, "takes": takes, "asrModel": asr_used, "outPath": item["out_path"], "chunks": report}, f, indent=2)


def run_job(job_path):
    """A job is one section ({chunks, out_path, report_path, ...}) or many ({items: [...], ...shared settings}).
    Many sections in one job load the TTS and ASR models once instead of once per section."""
    with open(job_path, encoding="utf-8") as f:
        job = json.load(f)
    items = job.get("items") or [job]
    settings = {
        "engine": job.get("engine", "chatterbox"),
        "takes": max(1, int(job.get("takes", 3))),
        "pause_ms": int(job.get("pause_ms", 250)),
        "accept_wer": float(job.get("accept_wer", 0.05)),
        "pace": float(job.get("pace", 1.0)),
    }
    engine = ENGINES[settings["engine"]](job)
    asr, asr_used = (None, None)
    if settings["takes"] > 1:
        asr, asr_used = load_asr(job.get("asr_model", "small.en"))
    for n, item in enumerate(items):
        if len(items) > 1:
            print(f"\n[{n + 1}/{len(items)}] {item.get('id', os.path.basename(item['out_path']))}: {len(item['chunks'])} chunk(s)", flush=True)
        if "speed" in item:
            engine.job = {**engine.job, "speed": item["speed"]}
        synth_item(engine, asr, asr_used, item, settings)


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--job", help="Batch job JSON")
    p.add_argument("--check-ref", help="Reference wav to transcribe and compare")
    p.add_argument("--ref-text-file")
    p.add_argument("--asr-model", default="small.en")
    args = p.parse_args()
    if args.check_ref:
        check_ref(args)
    elif args.job:
        run_job(args.job)
    else:
        p.error("need --job or --check-ref")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Best-of-N TTS synthesis: passage -> N takes -> ASR score -> keep the first good one -> join into one WAV.

Engines: "qwen" (default; Qwen3-TTS 1.7B Base on MLX, clones the voice's reference clip + transcript) or "gemini"
(Google Gemini TTS, cloud; job adds voice, style, gemini_model).
Job JSON: {engine, pace, ref_audio, ref_text, temperature, takes, asr_model, pause_ms, items: [{chunks: [{id, text}],
           out_path, report_path, tail_ms, style?}]}

Natural delivery: a chunk is a whole passage (several sentences of one script block), so the model phrases sentences
together and places its own pauses and breaths; only passages are joined with pause_ms. Edges are trimmed with a
generous pad (breaths stay). Takes are judged only for misread words, broken speed and voice drift, and the first take
that passes is kept, so an expressive take is not traded for a flatter one. Loudness is set once per section, not per
sentence, so the rise and fall inside a section survives. Gemini gets a per-section style (item.style).
Consistency (Qwen): one reference clip and one speaker embedding for every passage; language fixed to English; seeded takes.
Also: --check-ref <ref_audio> <ref_text_file> transcribes the reference clip and prints WER (JSON on stdout).
"""
import sys
import os
import re
import json
import time
import argparse

SR = 24000
# Gemini's inline vocal/pause tags (<short pause>, <breath>, <sigh>...): performed, not spoken words
DELIVERY_TAG = re.compile(r"<[a-z][a-z -]{0,24}>", re.I)
SILENCE_DB = -45.0
PAD_MS = 150             # silence kept around a take: room for the in-breath and the tail of the last word
WPS_MIN, WPS_MAX = 1.4, 4.8   # only catches broken takes (rushed or stalled), not deliberate pace changes
WPS_PENALTY = 0.25
FLAG_WER = 0.15
TARGET_RMS_DB = -20.0     # every section is levelled to this once (mastering does the final loudness)
MIN_SPK_SIM = 0.95        # takes less similar than this to the reference voice are penalised (gross drift only)
SPK_PENALTY = 0.5


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
    """Lowercase, spell out digits (ASR emits '10,000'), drop punctuation and inline delivery tags (<short pause>)."""
    text = DELIVERY_TAG.sub(" ", text)
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


def _decode_audio(data, mime):
    """Gemini returns WAV (RIFF) or raw 16-bit PCM ("audio/l16; rate=24000"); both -> float32 mono, sr."""
    import io
    import numpy as np
    import soundfile as sf
    if data[:4] == b"RIFF":
        wav, sr = sf.read(io.BytesIO(data), dtype="float32")
    else:
        m = re.search(r"rate=(\d+)", mime or "")
        sr = int(m.group(1)) if m else SR
        wav = np.frombuffer(data, dtype="<i2").astype("float32") / 32768.0
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    return wav, sr


class GeminiEngine:
    """Google Gemini TTS (cloud, prebuilt voices; no cloning). Auth: the API key in GEMINI_TTS (or GEMINI_API_KEY /
    GOOGLE_API_KEY) through the Gemini API; if that is missing or its project has the Gemini API disabled, Vertex AI
    with Application Default Credentials (gcloud auth application-default login) and GOOGLE_CLOUD_PROJECT.
    Delivery is steered by a natural-language style line; takes differ because sampling is not seeded."""

    RETRIES = 6
    # a passage takes ~5-20 s; the Interactions API can hold a request open forever instead of answering (seen when the
    # daily quota is used up), so every request gets a deadline. interactions.create ignores the client's http_options.
    TIMEOUT = 180

    def __init__(self, job):
        from google import genai
        from google.genai import types
        self.types = types
        self.job = job
        self.model = job.get("gemini_model") or "gemini-3.8-flash-tts"
        self.voice = job.get("voice") or "Algenib"
        # a designed voice (bun run voice:design:gemini) is referred to by its folder name
        designed = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "voices", self.voice, "gemini.json")
        if os.path.exists(designed):
            self.voice = json.load(open(designed))["id"]
        self.style = (job.get("style") or "").strip()
        self.sr = SR
        self._warned = False
        key = os.environ.get("GEMINI_TTS") or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        self.vertex = None
        project = os.environ.get("GOOGLE_CLOUD_PROJECT") or _gcloud_project()
        if project:
            self.vertex = genai.Client(vertexai=True, project=project, location=os.environ.get("GOOGLE_CLOUD_LOCATION", "global"))
        self.client = genai.Client(api_key=key, http_options=types.HttpOptions(timeout=self.TIMEOUT * 1000)) if key else self.vertex
        import threading
        self._probe_lock = threading.Lock()
        self._probed = False
        if self.client is None:
            raise SystemExit("Gemini TTS: set GEMINI_TTS in .env, or run `gcloud auth application-default login` and set GOOGLE_CLOUD_PROJECT")
        print(f"  Gemini TTS: {self.model}, voice {self.voice}, via {'API key' if key else 'Vertex AI (' + project + ')'}", flush=True)

    def use_style(self, style):
        """Delivery direction for the next passages (the channel style + this section's tone note)."""
        self.style = (style or "").strip()

    def _verbatim(self):
        """gemini-3.8 TTS models read generate_content text word for word (a style prefix gets spoken); older ones take
        "<style>: <text>". 3.8 gets its style through the Interactions API, which only the Gemini API (key) serves."""
        return self.model.startswith("gemini-3.8")

    def _call(self, client, text, style=None):
        t = self.types
        style = self.style if style is None else style
        if self.voice.startswith("voice"):
            if client is self.vertex:
                raise SystemExit("Designed Gemini voices only work through the Gemini API key (GEMINI_TTS), not Vertex AI")
        if (self._verbatim() or self.voice.startswith("voice")) and client is not self.vertex:
            content = {"type": "text", "text": text}
            if style:
                content["annotations"] = [{"type": "speech_metadata", "style": style}]
            r = client.interactions.create(model=self.model, input=[{"type": "user_input", "content": [content]}],
                                           response_format={"type": "audio"},
                                           generation_config={"speech_config": [{"voice": self.voice}]},
                                           timeout=self.TIMEOUT)
            import base64
            a = r.output_audio
            data = a.data if isinstance(a.data, (bytes, bytearray)) else base64.b64decode(a.data)
            return _decode_audio(data, f"{a.mime_type or ''}; rate={a.sample_rate or SR}")
        if self._verbatim() and style and not self._warned:
            print("  ! Style is ignored for gemini-3.8 on Vertex AI (it would be read aloud). Enable the Gemini API for the key's"
                  " project, or pick gemini-2.5-pro-tts / gemini-3.1-flash-tts-preview to use a style.", flush=True)
            self._warned = True
        prompt = f"{style}: {text}" if style and not self._verbatim() else text
        # Vertex and the Gemini API name the 2.5 TTS models differently
        model = self.model.replace("-preview-tts", "-tts") if client is self.vertex and self.model.startswith("gemini-2.5") else self.model
        if client is not self.vertex and self.model.startswith("gemini-2.5") and not self.model.endswith("-preview-tts"):
            model = self.model.replace("-tts", "-preview-tts")
        r = client.models.generate_content(
            model=model, contents=prompt,
            config=t.GenerateContentConfig(response_modalities=["AUDIO"], speech_config=t.SpeechConfig(
                voice_config=t.VoiceConfig(prebuilt_voice_config=t.PrebuiltVoiceConfig(voice_name=self.voice)))))
        part = r.candidates[0].content.parts[0].inline_data
        return _decode_audio(part.data, part.mime_type)

    parallel = True   # requests are independent, so run_job sends several at once

    def _call_by_deadline(self, text, style):
        """_call with a wall-clock deadline. The server can keep a request's connection alive without ever answering, so
        the SDK's read timeouts never fire; the call runs on a daemon thread that is abandoned when time is up."""
        import threading
        box = {}

        def run():
            try:
                box["r"] = self._call(self.client, text, style)
            except BaseException as e:
                box["e"] = e
        th = threading.Thread(target=run, daemon=True)
        th.start()
        th.join(self.TIMEOUT)
        if th.is_alive():
            raise TimeoutError(f"no answer in {self.TIMEOUT}s (timed out)")
        if "e" in box:
            raise box["e"]
        return box["r"]

    def _why_no_answer(self):
        """The Interactions API stays silent where generate_content answers at once with the error (quota, billing).
        After a timeout, one tiny generate_content call (once per run) asks for the reason; '' when it goes through."""
        with self._probe_lock:
            if self._probed:
                return ""
            self._probed = True
            t = self.types
            try:
                self.client.models.generate_content(model=self.model, contents="Hi.", config=t.GenerateContentConfig(
                    response_modalities=["AUDIO"], speech_config=t.SpeechConfig(voice_config=t.VoiceConfig(
                        prebuilt_voice_config=t.PrebuiltVoiceConfig(voice_name="Algenib")))))
                return ""
            except Exception as e:
                print(f"  ! Asked Gemini why: {str(e)[:160]}", flush=True)
                return str(e)

    def synth(self, text, seed, style=None):
        delay = 4.0
        for attempt in range(self.RETRIES):
            try:
                wav, sr = self._call_by_deadline(text, style)
                if sr != self.sr:
                    import soxr
                    wav = soxr.resample(wav, sr, self.sr).astype("float32")
                return wav
            except Exception as e:
                msg = str(e)
                if isinstance(e, SystemExit):
                    raise
                timed_out = "timeout" in type(e).__name__.lower() or "timed out" in msg.lower()
                if timed_out:
                    print(f"  ! Gemini did not answer within {self.TIMEOUT}s", flush=True)
                    msg = (self._why_no_answer() or "") + " timed out"
                if re.search(r"per.?day|PerDay", msg, re.I):
                    limit = re.search(r"limit: (\d+)", msg)
                    wait = re.search(r"retry in ((?:\d+h)?(?:\d+m)?\d+)(?:\.\d+)?s", msg)
                    wait = wait.group(1) + "s" if wait else None
                    raise SystemExit(f"Gemini daily quota for {self.model} is used up ({limit.group(1) if limit else 'the'} requests/day"
                                     f" on this key's tier{'; it resets in ' + wait if wait else ''}). Finished sections are kept, so"
                                     " rerunning later continues where this stopped. To go on today: another model (its quota is"
                                     " separate), fewer takes per line (--takes 1), or a higher tier/billing in AI Studio.")
                if re.search(r"outstanding balance|billing account|billing.*(disabled|not enabled)|prepay|credits? (are )?(exhausted|depleted)", msg, re.I):
                    if self.vertex is not None and self.client is not self.vertex:
                        print("  ! The Gemini API key's billing account is blocked (unpaid balance); switching to Vertex AI", flush=True)
                        self.client = self.vertex
                        continue
                    raise SystemExit("Gemini TTS is blocked by billing: the API key's billing account has an outstanding balance."
                                     " Pay it at https://aistudio.google.com/billing (or use a key from another project in .env"
                                     " GEMINI_TTS), then rerun: finished sections are kept, so the rerun continues where this stopped.")
                if re.search(r"SERVICE_DISABLED|PERMISSION_DENIED", msg, re.I) and self.vertex is not None and self.client is not self.vertex:
                    print("  ! Gemini API is disabled for the key's project; switching to Vertex AI", flush=True)
                    self.client = self.vertex
                    continue
                transient = any(s in msg for s in ("429", "RESOURCE_EXHAUSTED", "500", "503", "UNAVAILABLE", "DEADLINE", "timed out"))
                if not transient or attempt == self.RETRIES - 1:
                    raise
                print(f"  ! Gemini busy ({msg[:60]}); retrying in {delay:.0f}s", flush=True)
                time.sleep(delay)
                delay = min(delay * 2, 60)


def _gcloud_project():
    """The quota project of the ADC file, else gcloud's active project; None when gcloud was never set up."""
    adc = os.path.expanduser("~/.config/gcloud/application_default_credentials.json")
    if not os.path.exists(adc):
        return None
    try:
        p = json.load(open(adc)).get("quota_project_id")
        if p:
            return p
        cfg = os.path.expanduser("~/.config/gcloud/configurations/config_default")
        m = re.search(r"^project\s*=\s*(\S+)", open(cfg).read(), re.M)
        return m.group(1) if m else None
    except Exception:
        return None


class QwenEngine:
    """Qwen3-TTS 1.7B Base (local, Apple Silicon MLX via mlx-audio): clones ref_audio + its exact transcript.
    The speaker embedding is taken from the reference once and pinned, so every sentence gets the same voice."""

    MODEL = "mlx-community/Qwen3-TTS-12Hz-1.7B-Base-bf16"

    def __init__(self, job):
        import mlx.core as mx
        from mlx_audio.tts.utils import load_model
        from mlx_audio.utils import load_audio
        self.mx = mx
        self.job = job
        print(f"  Qwen3-TTS: {self.MODEL}", flush=True)
        self.model = load_model(self.MODEL)
        self.sr = int(getattr(self.model, "sample_rate", SR))
        self.ref = load_audio(job["ref_audio"], sample_rate=self.sr)
        self.ref_emb = self.model.extract_speaker_embedding(self.ref)
        self._extract = self.model.extract_speaker_embedding
        self.model.extract_speaker_embedding = lambda audio, sr=24000: self.ref_emb
        self.temperature = job.get("temperature")
        self._load_audio = load_audio
        self._refs = {job["ref_audio"]: self.ref}
        self.icl = (self.ref, job["ref_text"])

    def use_reference(self, ref_audio, ref_text):
        """In-context reference for the next sentences (a mood clip of the same voice); the speaker embedding stays
        pinned to the main reference, so the delivery follows the clip and the voice does not move."""
        if ref_audio not in self._refs:
            self._refs[ref_audio] = self._load_audio(ref_audio, sample_rate=self.sr)
        self.icl = (self._refs[ref_audio], ref_text)

    def synth(self, text, seed):
        import numpy as np
        self.mx.random.seed(seed)
        kw = {"temperature": float(self.temperature)} if self.temperature is not None else {}
        out = list(self.model.generate(text=text, ref_audio=self.icl[0], ref_text=self.icl[1], lang_code="english", **kw))
        wav = np.concatenate([np.asarray(o.audio, dtype="float32") for o in out]) if out else np.zeros(0, dtype="float32")
        self.mx.clear_cache()
        return wav

    def similarity(self, wav):
        """Cosine similarity of a take's speaker embedding to the reference's (1 = same voice)."""
        mx = self.mx
        if len(wav) < self.sr // 2:
            return 1.0
        e = self._extract(mx.array(wav))
        a, b = e.reshape(-1), self.ref_emb.reshape(-1)
        return float((a * b).sum() / (mx.sqrt((a * a).sum()) * mx.sqrt((b * b).sum())))


def level(wav, target_db=TARGET_RMS_DB):
    """One gain for the whole section: scale to the target RMS of its voiced part, never clipping."""
    import numpy as np
    wav = np.asarray(wav, dtype="float32")
    voiced = wav[np.abs(wav) > 10 ** (SILENCE_DB / 20.0)]
    if len(voiced) == 0:
        return wav
    rms = float(np.sqrt(np.mean(voiced ** 2)))
    gain = 10 ** (target_db / 20.0) / max(rms, 1e-6)
    peak = float(np.max(np.abs(wav))) * gain
    if peak > 0.97:
        gain *= 0.97 / peak
    return wav * gain


ENGINES = {"qwen": QwenEngine, "gemini": GeminiEngine}


def score_take(engine, asr, text, wav, seed):
    """A take's checks: words read (WER vs ASR), speed in a sane range, voice similarity (Qwen). Lower score = better."""
    sr = engine.sr
    dur = len(wav) / sr
    wps = max(1, len(norm_words(text))) / max(dur, 1e-3)
    heard, w = "", 0.0
    if asr is not None:
        heard = transcribe(asr, to_16k(wav, sr))
        w = wer(text, heard)
    sim = engine.similarity(wav) if hasattr(engine, "similarity") else 1.0
    score = w + (WPS_PENALTY if not (WPS_MIN <= wps <= WPS_MAX) else 0.0) + (SPK_PENALTY if sim < MIN_SPK_SIM else 0.0)
    return {"seed": seed, "wer": round(w, 4), "duration": round(dur, 3), "wps": round(wps, 2), "sim": round(sim, 4), "heard": heard, "score": round(score, 4), "wav": wav}


def chunk_report(ch, text, cands, asr):
    """The kept take (the first that passed, else the best scoring) and its report row."""
    best = min(cands, key=lambda c: c["score"])
    flagged = (asr is not None and best["wer"] > FLAG_WER) or best["sim"] < MIN_SPK_SIM
    return best, {
        "id": ch["id"], "text": text, "chosenSeed": best["seed"],
        "wer": [c["wer"] for c in cands], "durations": [c["duration"] for c in cands],
        "wps": [c["wps"] for c in cands], "voiceSim": [c["sim"] for c in cands], "heard": [c["heard"] for c in cands], "chosenWer": best["wer"], "takesUsed": len(cands), "flagged": bool(flagged),
    }


def write_item(engine, asr_used, item, settings, kept, report):
    """Joins a section's kept passages with the passage gap, adds its tail pause, levels it once, writes wav + report."""
    import numpy as np
    import soundfile as sf
    sr, pause_ms, pace = engine.sr, settings["pause_ms"], settings["pace"]
    out = []
    for i, wav in enumerate(kept):
        out.append(stretch(wav, sr, pace))
        if i < len(kept) - 1:
            out.append(np.zeros(int(sr * pause_ms / 1000), dtype="float32"))
    tail_ms = int(item.get("tail_ms", 0))  # section / chapter pause after the last passage
    if tail_ms > 0:
        out.append(np.zeros(int(sr * tail_ms / 1000), dtype="float32"))
    final = level(np.concatenate(out)) if out else np.zeros(0, dtype="float32")
    os.makedirs(os.path.dirname(item["out_path"]), exist_ok=True)
    sf.write(item["out_path"], final, sr, subtype="PCM_16")
    os.makedirs(os.path.dirname(item["report_path"]), exist_ok=True)
    with open(item["report_path"], "w", encoding="utf-8") as f:
        json.dump({"engine": settings["engine"], "voice": settings.get("voice"), "mood": item.get("mood") or "neutral", "style": item.get("style"), "pace": pace, "takes": settings["takes"], "asrModel": asr_used, "outPath": item["out_path"], "chunks": report}, f, indent=2)


def synth_item(engine, asr, asr_used, item, settings):
    """One section, one passage at a time (local engines): takes until one passes, then written."""
    takes, accept_wer, sr = settings["takes"], settings["accept_wer"], engine.sr
    kept, report = [], []
    for ci, ch in enumerate(item["chunks"]):
        text = ch["text"].strip()
        t0 = time.time()
        cands = []
        for seed in range(1, takes + 1):
            cands.append(score_take(engine, asr, text, trim_silence(engine.synth(text, seed), sr), seed))
            if asr is not None and cands[-1]["score"] <= accept_wer:   # first take that passes is kept
                break
        best, row = chunk_report(ch, text, cands, asr)
        kept.append(best["wav"]); report.append(row)
        print(f"    chunk {ci + 1}/{len(item['chunks'])}: seed {best['seed']} wer={best['wer']:.2f} voice={best['sim']:.3f} "
              f"({time.time() - t0:.1f}s, {len(cands)}/{takes} take(s)){'  FLAGGED' if row['flagged'] else ''}", flush=True)
    write_item(engine, asr_used, item, settings, kept, report)


def run_parallel(engine, asr, asr_used, items, settings, workers):
    """Cloud engines: every passage of every section is requested at once (`workers` in flight). Each round sends the
    passages still without a passing take; a section is written as soon as all its passages are settled, so a run that
    stops (quota) keeps the finished sections."""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    takes, accept_wer, sr = settings["takes"], settings["accept_wer"], engine.sr
    cands = {(ii, ci): [] for ii, it in enumerate(items) for ci in range(len(it["chunks"]))}
    pending = list(cands)
    unsettled = set(pending)   # passages that may still get another take
    written = set()
    print(f"  {len(pending)} passage(s) across {len(items)} section(s), {workers} request(s) at a time", flush=True)

    def settle():
        for ii, it in enumerate(items):
            if ii in written or any(k[0] == ii for k in unsettled):
                continue
            kept, report = [], []
            for ci, ch in enumerate(it["chunks"]):
                best, row = chunk_report(ch, ch["text"].strip(), cands[(ii, ci)], asr)
                kept.append(best["wav"]); report.append(row)
            write_item(engine, asr_used, it, settings, kept, report)
            written.add(ii)
            bad = sum(r["flagged"] for r in report)
            print(f"  ✓ {os.path.basename(it['out_path'])}{'  (' + str(bad) + ' flagged)' if bad else ''}", flush=True)

    with ThreadPoolExecutor(max_workers=workers) as pool:
        for rnd in range(1, takes + 1):
            if not pending:
                break
            if rnd > 1:
                print(f"  retake round {rnd}: {len(pending)} passage(s)", flush=True)
            futs = {pool.submit(engine.synth, items[ii]["chunks"][ci]["text"].strip(), rnd, items[ii].get("style") or ""): (ii, ci) for ii, ci in pending}
            still = []
            for f in as_completed(futs):
                ii, ci = futs[f]
                text = items[ii]["chunks"][ci]["text"].strip()
                try:
                    wav = f.result()
                except SystemExit as e:
                    # a stop for the whole run (quota, billing): don't wait on the other requests in flight. Every
                    # finished section is already written, so a rerun continues from here.
                    print(f"\n❌ {e}", file=sys.stderr, flush=True)
                    os._exit(1)
                c = score_take(engine, asr, text, trim_silence(wav, sr), rnd)
                cands[(ii, ci)].append(c)
                ok = asr is None or c["score"] <= accept_wer
                print(f"    {items[ii]['chunks'][ci]['id']}: wer={c['wer']:.2f} {c['duration']:.1f}s{'' if ok else '  (retake)' if rnd < takes else '  FLAGGED'}", flush=True)
                if not ok and rnd < takes:
                    still.append((ii, ci))
                else:
                    unsettled.discard((ii, ci))
                    settle()   # write a section the moment its last passage is settled
            pending = still


def run_job(job_path):
    """A job is one section ({chunks, out_path, report_path, ...}) or many ({items: [...], ...shared settings}).
    Many sections in one job load the TTS and ASR models once instead of once per section."""
    with open(job_path, encoding="utf-8") as f:
        job = json.load(f)
    items = job.get("items") or [job]
    settings = {
        "engine": job.get("engine", "qwen"),
        "voice": job.get("voice_name"),
        "takes": max(1, int(job.get("takes", 3))),
        "pause_ms": int(job.get("pause_ms", 250)),
        "accept_wer": float(job.get("accept_wer", 0.05)),
        "pace": float(job.get("pace", 1.0)),
    }
    engine = ENGINES[settings["engine"]](job)
    asr, asr_used = (None, None)
    if settings["takes"] > 1:
        asr, asr_used = load_asr(job.get("asr_model", "small.en"))
    if getattr(engine, "parallel", False):
        t0 = time.time()
        run_parallel(engine, asr, asr_used, items, settings, max(1, int(job.get("parallel", 4))))
        print(f"  done in {time.time() - t0:.0f}s", flush=True)
        return
    for n, item in enumerate(items):
        if len(items) > 1:
            print(f"\n[{n + 1}/{len(items)}] {item.get('id', os.path.basename(item['out_path']))}: {len(item['chunks'])} chunk(s)"
                  f"{', mood ' + item['mood'] if item.get('mood') else ''}", flush=True)
        if hasattr(engine, "use_style"):
            engine.use_style(item.get("style") or job.get("style") or "")
        if hasattr(engine, "use_reference"):
            engine.use_reference(item.get("ref_audio") or job["ref_audio"], item.get("ref_text") or job["ref_text"])
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

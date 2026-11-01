#!/usr/bin/env python3
"""Design a Gemini TTS voice from a description (gemini-3.8 voice design, Gemini API key only).

  --name <slug> --describe "<voice description>" [--gender male|female] [--lang en-US]
  -> workflow/03-voiceover/voices/<slug>/gemini.json ({id, describe, ...}) + gemini_preview.wav

The voice id (voice_...) is stable, so every sentence is read by the same voice: use it with
`bun run tts --gemini --voice <slug>` (or the id itself). Stored voices live 1 year from last use, 200 per project.
Put permanent traits (age, gender, timbre, accent) here; situational delivery goes in --style at synthesis time.
"""
import argparse
import base64
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
VOICES = os.path.normpath(os.path.join(HERE, "..", "voices"))


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--name", required=True)
    p.add_argument("--describe", required=True)
    p.add_argument("--gender", default=None)
    p.add_argument("--lang", default="en-US")
    p.add_argument("--model", default="gemini-3.8-flash-tts")
    a = p.parse_args()
    if not all(c.isalnum() or c in "_-" for c in a.name):
        p.error("--name: letters, digits, _ and -")
    key = os.environ.get("GEMINI_TTS") or os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not key:
        sys.exit("Gemini voice design needs an API key with the Gemini API allowed (GEMINI_TTS in .env)")
    from google import genai
    client = genai.Client(api_key=key)
    voice = {"model": a.model, "type": "prompted", "display_name": a.name, "language_code": a.lang, "prompted": {"input": a.describe}}
    if a.gender:
        voice["gender"] = a.gender
    v = client.voices.create(store=True, voice=voice)
    out = os.path.join(VOICES, a.name)
    os.makedirs(out, exist_ok=True)
    if v.sample_audio and v.sample_audio.data:
        d = v.sample_audio.data
        open(os.path.join(out, "gemini_preview.wav"), "wb").write(d if isinstance(d, (bytes, bytearray)) else base64.b64decode(d))
    json.dump({"id": v.id, "name": a.name, "describe": a.describe, "model": a.model, "lang": a.lang}, open(os.path.join(out, "gemini.json"), "w"), indent=2)
    print(f"{a.name}: {v.id} -> voices/{a.name}/gemini_preview.wav. Use: bun run tts --gemini --voice {a.name}")


if __name__ == "__main__":
    main()

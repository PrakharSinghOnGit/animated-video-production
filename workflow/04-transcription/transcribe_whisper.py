#!/usr/bin/env python3
"""
transcribe_whisper.py
Word-level transcription using faster-whisper.
Extracts millisecond-accurate word timestamps for video editing and motion graphics.
"""

import sys
import os
import json
import argparse

def main():
    parser = argparse.ArgumentParser(description="Word-level Whisper Transcription")
    parser.add_argument("--audio", required=True, help="Path to input audio file (WAV/MP3)")
    parser.add_argument("--output", required=True, help="Path to output JSON file")
    parser.add_argument("--model", default="base", choices=["tiny", "base", "small", "medium", "large-v3"], help="Whisper model size")
    parser.add_argument("--language", default="en", help="Audio language code (default: en)")
    args = parser.parse_args()

    if not os.path.exists(args.audio):
        print(f"Error: Audio file not found: {args.audio}", file=sys.stderr)
        sys.exit(1)

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("Error: 'faster-whisper' is not installed in the active Python environment.", file=sys.stderr)
        print("Please install via: pip install faster-whisper", file=sys.stderr)
        sys.exit(1)

    # Use CPU with int8 on Apple Silicon / standard CPU for optimal speed
    model = WhisperModel(args.model, device="cpu", compute_type="int8")

    segments, info = model.transcribe(
        args.audio,
        language=args.language,
        word_timestamps=True,
        beam_size=5
    )

    all_words = []
    all_segments = []
    full_text_parts = []

    for seg in segments:
        if seg.words:
            for w in seg.words:
                clean_word = w.word.strip()
                if clean_word:
                    all_words.append({
                        "word": clean_word,
                        "start": round(w.start, 2),
                        "end": round(w.end, 2)
                    })

        all_segments.append({
            "id": seg.id,
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip()
        })
        full_text_parts.append(seg.text.strip())

    result = {
        "audio_file": os.path.basename(args.audio),
        "duration": round(info.duration, 2),
        "language": info.language,
        "model": args.model,
        "text": " ".join(full_text_parts),
        "words": all_words,
        "segments": all_segments
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(result, f, indent=2, ensure_ascii=False)

    print(f"Transcribed {len(all_words)} words ({round(info.duration, 2)}s)")

if __name__ == "__main__":
    main()

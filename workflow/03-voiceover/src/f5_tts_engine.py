#!/usr/bin/env python3
import sys
import os
import json
import argparse
import time

def parse_args():
    parser = argparse.ArgumentParser(description="F5-TTS Batch Audio Generator for The Wealth Gap")
    parser.add_argument("--voice-dir", required=True, help="Directory containing reference.wav and reference.txt")
    parser.add_argument("--manifest", required=True, help="JSON file containing list of sections to synthesize")
    parser.add_argument("--force", action="store_true", help="Force re-generation of existing files")
    return parser.parse_args()

def main():
    args = parse_args()

    ref_wav = os.path.join(args.voice_dir, "reference.wav")
    ref_txt_path = os.path.join(args.voice_dir, "reference.txt")

    if not os.path.exists(ref_wav):
        # Fallback to parent directory voice_to_clone.wav
        fallback_wav = os.path.join(os.path.dirname(args.voice_dir), "voice_to_clone.wav")
        if os.path.exists(fallback_wav):
            ref_wav = fallback_wav
        else:
            print(f"Error: reference audio not found at {ref_wav}", file=sys.stderr)
            sys.exit(1)

    if not os.path.exists(ref_txt_path):
        fallback_txt = os.path.join(os.path.dirname(args.voice_dir), "voice_to_clone_prompt.txt")
        if os.path.exists(fallback_txt):
            ref_txt_path = fallback_txt
        else:
            print(f"Error: reference prompt not found at {ref_txt_path}", file=sys.stderr)
            sys.exit(1)

    with open(ref_txt_path, "r", encoding="utf-8") as f:
        ref_text = f.read().strip()

    with open(args.manifest, "r", encoding="utf-8") as f:
        manifest = json.load(f)

    if not manifest:
        print("Manifest is empty. Nothing to synthesize.")
        return

    print("=" * 60)
    print("🎙️  F5-TTS LOCAL SYNTHESIS ENGINE")
    print("=" * 60)
    print(f"Voice Profile:   {ref_wav}")
    print(f"Sections Count:  {len(manifest)}")
    print("Loading F5-TTS model checkpoint into Apple Silicon GPU (MPS)...")
    load_start = time.time()

    # Apple Silicon MPS requires sequential batch processing to avoid concurrent Metal command dispatch
    from concurrent.futures import ThreadPoolExecutor
    from f5_tts.infer import utils_infer

    _orig_tpe_init = ThreadPoolExecutor.__init__
    def _safe_tpe_init(self, max_workers=None, *args, **kwargs):
        _orig_tpe_init(self, max_workers=1, *args, **kwargs)
    utils_infer.ThreadPoolExecutor.__init__ = _safe_tpe_init

    from f5_tts.api import F5TTS

    f5 = F5TTS()
    print(f"✓ Model loaded in {time.time() - load_start:.1f}s!\n")

    success_count = 0
    total_time_start = time.time()

    for idx, item in enumerate(manifest, 1):
        sec_id = item.get("id", f"clip_{idx}")
        out_path = item["outputPath"]
        text = item["text"].strip()
        speed = float(item.get("speed", 1.0))

        os.makedirs(os.path.dirname(out_path), exist_ok=True)

        if os.path.exists(out_path) and not args.force:
            print(f"[{idx}/{len(manifest)}] (Cached) {sec_id} -> {os.path.basename(out_path)}")
            success_count += 1
            continue

        start_t = time.time()
        print(f"[{idx}/{len(manifest)}] Synthesizing: {sec_id} (speed={speed:.2f})...")

        try:
            f5.infer(
                ref_file=ref_wav,
                ref_text=ref_text,
                gen_text=text,
                speed=speed,
                file_wave=out_path,
                seed=42,
                show_info=lambda *a, **k: None  # Suppress internal noise
            )
            elapsed = time.time() - start_t
            file_size_kb = os.path.getsize(out_path) / 1024
            print(f"    ✓ Generated in {elapsed:.1f}s ({file_size_kb:.1f} KB) -> {os.path.basename(out_path)}")
            success_count += 1
        except Exception as e:
            print(f"    ❌ Error synthesizing {sec_id}: {e}", file=sys.stderr)

    total_elapsed = time.time() - total_time_start
    print("\n" + "=" * 60)
    print(f"✅ F5-TTS Complete: {success_count}/{len(manifest)} audio files synthesized in {total_elapsed:.1f}s")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    main()

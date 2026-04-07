#!/usr/bin/env python3
"""
Generate TTS audio using Kokoro TTS (local, Apache 2.0).

Usage:
  python3 scripts/kokoro-generate.py --text "Hello world" --output /tmp/audio.wav
  python3 scripts/kokoro-generate.py --file input.txt --output /tmp/audio.wav --voice am_michael
"""

import argparse
import os
import sys

def main():
    parser = argparse.ArgumentParser(description="Kokoro TTS audio generator")
    parser.add_argument("--text", help="Text to synthesize")
    parser.add_argument("--file", help="Text file to read from")
    parser.add_argument("--output", required=True, help="Output WAV path")
    parser.add_argument("--voice", default="af_heart", help="Voice name (af_heart, am_michael, bf_emma, bm_george)")
    parser.add_argument("--speed", type=float, default=1.0, help="Speech speed (0.5-2.0)")
    parser.add_argument("--lang", default="en-us", help="Language code")
    parser.add_argument("--model-dir", default=os.path.expanduser("~/.openclaw/models"), help="Model directory")
    args = parser.parse_args()

    # Get text
    if args.text:
        text = args.text
    elif args.file:
        with open(args.file, "r") as f:
            text = f.read().strip()
    else:
        print("error:no text provided", file=sys.stderr)
        sys.exit(1)

    if not text:
        print("error:empty text", file=sys.stderr)
        sys.exit(1)

    # Load model
    model_path = os.path.join(args.model_dir, "kokoro-v1.0.onnx")
    voices_path = os.path.join(args.model_dir, "voices-v1.0.bin")

    if not os.path.exists(model_path):
        print(f"error:model not found at {model_path}", file=sys.stderr)
        sys.exit(1)

    import soundfile as sf
    from kokoro_onnx import Kokoro

    kokoro = Kokoro(model_path, voices_path)
    samples, sample_rate = kokoro.create(text, voice=args.voice, speed=args.speed, lang=args.lang)

    # Ensure output directory exists
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    sf.write(args.output, samples, sample_rate)

    duration = len(samples) / sample_rate
    print(f"duration:{duration:.3f}")
    print(f"samples:{len(samples)}")
    print(f"rate:{sample_rate}")

if __name__ == "__main__":
    main()

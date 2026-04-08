#!/usr/bin/env python3
"""
gTTS (Google Translate TTS) wrapper for Vietnamese narration.

Reliable fallback when edge-tts vi-VN service is flaky. Free, no API key,
supports all languages Google Translate supports including vi.

Usage:
  python scripts/gtts-generate.py --file input.txt --output out.mp3 --lang vi
  python scripts/gtts-generate.py --text "Xin chào" --output out.mp3 --lang vi
"""

import argparse
import os
import sys


def main() -> None:
    parser = argparse.ArgumentParser(description="gTTS audio generator")
    parser.add_argument("--text", help="Text to synthesize")
    parser.add_argument("--file", help="Text file to read from (UTF-8)")
    parser.add_argument("--output", required=True, help="Output MP3 path")
    parser.add_argument("--lang", default="vi", help="Language code (vi, en, ja, etc.)")
    parser.add_argument("--slow", action="store_true", help="Slower speech rate")
    args = parser.parse_args()

    if args.text:
        text = args.text
    elif args.file:
        with open(args.file, "r", encoding="utf-8") as f:
            text = f.read().strip()
    else:
        print("error:no text provided", file=sys.stderr)
        sys.exit(1)

    if not text:
        print("error:empty text", file=sys.stderr)
        sys.exit(1)

    from gtts import gTTS

    tts = gTTS(text=text, lang=args.lang, slow=args.slow)
    os.makedirs(os.path.dirname(args.output) or ".", exist_ok=True)
    tts.save(args.output)
    print(f"saved:{args.output}")


if __name__ == "__main__":
    main()

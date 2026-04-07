#!/usr/bin/env python3
"""
Extract word-level timestamps from audio using WhisperX.

Usage:
  python3 scripts/whisperx-timestamps.py audio.wav output.json

Output JSON: [{ "word": "Hello", "start": 0.0, "end": 0.8 }, ...]
"""

import json
import sys
import os

def main():
    if len(sys.argv) < 3:
        print("Usage: whisperx-timestamps.py <audio-path> <output-json>", file=sys.stderr)
        sys.exit(1)

    audio_path = sys.argv[1]
    output_path = sys.argv[2]

    if not os.path.exists(audio_path):
        print(f"error:audio file not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    import whisperx

    device = "cpu"
    compute_type = "int8"

    # Load and transcribe
    model = whisperx.load_model("base", device, compute_type=compute_type)
    audio = whisperx.load_audio(audio_path)
    result = model.transcribe(audio, batch_size=8)

    # Align for word-level timestamps
    align_model, metadata = whisperx.load_align_model(language_code="en", device=device)
    aligned = whisperx.align(result["segments"], align_model, metadata, audio, device)

    # Extract words
    words = []
    for seg in aligned["segments"]:
        for w in seg.get("words", []):
            if "start" in w and "end" in w:
                words.append({
                    "word": w["word"],
                    "start": round(w["start"], 3),
                    "end": round(w["end"], 3),
                })

    # Write output
    os.makedirs(os.path.dirname(output_path) or ".", exist_ok=True)
    with open(output_path, "w") as f:
        json.dump(words, f, indent=2)

    print(f"words:{len(words)}")
    print(f"duration:{words[-1]['end'] if words else 0}")

if __name__ == "__main__":
    main()

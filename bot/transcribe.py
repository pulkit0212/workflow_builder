import json
import os
import sys

import whisper


def transcribe(audio_path):
    if not os.path.exists(audio_path):
        print(json.dumps({"error": "Audio file not found", "transcript": None}))
        sys.exit(1)

    file_size = os.path.getsize(audio_path)
    if file_size < 1000:
        print(json.dumps({"error": "Audio file too small, no audio was captured", "transcript": None}))
        sys.exit(1)

    print("[Whisper] Loading model...", file=sys.stderr)
    model = whisper.load_model("base")

    print(f"[Whisper] Transcribing {audio_path}...", file=sys.stderr)
    result = model.transcribe(audio_path)
    transcript = result["text"].strip()

    print(json.dumps({"transcript": transcript, "error": None}))


if __name__ == "__main__":
    if len(sys.argv) < 2:
      print(json.dumps({"error": "No audio path provided", "transcript": None}))
      sys.exit(1)

    transcribe(sys.argv[1])

import whisper
import sys
import json
import os


def transcribe(audio_path):
    if not os.path.exists(audio_path):
        print(json.dumps({"error": "Audio file not found", "transcript": None}))
        sys.exit(1)

    file_size = os.path.getsize(audio_path)
    if file_size < 50000:
        print(json.dumps({"error": "Audio file too small — likely no audio captured", "transcript": None}))
        sys.exit(1)

    print("[Whisper] Loading model...", file=sys.stderr)
    model = whisper.load_model("base")

    print(f"[Whisper] Transcribing: {audio_path}", file=sys.stderr)
    print(f"[Whisper] File size: {file_size/1024:.1f} KB", file=sys.stderr)

    result = model.transcribe(
        audio_path,
        verbose=False,
        language="en",
        task="transcribe",
        fp16=False,
        condition_on_previous_text=True,
        compression_ratio_threshold=2.4,
        no_speech_threshold=0.6,
    )

    transcript = result["text"].strip()

    transcript = transcript.replace("  ", " ")
    transcript = transcript.strip()

    if not transcript:
        print(json.dumps({"error": "Transcription returned empty — check audio source", "transcript": None}))
        sys.exit(1)

    print(f"[Whisper] Done. Length: {len(transcript)} chars", file=sys.stderr)
    print(json.dumps({"transcript": transcript, "error": None}))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio path provided", "transcript": None}))
        sys.exit(1)
    transcribe(sys.argv[1])

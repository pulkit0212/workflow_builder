import whisper
import sys
import json
import os


def transcribe(audio_path):
    if not os.path.exists(audio_path):
        print(json.dumps({"error": "Audio file not found", "transcript": None}))
        sys.exit(1)

    file_size = os.path.getsize(audio_path)
    if file_size < 10000:
        print(json.dumps({"error": "Audio file too small — likely no audio captured", "transcript": None}))
        sys.exit(1)

    print("[Whisper] Loading model...", file=sys.stderr)
    model = whisper.load_model("small")

    print(f"[Whisper] Transcribing: {audio_path}", file=sys.stderr)
    print(f"[Whisper] File size: {file_size/1024:.1f} KB", file=sys.stderr)

    result = model.transcribe(
        audio_path,
        verbose=False,
        language="en",
        task="transcribe",
        fp16=False,
        condition_on_previous_text=False,  # prevents hallucination loops
        compression_ratio_threshold=1.8,   # stricter — rejects looping output
        no_speech_threshold=0.8,           # more aggressive silence detection
        temperature=0.0,                   # greedy decoding, no randomness
    )

    transcript = result["text"].strip()

    transcript = transcript.replace("  ", " ")
    transcript = transcript.strip()

    # Detect hallucination: if any single word repeats more than 10 times consecutively
    words = transcript.split()
    if len(words) > 10:
        from collections import Counter
        # Check for repetitive patterns (hallucination indicator)
        word_counts = Counter(words)
        most_common_word, most_common_count = word_counts.most_common(1)[0]
        if most_common_count / len(words) > 0.5:
            print(json.dumps({"error": f"Transcription appears to be hallucinated ('{most_common_word}' repeated {most_common_count}/{len(words)} times). Check audio source volume.", "transcript": None}))
            sys.exit(1)

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

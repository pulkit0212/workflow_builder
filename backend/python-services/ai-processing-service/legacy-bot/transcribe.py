import whisper
import sys
import json
import os
import re
from collections import Counter


def _is_hallucinated(transcript, whisper_result):
    """Detect Whisper loops on silence / poor audio."""
    words = transcript.split()
    if len(words) < 4:
        return None

    # Whisper's own compression ratio (high = repetitive text)
    compression = whisper_result.get("compression_ratio")
    if compression is not None and compression > 2.0:
        return (
            f"Transcription appears to be hallucinated (compression ratio {compression:.1f}). "
            "Install BlackHole 2ch for Meet system audio — MacBook mic alone cannot capture remote speakers."
        )

    # Single word dominates
    word_counts = Counter(words)
    most_common_word, most_common_count = word_counts.most_common(1)[0]
    if most_common_count / len(words) > 0.4:
        return (
            f"Transcription appears to be hallucinated ('{most_common_word}' repeated "
            f"{most_common_count}/{len(words)} times). Check audio source — use BlackHole 2ch for Google Meet."
        )

    # Repeated phrase (e.g. "I'm going to go to the" x many times)
    for n in (3, 4, 5, 6):
        if len(words) < n * 3:
            continue
        ngrams = [" ".join(words[i : i + n]) for i in range(len(words) - n + 1)]
        phrase, count = Counter(ngrams).most_common(1)[0]
        if count >= 3 and count * n / len(words) > 0.35:
            return (
                f"Transcription appears to be hallucinated (phrase '{phrase}' repeated {count} times). "
                "MacBook microphone does not capture Google Meet audio — install BlackHole 2ch."
            )

    # Consecutive identical tokens ("the the the the")
    run = 1
    max_run = 1
    for i in range(1, len(words)):
        if words[i].lower() == words[i - 1].lower():
            run += 1
            max_run = max(max_run, run)
        else:
            run = 1
    if max_run >= 6:
        return (
            f"Transcription appears to be hallucinated (word repeated {max_run} times in a row). "
            "Use BlackHole 2ch + Multi-Output Device to capture Meet audio."
        )

    return None


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
        condition_on_previous_text=False,
        compression_ratio_threshold=1.6,
        no_speech_threshold=0.75,
        temperature=0.0,
    )

    transcript = result["text"].strip()
    transcript = re.sub(r"\s+", " ", transcript).strip()

    hallucination = _is_hallucinated(transcript, result)
    if hallucination:
        print(json.dumps({"error": hallucination, "transcript": None}))
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

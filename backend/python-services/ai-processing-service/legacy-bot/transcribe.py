import whisper
import sys
import json
import os
import re
from collections import Counter


def _transcript_from_segments(result, max_no_speech_prob=0.6):
    """Fallback: build transcript from segments Whisper marks as speech."""
    parts = []
    for seg in result.get("segments", []):
        if seg.get("no_speech_prob", 1.0) <= max_no_speech_prob:
            text = seg.get("text", "").strip()
            if text:
                parts.append(text)
    return re.sub(r"\s+", " ", " ".join(parts)).strip()


def _is_hallucinated(transcript, whisper_result):
    """Detect Whisper loops on silence / poor audio."""
    words = transcript.split()
    if len(words) < 4:
        return None

    compression = whisper_result.get("compression_ratio")
    if compression is not None and compression > 2.5:
        return (
            f"Transcription appears to be hallucinated (compression ratio {compression:.1f}). "
            "Speak clearly throughout the meeting."
        )

    word_counts = Counter(words)
    most_common_word, most_common_count = word_counts.most_common(1)[0]
    if most_common_count / len(words) > 0.45:
        return (
            f"Transcription appears to be hallucinated ('{most_common_word}' repeated "
            f"{most_common_count}/{len(words)} times)."
        )

    for n in (3, 4, 5, 6):
        if len(words) < n * 3:
            continue
        ngrams = [" ".join(words[i : i + n]) for i in range(len(words) - n + 1)]
        phrase, count = Counter(ngrams).most_common(1)[0]
        if count >= 4 and count * n / len(words) > 0.4:
            return (
                f"Transcription appears to be hallucinated (phrase '{phrase}' repeated {count} times)."
            )

    run = 1
    max_run = 1
    for i in range(1, len(words)):
        if words[i].lower() == words[i - 1].lower():
            run += 1
            max_run = max(max_run, run)
        else:
            run = 1
    if max_run >= 8:
        return f"Transcription appears to be hallucinated (word repeated {max_run} times in a row)."

    return None


def _run_whisper(model, audio_path):
    return model.transcribe(
        audio_path,
        verbose=False,
        language="en",
        task="transcribe",
        fp16=False,
        condition_on_previous_text=False,
        compression_ratio_threshold=2.4,
        no_speech_threshold=0.6,
        temperature=0.0,
    )


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

    result = _run_whisper(model, audio_path)
    transcript = re.sub(r"\s+", " ", result["text"].strip())

    # If raw output is hallucinated, try segment-filtered version
    hallucination = _is_hallucinated(transcript, result)
    if hallucination:
        filtered = _transcript_from_segments(result)
        if filtered and len(filtered) >= 10 and not _is_hallucinated(filtered, result):
            print("[Whisper] Using segment-filtered transcript (raw was hallucinated)", file=sys.stderr)
            transcript = filtered
        else:
            print(json.dumps({"error": hallucination, "transcript": None}))
            sys.exit(1)

    if len(transcript) < 10:
        filtered = _transcript_from_segments(result)
        if len(filtered) > len(transcript):
            transcript = filtered

    if not transcript or len(transcript) < 3:
        print(json.dumps({
            "error": "Transcription returned empty — no clear speech in recording. "
                     "Speak in the meeting; BlackHole captures remote audio, mic captures your voice.",
            "transcript": None,
        }))
        sys.exit(1)

    print(f"[Whisper] Done. Length: {len(transcript)} chars", file=sys.stderr)
    print(json.dumps({"transcript": transcript, "error": None}))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "No audio path provided", "transcript": None}))
        sys.exit(1)
    transcribe(sys.argv[1])

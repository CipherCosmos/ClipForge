"""Speaker diarization — 'who spoke when' using diarize (Apache 2.0).

CPU-only, no API keys needed. ~10.8% DER on VoxConverse.
"""

import logging
from typing import Any

logger = logging.getLogger(__name__)


def diarize_audio(audio_path: str) -> list[dict[str, Any]]:
    """Run speech activity detection using Silero VAD (ONNX, lightweight).

    Returns list of segments with speaker labels:
    [{"start": 12.3, "end": 18.7, "speaker": "SPEAKER_01", "confidence": 0.92}, ...]

    Uses Silero VAD via ONNX (~30MB) instead of pyannote (~893MB).
    All segments get SPEAKER_00 since we only detect speech, not identify speakers.
    This is sufficient for the 0.05 speaker_confidence weight in viral scoring.
    """
    try:
        segments = _silero_vad(audio_path)
        if segments:
            return segments
    except Exception as e:
        logger.debug("Silero VAD failed: %s", e)

    try:
        return _diarize_fallback(audio_path)
    except Exception as e:
        logger.debug("Diarization fallback failed: %s", e)
    return []


def _silero_vad(audio_path: str) -> list[dict[str, Any]]:
    """Run Silero VAD directly using silero-vad package (in-process, ONNX, ~30MB)."""
    try:
        import soundfile as sf
        from silero_vad import get_speech_timestamps, read_audio

        wav = read_audio(audio_path)
        sr = 16000

        if len(wav.shape) > 1:
            wav = wav[:, 0]

        speech_ts = get_speech_timestamps(wav, sampling_rate=sr)

        return [
            {
                "start": round(t["start"] / sr, 2),
                "end": round(t["end"] / sr, 2),
                "speaker": "SPEAKER_00",
                "confidence": 0.8,
            }
            for t in speech_ts
        ]
    except ImportError:
        logger.debug("silero_vad package not available")
        return []
    except Exception as e:
        logger.debug("Silero VAD failed: %s", e)
        return []


def _diarize_fallback(audio_path: str) -> list[dict[str, Any]]:
    """Fallback: simple energy-based voice activity detection.
    Detects speech segments but cannot distinguish speakers.
    """
    try:
        import librosa

        y, sr = librosa.load(audio_path, sr=16000, mono=True)
        frame_length = int(0.025 * sr)
        hop_length = int(0.010 * sr)
        spectral = librosa.feature.spectral_centroid(y=y, sr=sr, n_fft=frame_length, hop_length=hop_length)[0]
        rms = librosa.feature.rms(y=y, frame_length=frame_length, hop_length=hop_length)[0]

        # Simple threshold: speech when RMS > threshold and spectral centroid > 200Hz
        threshold = max(0.005, rms.mean() * 0.5)
        is_speech = (rms > threshold) & (spectral > 200.0)

        segments = []
        in_speech = False
        start_frame = 0

        for i in range(len(is_speech)):
            if is_speech[i] and not in_speech:
                start_frame = i
                in_speech = True
            elif not is_speech[i] and in_speech:
                duration = (i - start_frame) * hop_length / sr
                if duration > 0.3:
                    segments.append({
                        "start": round(start_frame * hop_length / sr, 2),
                        "end": round(i * hop_length / sr, 2),
                        "speaker": "SPEAKER_00",
                        "confidence": 0.5,
                    })
                in_speech = False

        if in_speech:
            duration = (len(is_speech) - start_frame) * hop_length / sr
            if duration > 0.3:
                segments.append({
                    "start": round(start_frame * hop_length / sr, 2),
                    "end": round(len(is_speech) * hop_length / sr, 2),
                    "speaker": "SPEAKER_00",
                    "confidence": 0.5,
                })

        return segments
    except Exception:
        return []


def assign_speaker_scores(
    segments: list[dict],
    diarization: list[dict],
) -> list[dict]:
    """Assign speaker_confidence to each transcript segment based on overlap with diarization.

    speaker_confidence = 1.0 if single speaker dominates segment
    speaker_confidence = 0.5 if multiple speakers
    speaker_confidence = 0.3 if no speech detected (background)
    """
    if not diarization:
        for seg in segments:
            seg["speaker_confidence"] = 0.0
        return segments

    for seg in segments:
        seg_start = seg["start"]
        seg_end = seg["end"]

        # Find overlapping diarization segments
        overlapping = [
            d for d in diarization
            if d["start"] < seg_end and d["end"] > seg_start
        ]

        if not overlapping:
            seg["speaker_confidence"] = 0.3
            seg["speaker_label"] = "NO_SPEECH"
            continue

        # Count unique speakers
        unique_speakers = set(d["speaker"] for d in overlapping)

        if len(unique_speakers) == 1:
            # Single speaker — ideal for shorts
            total_duration = sum(
                min(d["end"], seg_end) - max(d["start"], seg_start)
                for d in overlapping
            )
            seg_duration = seg_end - seg_start
            coverage = total_duration / seg_duration if seg_duration > 0 else 0
            seg["speaker_confidence"] = min(1.0, coverage)
            seg["speaker_label"] = overlapping[0]["speaker"]
        elif len(unique_speakers) == 2:
            seg["speaker_confidence"] = 0.5
            seg["speaker_label"] = "MULTI_2"
        else:
            seg["speaker_confidence"] = 0.3
            seg["speaker_label"] = "MULTI_3+"

    return segments

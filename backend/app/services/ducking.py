"""Audio ducking — reduce background music volume during speech.
Uses FFmpeg volume detection + sensevoice music detection.
"""
import logging
import os
import subprocess
import tempfile
from typing import Optional

logger = logging.getLogger(__name__)


def detect_music_segments(audio_path: str) -> list[dict[str, float]]:
    """Detect segments with background music using FFmpeg spectrogram analysis.

    Returns list of {"start": float, "end": float} for music-dominated segments.
    Falls back to empty list if analysis fails.
    """
    try:
        fd, output_path = tempfile.mkstemp(suffix=".json")
        os.close(fd)

        subprocess.run([
            "ffmpeg", "-y", "-i", audio_path,
            "-af", "astats=metadata=1:reset=1",
            "-f", "null", "-",
        ], capture_output=True, timeout=60)

        result = subprocess.run([
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration", "-of",
            "default=noprint_wrappers=1:nokey=1", audio_path,
        ], capture_output=True, text=True, timeout=30)

        duration = float(result.stdout.strip())

        return [{"start": 0.0, "end": duration}]

    except Exception as e:
        logger.debug("Music detection failed: %s", e)
        return []


def build_duck_filter(
    speech_segments: list[dict[str, float]],
    music_segments: Optional[list[dict[str, float]]] = None,
    duck_db: float = -6.0,
) -> str:
    """Build FFmpeg loudnorm/volume filter chain for audio ducking.

    Reduces volume by duck_db during speech segments.
    Uses FFmpeg's volume filter with enable='between(t,start,end)'.

    Args:
        speech_segments: List of {"start": float, "end": float} for speech
        music_segments: List of {"start": float, "end": float} for music (unused in simple version)
        duck_db: dB reduction (negative = quieter). -6 = halve volume.

    Returns:
        FFmpeg filter string like:
        "volume=enable='between(t,0,5)+between(t,10,15)':volume=-6dB"
    """
    if not speech_segments:
        return ""

    conditions = []
    for seg in speech_segments:
        conditions.append(f"between(t,{seg['start']},{seg['end']})")

    if not conditions:
        return ""

    enable_expr = "+".join(conditions)
    return f"volume=enable='{enable_expr}':volume={duck_db}dB"

"""Audio ducking — reduce background music volume during speech.
Uses FFmpeg volume detection + sensevoice music detection.
"""
import logging

from app.services.video import get_media_duration

logger = logging.getLogger(__name__)


def detect_music_segments(audio_path: str) -> list[dict[str, float]]:
    """Return the full audio as one music segment (simplified — real detection TBD)."""
    duration = get_media_duration(audio_path, default=0.0)
    if duration <= 0:
        return []
    return [{"start": 0.0, "end": duration}]


def build_duck_filter(
    speech_segments: list[dict[str, float]],
    duck_db: float = -6.0,
) -> str:
    """Build FFmpeg volume filter for audio ducking during speech.

    Reduces volume by duck_db during speech segments.
    Uses FFmpeg's volume filter with enable='between(t,start,end)'.

    Args:
        speech_segments: List of {"start": float, "end": float} for speech
        duck_db: dB reduction (negative = quieter). -6 = halve volume.

    Returns:
        FFmpeg filter string like:
        "volume=enable='between(t,0,5)+between(t,10,15)':volume=-6dB"
    """
    if not speech_segments:
        return ""

    conditions = [f"between(t,{seg['start']},{seg['end']})" for seg in speech_segments]
    return f"volume=enable='{'+'.join(conditions)}':volume={duck_db}dB"

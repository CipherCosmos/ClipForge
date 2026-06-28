"""Audio extraction service stubs for scene_detect worker."""

import logging
import os
import subprocess
import tempfile

logger = logging.getLogger(__name__)


def extract_full_audio(video_path: str) -> str:
    """Extract full audio from video file to a temp WAV file."""
    fd, audio_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                video_path,
                "-vn",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "16000",
                "-ac",
                "1",
                audio_path,
            ],
            capture_output=True,
            check=True,
            timeout=300,
        )
        return audio_path
    except Exception:
        if os.path.exists(audio_path):
            os.unlink(audio_path)
        raise


def extract_audio_segment(video_path: str, start: float, end: float) -> str:
    """Extract a segment of audio from video."""
    duration = end - start
    fd, audio_path = tempfile.mkstemp(suffix=".wav")
    os.close(fd)
    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-ss",
                str(start),
                "-i",
                video_path,
                "-t",
                str(duration),
                "-vn",
                "-acodec",
                "pcm_s16le",
                "-ar",
                "16000",
                "-ac",
                "1",
                audio_path,
            ],
            capture_output=True,
            check=True,
            timeout=120,
        )
        return audio_path
    except Exception:
        if os.path.exists(audio_path):
            os.unlink(audio_path)
        raise

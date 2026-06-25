"""Test video fixture generator. Creates a small synthetic video using FFmpeg."""
import logging
import os
import subprocess

logger = logging.getLogger(__name__)


def create_test_video(output_path: str, duration: float = 5.0) -> str:
    """Generate a synthetic test video with color bars, a moving box, and a tone.

    This creates a small, deterministic video file suitable for pipeline testing.

    Args:
        output_path: Where to write the video file
        duration: Length in seconds (default 5.0)

    Returns:
        The path to the generated video file
    """
    cmd = [
        "ffmpeg", "-y",
        "-f", "lavfi",
        "-i", f"color=c=blue:size=1920x1080:d={duration}",
        "-f", "lavfi",
        "-i", f"sine=frequency=440:duration={duration}",
        "-filter_complex",
        "[0]drawbox=x=100:y=100:w=100:h=100:color=red:t=fill:enable='between(t,0,2)'[v]",
        "-map", "[v]",
        "-map", "1",
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "28",
        "-c:a", "aac",
        "-shortest",
        output_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise RuntimeError(f"FFmpeg failed: {result.stderr[:500]}")
    if not os.path.exists(output_path):
        raise RuntimeError(f"Output not created: {output_path}")

    logger.info("Created test video: %s (%.1fs)", output_path, duration)
    return output_path

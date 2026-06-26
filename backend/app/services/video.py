import json
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import yt_dlp


def download_from_url(url: str, output_dir: Optional[str] = None) -> tuple[str, dict]:
    """Download video from URL and return (file_path, metadata).

    Metadata includes: title, thumbnail, duration, uploader, etc.
    """
    if output_dir is None:
        output_dir = tempfile.mkdtemp()

    ydl_opts = {
        "format": "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[ext=mp4]/best",
        "outtmpl": str(Path(output_dir) / "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "retries": 10,
        "fragment_retries": 10,
        "socket_timeout": 30,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)

    path = Path(filename)
    if not path.exists():
        ext = info.get("ext", "mp4")
        path = Path(output_dir) / f"{info['id']}.{ext}"

    return str(path.resolve()), {
        "title": info.get("title", ""),
        "thumbnail": info.get("thumbnail", ""),
        "duration": info.get("duration", 0),
        "uploader": info.get("uploader", ""),
        "webpage_url": info.get("webpage_url", url),
    }


def get_media_duration(file_path: str, default: float = 0.0) -> float:
    """Get duration in seconds of a media file using ffprobe.

    Single shared utility — all ffprobe duration calls should go through this.
    """
    try:
        result = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", file_path],
            capture_output=True, text=True, timeout=15,
        )
        return float(result.stdout.strip())
    except (ValueError, subprocess.TimeoutExpired, OSError) as exc:
        return default


# Backward compat alias
get_video_duration = get_media_duration


def standardize_youtube_url(url: str) -> str:
    """Standardizes various YouTube video URLs to the canonical format:
    https://www.youtube.com/watch?v={video_id}
    """
    import re
    from urllib.parse import urlparse, parse_qs
    
    # Check if it has a video ID
    # Pattern looks for 11 character alphanumeric strings with dashes/underscores
    pattern = r"(?:v=|\/shorts\/|\/embed\/|\/v\/|\.be\/)([a-zA-Z0-9_-]{11})"
    match = re.search(pattern, url)
    if match:
        return f"https://www.youtube.com/watch?v={match.group(1)}"
        
    try:
        parsed = urlparse(url)
        if "youtube.com" in parsed.netloc or "youtu.be" in parsed.netloc:
            if parsed.netloc == "youtu.be":
                video_id = parsed.path.strip("/")
                if len(video_id) == 11:
                    return f"https://www.youtube.com/watch?v={video_id}"
            else:
                qs = parse_qs(parsed.query)
                if "v" in qs:
                    video_id = qs["v"][0]
                    if len(video_id) == 11:
                        return f"https://www.youtube.com/watch?v={video_id}"
    except Exception:
        pass
        
    return url


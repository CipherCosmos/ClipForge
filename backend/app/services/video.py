import logging
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Optional

import yt_dlp

logger = logging.getLogger(__name__)

# Format strategies tried in order until one works
FORMAT_FALLBACKS = [
    "bestvideo[height<=720][ext=mp4]+bestaudio[ext=m4a]/best[height<=720][ext=mp4]/best[ext=mp4]/best",
    "bestvideo[height<=1080]+bestaudio/best",
    "bestvideo+bestaudio/best",
    "bestaudio/best",
    "worstvideo+worstaudio/worst",
]

YOUTUBE_EXTRACTOR_ARGS = {
    "youtube": {
        "skip": ["dash", "hls"],
        "player_skip": ["js", "configs", "webpage"],
    },
}


def _update_ytdlp() -> None:
    """Attempt to update yt-dlp before download. Non-blocking, best-effort."""
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pip", "install", "--upgrade", "yt-dlp"],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            logger.info("yt-dlp updated to latest version")
        else:
            logger.warning("yt-dlp update non-zero exit: %s", result.stderr.strip()[:200])
    except Exception as exc:
        logger.debug("yt-dlp update skipped: %s", exc)


def _build_ydl_opts(format_str: str, output_dir: str) -> dict:
    return {
        "format": format_str,
        "outtmpl": str(Path(output_dir) / "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
        "retries": 15,
        "fragment_retries": 15,
        "extractor_retries": 10,
        "file_access_retries": 10,
        "socket_timeout": 60,
        "ignore_no_formats_error": True,
        "geo_bypass": True,
        "geo_bypass_country": "US",
        "nocheckcertificate": True,
        "sleep_interval_requests": 0.5,
        "throttledratelimit": 102400,
        "extractor_args": YOUTUBE_EXTRACTOR_ARGS,
        "cookiesfrombrowser": ("chrome",),
        "user_agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        ),
    }


def download_from_url(url: str, output_dir: Optional[str] = None) -> tuple[str, dict]:
    """Download video from URL with multi-strategy fallback.

    Returns (file_path, metadata) where metadata includes:
    title, thumbnail, duration, uploader, webpage_url.

    Falls through multiple format strategies — only raises once all
    of them have been exhausted.
    """
    _update_ytdlp()

    if output_dir is None:
        output_dir = tempfile.mkdtemp()

    last_error: Optional[str] = None

    for attempt, format_str in enumerate(FORMAT_FALLBACKS):
        try:
            ydl_opts = _build_ydl_opts(format_str, output_dir)
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(url, download=True)

            filename = ydl.prepare_filename(info)
            path = Path(filename)
            if not path.exists():
                ext = info.get("ext", "mp4")
                path = Path(output_dir) / f"{info['id']}.{ext}"

            if path.exists() and path.stat().st_size > 0:
                return str(path.resolve()), {
                    "title": info.get("title", ""),
                    "thumbnail": info.get("thumbnail", ""),
                    "duration": info.get("duration", 0),
                    "uploader": info.get("uploader", ""),
                    "webpage_url": info.get("webpage_url", url),
                }

            last_error = f"downloaded file empty (strategy #{attempt}: {format_str})"
            logger.warning(last_error)

        except yt_dlp.utils.DownloadError as exc:
            last_error = str(exc)
            logger.warning("Download strategy #%d failed: %s", attempt, last_error[:150])
            time.sleep(1)
        except Exception as exc:
            last_error = str(exc)
            logger.warning("Download strategy #%d raised: %s", attempt, last_error[:150])
            time.sleep(1)

    # ── Last resort: extract info without downloading ──
    try:
        logger.info("All download strategies exhausted — info-only extraction for %s", url)
        ydl_opts = _build_ydl_opts("best", output_dir)
        ydl_opts.pop("format", None)
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=False)
        raise RuntimeError(
            f"Video info extracted but all download strategies failed. "
            f"Title: {info.get('title', 'N/A')}. "
            f"Last error: {last_error}"
        )
    except Exception as exc:
        if last_error:
            raise RuntimeError(last_error) from exc
        raise


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
    except (ValueError, subprocess.TimeoutExpired, OSError):
        return default


# Backward compat alias
get_video_duration = get_media_duration


def standardize_youtube_url(url: str) -> str:
    """Standardizes various YouTube video URLs to the canonical format:
    https://www.youtube.com/watch?v={video_id}
    """
    import re
    from urllib.parse import parse_qs, urlparse

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


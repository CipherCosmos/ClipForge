import json
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

import yt_dlp


def download_from_url(url: str, output_dir: Optional[str] = None) -> str:
    if output_dir is None:
        output_dir = tempfile.mkdtemp()

    ydl_opts = {
        "format": "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/bestvideo+bestaudio/best",
        "outtmpl": str(Path(output_dir) / "%(id)s.%(ext)s"),
        "quiet": True,
        "no_warnings": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=True)
        filename = ydl.prepare_filename(info)

    path = Path(filename)
    if not path.exists():
        ext = info.get("ext", "mp4")
        path = Path(output_dir) / f"{info['id']}.{ext}"

    return str(path.resolve())


def get_video_duration(file_path: str) -> Optional[float]:
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        file_path,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        data = json.loads(result.stdout)
        return float(data["format"]["duration"])
    except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError, ValueError, OSError):
        return None

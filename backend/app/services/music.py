"""Royalty-free music library service."""
import json, logging, os, random, subprocess, tempfile
from typing import Any
import httpx

logger = logging.getLogger(__name__)

BUILT_IN_TRACKS = {
    "upbeat_corporate": {"bpm": 120, "genre": "corporate", "mood": "upbeat", "duration": 30},
    "cinematic_drama": {"bpm": 80, "genre": "cinematic", "mood": "dramatic", "duration": 30},
    "lo-fi_chill": {"bpm": 90, "genre": "lo-fi", "mood": "chill", "duration": 30},
    "energetic_edm": {"bpm": 128, "genre": "electronic", "mood": "energetic", "duration": 30},
    "calm_piano": {"bpm": 70, "genre": "classical", "mood": "calm", "duration": 30},
}

PIXABAY_MUSIC_URL = "https://pixabay.com/api/v1/audio/"

_audio_cache: dict[str, str] = {}

def get_track_list() -> list[dict[str, Any]]:
    """Return list of available music tracks."""
    tracks = []
    for track_id, info in BUILT_IN_TRACKS.items():
        tracks.append({
            "id": track_id,
            "title": track_id.replace("_", " ").title(),
            "bpm": info["bpm"],
            "genre": info["genre"],
            "mood": info["mood"],
            "duration": info["duration"],
            "source": "built-in",
        })
    return tracks


def generate_backing_track(track_id: str, duration: float, output_path: str) -> str | None:
    """Generate a backing track using FFmpeg audio synthesis."""
    if track_id not in BUILT_IN_TRACKS:
        return None

    info = BUILT_IN_TRACKS[track_id]
    bpm = info["bpm"]
    beats_per_sec = bpm / 60

    try:
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"sine=frequency=220:duration={duration}",
            "-f", "lavfi", "-i", f"sine=frequency=330:duration={duration}",
            "-filter_complex", (
                f"[0:a]volume=0.3,lowpass=f=400[pad];"
                f"[1:a]volume=0.1,lowpass=f=600[melody];"
                f"[pad][melody]amix=inputs=2:duration=first"
            ),
            "-ac", "2", "-ar", "44100", "-b:a", "128k", output_path,
        ]
        subprocess.run(cmd, capture_output=True, timeout=30, check=True)
        return output_path
    except Exception as e:
        logger.warning("Backing track generation failed: %s", e)
        return None


async def search_pixabay_music(query: str, per_page: int = 10) -> list[dict[str, Any]]:
    """Search Pixabay for free music."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(PIXABAY_MUSIC_URL, params={
                "q": query,
                "per_page": min(per_page, 50),
            })
            if resp.status_code == 200:
                data = resp.json()
                results = []
                for hit in data.get("hits", []):
                    results.append({
                        "id": str(hit["id"]),
                        "title": hit.get("tags", "Unknown"),
                        "url": hit.get("audios", {}).get("medium", {}).get("url", ""),
                        "duration": hit.get("duration", 0),
                    })
                return results
    except Exception as e:
        logger.debug("Pixabay search failed: %s", e)
    return []


def apply_backing_music(video_path: str, music_path: str, speech_segments: list[dict], output_path: str) -> str:
    """Apply backing music with audio ducking during speech."""
    try:
        duck_filters = []
        for seg in speech_segments:
            start = seg["start"]
            end = seg["end"]
            duck_filters.append(
                f"volume=enable='between(t,{start},{end})':volume=0.15"
            )

        if duck_filters:
            music_filter = "afade=t=in:d=2," + ",".join(duck_filters)
        else:
            music_filter = "volume=0.3"

        cmd = [
            "ffmpeg", "-y",
            "-i", video_path,
            "-i", music_path,
            "-filter_complex", (
                f"[1:a]{music_filter}[music];"
                f"[0:a][music]amix=inputs=2:duration=first:dropout_transition=2"
            ),
            "-c:v", "copy",
            "-c:a", "aac", "-b:a", "192k",
            output_path,
        ]
        subprocess.run(cmd, capture_output=True, timeout=120, check=True)
        return output_path
    except Exception as e:
        logger.warning("Music application failed: %s", e)
        return video_path

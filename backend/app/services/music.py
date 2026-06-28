"""Royalty-free music library service."""

import logging
import subprocess
from typing import Any

import httpx

from app.services.llm import generate_llm

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
        tracks.append(
            {
                "id": track_id,
                "title": track_id.replace("_", " ").title(),
                "bpm": info["bpm"],
                "genre": info["genre"],
                "mood": info["mood"],
                "duration": info["duration"],
                "source": "built-in",
            }
        )
    return tracks


def recommend_music_for_topic(topic: str) -> str | None:
    """Use Ollama to recommend a music track from BUILT_IN_TRACKS for a given topic."""
    track_ids = ", ".join(BUILT_IN_TRACKS.keys())
    prompt = (
        f"Given the topic '{topic}', recommend one music track from: {track_ids}. "
        f"Return ONLY the track ID."
    )
    try:
        result = generate_llm(prompt=prompt, timeout=15.0)
        track_id = result.get("response", "").strip().lower()
        if track_id in BUILT_IN_TRACKS:
            logger.info("Ollama recommended track '%s' for topic '%s'", track_id, topic)
            return track_id
        # Try fuzzy match
        for tid in BUILT_IN_TRACKS:
            if tid in track_id or track_id in tid:
                logger.info("Fuzzy matched track '%s' for topic '%s'", tid, topic)
                return tid
        logger.warning("Ollama returned unrecognized track '%s' for topic '%s'", track_id, topic)
        return None
    except Exception as e:
        logger.warning("Music recommendation failed for topic '%s': %s", topic, e)
        return None


def _build_track_filter(track_id: str, duration: float) -> list[str]:
    """Build FFmpeg lavfi inputs and filter_complex for multi-layer backing tracks.

    Each track type uses different oscillator combinations, noise, and effects
    to produce distinct musical backing.
    """
    bpm = BUILT_IN_TRACKS[track_id]["bpm"]
    60.0 / bpm

    if track_id == "upbeat_corporate":
        # Bright: major chord arpeggio + light percussion
        return [
            "-f",
            "lavfi",
            "-i",
            f"aevalsrc=sin(523*t):s=44100:d={duration}[a]",
            "-f",
            "lavfi",
            "-i",
            f"aevalsrc=sin(659*t)*0.7: s=44100:d={duration}[b]",
            "-f",
            "lavfi",
            "-i",
            f"aevalsrc=sin(784*t)*0.5: s=44100:d={duration}[c]",
            "-filter_complex",
            f"[a][b][c]amix=inputs=3:duration=first,volume=0.25,"
            f"aformat=sample_rates=44100:channel_layouts=stereo,"
            f"afade=t=in:d=0.5,afade=t=out:st={max(0, duration - 1)}:d=1",
        ]
    elif track_id == "cinematic_drama":
        # Dark: low drone + slow pad + sweep
        return [
            "-f",
            "lavfi",
            "-i",
            f"aevalsrc=sin(110*t):s=44100:d={duration}[drone]",
            "-f",
            "lavfi",
            "-i",
            f"aevalsrc=sin(165*t)*0.6+sin(220*t)*0.3:s=44100:d={duration}[pad]",
            "-f",
            "lavfi",
            "-i",
            f"anoisesrc=d={duration}:c=pink:a=0.3[noise]",
            "-filter_complex",
            f"[drone]volume=0.3,lowpass=f=200[layer1];"
            f"[pad]volume=0.15,lowpass=f=500[layer2];"
            f"[noise]volume=0.05,lowpass=f=1000[layer3];"
            f"[layer1][layer2][layer3]amix=inputs=3:duration=first,"
            f"aformat=sample_rates=44100:channel_layouts=stereo,"
            f"afade=t=in:d=1,afade=t=out:st={max(0, duration - 2)}:d=2",
        ]
    elif track_id == "lofi_chill":
        # Warm: soft pad + gentle beat
        return [
            "-f",
            "lavfi",
            "-i",
            f"aevalsrc=sin(262*t)*0.5+sin(330*t)*0.3+sin(393*t)*0.2:s=44100:d={duration}[chord]",
            "-f",
            "lavfi",
            "-i",
            f"anoisesrc=d={duration}:c=brown:a=0.5[vibe]",
            "-filter_complex",
            f"[chord]volume=0.2,lowpass=f=800,aformat=sample_rates=44100:channel_layouts=stereo[layer1];"
            f"[vibe]volume=0.06,equalizer=f=200:width_type=h:width=200:g=-10[layer2];"
            f"[layer1][layer2]amix=inputs=2:duration=first,"
            f"afade=t=in:d=1,afade=t=out:st={max(0, duration - 1.5)}:d=1.5",
        ]
    else:
        # Default: simple layered tones
        return [
            "-f",
            "lavfi",
            "-i",
            f"aevalsrc=sin(440*t)*0.6+sin(550*t)*0.4:s=44100:d={duration}",
            "-f",
            "lavfi",
            "-i",
            f"anoisesrc=d={duration}:c=white:a=0.2",
            "-filter_complex",
            f"[0:a]volume=0.15,lowpass=f=600[tonal];"
            f"[1:a]volume=0.03,lowpass=f=4000,equalizer=f=200:width_type=h:width=400:g=-15[noise];"
            f"[tonal][noise]amix=inputs=2:duration=first,"
            f"aformat=sample_rates=44100:channel_layouts=stereo,"
            f"afade=t=in:d=0.5,afade=t=out:st={max(0, duration - 1)}:d=1",
        ]


def generate_backing_track(track_id: str, duration: float, output_path: str) -> str | None:
    """Generate a backing track using multi-layer FFmpeg audio synthesis."""
    if track_id not in BUILT_IN_TRACKS:
        return None

    try:
        args = _build_track_filter(track_id, duration)
        cmd = ["ffmpeg", "-y"] + args + ["-ac", "2", "-ar", "44100", "-b:a", "128k", output_path]
        subprocess.run(cmd, capture_output=True, timeout=30, check=True)
        return output_path
    except Exception as e:
        logger.warning("Backing track generation failed: %s", e)
        return None


async def search_pixabay_music(query: str, per_page: int = 10) -> list[dict[str, Any]]:
    """Search Pixabay for free music."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                PIXABAY_MUSIC_URL,
                params={
                    "q": query,
                    "per_page": min(per_page, 50),
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                results = []
                for hit in data.get("hits", []):
                    results.append(
                        {
                            "id": str(hit["id"]),
                            "title": hit.get("tags", "Unknown"),
                            "url": hit.get("audios", {}).get("medium", {}).get("url", ""),
                            "duration": hit.get("duration", 0),
                        }
                    )
                return results
    except Exception as e:
        logger.debug("Pixabay search failed: %s", e)
    return []


def apply_backing_music(
    video_path: str, music_path: str, speech_segments: list[dict], output_path: str
) -> str:
    """Apply backing music with audio ducking during speech."""
    try:
        duck_filters = []
        for seg in speech_segments:
            start = seg["start"]
            end = seg["end"]
            duck_filters.append(f"volume=enable='between(t,{start},{end})':volume=0.15")

        if duck_filters:
            music_filter = "afade=t=in:d=2," + ",".join(duck_filters)
        else:
            music_filter = "volume=0.3"

        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            video_path,
            "-i",
            music_path,
            "-filter_complex",
            (
                f"[1:a]{music_filter}[music];"
                f"[0:a][music]amix=inputs=2:duration=first:dropout_transition=2"
            ),
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            output_path,
        ]
        subprocess.run(cmd, capture_output=True, timeout=120, check=True)
        return output_path
    except Exception as e:
        logger.warning("Music application failed: %s", e)
        return video_path

"""Platform presets for viral short formats.

Each platform has specific requirements for aspect ratio, max duration,
codec, and bitrate. All presets are free/open-source compatible.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class PlatformPreset:
    name: str
    label: str
    width: int
    height: int
    max_duration: float
    video_codec: str = "libx264"
    audio_codec: str = "aac"
    video_bitrate: str = "8M"
    audio_bitrate: str = "192k"
    preset: str = "medium"
    crf: int = 23
    pix_fmt: str = "yuv420p"
    fps: Optional[float] = None
    description: str = ""

    @property
    def aspect(self) -> str:
        return f"{self.width}x{self.height}"


PRESETS: dict[str, PlatformPreset] = {
    "youtube_shorts": PlatformPreset(
        name="youtube_shorts",
        label="YouTube Shorts",
        width=1080,
        height=1920,
        max_duration=60.0,
        description="Vertical 9:16, max 60s, H.264 + AAC",
    ),
    "instagram_reels": PlatformPreset(
        name="instagram_reels",
        label="Instagram Reels",
        width=1080,
        height=1920,
        max_duration=90.0,
        description="Vertical 9:16, max 90s, H.264 + AAC",
    ),
    "tiktok": PlatformPreset(
        name="tiktok",
        label="TikTok",
        width=1080,
        height=1920,
        max_duration=180.0,
        description="Vertical 9:16, max 3min, H.264 + AAC",
    ),
    "facebook_reels": PlatformPreset(
        name="facebook_reels",
        label="Facebook Reels",
        width=1080,
        height=1920,
        max_duration=60.0,
        description="Vertical 9:16, max 60s, H.264 + AAC",
    ),
    "twitter_video": PlatformPreset(
        name="twitter_video",
        label="X/Twitter Video",
        width=1080,
        height=1920,
        max_duration=140.0,
        video_bitrate="5M",
        description="Vertical 9:16, max 2min 20s, H.264 + AAC",
    ),
    "landscape": PlatformPreset(
        name="landscape",
        label="Landscape 16:9",
        width=1920,
        height=1080,
        max_duration=600.0,
        description="Horizontal 16:9, max 10min, H.264 + AAC",
    ),
    "square": PlatformPreset(
        name="square",
        label="Square 1:1",
        width=1080,
        height=1080,
        max_duration=60.0,
        description="Square 1:1, max 60s, H.264 + AAC",
    ),
}


def get_preset(name: str) -> PlatformPreset:
    """Get a platform preset by name. Falls back to YouTube Shorts."""
    preset = PRESETS.get(name)
    if preset:
        return preset
    return PRESETS["youtube_shorts"]


def list_presets() -> list[dict]:
    """Return all presets as serializable dicts."""
    return [
        {
            "name": p.name,
            "label": p.label,
            "width": p.width,
            "height": p.height,
            "max_duration": p.max_duration,
            "description": p.description,
        }
        for p in PRESETS.values()
    ]

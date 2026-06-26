"""Branding service — watermark, logo, colors, intro/outro."""
import logging
import os
import subprocess
from dataclasses import dataclass

logger = logging.getLogger(__name__)

@dataclass
class BrandConfig:
    watermark_text: str = ""
    watermark_logo_path: str = ""
    watermark_position: str = "bottom-right"
    primary_color: str = "#FF6B35"
    font_family: str = "fonts/Inter-Bold.ttf"
    intro_clip_path: str = ""
    outro_clip_path: str = ""

def build_watermark_filter(brand: BrandConfig, video_w: int, video_h: int) -> list[str]:
    """Build FFmpeg drawtext filter for watermark overlay."""
    if not brand.watermark_text and not brand.watermark_logo_path:
        return []

    filters = []
    if brand.watermark_text:
        pos_map = {
            "top-left": "x=20:y=20",
            "top-right": f"x={video_w - 20}-text_w:y=20",
            "bottom-left": f"x=20:y={video_h - 20}-text_h",
            "bottom-right": f"x={video_w - 20}-text_w:y={video_h - 20}-text_h",
        }
        pos = pos_map.get(brand.watermark_position, pos_map["bottom-right"])
        filters.append(
            f"drawtext=text='{brand.watermark_text}':{pos}:"
            f"fontsize=24:fontcolor={brand.primary_color}@0.7:"
            f"fontfile='{brand.font_family}':box=1:boxcolor=black@0.3:boxborderw=8"
        )
    return filters

def build_caption_style_filter(
    text: str,
    style: str = "classic",
    video_w: int = 1080,
    video_h: int = 1920,
) -> list[str]:
    """Build FFmpeg subtitle/caption filter with various visual styles."""

    base_y = video_h - 180

    styles = {
        "classic": (
            f"drawtext=text='{text}':x=(w-text_w)/2:y={base_y}:"
            f"fontsize=36:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=12:"
            f"fontfile='fonts/Inter-Regular.ttf'"
        ),
        "neon": (
            f"drawtext=text='{text}':x=(w-text_w)/2:y={base_y}:"
            f"fontsize=42:fontcolor=#00FFFF:box=1:boxcolor=black@0.4:boxborderw=15:"
            f"fontfile='fonts/Inter-Bold.ttf':shadowx=3:shadowy=3:shadowcolor=#FF00FF@0.5"
        ),
        "minimal": (
            f"drawtext=text='{text}':x=(w-text_w)/2:y={base_y}:"
            f"fontsize=32:fontcolor=white:box=0:"
            f"fontfile='fonts/Inter-Light.ttf'"
        ),
        "highlight": (
            f"drawtext=text='{text}':x=(w-text_w)/2:y={base_y}:"
            f"fontsize=40:fontcolor=#FFD700:box=1:boxcolor=#FF6B35@0.8:boxborderw=10:"
            f"fontfile='fonts/Inter-Bold.ttf'"
        ),
        "typewriter": (
            f"drawtext=text='{text}':x=(w-text_w)/2:y={base_y}:"
            f"fontsize=36:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=10:"
            f"fontfile='fonts/Inter-Regular.ttf':enable='between(t,0,2)'"
        ),
    }

    result = styles.get(style, styles["classic"])
    return [result]


def build_intro_filter(intro_path: str, video_w: int, video_h: int) -> list[str]:
    """Build FFmpeg concat filter for intro video."""
    if not intro_path or not os.path.exists(intro_path):
        return []
    return [f"movie={intro_path}:f=mp4 [intro]; [intro] scale={video_w}:{video_h}:force_original_aspect_ratio=decrease,pad={video_w}:{video_h}:(ow-iw)/2:(oh-ih)/2 [intro_scaled]"]


def generate_title_card(
    title: str,
    output_path: str,
    brand: BrandConfig | None = None,
    video_w: int = 1080,
    video_h: int = 1920,
) -> str | None:
    """Generate a title card video using FFmpeg."""
    color = brand.primary_color if brand else "#FF6B35"
    bg = "black"

    try:
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c={bg}:s={video_w}x{video_h}:d=3",
            "-vf", (
                f"drawtext=text='{title}':x=(w-text_w)/2:y=(h-text_h)/2-50:"
                f"fontsize=56:fontcolor=white:fontfile='fonts/Inter-Bold.ttf',"
                f"drawtext=text='ClipForge':x=(w-text_w)/2:y=(h-text_h)/2+50:"
                f"fontsize=32:fontcolor={color}:fontfile='fonts/Inter-Regular.ttf'"
            ),
            "-c:v", "libx264", "-preset", "fast", "-t", "3", output_path,
        ]
        subprocess.run(cmd, capture_output=True, timeout=30, check=True)
        return output_path
    except Exception as e:
        logger.warning("Title card generation failed: %s", e)
        return None

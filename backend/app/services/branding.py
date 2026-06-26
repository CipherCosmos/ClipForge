"""Branding service — watermark, logo, colors, intro/outro."""
import logging
import os
import subprocess
from dataclasses import dataclass

logger = logging.getLogger(__name__)

_DRAWTEXT_AVAILABLE = None

def has_drawtext() -> bool:
    """Check if drawtext filter is available in FFmpeg."""
    global _DRAWTEXT_AVAILABLE
    if _DRAWTEXT_AVAILABLE is not None:
        return _DRAWTEXT_AVAILABLE
    try:
        result = subprocess.run(
            ["ffmpeg", "-filters"], capture_output=True, text=True, timeout=10
        )
        _DRAWTEXT_AVAILABLE = "drawtext" in result.stdout
    except Exception:
        _DRAWTEXT_AVAILABLE = False
    return _DRAWTEXT_AVAILABLE

def escape_ffmpeg_text(text: str) -> str:
    """Escapes text for FFmpeg drawtext filter."""
    if not text:
        return ""
    # Replace single quote with curly apostrophe to prevent FFmpeg single quote escape issues
    text = text.replace("'", "’").replace('"', "”")
    # Escape backslash first
    text = text.replace("\\", "\\\\")
    # Escape other special characters for drawtext
    for ch in (":", ",", "%", "[", "]", "{", "}"):
        text = text.replace(ch, f"\\{ch}")
    return text

def get_font_path(bold: bool = False, light: bool = False) -> str:
    """Find a suitable system font path or custom font path."""
    candidates = []
    if bold:
        candidates.extend([
            "fonts/Inter-Bold.ttf",
            "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
            "/Library/Fonts/Arial Bold.ttf",
            "/System/Library/Fonts/Supplemental/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ])
    elif light:
        candidates.extend([
            "fonts/Inter-Light.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/Library/Fonts/Arial.ttf",
            "/System/Library/Fonts/Supplemental/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ])
    else:
        candidates.extend([
            "fonts/Inter-Regular.ttf",
            "/System/Library/Fonts/Supplemental/Arial.ttf",
            "/Library/Fonts/Arial.ttf",
            "/System/Library/Fonts/Supplemental/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ])
    for path in candidates:
        if os.path.exists(path):
            return path
    return ""

@dataclass
class BrandConfig:
    watermark_text: str = ""
    watermark_logo_path: str = ""
    watermark_position: str = "bottom-right"
    primary_color: str = "#FF6B35"
    font_family: str = ""
    intro_clip_path: str = ""
    outro_clip_path: str = ""

def build_watermark_filter(brand: BrandConfig, video_w: int, video_h: int) -> list[str]:
    """Build FFmpeg drawtext filter for watermark overlay."""
    if not has_drawtext():
        return []
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
        
        font_path = brand.font_family
        if not font_path or not os.path.exists(font_path):
            font_path = get_font_path(bold=True)
        font_arg = f":fontfile='{font_path}'" if font_path else ""
        
        escaped_watermark = escape_ffmpeg_text(brand.watermark_text)
        filters.append(
            f"drawtext=text='{escaped_watermark}':{pos}:"
            f"fontsize=24:fontcolor={brand.primary_color}@0.7"
            f"{font_arg}:box=1:boxcolor=black@0.3:boxborderw=8"
        )
    return filters

def build_caption_style_filter(
    text: str,
    style: str = "classic",
    video_w: int = 1080,
    video_h: int = 1920,
) -> list[str]:
    """Build FFmpeg subtitle/caption filter with various visual styles."""
    if not has_drawtext():
        return []

    base_y = video_h - 180
    
    is_bold = "bold" in style or style in ("neon", "highlight")
    is_light = style == "minimal"
    font_path = get_font_path(bold=is_bold, light=is_light)
    font_arg = f":fontfile='{font_path}'" if font_path else ""
    
    escaped_text = escape_ffmpeg_text(text)

    styles = {
        "classic": (
            f"drawtext=text='{escaped_text}':x=(w-text_w)/2:y={base_y}:"
            f"fontsize=36:fontcolor=white:box=1:boxcolor=black@0.6:boxborderw=12"
            f"{font_arg}"
        ),
        "neon": (
            f"drawtext=text='{escaped_text}':x=(w-text_w)/2:y={base_y}:"
            f"fontsize=42:fontcolor=#00FFFF:box=1:boxcolor=black@0.4:boxborderw=15"
            f"{font_arg}:shadowx=3:shadowy=3:shadowcolor=#FF00FF@0.5"
        ),
        "minimal": (
            f"drawtext=text='{escaped_text}':x=(w-text_w)/2:y={base_y}:"
            f"fontsize=32:fontcolor=white:box=0"
            f"{font_arg}"
        ),
        "highlight": (
            f"drawtext=text='{escaped_text}':x=(w-text_w)/2:y={base_y}:"
            f"fontsize=40:fontcolor=#FFD700:box=1:boxcolor=#FF6B35@0.8:boxborderw=10"
            f"{font_arg}"
        ),
        "typewriter": (
            f"drawtext=text='{escaped_text}':x=(w-text_w)/2:y={base_y}:"
            f"fontsize=36:fontcolor=white:box=1:boxcolor=black@0.5:boxborderw=10"
            f"{font_arg}:enable='between(t,0,2)'"
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
    if not has_drawtext():
        logger.warning("FFmpeg drawtext filter not available, rendering black video for title card")
        try:
            cmd = [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"color=c=black:s={video_w}x{video_h}:d=3",
                "-c:v", "libx264", "-preset", "fast", "-t", "3", output_path,
            ]
            subprocess.run(cmd, capture_output=True, timeout=30, check=True)
            return output_path
        except Exception as e:
            logger.warning("Fallback black title card generation failed: %s", e)
            return None

    color = brand.primary_color if brand else "#FF6B35"
    bg = "black"
    
    font_bold = get_font_path(bold=True)
    font_reg = get_font_path(bold=False)
    font_bold_arg = f":fontfile='{font_bold}'" if font_bold else ""
    font_reg_arg = f":fontfile='{font_reg}'" if font_reg else ""
    
    escaped_title = escape_ffmpeg_text(title)

    try:
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", f"color=c=black:s={video_w}x{video_h}:d=3",
            "-vf", (
                f"drawtext=text='{escaped_title}':x=(w-text_w)/2:y=(h-text_h)/2-50:"
                f"fontsize=56:fontcolor=white{font_bold_arg},"
                f"drawtext=text='ClipForge':x=(w-text_w)/2:y=(h-text_h)/2+50:"
                f"fontsize=32:fontcolor={color}{font_reg_arg}"
            ),
            "-c:v", "libx264", "-preset", "fast", "-t", "3", output_path,
        ]
        subprocess.run(cmd, capture_output=True, timeout=30, check=True)
        return output_path
    except Exception as e:
        logger.warning("Title card generation failed: %s", e)
        return None

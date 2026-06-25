"""Text-to-speech service using Edge TTS (free, no API key)."""

import logging
import os
import subprocess
import tempfile

logger = logging.getLogger(__name__)

VOICE_MAP = {
    "en": "en-US-JennyNeural",
    "es": "es-ES-AlvaroNeural",
    "fr": "fr-FR-DeniseNeural",
    "de": "de-DE-KatjaNeural",
    "it": "it-IT-ElsaNeural",
    "pt": "pt-BR-FranciscaNeural",
    "ru": "ru-RU-SvetlanaNeural",
    "zh": "zh-CN-XiaoxiaoNeural",
    "ja": "ja-JP-NanamiNeural",
    "ko": "ko-KR-SunHiNeural",
    "ar": "ar-SA-ZariyahNeural",
    "hi": "hi-IN-SwaraNeural",
    "nl": "nl-NL-MaartenNeural",
    "pl": "pl-PL-AgnieszkaNeural",
    "tr": "tr-TR-EmelNeural",
    "vi": "vi-VN-HoaiMyNeural",
    "th": "th-TH-PremwadeeNeural",
    "sv": "sv-SE-SofieNeural",
}


def _generate_speech_edge_tts(text: str, voice: str, output_path: str) -> bool:
    """Generate speech using edge-tts CLI tool.

    Args:
        text: Text to synthesize.
        voice: Edge TTS voice name (e.g. "en-US-JennyNeural").
        output_path: Path to write the audio file.

    Returns:
        True if successful, False otherwise.
    """
    try:
        result = subprocess.run(
            ["edge-tts", "--voice", voice, "--text", text, "--write-media", output_path],
            capture_output=True,
            text=True,
            timeout=30,
        )
        if result.returncode != 0:
            logger.warning(
                "edge-tts failed (rc=%d): %s", result.returncode, result.stderr[:200]
            )
            return False
        if not os.path.exists(output_path) or os.path.getsize(output_path) < 100:
            logger.warning("edge-tts produced empty output: %s", output_path)
            return False
        return True
    except FileNotFoundError:
        logger.warning("edge-tts CLI not found, install with: pip install edge-tts")
        return False
    except subprocess.TimeoutExpired:
        logger.warning("edge-tts timed out")
        return False
    except Exception as exc:
        logger.warning("edge-tts failed: %s", exc)
        return False


def _generate_sine_tone(output_path: str, duration: float = 3.0) -> bool:
    """Generate a fallback sine tone audio file.

    Args:
        output_path: Path to write the audio file.
        duration: Duration in seconds (default 3.0).

    Returns:
        True if successful, False otherwise.
    """
    try:
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "lavfi", "-i", f"sine=frequency=440:duration={duration}",
                "-ar", "22050",
                "-ac", "1",
                "-b:a", "64k",
                output_path,
            ],
            capture_output=True,
            text=True,
            timeout=15,
        )
        return os.path.exists(output_path) and os.path.getsize(output_path) > 100
    except Exception as exc:
        logger.warning("Sine tone generation failed: %s", exc)
        return False


def generate_speech(text: str, lang: str, output_path: str | None = None) -> str | None:
    """Generate speech audio for the given text in the target language.

    Uses Edge TTS primarily. Falls back to a sine tone if TTS is unavailable,
    ensuring the dubbing pipeline never breaks.

    Args:
        text: Text to synthesize.
        lang: Target language code (e.g. "en", "es").
        output_path: Path to write the audio file. If None, creates a temp file.

    Returns:
        Path to the generated audio file, or None on total failure.
    """
    if output_path is None:
        fd, output_path = tempfile.mkstemp(suffix=".mp3")
        os.close(fd)

    voice = VOICE_MAP.get(lang)
    if voice and text.strip():
        if _generate_speech_edge_tts(text, voice, output_path):
            logger.info("Generated TTS speech for lang %s at %s", lang, output_path)
            return output_path
    else:
        logger.warning("No voice mapped for lang '%s', falling back to sine tone", lang)

    text_len_seconds = max(2.0, min(10.0, len(text) * 0.05))
    if _generate_sine_tone(output_path, duration=text_len_seconds):
        logger.info("Generated fallback sine tone at %s", output_path)
        return output_path

    logger.error("Failed to generate any audio for lang %s", lang)
    return None

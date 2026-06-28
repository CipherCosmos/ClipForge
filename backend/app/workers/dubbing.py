"""AI Voice Dubbing worker — translates audio and replaces in rendered clips.

Pipeline: extract audio → translate transcript → TTS → replace audio → upload.
"""

import logging
import os
import shutil
import subprocess
import tempfile
import uuid

import httpx

from app.models import Clip, Video
from app.services.storage import ensure_bucket, get_presigned_url, upload_file
from app.services.translation import SUPPORTED_LANGUAGES, translate_text
from app.services.tts import generate_speech
from app.services.video import get_media_duration
from app.workers.celery_app import SyncSessionLocal, celery_app

logger = logging.getLogger(__name__)


def dub_clip(
    input_video: str,
    output_video: str,
    transcript: str,
    source_lang: str = "en",
    target_lang: str = "es",
) -> bool:
    """Dub a single clip: translate transcript, generate speech, replace audio.

    Args:
        input_video: Path to the original clip video
        output_video: Path for the dubbed clip
        transcript: Original transcript text
        source_lang: Source language code
        target_lang: Target language code

    Returns:
        True if dubbing succeeded, False otherwise
    """
    try:
        # Step 1: Translate transcript
        translated = translate_text(transcript, target_lang, source_lang)
        if translated == transcript and target_lang != source_lang:
            logger.warning("Translation produced no change, skipping dub")
            return False

        logger.info("Translated: '%s' -> '%s'", transcript[:50], translated[:50])

        # Step 2: Generate speech
        speech_path = generate_speech(translated, target_lang)
        if not speech_path or not os.path.exists(speech_path):
            logger.warning("Speech generation failed, skipping dub")
            return False

        # Step 3: Get duration of generated speech
        speech_duration = get_media_duration(speech_path, default=3.0)

        # Step 4: Get duration of original clip
        original_duration = get_media_duration(input_video, default=5.0)

        # Step 5: Speed up speech ONLY if it is longer than the original video duration
        if speech_duration > original_duration:
            tempo = speech_duration / original_duration
            # Cap tempo at 1.4 to keep the speech natural and intelligible
            tempo = min(1.4, tempo)
        else:
            tempo = 1.0

        # Build audio filter: tempo + normalize volume + pad with silence to match video length
        audio_filter = f"atempo={tempo:.2f},loudnorm=I=-16:LRA=11:TP=-1.5,apad"

        # Step 6: Replace audio in video (use -t to enforce original duration, prevent truncation)
        cmd = [
            "ffmpeg",
            "-y",
            "-i",
            input_video,
            "-i",
            speech_path,
            "-filter_complex",
            f"[1:a]{audio_filter}[dubbed]",
            "-map",
            "0:v",
            "-map",
            "[dubbed]",
            "-c:v",
            "copy",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-t",
            f"{original_duration:.2f}",
            output_video,
        ]

        logger.debug("Running FFmpeg dub: %s", " ".join(cmd))
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)

        if result.returncode != 0:
            logger.warning("FFmpeg dub failed: %s", result.stderr[:300])
            return False

        if not os.path.exists(output_video):
            logger.warning("FFmpeg did not produce dubbed output")
            return False

        logger.info(
            "Dubbed clip created: %s (lang=%s, tempo=%.2f)",
            output_video,
            target_lang,
            tempo,
        )
        return True

    except Exception as e:
        logger.exception("Dubbing failed: %s", e)
        return False


@celery_app.task(bind=True, max_retries=2, default_retry_delay=60)
def run_dub_clip(self, clip_id: str, target_lang: str = "es"):
    """Dub a single clip to the target language.

    Downloads the rendered clip, dubs it, uploads the dubbed version.
    """
    session = SyncSessionLocal()
    tmp_dir = None
    try:
        clip_uuid = uuid.UUID(clip_id)
        clip = session.query(Clip).filter(Clip.id == clip_uuid).first()
        if not clip:
            raise ValueError(f"Clip {clip_id} not found")

        video = session.query(Video).filter(Video.id == clip.video_id).first()
        if not video:
            raise ValueError(f"Video {clip.video_id} not found")

        source_lang = video.language or "en"
        transcript = clip.caption or ""

        if not transcript:
            logger.warning("No caption for clip %s, skipping dub", clip_id)
            return

        tmp_dir = tempfile.mkdtemp(prefix=f"dub_{clip_id}_")
        input_path = os.path.join(tmp_dir, "input.mp4")
        output_path = os.path.join(tmp_dir, f"dubbed_{target_lang}.mp4")

        # Download the rendered clip from presigned URL
        clip_url = clip.file_url
        if clip_url and not clip_url.startswith("http"):
            try:
                clip_url = get_presigned_url(clip_url)
            except Exception as e:
                logger.error("Failed to presign clip_url %s: %s", clip_url, e)
        logger.info("Downloading clip %s from %s", clip_id, clip_url[:80])
        with httpx.Client(timeout=120.0, follow_redirects=True) as client:
            resp = client.get(clip_url)
            resp.raise_for_status()
            with open(input_path, "wb") as f:
                f.write(resp.content)

        success = dub_clip(input_path, output_path, transcript, source_lang, target_lang)
        if not success:
            logger.warning("Dubbing failed for clip %s", clip_id)
            return

        # Upload dubbed clip
        ensure_bucket()
        object_name = f"dubs/{clip.video_id}/{clip_id}_{target_lang}.mp4"
        upload_file(output_path, object_name)
        dubbed_url = get_presigned_url(object_name)

        logger.info(
            "Dubbed clip uploaded: %s (lang=%s, url=%s)",
            clip_id,
            target_lang,
            dubbed_url,
        )

        from app.services.webhooks import fire_event_sync

        fire_event_sync(
            str(clip.video_id),
            "dub.completed",
            {
                "status": "completed",
                "clip_id": clip_id,
                "target_language": target_lang,
                "dubbed_url": dubbed_url,
            },
        )

        return {
            "clip_id": clip_id,
            "target_lang": target_lang,
            "dubbed_url": dubbed_url,
        }

    except Exception as exc:
        logger.exception("Dub clip failed for %s", clip_id)
        if self and hasattr(self, "retry"):
            raise self.retry(exc=exc)
        raise exc
    finally:
        session.close()
        if tmp_dir and os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir, ignore_errors=True)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def run_dub_video(self, video_id: str, target_langs: list[str] | None = None):
    """Dub all clips in a video to one or more target languages.

    Args:
        video_id: UUID of the video to dub
        target_langs: List of target language codes.
            Defaults to ["es", "fr", "de", "pt", "hi"].
    """
    if target_langs is None:
        target_langs = ["es", "fr", "de", "pt", "hi"]

    session = SyncSessionLocal()
    try:
        video_uuid = uuid.UUID(video_id)
        video = session.query(Video).filter(Video.id == video_uuid).first()
        if not video:
            raise ValueError(f"Video {video_id} not found")

        clips = session.query(Clip).filter(Clip.video_id == video_uuid).all()
        if not clips:
            logger.info("No clips found for video %s, nothing to dub", video_id)
            return

        for lang in target_langs:
            if lang not in SUPPORTED_LANGUAGES:
                logger.warning("Unsupported language: %s, skipping", lang)
                continue

            for clip in clips:
                run_dub_clip.delay(str(clip.id), lang)

        logger.info(
            "Enqueued dubbing for video %s: %d clips x %d languages",
            video_id,
            len(clips),
            len(target_langs),
        )

    except Exception as exc:
        logger.exception("Dub video failed for %s", video_id)
        if self and hasattr(self, "retry"):
            raise self.retry(exc=exc)
        raise exc
    finally:
        session.close()

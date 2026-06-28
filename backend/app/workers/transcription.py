import logging
import os
import tempfile
import uuid

from sqlalchemy import and_

from app.api.ws import broadcast_sync
from app.models import Job, JobStatusEnum, JobTypeEnum, Video, VideoStatusEnum
from app.services.storage import download_file
from app.services.transcription import transcribe_audio
from app.workers.celery_app import SyncSessionLocal, celery_app

logger = logging.getLogger(__name__)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60, acks_late=True)
def run_transcription(self, video_id: str):
    session = SyncSessionLocal()
    tmp_path = None
    try:
        video_uuid = uuid.UUID(video_id)
        video = session.query(Video).filter(Video.id == video_uuid).first()
        if not video:
            raise ValueError(f"Video {video_id} not found")

        trans_job = (
            session.query(Job)
            .filter(
                and_(
                    Job.video_id == video_uuid,
                    Job.type == JobTypeEnum.TRANSCRIPTION,
                )
            )
            .first()
        )

        # ── Smart Resume: check both job status AND actual data ──
        has_transcript_data = bool(video.transcript and video.segments and len(video.segments) > 0)
        transcription_skipped = (
            trans_job and trans_job.status == JobStatusEnum.DONE
        ) or has_transcript_data

        video.status = VideoStatusEnum.PROCESSING

        if not transcription_skipped:
            if trans_job:
                trans_job.status = JobStatusEnum.RUNNING
                trans_job.progress = 0.0

            session.commit()

            if video.source_url.startswith("http://") or video.source_url.startswith("https://"):
                logger.info("Downloading external video %s for transcription", video_id)
                broadcast_sync(
                    video_id,
                    "transcription",
                    0.05,
                    "running",
                    "Downloading from YouTube (this may take a while)...",
                )

                from app.services.storage import upload_file
                from app.services.video import download_from_url, get_video_duration

                tmp_path, meta = download_from_url(video.source_url)

                try:
                    duration = get_video_duration(tmp_path)
                    if duration:
                        video.duration = duration
                except Exception:
                    pass

                # Update title from YouTube metadata
                if meta.get("title"):
                    video.title = meta["title"][:200]
                if meta.get("thumbnail") and not video.thumbnail_url:
                    video.thumbnail_url = meta["thumbnail"]

                object_name = f"videos/{video.user_id}/{uuid.uuid4()}.mp4"
                upload_file(tmp_path, object_name)
                video.source_url = object_name
                session.commit()
            else:
                with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
                    tmp_path = tmp.name

                logger.info("Downloading video %s from MinIO for transcription", video_id)
                broadcast_sync(video_id, "transcription", 0.05, "running", "Downloading media")
                download_file(video.source_url, tmp_path)

            logger.info("Starting transcription for video %s", video_id)
            broadcast_sync(video_id, "transcription", 0.1, "running", "Running Whisper ASR")

            result = transcribe_audio(tmp_path)

            broadcast_sync(video_id, "transcription", 0.95, "running", "Chunking segments")
            whisper_segments = result["segments"]
            language = result.get("language", "en")

            # Split whisper segments into ~3s chunks using word timestamps
            max_chunk_duration = 3.5
            segments = []
            full_text_parts = []
            for seg in whisper_segments:
                words = seg.get("words", [])
                if len(words) > 1:
                    chunk_start = words[0].get("start", seg["start"])
                    chunk_words = []
                    for w in words:
                        w_start = w.get("start", seg["start"])
                        w_end = w.get("end", seg["end"])
                        if not chunk_words:
                            chunk_start = w_start
                            chunk_words.append(w)
                        elif w_end - chunk_start <= max_chunk_duration:
                            chunk_words.append(w)
                        else:
                            chunk_text = " ".join(cw.get("word", "").strip() for cw in chunk_words)
                            chunk_end = chunk_words[-1].get("end", seg["end"])
                            segments.append(
                                {
                                    "start": chunk_start,
                                    "end": chunk_end,
                                    "text": chunk_text,
                                    "score": 0.0,
                                    "emotion_intensity": 0.0,
                                    "keyword_density": 0.0,
                                    "scene_change_intensity": 0.0,
                                    "audio_energy": 0.0,
                                    "viral_score": 0.0,
                                    "hook_score": 0.0,
                                    "engagement_potential": 0.0,
                                }
                            )
                            full_text_parts.append(chunk_text)
                            chunk_start = w_start
                            chunk_words = [w]
                    if chunk_words:
                        chunk_text = " ".join(cw.get("word", "").strip() for cw in chunk_words)
                        chunk_end = chunk_words[-1].get("end", seg["end"])
                        segments.append(
                            {
                                "start": chunk_start,
                                "end": chunk_end,
                                "text": chunk_text,
                                "score": 0.0,
                                "emotion_intensity": 0.0,
                                "keyword_density": 0.0,
                                "scene_change_intensity": 0.0,
                                "audio_energy": 0.0,
                                "viral_score": 0.0,
                                "hook_score": 0.0,
                                "engagement_potential": 0.0,
                            }
                        )
                        full_text_parts.append(chunk_text)
                else:
                    seg_dict = {
                        "start": seg["start"],
                        "end": seg["end"],
                        "text": seg["text"],
                        "score": 0.0,
                        "emotion_intensity": 0.0,
                        "keyword_density": 0.0,
                        "scene_change_intensity": 0.0,
                        "audio_energy": 0.0,
                        "viral_score": 0.0,
                        "hook_score": 0.0,
                        "engagement_potential": 0.0,
                    }
                    segments.append(seg_dict)
                    full_text_parts.append(seg["text"])

            video.transcript = {
                "language": language,
                "segments": segments,
                "full_text": " ".join(full_text_parts),
            }
            video.language = language
            video.segments = segments
            broadcast_sync(
                video_id, "transcription", 1.0, "completed", f"Transcription complete in {language}"
            )

            if trans_job:
                trans_job.progress = 1.0
                trans_job.status = JobStatusEnum.DONE

            session.commit()
            logger.info("Transcription complete for video %s", video_id)

            from app.services.webhooks import fire_event_sync

            fire_event_sync(
                video_id,
                "transcription.completed",
                {
                    "status": "completed",
                    "language": language,
                    "segments_count": len(segments),
                },
            )
        else:
            session.commit()
            logger.info(
                "Smart Resume: transcription already complete for video %s, skipping", video_id
            )

        # ── Smart Resume: route to next stage based on HIGHLIGHT job status ──
        highlight_job = (
            session.query(Job)
            .filter(
                and_(
                    Job.video_id == video_uuid,
                    Job.type == JobTypeEnum.HIGHLIGHT,
                )
            )
            .first()
        )

        should_skip_highlight = highlight_job and highlight_job.status == JobStatusEnum.DONE

        if should_skip_highlight:
            logger.info(
                "Smart Resume: highlights already complete for video %s, skipping to render",
                video_id,
            )
            from app.workers.render import run_render

            run_render.delay(video_id)
        else:
            if highlight_job and highlight_job.status == JobStatusEnum.QUEUED:
                logger.info(
                    "Smart Resume: highlights queued for video %s, starting NLP + Scene Detect",
                    video_id,
                )
            else:
                logger.info(
                    "Smart Resume: highlight job status=%s for video %s,"
                    " defaulting to NLP + Scene Detect",
                    highlight_job.status if highlight_job else "None",
                    video_id,
                )
            from app.workers.nlp import run_nlp
            from app.workers.scene_detect import run_scene_detect

            # Enqueue NLP and scene detect independently (no fragile chord)
            # Each will check if the other is done before triggering render
            run_nlp.delay(video_id)
            run_scene_detect.delay(video_id)

    except Exception as exc:
        logger.exception("Transcription failed for video %s", video_id)
        try:
            video = session.query(Video).filter(Video.id == uuid.UUID(video_id)).first()
            if video:
                video.status = VideoStatusEnum.FAILED
                err_msg = str(exc)
                err_lower = err_msg.lower()
                blocked_kw = (
                    "not available",
                    "private",
                    "removed",
                    "deleted",
                    "geoblocked",
                    "age",
                    "restricted",
                    "copyright",
                    "takedown",
                )
                if any(kw in err_lower for kw in blocked_kw):
                    err_msg = f"YouTube video is not available ({', '.join(blocked_kw)})."
                video.transcript = {"error": err_msg}
            job = (
                session.query(Job)
                .filter(
                    and_(
                        Job.video_id == uuid.UUID(video_id),
                        Job.type == JobTypeEnum.TRANSCRIPTION,
                    )
                )
                .first()
            )
            if job:
                job.status = JobStatusEnum.FAILED
            session.commit()
        except Exception:
            session.rollback()
        if self and hasattr(self, "retry"):
            raise self.retry(exc=exc)
        raise exc
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        session.close()

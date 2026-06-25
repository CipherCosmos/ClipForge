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
    try:
        video_uuid = uuid.UUID(video_id)
        video = session.query(Video).filter(Video.id == video_uuid).first()
        if not video:
            raise ValueError(f"Video {video_id} not found")

        job = (
            session.query(Job)
            .filter(
                and_(
                    Job.video_id == video_uuid,
                    Job.type == JobTypeEnum.TRANSCRIPTION,
                )
            )
            .first()
        )

        if job:
            job.status = JobStatusEnum.RUNNING
            job.progress = 0.0

        video.status = VideoStatusEnum.PROCESSING
        session.commit()

        tmp_path = None
        try:
            with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
                tmp_path = tmp.name

            logger.info("Downloading video %s for transcription", video_id)
            download_file(video.source_url, tmp_path)

            logger.info("Starting transcription for video %s", video_id)
            broadcast_sync(video_id, "transcription", 0.1, "running", "Running Whisper ASR")
            result = transcribe_audio(tmp_path)
            broadcast_sync(video_id, "transcription", 0.5, "running", "Processing segments")
            whisper_segments = result["segments"]
            language = result.get("language", "en")

            # Split whisper segments into ~3s chunks using word timestamps
            MAX_CHUNK_DURATION = 3.5
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
                        elif w_end - chunk_start <= MAX_CHUNK_DURATION:
                            chunk_words.append(w)
                        else:
                            chunk_text = " ".join(cw.get("word", "").strip() for cw in chunk_words)
                            chunk_end = chunk_words[-1].get("end", seg["end"])
                            segments.append({
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
                            })
                            full_text_parts.append(chunk_text)
                            chunk_start = w_start
                            chunk_words = [w]
                    if chunk_words:
                        chunk_text = " ".join(cw.get("word", "").strip() for cw in chunk_words)
                        chunk_end = chunk_words[-1].get("end", seg["end"])
                        segments.append({
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
                        })
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
            broadcast_sync(video_id, "transcription", 1.0, "completed", f"Transcription complete in {language}")

            if job:
                job.progress = 1.0
                job.status = JobStatusEnum.DONE

            session.commit()
            logger.info("Transcription complete for video %s", video_id)

            from celery import chord
            from app.workers.nlp import run_nlp
            from app.workers.scene_detect import run_scene_detect
            from app.workers.join_worker import run_join_and_render

            chord([run_nlp.s(video_id), run_scene_detect.s(video_id)])(run_join_and_render.s(video_id))

        except Exception:
            raise
        finally:
            if tmp_path and os.path.exists(tmp_path):
                os.unlink(tmp_path)

    except Exception as exc:
        logger.exception("Transcription failed for video %s", video_id)
        try:
            video = session.query(Video).filter(Video.id == uuid.UUID(video_id)).first()
            if video:
                video.status = VideoStatusEnum.FAILED
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
        raise self.retry(exc=exc)
    finally:
        session.close()

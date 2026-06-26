"""Merges NLP + scene detect results and triggers render.

Each worker saves its results independently to the DB segments.
This function reads from DB, merges, and triggers render when both are done.
Called by NLP or scene_detect when they complete.
"""
import logging
import uuid

from sqlalchemy import and_
from sqlalchemy.orm.attributes import flag_modified

from app.models import Job, JobStatusEnum, JobTypeEnum, Video
from app.services.scoring import calculate_viral_score
from app.workers.celery_app import SyncSessionLocal, celery_app

logger = logging.getLogger(__name__)


def _has_nlp_keys(segments: list) -> bool:
    """Check if NLP has run by looking for hook_score key presence (even if zero)."""
    if not segments:
        return False
    return any("hook_score" in (s or {}) for s in segments)


def _has_scene_keys(segments: list) -> bool:
    """Check if scene detect has run by looking for scene keys (even if zero)."""
    if not segments:
        return False
    return any("speaker_confidence" in (s or {}) for s in segments)


def check_and_merge(video_id: str) -> bool:
    """Check if both NLP and scene detect are done, merge if so, and trigger render.

    Returns True if merge + render was triggered, False if waiting for other worker.
    """
    session = SyncSessionLocal()
    try:
        video_uuid = uuid.UUID(video_id)
        video = session.query(Video).filter(Video.id == video_uuid).first()
        if not video:
            return False

        segments = video.segments
        if not segments:
            return False

        has_nlp = _has_nlp_keys(segments)
        has_scene = _has_scene_keys(segments)

        logger.info("Merge check for %s: NLP=%s Scene=%s", video_id[:8], has_nlp, has_scene)

        if not (has_nlp and has_scene):
            return False  # Waiting for the other worker

        # Both done — merge is already in segments (each worker saved its keys)
        # Just recalculate viral scores
        for seg in segments:
            seg["viral_score"] = calculate_viral_score(seg)
            seg["viral_score"] *= seg.get("trend_boost", 1.0)

        video.segments = segments
        flag_modified(video, "segments")

        job = session.query(Job).filter(
            and_(Job.video_id == video_uuid, Job.type == JobTypeEnum.HIGHLIGHT)
        ).first()
        if job:
            job.status = JobStatusEnum.DONE
            job.progress = 1.0

        session.commit()
        logger.info("Merged NLP + Scene Detect results for video %s", video_id[:8])

        from app.workers.render import run_render
        run_render.delay(video_id)
        return True

    except Exception as exc:
        logger.exception("Merge check failed for video %s", video_id)
        return False
    finally:
        session.close()

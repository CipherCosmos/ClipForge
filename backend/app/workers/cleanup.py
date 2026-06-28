"""Auto-cleanup for stuck pipeline jobs.

Resets jobs stuck in 'running' state (from crashed workers) back to 'queued'.
Periodically checks for videos stuck in processing with no active jobs.
"""

import logging
from datetime import datetime, timedelta, timezone

from app.models import Job, JobStatusEnum, Video, VideoStatusEnum
from app.workers.celery_app import SyncSessionLocal, celery_app

logger = logging.getLogger(__name__)

JOB_TIMEOUT_MINUTES = 30


def reset_stale_jobs():
    """Reset jobs stuck in 'running' state back to 'queued'.

    Called on Celery worker startup to recover from hard crashes.
    Also marks jobs that have been running >30min as failed.
    """
    session = SyncSessionLocal()
    try:
        now = datetime.now(timezone.utc)
        stale = session.query(Job).filter(Job.status == JobStatusEnum.RUNNING).all()
        for job in stale:
            age = now - job.created_at
            if age > timedelta(minutes=JOB_TIMEOUT_MINUTES):
                job.status = JobStatusEnum.FAILED
                logger.warning(
                    "Timed out stale job %s (%s, running for %d min)",
                    job.id,
                    job.type.value,
                    age.total_seconds() // 60,
                )
            else:
                job.status = JobStatusEnum.QUEUED
                job.progress = 0.0
                logger.info("Reset stale job %s (%s) back to queued", job.id, job.type.value)
        session.commit()
        if stale:
            logger.info("Cleaned %d stale job(s)", len(stale))
    except Exception as e:
        logger.error("Failed to reset stale jobs: %s", e)
        session.rollback()
    finally:
        session.close()


def unstuck_pipeline():
    """Find videos stuck in processing with no active jobs and re-enqueue them.

    This handles cases where the pipeline chord was lost due to worker crash.
    """
    session = SyncSessionLocal()
    try:
        now = datetime.now(timezone.utc)
        stuck_videos = session.query(Video).filter(Video.status == VideoStatusEnum.PROCESSING).all()

        for video in stuck_videos:
            jobs = session.query(Job).filter(Job.video_id == video.id).all()
            active_jobs = [
                j for j in jobs if j.status in (JobStatusEnum.RUNNING, JobStatusEnum.QUEUED)
            ]
            done_jobs = [j for j in jobs if j.status == JobStatusEnum.DONE]

            if not active_jobs:
                age = now - video.created_at if video.created_at else timedelta(0)
                has_segments = bool(video.segments and len(video.segments) > 0)
                bool(video.transcript)

                if age < timedelta(minutes=5):
                    continue  # Too early, still might be starting

                if not done_jobs and not has_segments:
                    # Nothing done yet — re-enqueue transcription
                    from app.workers.transcription import run_transcription

                    run_transcription.delay(str(video.id))
                    logger.info("Unstuck video %s — re-enqueuing transcription", str(video.id)[:8])
                elif has_segments:
                    # Transcription done — re-enqueue NLP + scene detect
                    from app.workers.nlp import run_nlp
                    from app.workers.scene_detect import run_scene_detect

                    run_nlp.delay(str(video.id))
                    run_scene_detect.delay(str(video.id))
                    logger.info(
                        "Unstuck video %s — re-enqueuing NLP + scene detect", str(video.id)[:8]
                    )
    except Exception as e:
        logger.error("Failed to unstuck pipeline: %s", e)
    finally:
        session.close()


@celery_app.on_after_configure.connect
def setup_cleanup_tasks(sender, **kwargs):
    """Register cleanup tasks on Celery startup."""
    sender.add_periodic_task(300.0, run_cleanup.s(), name="cleanup-stale-jobs")


@celery_app.task
def run_cleanup():
    """Periodic cleanup: reset stale jobs and unstuck pipelines."""
    reset_stale_jobs()
    unstuck_pipeline()

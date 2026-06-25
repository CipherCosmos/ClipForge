import logging
import uuid

from sqlalchemy import and_
from sqlalchemy.orm.attributes import flag_modified

from app.models import Job, JobStatusEnum, JobTypeEnum, Video
from app.workers.celery_app import SyncSessionLocal, celery_app

logger = logging.getLogger(__name__)


def _calculate_viral_score(seg: dict) -> float:
    return (
        0.25 * seg.get("hook_score", 0.0) +
        0.20 * seg.get("emotion_intensity", 0.0) +
        0.15 * seg.get("engagement_potential", 0.0) +
        0.10 * seg.get("keyword_density", 0.0) +
        0.10 * seg.get("scene_change_intensity", 0.0) +
        0.10 * seg.get("audio_event_score", 0.0) +
        0.05 * seg.get("audio_energy", 0.0) +
        0.05 * seg.get("speaker_confidence", 0.0)
    )


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def run_join_and_render(self, results, video_id: str):
    session = SyncSessionLocal()
    try:
        video_uuid = uuid.UUID(video_id)
        video = session.query(Video).filter(Video.id == video_uuid).first()
        if not video:
            raise ValueError(f"Video {video_id} not found")

        # In a chord, results is a list of return values from the header tasks
        if len(results) != 2:
            logger.error("Expected 2 results from parallel workers, got %d", len(results))
            return

        nlp_segments = results[0]
        scene_segments = results[1]

        if not nlp_segments or not scene_segments:
            logger.warning("Missing segments from parallel workers for video %s", video_id)
            return
            
        if len(nlp_segments) != len(scene_segments):
            logger.warning("Segment length mismatch: NLP=%d, Scene=%d", len(nlp_segments), len(scene_segments))
            return

        # Merge segments
        merged_segments = []
        for nlp_seg, scene_seg in zip(nlp_segments, scene_segments):
            merged = nlp_seg.copy()
            
            # Update with scene detect keys
            merged.update({
                "scene_change_intensity": scene_seg.get("scene_change_intensity", 0.0),
                "audio_emotions": scene_seg.get("audio_emotions", []),
                "audio_events": scene_seg.get("audio_events", []),
                "audio_event_score": scene_seg.get("audio_event_score", 0.0),
                "prosody": scene_seg.get("prosody", {}),
                "audio_energy": scene_seg.get("audio_energy", 0.0),
                "speaker_confidence": scene_seg.get("speaker_confidence", 0.0),
            })

            # Recalculate final viral score
            merged["viral_score"] = _calculate_viral_score(merged)
            merged["viral_score"] *= merged.get("trend_boost", 1.0)

            merged_segments.append(merged)

        video.segments = merged_segments
        flag_modified(video, "segments")
        
        job = session.query(Job).filter(
            and_(Job.video_id == video_uuid, Job.type == JobTypeEnum.HIGHLIGHT)
        ).first()
        if job:
            job.status = JobStatusEnum.DONE
            job.progress = 1.0
            
        session.commit()

        logger.info("Successfully merged NLP and Scene Detect results for video %s", video_id)

        from app.workers.render import run_render
        run_render.delay(video_id)

    except Exception as exc:
        logger.exception("Join and render failed for video %s", video_id)
        try:
            job = session.query(Job).filter(
                and_(Job.video_id == uuid.UUID(video_id), Job.type == JobTypeEnum.HIGHLIGHT)
            ).first()
            if job:
                job.status = JobStatusEnum.FAILED
            session.commit()
        except Exception:
            session.rollback()
        raise self.retry(exc=exc)
    finally:
        session.close()

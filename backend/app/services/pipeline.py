"""Stateful Incremental Pipeline Service.

Determines the earliest incomplete stage in the video processing pipeline
(transcription -> highlights -> render) and triggers the appropriate Celery tasks,
reusing already generated database state to save time and resources.
"""
import logging
import uuid
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.models.video import Video, VideoStatusEnum
from app.models.job import Job, JobStatusEnum, JobTypeEnum
from app.models.clip import Clip

logger = logging.getLogger(__name__)


async def start_pipeline(
    db: AsyncSession,
    video: Video,
    force_transcribe: bool = False,
    force_highlights: bool = False,
) -> None:
    """Statefully start or resume the video processing pipeline.

    Inspects existing Video data (transcript, segments) and Jobs to determine
    the earliest incomplete stage, reusing already generated results.
    """
    video_id_str = str(video.id)

    # 1. Determine if we can reuse transcript
    has_transcript = bool(video.transcript and video.segments and len(video.segments) > 0)
    reuse_transcribe = has_transcript and not force_transcribe

    # 2. Determine if we can reuse highlights (NLP + Scene Detect)
    has_highlights = False
    if has_transcript:
        has_nlp = any("hook_score" in (s or {}) for s in video.segments)
        has_scene = any("speaker_confidence" in (s or {}) for s in video.segments)
        has_highlights = has_nlp and has_scene

    reuse_highlights = has_highlights and reuse_transcribe and not force_highlights

    logger.info(
        "Starting pipeline for video %s: reuse_transcribe=%s, reuse_highlights=%s",
        video_id_str[:8],
        reuse_transcribe,
        reuse_highlights,
    )

    # 3. Clean up existing clips (since we are rendering again)
    await db.execute(delete(Clip).where(Clip.video_id == video.id))

    # 4. Clear/Delete jobs so we can write fresh state
    await db.execute(delete(Job).where(Job.video_id == video.id))

    # 5. Set video status to processing
    video.status = VideoStatusEnum.PROCESSING

    if reuse_highlights:
        # Step A: ASR and Highlights are done, run RENDER directly
        trans_job = Job(
            video_id=video.id,
            type=JobTypeEnum.TRANSCRIPTION,
            status=JobStatusEnum.DONE,
            progress=1.0,
        )
        high_job = Job(
            video_id=video.id,
            type=JobTypeEnum.HIGHLIGHT,
            status=JobStatusEnum.DONE,
            progress=1.0,
        )
        render_job = Job(
            video_id=video.id,
            type=JobTypeEnum.RENDER,
            status=JobStatusEnum.QUEUED,
            progress=0.0,
        )
        db.add_all([trans_job, high_job, render_job])
        await db.commit()

        from app.workers.render import run_render

        run_render.delay(video_id_str)
        logger.info(
            "Pipeline: skipped transcription & highlights, enqueued rendering for video %s",
            video_id_str[:8],
        )

    elif reuse_transcribe:
        # Step B: ASR is done, run highlights (NLP + Scene Detect)
        # Clear old scoring keys from segments to prevent check_and_merge race conditions
        if video.segments:
            updated_segments = []
            for seg in video.segments:
                s = dict(seg) if isinstance(seg, dict) else {}
                s.pop("hook_score", None)
                s.pop("emotion_intensity", None)
                s.pop("engagement_potential", None)
                s.pop("keyword_density", None)
                s.pop("scene_change_intensity", None)
                s.pop("audio_event_score", None)
                s.pop("audio_energy", None)
                s.pop("speaker_confidence", None)
                s.pop("viral_score", None)
                updated_segments.append(s)
            video.segments = updated_segments
            flag_modified(video, "segments")

        trans_job = Job(
            video_id=video.id,
            type=JobTypeEnum.TRANSCRIPTION,
            status=JobStatusEnum.DONE,
            progress=1.0,
        )
        high_job = Job(
            video_id=video.id,
            type=JobTypeEnum.HIGHLIGHT,
            status=JobStatusEnum.QUEUED,
            progress=0.0,
        )
        render_job = Job(
            video_id=video.id,
            type=JobTypeEnum.RENDER,
            status=JobStatusEnum.QUEUED,
            progress=0.0,
        )
        db.add_all([trans_job, high_job, render_job])
        await db.commit()

        from app.workers.nlp import run_nlp
        from app.workers.scene_detect import run_scene_detect

        run_nlp.delay(video_id_str)
        run_scene_detect.delay(video_id_str)
        logger.info(
            "Pipeline: skipped transcription, enqueued highlights for video %s",
            video_id_str[:8],
        )

    else:
        # Step C: Start from the very beginning (ASR transcription)
        # Reset video transcript metadata (only if we are NOT reusing it)
        video.transcript = None
        video.segments = None
        video.language = None
        flag_modified(video, "transcript")
        flag_modified(video, "segments")

        trans_job = Job(
            video_id=video.id,
            type=JobTypeEnum.TRANSCRIPTION,
            status=JobStatusEnum.QUEUED,
            progress=0.0,
        )
        high_job = Job(
            video_id=video.id,
            type=JobTypeEnum.HIGHLIGHT,
            status=JobStatusEnum.QUEUED,
            progress=0.0,
        )
        render_job = Job(
            video_id=video.id,
            type=JobTypeEnum.RENDER,
            status=JobStatusEnum.QUEUED,
            progress=0.0,
        )
        db.add_all([trans_job, high_job, render_job])
        await db.commit()

        from app.workers.transcription import run_transcription

        run_transcription.delay(video_id_str)
        logger.info(
            "Pipeline: started full processing from transcription for video %s",
            video_id_str[:8],
        )

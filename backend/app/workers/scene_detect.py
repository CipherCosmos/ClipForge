"""Scene detection using PySceneDetect v0.7 (BSD license)."""
import logging
import os
import tempfile
import uuid

from scenedetect import SceneManager, open_video
from scenedetect.detectors import AdaptiveDetector, ContentDetector
from sqlalchemy import and_
from sqlalchemy.orm.attributes import flag_modified

from app.api.ws import broadcast_sync
from app.models import Job, JobStatusEnum, JobTypeEnum, Video, VideoStatusEnum
from app.services.audio import extract_full_audio
from app.services.diarization import assign_speaker_scores, diarize_audio
from app.services.emotion import (
    analyze_full_audio_emotions,
    extract_full_audio_features,
    get_segment_prosody_from_full,
)
from app.services.storage import download_file
from app.workers.celery_app import SyncSessionLocal, celery_app

logger = logging.getLogger(__name__)


def _detect_scenes(video_path: str) -> list[float]:
    """Detect scene boundaries using PySceneDetect with two detectors.

    Uses ContentDetector for hard cuts + AdaptiveDetector for fades/dissolves.
    Returns list of boundary timestamps in seconds.
    """
    video = open_video(video_path)
    scene_manager = SceneManager()

    # ContentDetector: histogram-based hard cut detection
    scene_manager.add_detector(ContentDetector(threshold=27.0))
    # AdaptiveDetector: handles fast camera movement, fades
    scene_manager.add_detector(AdaptiveDetector(adaptive_threshold=3.0))

    scene_manager.detect_scenes(video, show_progress=False)
    scene_list = scene_manager.get_scene_list()

    if not scene_list:
        return []
    boundaries = []
    first_start = scene_list[0][0].get_seconds()
    for start, end in scene_list:
        t = start.get_seconds()
        if t > first_start:
            boundaries.append(t)
    return boundaries


def _assign_scene_intensity(segments: list[dict], boundaries: list[float]) -> list[dict]:
    """Assign scene_change_intensity (0-1) to each segment based on proximity to boundaries."""
    if not boundaries:
        for seg in segments:
            seg["scene_change_intensity"] = 0.0
        return segments

    for seg in segments:
        seg_start = seg["start"]
        seg_end = seg["end"]

        # Count boundaries within this segment
        boundaries_in_seg = [b for b in boundaries if seg_start <= b <= seg_end]
        boundary_count = len(boundaries_in_seg)

        # Normalize: 0 boundaries = 0, 3+ boundaries = 1.0
        seg["scene_change_intensity"] = min(1.0, boundary_count / 3.0)

    return segments


def _calculate_viral_score(seg: dict) -> float:
    """Recalculate viral score with all available dimensions."""
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
def run_scene_detect(self, video_id: str):
    session = SyncSessionLocal()
    tmp_path = None
    audio_path = None
    tmpdir = None
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
                    Job.type == JobTypeEnum.HIGHLIGHT,
                )
            )
            .first()
        )
        if job:
            job.status = JobStatusEnum.RUNNING
            job.progress = 0.3
            session.commit()

        segments = video.segments
        if not segments:
            logger.warning("No segments for video %s", video_id)
            if job:
                job.status = JobStatusEnum.DONE
                job.progress = 1.0
                session.commit()
            return

        # Download video
        tmpdir = tempfile.mkdtemp(prefix=f"scene_{video_id}_")
        tmp_path = os.path.join(tmpdir, "input.mp4")
        download_file(video.source_url, tmp_path)

        # Extract full audio for emotion/event analysis
        audio_path = extract_full_audio(tmp_path)

        # Scene detection
        logger.info("Detecting scenes for video %s", video_id)
        broadcast_sync(video_id, "scene_detect", 0.0, "running", "Detecting scenes")
        boundaries = _detect_scenes(tmp_path)
        segments = _assign_scene_intensity(segments, boundaries)

        if job:
            job.progress = 0.5
            session.commit()

        # Speaker diarization
        try:
            logger.info("Running speaker diarization for video %s", video_id)
            diarization = diarize_audio(audio_path)
            segments = assign_speaker_scores(segments, diarization)
            logger.info(
                "Diarization complete: %d speakers detected",
                len(set(d["speaker"] for d in diarization)) if diarization else 0,
            )
        except Exception as e:
            logger.warning("Diarization failed for video %s: %s", video_id, e)
            for seg in segments:
                seg["speaker_confidence"] = 0.0

        # Single-pass audio emotion & event analysis on the full audio track
        logger.info("Running single-pass audio emotion & event analysis for video %s", video_id)
        try:
            full_emotions_events = analyze_full_audio_emotions(audio_path)
            all_emotions = full_emotions_events.get("emotions", [])
            all_events = full_emotions_events.get("events", [])
        except Exception as e:
            logger.warning("SenseVoice full analysis failed for video %s: %s", video_id, e)
            all_emotions = []
            all_events = []

        # Single-pass full audio prosody feature extraction
        logger.info("Extracting full audio prosody features for video %s", video_id)
        try:
            prosody_features = extract_full_audio_features(audio_path)
        except Exception as e:
            logger.warning("Full audio prosody extraction failed for video %s: %s", video_id, e)
            prosody_features = {}

        # Map emotion + events + prosody per segment
        total = len(segments)
        last_broadcast = -1
        for idx, seg in enumerate(segments):
            seg_start = seg["start"]
            seg_end = seg["end"]

            # Map emotions and events that overlap with this segment
            seg_emotions = [
                e for e in all_emotions
                if e.get("start", 0) < seg_end and e.get("end", 0) > seg_start
            ]
            seg_events = [
                ev for ev in all_events
                if ev.get("start", 0) < seg_end and ev.get("end", 0) > seg_start
            ]

            seg["audio_emotions"] = seg_emotions
            seg["audio_events"] = seg_events

            has_laughter = any(e.get("event") == "laughter" for e in seg_events)
            has_applause = any(e.get("event") == "applause" for e in seg_events)
            has_music = any(e.get("event") == "music" for e in seg_events)
            seg["audio_event_score"] = max(
                1.0 if has_laughter else 0.0,
                1.0 if has_applause else 0.0,
                0.5 if has_music else 0.0,
            )

            # Slice prosody features
            try:
                prosody = get_segment_prosody_from_full(prosody_features, seg_start, seg_end)
                seg["prosody"] = prosody
                seg["audio_energy"] = prosody.get("energy_mean", 0.0)
            except Exception:
                seg["prosody"] = {}
                seg["audio_energy"] = 0.0

            # Recalculate viral score
            seg["viral_score"] = _calculate_viral_score(seg)
            seg["viral_score"] *= seg.get("trend_boost", 1.0)

            if job:
                progress = 0.5 + (0.4 * (idx + 1) / total)
                job.progress = progress
                session.commit()
                pct = int((idx + 1) / total * 100)
                if pct > last_broadcast:
                    last_broadcast = pct
                    broadcast_sync(video_id, "scene_detect", progress, "running", f"Analyzed {idx + 1}/{total} segments")

        if job:
            job.progress = 0.9
        session.commit()

        logger.info("Scene detection + audio analysis complete for video %s", video_id)
        broadcast_sync(video_id, "scene_detect", 1.0, "completed", f"Analyzed {total} segments")

        return segments

    except Exception as exc:
        logger.exception("Scene detection failed for video %s", video_id)
        try:
            video = session.query(Video).filter(Video.id == uuid.UUID(video_id)).first()
            if video:
                video.status = VideoStatusEnum.FAILED
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
        if audio_path and os.path.exists(audio_path):
            os.unlink(audio_path)
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
        if tmpdir and os.path.exists(tmpdir):
            os.rmdir(tmpdir)

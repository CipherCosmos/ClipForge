"""Unit tests for the stateful incremental reprocessing pipeline.

Validates that start_pipeline intelligently reuses transcription and
highlighting results depending on database state, and enqueues tasks.
"""
import sys
from pathlib import Path
import uuid
from unittest.mock import AsyncMock, patch
from sqlalchemy.ext.asyncio import AsyncSession

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models import Video, VideoStatusEnum, JobStatusEnum, JobTypeEnum
from app.services.pipeline import start_pipeline


@pytest.mark.asyncio
async def test_start_pipeline_fresh_video():
    """Verify that a fresh video with no transcript starts from transcription."""
    db = AsyncMock(spec=AsyncSession)
    
    video = Video(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        source_url="https://youtube.com/watch?v=fresh",
        status=VideoStatusEnum.UPLOADED,
        transcript=None,
        segments=None,
        language=None,
    )
    
    with patch("app.workers.transcription.run_transcription.delay") as mock_transcribe_delay, \
         patch("app.workers.nlp.run_nlp.delay") as mock_nlp_delay, \
         patch("app.workers.scene_detect.run_scene_detect.delay") as mock_scene_delay, \
         patch("app.workers.render.run_render.delay") as mock_render_delay:
         
        await start_pipeline(db, video)
        
        # Verify db.add_all was called with the 3 jobs
        db.add_all.assert_called_once()
        jobs = db.add_all.call_args[0][0]
        assert len(jobs) == 3
        
        # Verify all jobs are queued
        assert all(j.status == JobStatusEnum.QUEUED for j in jobs)
        assert all(j.progress == 0.0 for j in jobs)
        
        # Verify Celery transcription task was enqueued
        mock_transcribe_delay.assert_called_once_with(str(video.id))
        mock_nlp_delay.assert_not_called()
        mock_scene_delay.assert_not_called()
        mock_render_delay.assert_not_called()


@pytest.mark.asyncio
async def test_start_pipeline_reuse_transcription():
    """Verify that a video with a transcript but no highlights runs highlights."""
    db = AsyncMock(spec=AsyncSession)
    
    # Video has transcript but segments have no scores
    video = Video(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        source_url="https://youtube.com/watch?v=transcribed",
        status=VideoStatusEnum.PROCESSING,
        transcript={"segments": [{"start": 0.0, "end": 2.0, "text": "hello"}]},
        segments=[{"start": 0.0, "end": 2.0, "text": "hello"}],
        language="en",
    )
    
    with patch("app.workers.transcription.run_transcription.delay") as mock_transcribe_delay, \
         patch("app.workers.nlp.run_nlp.delay") as mock_nlp_delay, \
         patch("app.workers.scene_detect.run_scene_detect.delay") as mock_scene_delay, \
         patch("app.workers.render.run_render.delay") as mock_render_delay:
         
        await start_pipeline(db, video)
        
        # Verify jobs added
        jobs = db.add_all.call_args[0][0]
        assert len(jobs) == 3
        
        # Transcription job is DONE/1.0
        trans_job = next(j for j in jobs if j.type == JobTypeEnum.TRANSCRIPTION)
        assert trans_job.status == JobStatusEnum.DONE
        assert trans_job.progress == 1.0
        
        # Highlights and Render jobs are QUEUED/0.0
        high_job = next(j for j in jobs if j.type == JobTypeEnum.HIGHLIGHT)
        assert high_job.status == JobStatusEnum.QUEUED
        assert high_job.progress == 0.0
        
        # Verify Celery NLP and Scene Detect tasks enqueued
        mock_transcribe_delay.assert_not_called()
        mock_nlp_delay.assert_called_once_with(str(video.id))
        mock_scene_delay.assert_called_once_with(str(video.id))
        mock_render_delay.assert_not_called()


@pytest.mark.asyncio
async def test_start_pipeline_reuse_highlights():
    """Verify that a video with highlights already computed skips to render directly."""
    db = AsyncMock(spec=AsyncSession)
    
    # Video has transcript and scored segments
    video = Video(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        source_url="https://youtube.com/watch?v=highlighted",
        status=VideoStatusEnum.PROCESSING,
        transcript={"segments": [{"start": 0.0, "end": 2.0, "text": "hello"}]},
        segments=[{
            "start": 0.0, "end": 2.0, "text": "hello",
            "hook_score": 0.8, "speaker_confidence": 0.9
        }],
        language="en",
    )
    
    with patch("app.workers.transcription.run_transcription.delay") as mock_transcribe_delay, \
         patch("app.workers.nlp.run_nlp.delay") as mock_nlp_delay, \
         patch("app.workers.scene_detect.run_scene_detect.delay") as mock_scene_delay, \
         patch("app.workers.render.run_render.delay") as mock_render_delay:
         
        await start_pipeline(db, video)
        
        # Verify jobs added
        jobs = db.add_all.call_args[0][0]
        assert len(jobs) == 3
        
        # Transcription and Highlights jobs are DONE/1.0
        trans_job = next(j for j in jobs if j.type == JobTypeEnum.TRANSCRIPTION)
        assert trans_job.status == JobStatusEnum.DONE
        assert trans_job.progress == 1.0
        
        high_job = next(j for j in jobs if j.type == JobTypeEnum.HIGHLIGHT)
        assert high_job.status == JobStatusEnum.DONE
        assert high_job.progress == 1.0
        
        # Render job is QUEUED/0.0
        render_job = next(j for j in jobs if j.type == JobTypeEnum.RENDER)
        assert render_job.status == JobStatusEnum.QUEUED
        assert render_job.progress == 0.0
        
        # Verify Celery Render task enqueued
        mock_transcribe_delay.assert_not_called()
        mock_nlp_delay.assert_not_called()
        mock_scene_delay.assert_not_called()
        mock_render_delay.assert_called_once_with(str(video.id))


@pytest.mark.asyncio
async def test_start_pipeline_force_rehighlight():
    """Verify that force_highlights=True strips old scoring keys and re-runs highlights."""
    db = MagicMock_with_AsyncSession = AsyncMock(spec=AsyncSession)
    
    # Video has transcript and scored segments
    video = Video(
        id=uuid.uuid4(),
        user_id=uuid.uuid4(),
        source_url="https://youtube.com/watch?v=highlighted",
        status=VideoStatusEnum.PROCESSING,
        transcript={"segments": [{"start": 0.0, "end": 2.0, "text": "hello"}]},
        segments=[{
            "start": 0.0, "end": 2.0, "text": "hello",
            "hook_score": 0.8, "speaker_confidence": 0.9, "viral_score": 0.85
        }],
        language="en",
    )
    
    with patch("app.workers.transcription.run_transcription.delay") as mock_transcribe_delay, \
         patch("app.workers.nlp.run_nlp.delay") as mock_nlp_delay, \
         patch("app.workers.scene_detect.run_scene_detect.delay") as mock_scene_delay, \
         patch("app.workers.render.run_render.delay") as mock_render_delay:
         
        await start_pipeline(db, video, force_highlights=True)
        
        # Verify the segments list cleared the scoring keys
        assert len(video.segments) == 1
        assert "hook_score" not in video.segments[0]
        assert "speaker_confidence" not in video.segments[0]
        assert "viral_score" not in video.segments[0]
        assert video.segments[0]["text"] == "hello"  # preserves text
        
        # Verify Celery NLP and Scene Detect tasks enqueued (re-run highlights)
        mock_transcribe_delay.assert_not_called()
        mock_nlp_delay.assert_called_once_with(str(video.id))
        mock_scene_delay.assert_called_once_with(str(video.id))
        mock_render_delay.assert_not_called()

import logging
import os
import tempfile
import uuid
from pathlib import Path
from typing import Optional
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from pydantic import BaseModel
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ratelimit import limiter
from app.core.security import get_current_user
from app.database import get_db
from app.models.job import Job, JobStatusEnum, JobTypeEnum
from app.models.user import User
from app.models.video import Video, VideoStatusEnum
from app.schemas.video import VideoCreate, VideoListResponse, VideoResponse
from app.services.platforms import get_preset, list_presets
from app.services.storage import (
    copy_file,
    copy_prefix,
    delete_file,
    delete_prefix,
    ensure_bucket,
    get_presigned_url,
    upload_file,
)
from app.services.video import standardize_youtube_url

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/videos", tags=["videos"])


def _validate_url(url: str):
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid URL scheme")
    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid URL")


async def get_or_clone_video_if_exists(
    db: AsyncSession, url: str, platform: str, user_id: uuid.UUID
) -> Optional[Video]:
    """Check if video has already been processed and clone it or return the
    existing user's record."""
    # 1. Standardize URL
    standard_url = standardize_youtube_url(url)

    # 2. Check if the current user already has this video
    stmt = (
        select(Video)
        .where(Video.user_id == user_id, Video.source_url == standard_url)
        .order_by(Video.created_at.desc())
    )
    res = await db.execute(stmt)
    existing_for_user = res.scalars().first()
    if existing_for_user:
        logger.info("Found existing video for same user with ID %s", existing_for_user.id)
        return existing_for_user

    # 3. Check if any other user has a COMPLETED video for this URL
    stmt_other = (
        select(Video)
        .where(Video.source_url == standard_url, Video.status == VideoStatusEnum.COMPLETED)
        .order_by(Video.created_at.desc())
    )
    res_other = await db.execute(stmt_other)
    completed_other = res_other.scalars().first()

    if completed_other:
        logger.info(
            "Deduplication Match: cloning video %s for user %s", completed_other.id, user_id
        )

        # Clone the Video
        cloned_video = Video(
            user_id=user_id,
            source_url=standard_url,
            status=VideoStatusEnum.COMPLETED,
            duration=completed_other.duration,
            title=completed_other.title,
            transcript=completed_other.transcript,
            segments=completed_other.segments,
            language=completed_other.language,
            platform=platform or completed_other.platform,
        )
        db.add(cloned_video)
        await db.flush()  # Populate cloned_video.id

        # Clone storage files if source_url is a storage path (starts with videos/)
        if not standard_url.startswith("http"):
            ext = Path(standard_url).suffix or ".mp4"
            dest_source_url = f"videos/{user_id}/{cloned_video.id}{ext}"
            copy_file(standard_url, dest_source_url)
            cloned_video.source_url = dest_source_url

        # Copy clips and compilations in storage
        copy_prefix(f"clips/{completed_other.id}/", f"clips/{cloned_video.id}/")
        copy_prefix(f"compilations/{completed_other.id}/", f"compilations/{cloned_video.id}/")

        # Clone the Clips
        from app.models.clip import Clip

        stmt_clips = select(Clip).where(Clip.video_id == completed_other.id)
        res_clips = await db.execute(stmt_clips)
        other_clips = res_clips.scalars().all()
        for clip in other_clips:
            # Replace old video ID with new video ID in the paths
            file_url = clip.file_url
            if file_url and str(completed_other.id) in file_url:
                file_url = file_url.replace(str(completed_other.id), str(cloned_video.id))
            thumbnail_url = clip.thumbnail_url
            if thumbnail_url and str(completed_other.id) in thumbnail_url:
                thumbnail_url = thumbnail_url.replace(str(completed_other.id), str(cloned_video.id))

            cloned_clip = Clip(
                video_id=cloned_video.id,
                start_time=clip.start_time,
                end_time=clip.end_time,
                caption=clip.caption,
                score=clip.score,
                file_url=file_url,
                thumbnail_url=thumbnail_url,
                title=clip.title,
                hashtags=clip.hashtags,
            )
            db.add(cloned_clip)

        # Create completed Jobs
        for jtype in [JobTypeEnum.TRANSCRIPTION, JobTypeEnum.HIGHLIGHT, JobTypeEnum.RENDER]:
            cloned_job = Job(
                video_id=cloned_video.id, type=jtype, status=JobStatusEnum.DONE, progress=1.0
            )
            db.add(cloned_job)

        await db.commit()
        await db.refresh(cloned_video)
        return cloned_video

    return None


async def _video_to_response(video: Video, db: AsyncSession | None = None) -> VideoResponse:
    resp = VideoResponse.model_validate(video)
    if video.source_url and not video.source_url.startswith("http"):
        try:
            resp.source_url = get_presigned_url(video.source_url)
        except Exception:
            pass
    if video.thumbnail_url and not video.thumbnail_url.startswith("http"):
        try:
            resp.thumbnail_url = get_presigned_url(video.thumbnail_url)
        except Exception:
            pass
    if video.segments:
        resp.viral_score = max(
            (s.get("viral_score", 0.0) for s in video.segments if isinstance(s, dict)),
            default=None,
        )
    # Include job progress for frontend real-time polling
    if db:
        try:
            import uuid

            from sqlalchemy import select

            from app.models import Job, JobStatusEnum

            running_job = await db.execute(
                select(Job)
                .where(
                    Job.video_id == uuid.UUID(str(video.id)),
                    Job.status == JobStatusEnum.RUNNING,
                )
                .limit(1)
            )
            rj = running_job.scalar_one_or_none()
            if rj:
                resp.progress = min(99.0, rj.progress * 100.0)
            else:
                all_jobs = await db.execute(
                    select(Job).where(Job.video_id == uuid.UUID(str(video.id)))
                )
                jlist = all_jobs.scalars().all()
                if jlist and all(j.status == JobStatusEnum.DONE for j in jlist):
                    resp.progress = 100.0
        except Exception:
            pass
    return resp


@router.post("", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def upload_video(
    request: Request,
    file: UploadFile = File(...),
    platform: str = Query("youtube_shorts", description="Platform preset"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    get_preset(platform)

    ensure_bucket()

    # Stream to temp file instead of reading all into memory
    ext = Path(file.filename or "video.mp4").suffix or ".mp4"
    tmp = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    try:
        content = await file.read()
        tmp.write(content)
        tmp.close()

        object_name = f"videos/{current_user.id}/{uuid.uuid4()}{ext}"
        upload_file(tmp.name, object_name)
    finally:
        os.unlink(tmp.name)

    source_url = object_name

    video = Video(
        user_id=current_user.id,
        source_url=source_url,
        status=VideoStatusEnum.UPLOADED,
        title=file.filename,
        platform=platform,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)

    from app.services.pipeline import start_pipeline

    await start_pipeline(db, video)

    return await _video_to_response(video, db)


@router.post("/import", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def import_video(
    request: Request,
    payload: VideoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    _validate_url(payload.source_url)
    ensure_bucket()
    preset = get_preset(payload.platform or "youtube_shorts")

    # Standardize URL
    standardized = standardize_youtube_url(payload.source_url)

    # Check/clone if exists
    cloned = await get_or_clone_video_if_exists(db, standardized, preset.name, current_user.id)
    if cloned:
        return await _video_to_response(cloned, db)

    video = Video(
        user_id=current_user.id,
        source_url=standardized,
        status=VideoStatusEnum.UPLOADED,
        duration=None,
        title="Importing from YouTube...",
        platform=preset.name,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)

    from app.services.pipeline import start_pipeline

    await start_pipeline(db, video)

    return await _video_to_response(video, db)


@router.post("/import-batch", status_code=status.HTTP_201_CREATED)
async def import_batch_videos(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    urls = payload.get("urls", [])
    platform = payload.get("platform", "youtube_shorts")

    if not urls:
        raise HTTPException(status_code=400, detail="No URLs provided")

    if len(urls) > 10:
        raise HTTPException(status_code=400, detail="Maximum 10 URLs per batch")

    preset = get_preset(platform)
    created = []

    for url in urls:
        _validate_url(url)
        standardized = standardize_youtube_url(url)

        # Check/clone if exists
        cloned = await get_or_clone_video_if_exists(db, standardized, preset.name, current_user.id)
        if cloned:
            created.append({"id": str(cloned.id), "url": url, "cloned": True})
            continue

        video = Video(
            user_id=current_user.id,
            source_url=standardized,
            status=VideoStatusEnum.UPLOADED,
            duration=None,
            title="Importing from YouTube...",
            platform=preset.name,
        )
        db.add(video)
        await db.flush()

        from app.services.pipeline import start_pipeline

        await start_pipeline(db, video)

        created.append({"id": str(video.id), "url": url, "cloned": False})

    await db.commit()
    return {"videos": created, "count": len(created)}


@router.get("/platforms")
async def list_platform_presets():
    return list_presets()


@router.get("", response_model=VideoListResponse)
async def list_videos(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    count_result = await db.execute(
        select(func.count(Video.id)).where(Video.user_id == current_user.id)
    )
    total = count_result.scalar()

    result = await db.execute(
        select(Video)
        .where(Video.user_id == current_user.id)
        .order_by(Video.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    videos = result.scalars().all()

    return VideoListResponse(
        items=[await _video_to_response(v, db) for v in videos],
        total=total,
    )


@router.get("/{video_id}", response_model=VideoResponse)
async def get_video(
    video_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Video).where(Video.id == video_id, Video.user_id == current_user.id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")
    return await _video_to_response(video, db)


@router.post("/{video_id}/reprocess", response_model=VideoResponse)
async def reprocess_video(
    video_id: uuid.UUID,
    force_retranscribe: bool = False,
    force_rehighlight: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Video).where(Video.id == video_id, Video.user_id == current_user.id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    from app.services.pipeline import start_pipeline

    try:
        await start_pipeline(
            db,
            video,
            force_transcribe=force_retranscribe,
            force_highlights=force_rehighlight,
        )
    except Exception as e:
        logger.error("Failed to enqueue pipeline task: %s", e)
        raise HTTPException(
            status_code=503,
            detail="Processing queue unavailable. Make sure Celery and Redis are running.",
        )

    return await _video_to_response(video, db)


@router.delete("/{video_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_video(
    video_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Video).where(Video.id == video_id, Video.user_id == current_user.id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    from app.models.clip import Clip

    await db.execute(delete(Clip).where(Clip.video_id == video_id))
    await db.execute(delete(Job).where(Job.video_id == video_id))
    await db.execute(delete(Video).where(Video.id == video_id))
    await db.commit()

    delete_file(video.source_url)
    delete_prefix(f"clips/{video_id}/")


@router.post("/batch-delete", status_code=status.HTTP_204_NO_CONTENT)
async def batch_delete_videos(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ids = payload.get("ids", [])
    if not ids:
        raise HTTPException(status_code=400, detail="No video IDs provided")

    from app.models.clip import Clip
    from app.models.job import Job

    for vid in ids:
        video_uuid = uuid.UUID(vid)
        # Verify ownership
        result = await db.execute(
            select(Video).where(Video.id == video_uuid, Video.user_id == current_user.id)
        )
        video = result.scalar_one_or_none()
        if not video:
            continue

        await db.execute(delete(Clip).where(Clip.video_id == video_uuid))
        await db.execute(delete(Job).where(Job.video_id == video_uuid))
        await db.execute(delete(Video).where(Video.id == video_uuid))

        delete_file(video.source_url)
        delete_prefix(f"clips/{video_uuid}/")

    await db.commit()



class VideoDubRequest(BaseModel):
    target_langs: list[str] | None = None


@router.post("/{video_id}/dub", response_model=VideoResponse)
async def dub_video(
    video_id: uuid.UUID,
    payload: VideoDubRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Video).where(Video.id == video_id, Video.user_id == current_user.id)
    )
    video = result.scalar_one_or_none()
    if not video:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    from app.workers.dubbing import run_dub_video

    run_dub_video.delay(str(video_id), payload.target_langs)

    return await _video_to_response(video, db)

import os
import tempfile
import uuid
from pathlib import Path
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_db
from app.core.ratelimit import limiter
from app.models.job import Job, JobStatusEnum, JobTypeEnum
from app.models.user import User
from app.models.video import Video, VideoStatusEnum
from app.schemas.video import VideoCreate, VideoListResponse, VideoResponse
from app.services.platforms import get_preset, list_presets
from app.services.storage import delete_file, delete_prefix, ensure_bucket, get_presigned_url, upload_file
from app.services.video import download_from_url, get_video_duration

router = APIRouter(prefix="/api/videos", tags=["videos"])


def _validate_url(url: str):
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="Invalid URL scheme")
    if not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid URL")


def _video_to_response(video: Video) -> VideoResponse:
    resp = VideoResponse.model_validate(video)
    if video.source_url and not video.source_url.startswith("http"):
        try:
            resp.source_url = get_presigned_url(video.source_url)
        except Exception:
            pass
    if video.segments:
        resp.viral_score = max(
            (s.get("viral_score", 0.0) for s in video.segments if isinstance(s, dict)),
            default=None,
        )
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

    job1 = Job(video_id=video.id, type=JobTypeEnum.TRANSCRIPTION, status=JobStatusEnum.QUEUED)
    job2 = Job(video_id=video.id, type=JobTypeEnum.HIGHLIGHT, status=JobStatusEnum.QUEUED)
    job3 = Job(video_id=video.id, type=JobTypeEnum.RENDER, status=JobStatusEnum.QUEUED)
    db.add_all([job1, job2, job3])
    await db.commit()
    await db.refresh(video)

    from app.workers.transcription import run_transcription
    run_transcription.delay(str(video.id))

    return _video_to_response(video)


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

    video = Video(
        user_id=current_user.id,
        source_url=payload.source_url,
        status=VideoStatusEnum.UPLOADED,
        duration=None,
        title="Importing from YouTube...",
        platform=preset.name,
    )
    db.add(video)
    await db.commit()
    await db.refresh(video)

    job1 = Job(video_id=video.id, type=JobTypeEnum.TRANSCRIPTION, status=JobStatusEnum.QUEUED)
    job2 = Job(video_id=video.id, type=JobTypeEnum.HIGHLIGHT, status=JobStatusEnum.QUEUED)
    job3 = Job(video_id=video.id, type=JobTypeEnum.RENDER, status=JobStatusEnum.QUEUED)
    db.add_all([job1, job2, job3])
    await db.commit()
    await db.refresh(video)

    from app.workers.transcription import run_transcription
    run_transcription.delay(str(video.id))

    return _video_to_response(video)


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
        items=[_video_to_response(v) for v in videos],
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
    return _video_to_response(video)

@router.post("/{video_id}/reprocess", response_model=VideoResponse)
async def reprocess_video(
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
    
    # Reset video metadata to force complete recalculation
    video.transcript = None
    video.segments = None
    video.language = None

    await db.execute(delete(Clip).where(Clip.video_id == video_id))
    await db.execute(delete(Job).where(Job.video_id == video_id))
    
    video.status = VideoStatusEnum.UPLOADED
    
    job1 = Job(
        video_id=video.id, 
        type=JobTypeEnum.TRANSCRIPTION, 
        status=JobStatusEnum.QUEUED,
        progress=0.0
    )
    job2 = Job(
        video_id=video.id, 
        type=JobTypeEnum.HIGHLIGHT, 
        status=JobStatusEnum.QUEUED,
        progress=0.0
    )
    job3 = Job(
        video_id=video.id, 
        type=JobTypeEnum.RENDER, 
        status=JobStatusEnum.QUEUED,
        progress=0.0
    )
    db.add_all([job1, job2, job3])
    await db.commit()
    await db.refresh(video)
    
    from app.workers.transcription import run_transcription
    run_transcription.delay(str(video.id))

    return _video_to_response(video)



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


from pydantic import BaseModel

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

    return _video_to_response(video)

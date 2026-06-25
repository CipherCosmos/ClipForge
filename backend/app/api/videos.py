import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_db
from app.models.job import Job, JobStatusEnum, JobTypeEnum
from app.models.user import User
from app.models.video import Video, VideoStatusEnum
from app.schemas.video import VideoCreate, VideoListResponse, VideoResponse
from app.services.platforms import get_preset, list_presets
from app.services.storage import delete_file, ensure_bucket, get_presigned_url, upload_file
from app.services.video import download_from_url, get_video_duration

router = APIRouter(prefix="/api/videos", tags=["videos"])


def _video_to_response(video: Video) -> VideoResponse:
    """Convert Video model to VideoResponse with presigned URL and job progress."""
    resp = VideoResponse.model_validate(video)
    try:
        resp.source_url = get_presigned_url(video.source_url)
    except Exception:
        pass
    try:
        from app.models.job import Job
        from app.workers.celery_app import SyncSessionLocal

        session = SyncSessionLocal()
        try:
            jobs = session.query(Job).filter(Job.video_id == video.id).all()
            if jobs:
                overall = 0.0
                for j in jobs:
                    p = j.progress or 0.0
                    if j.type == JobTypeEnum.TRANSCRIPTION:
                        overall += p * 30.0
                    elif j.type == JobTypeEnum.HIGHLIGHT:
                        overall += p * 50.0
                    elif j.type == JobTypeEnum.RENDER:
                        overall += p * 20.0
                resp.progress = min(overall, 99.0)
        finally:
            session.close()
    except Exception:
        pass
    if video.segments:
        resp.viral_score = max(
            (s.get("viral_score", 0.0) for s in video.segments if isinstance(s, dict)),
            default=None,
        )
    return resp


@router.post("", response_model=VideoResponse, status_code=status.HTTP_201_CREATED)
async def upload_video(
    file: UploadFile = File(...),
    platform: str = Query("youtube_shorts", description="Platform preset"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    get_preset(platform)

    ensure_bucket()

    content = await file.read()
    ext = Path(file.filename or "video.mp4").suffix or ".mp4"
    object_name = f"videos/{current_user.id}/{uuid.uuid4()}{ext}"

    from app.services.storage import upload_bytes
    upload_bytes(content, object_name, content_type=file.content_type or "video/mp4")

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
async def import_video(
    payload: VideoCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ensure_bucket()

    preset = get_preset(payload.platform or "youtube_shorts")

    try:
        file_path = download_from_url(payload.source_url)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to download video: {exc}",
        )

    duration = None
    try:
        duration = get_video_duration(file_path)
    except Exception:
        pass

    object_name = f"videos/{current_user.id}/{uuid.uuid4()}.mp4"
    upload_file(file_path, object_name)

    video = Video(
        user_id=current_user.id,
        source_url=object_name,
        status=VideoStatusEnum.UPLOADED,
        duration=duration,
        title=Path(file_path).name,
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
    
    has_transcription = bool(video.transcript and video.segments and len(video.segments) > 0)
    has_highlights = False
    if has_transcription:
        scored = [s for s in video.segments if isinstance(s, dict) and "hook_score" in s and "scene_change_intensity" in s]
        has_highlights = len(scored) >= max(1, len(video.segments) // 2)

    await db.execute(delete(Clip).where(Clip.video_id == video_id))
    await db.execute(delete(Job).where(Job.video_id == video_id))
    
    video.status = VideoStatusEnum.UPLOADED
    
    job1 = Job(
        video_id=video.id, 
        type=JobTypeEnum.TRANSCRIPTION, 
        status=JobStatusEnum.DONE if has_transcription else JobStatusEnum.QUEUED,
        progress=1.0 if has_transcription else 0.0
    )
    job2 = Job(
        video_id=video.id, 
        type=JobTypeEnum.HIGHLIGHT, 
        status=JobStatusEnum.DONE if has_highlights else JobStatusEnum.QUEUED,
        progress=1.0 if has_highlights else 0.0
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

    from app.services.storage import delete_prefix
    delete_file(video.source_url)
    delete_prefix(f"clips/{video_id}/")

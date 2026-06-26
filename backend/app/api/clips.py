import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_db
from app.models.clip import Clip
from app.models.user import User
from app.models.video import Video
from app.schemas.clip import ClipListResponse, ClipResponse
from app.services.storage import get_presigned_url

router = APIRouter(prefix="/api/clips", tags=["clips"])


def _clip_to_response(clip: Clip) -> ClipResponse:
    resp = ClipResponse.model_validate(clip)
    if resp.file_url and not resp.file_url.startswith("http"):
        try:
            resp.file_url = get_presigned_url(resp.file_url)
        except Exception:
            pass
    if resp.thumbnail_url and not resp.thumbnail_url.startswith("http"):
        try:
            resp.thumbnail_url = get_presigned_url(resp.thumbnail_url)
        except Exception:
            pass

    # Scan MinIO for dubbed files
    try:
        from app.services.storage import list_files
        prefix = f"dubs/{clip.video_id}/{clip.id}_"
        objects = list_files(prefix)
        dubs = {}
        for obj_name in objects:
            filename = obj_name.split("/")[-1]
            if filename.endswith(".mp4"):
                name_part = filename[:-4]
                parts = name_part.split("_")
                if len(parts) >= 2:
                    lang = parts[-1]
                    dubs[lang] = get_presigned_url(obj_name)
        resp.dubs = dubs
    except Exception:
        resp.dubs = {}

    return resp


@router.get("", response_model=ClipListResponse)
async def list_clips(
    video_id: uuid.UUID = Query(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
):
    video_result = await db.execute(
        select(Video).where(Video.id == video_id, Video.user_id == current_user.id)
    )
    if not video_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Video not found")

    count_result = await db.execute(
        select(func.count(Clip.id)).where(Clip.video_id == video_id)
    )
    total = count_result.scalar()

    result = await db.execute(
        select(Clip)
        .where(Clip.video_id == video_id)
        .order_by(Clip.start_time)
        .offset(skip)
        .limit(limit)
    )
    clips = result.scalars().all()

    return ClipListResponse(
        items=[_clip_to_response(c) for c in clips],
        total=total,
    )


@router.get("/{clip_id}", response_model=ClipResponse)
async def get_clip(
    clip_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Clip).where(Clip.id == clip_id)
    )
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")

    video_result = await db.execute(
        select(Video).where(Video.id == clip.video_id, Video.user_id == current_user.id)
    )
    if not video_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")

    return _clip_to_response(clip)


from pydantic import BaseModel

class ClipDubRequest(BaseModel):
    target_lang: str


@router.post("/{clip_id}/dub", response_model=ClipResponse)
async def dub_clip_endpoint(
    clip_id: uuid.UUID,
    payload: ClipDubRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Clip).where(Clip.id == clip_id)
    )
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")

    video_result = await db.execute(
        select(Video).where(Video.id == clip.video_id, Video.user_id == current_user.id)
    )
    if not video_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clip not found")

    from app.workers.dubbing import run_dub_clip
    run_dub_clip.delay(str(clip_id), payload.target_lang)

    return _clip_to_response(clip)

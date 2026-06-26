"""Scheduled publishing endpoints."""
import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_token, encrypt_token
from app.core.security import get_current_user
from app.database import get_db
from app.models.clip import Clip
from app.models.schedule import Schedule
from app.models.user import User
from app.models.video import Video
from app.services.publishing import publish_clip
from app.services.storage import get_presigned_url, list_files

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/schedule", tags=["scheduling"])


class ScheduleCreateRequest(BaseModel):
    clip_id: str
    platform: str
    title: str = ""
    description: str = ""
    hashtags: str = ""
    access_token: str = ""
    platform_account_id: str | None = None
    platform_user_id: str | None = None
    scheduled_at: str  # ISO 8601 datetime
    dub_language: str | None = None  # Publish dubbed version if available


class ScheduleResponse(BaseModel):
    id: str
    clip_id: str
    platform: str
    title: str
    description: str
    hashtags: str
    access_token_masked: str
    platform_user_id: str | None
    dub_language: str | None
    scheduled_at: datetime
    status: str
    result: dict | None
    created_at: datetime
    updated_at: datetime


def mask_token(token: str) -> str:
    if len(token) <= 8:
        return token[:2] + "***"
    return token[:4] + "..." + token[-4:]


def _schedule_to_response(s: Schedule) -> ScheduleResponse:
    return ScheduleResponse(
        id=str(s.id),
        clip_id=str(s.clip_id),
        platform=s.platform,
        title=s.title or "",
        description=s.description or "",
        hashtags=s.hashtags or "",
        access_token_masked=mask_token(decrypt_token(s.access_token)),
        platform_user_id=s.platform_user_id,
        dub_language=s.dub_language,
        scheduled_at=s.scheduled_at,
        status=s.status,
        result=s.result,
        created_at=s.created_at,
        updated_at=s.updated_at,
    )


@router.post("")
async def create_schedule(
    req: ScheduleCreateRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    clip_uuid = uuid.UUID(req.clip_id)
    result = await db.execute(
        select(Clip).join(Video).where(Clip.id == clip_uuid, Video.user_id == current_user.id)
    )
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")

    try:
        scheduled_dt = datetime.fromisoformat(req.scheduled_at.replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid scheduled_at format. Use ISO 8601.")

    if scheduled_dt <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="scheduled_at must be in the future")

    # Resolve access_token from platform_account_id if provided
    from app.models.platform_account import PlatformAccount

    access_token = req.access_token
    platform_account_id = None
    if req.platform_account_id:
        acc_result = await db.execute(
            select(PlatformAccount).where(
                PlatformAccount.id == uuid.UUID(req.platform_account_id),
                PlatformAccount.user_id == current_user.id,
            )
        )
        account = acc_result.scalar_one_or_none()
        if account:
            try:
                access_token = decrypt_token(account.access_token)
                platform_account_id = account.id
            except Exception:
                raise HTTPException(status_code=500, detail="Failed to decrypt account credentials")

    if not access_token:
        raise HTTPException(status_code=400, detail="Provide access_token or platform_account_id")

    schedule = Schedule(
        user_id=current_user.id,
        clip_id=clip_uuid,
        platform=req.platform,
        title=req.title or clip.title or "",
        description=req.description or clip.caption or "",
        hashtags=req.hashtags or clip.hashtags or "",
        access_token=encrypt_token(access_token),
        platform_account_id=platform_account_id,
        platform_user_id=req.platform_user_id or (account.platform_user_id if account else None),
        dub_language=req.dub_language if req.dub_language and req.dub_language != "original" else None,
        scheduled_at=scheduled_dt,
        status="pending",
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)

    return _schedule_to_response(schedule)


@router.get("")
async def list_schedules(
    status: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    query = select(Schedule).where(Schedule.user_id == current_user.id)
    if status:
        query = query.where(Schedule.status == status)
    query = query.order_by(Schedule.scheduled_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    schedules = result.scalars().all()

    count_query = select(sa_func.count()).select_from(Schedule).where(Schedule.user_id == current_user.id)
    if status:
        count_query = count_query.where(Schedule.status == status)
    count_result = await db.execute(count_query)
    total = count_result.scalar()

    return {
        "items": [_schedule_to_response(s) for s in schedules],
        "total": total,
    }


@router.delete("/{schedule_id}")
async def cancel_schedule(
    schedule_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Schedule).where(
            Schedule.id == uuid.UUID(schedule_id),
            Schedule.user_id == current_user.id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if schedule.status != "pending":
        raise HTTPException(status_code=400, detail="Only pending schedules can be cancelled")

    await db.delete(schedule)
    await db.commit()
    return {"success": True}


@router.post("/{schedule_id}/publish-now")
async def publish_now(
    schedule_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Schedule).where(
            Schedule.id == uuid.UUID(schedule_id),
            Schedule.user_id == current_user.id,
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Schedule not found")
    if schedule.status != "pending":
        raise HTTPException(status_code=400, detail="Schedule is not in pending status")

    schedule.status = "publishing"
    await db.commit()

    try:
        # Resolve file URL — use dubbed version if dub_language is set
        file_url = schedule.clip.file_url
        if schedule.dub_language:
            dub_object_name = f"dubs/{schedule.clip.video_id}/{schedule.clip_id}_{schedule.dub_language}.mp4"
            try:
                all_dub_files = list_files(f"dubs/{schedule.clip.video_id}/")
                if dub_object_name in all_dub_files:
                    file_url = get_presigned_url(dub_object_name)
                    logger.info("Publishing dubbed version: lang=%s, clip=%s", schedule.dub_language, schedule.clip_id)
                else:
                    logger.warning("Dubbed file not found for scheduled publish, using original")
            except Exception as e:
                logger.warning("Failed to resolve dubbed URL for scheduled publish: %s", e)

        if file_url and not file_url.startswith("http"):
            try:
                file_url = get_presigned_url(file_url)
            except Exception:
                pass

        result_obj = await publish_clip(
            file_url,
            schedule.platform,
            schedule.title or "",
            schedule.description or "",
            schedule.hashtags or "",
            decrypt_token(schedule.access_token),
            schedule.platform_user_id,
        )
        schedule.result = result_obj
        if result_obj.get("success"):
            schedule.status = "published"
        else:
            schedule.status = "failed"
    except Exception as e:
        schedule.status = "failed"
        schedule.result = {"error": str(e)}

    await db.commit()
    await db.refresh(schedule)
    return _schedule_to_response(schedule)

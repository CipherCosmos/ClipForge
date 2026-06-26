"""Social media publishing endpoints."""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func as sa_func
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_token
from app.core.security import get_current_user
from app.database import get_db
from app.models.clip import Clip
from app.models.platform_account import PlatformAccount
from app.models.publish_log import PublishLog
from app.models.user import User
from app.models.video import Video
from app.services.publishing import publish_clip
from app.services.storage import get_presigned_url, list_files
from app.services.webhooks import (
    fire_event_async,
    get_webhooks_for_video,
    register_webhook,
    unregister_webhook,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/publish", tags=["publishing"])

PLATFORM_LABELS = {
    "youtube_shorts": "YouTube Shorts",
    "tiktok": "TikTok",
    "instagram_reels": "Instagram Reels",
    "linkedin": "LinkedIn Video",
}


class PublishRequest(BaseModel):
    clip_id: str
    platform: str
    title: str = ""
    description: str = ""
    hashtags: str = ""
    # Either provide a saved account ID OR a raw access token
    platform_account_id: str | None = None
    access_token: str | None = None
    platform_user_id: str | None = None
    dub_language: str | None = None
    privacy: str | None = None  # public, unlisted, private


class WebhookRegisterRequest(BaseModel):
    video_id: str
    url: str
    events: list[str] | None = None


def _resolve_dub_url(clip, dub_language: str | None) -> str | None:
    """Resolve the dubbed clip URL from storage if dub_language is set."""
    file_url = clip.file_url
    if dub_language and dub_language != "original":
        dub_object_name = f"dubs/{clip.video_id}/{clip.id}_{dub_language}.mp4"
        try:
            all_dub_files = list_files(f"dubs/{clip.video_id}/")
            if dub_object_name in all_dub_files:
                file_url = get_presigned_url(dub_object_name)
                logger.info("Using dubbed version: lang=%s, clip=%s", dub_language, clip.id)
            else:
                logger.warning(
                    "Dubbed file not found for lang=%s clip=%s, falling back to original",
                    dub_language, clip.id,
                )
        except Exception as e:
            logger.warning("Failed to resolve dubbed URL: %s", e)

    # Presign if it's a storage path
    if file_url and not file_url.startswith("http"):
        try:
            file_url = get_presigned_url(file_url)
        except Exception:
            pass

    return file_url


@router.post("/clip")
async def publish_clip_endpoint(
    req: PublishRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Validate clip ownership
    clip_uuid = uuid.UUID(req.clip_id)
    result = await db.execute(
        select(Clip).join(Video).where(Clip.id == clip_uuid, Video.user_id == current_user.id)
    )
    clip = result.scalar_one_or_none()
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found")

    # Resolve access token — prefer saved account, fall back to raw token
    access_token = None
    platform_user_id = req.platform_user_id
    account_id = None

    if req.platform_account_id:
        acc_result = await db.execute(
            select(PlatformAccount).where(
                PlatformAccount.id == uuid.UUID(req.platform_account_id),
                PlatformAccount.user_id == current_user.id,
                PlatformAccount.is_active == True,
            )
        )
        account = acc_result.scalar_one_or_none()
        if not account:
            raise HTTPException(status_code=404, detail="Platform account not found or inactive")
        try:
            access_token = decrypt_token(account.access_token)
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to decrypt account credentials")
        if account.platform_user_id:
            platform_user_id = account.platform_user_id
        account_id = account.id
    elif req.access_token:
        access_token = req.access_token
    else:
        raise HTTPException(
            status_code=400,
            detail="Provide either platform_account_id or access_token",
        )

    # Resolve file URL (with dub support)
    file_url = _resolve_dub_url(clip, req.dub_language)

    # Create publish log entry
    log_entry = PublishLog(
        user_id=current_user.id,
        clip_id=clip_uuid,
        platform_account_id=account_id,
        platform=req.platform,
        status="pending",
        dub_language=req.dub_language if req.dub_language and req.dub_language != "original" else None,
        title=req.title or clip.title or "",
        description=req.description or clip.caption or "",
        hashtags=req.hashtags or clip.hashtags or "",
    )
    db.add(log_entry)
    await db.commit()
    await db.refresh(log_entry)

    # Publish
    try:
        client_id = account.client_id if account_id else None
        client_secret = account.client_secret if account_id else None
        result_obj = await publish_clip(
            file_url,
            req.platform,
            req.title or clip.title or "",
            req.description or clip.caption or "",
            req.hashtags or clip.hashtags or "",
            access_token,
            platform_user_id,
            client_id=client_id,
            client_secret=client_secret,
            privacy=req.privacy or "public",
        )

        # Update log
        log_entry.result = result_obj
        log_entry.status = "success" if result_obj.get("success") else "failed"
        await db.commit()

        if result_obj.get("success"):
            await fire_event_async(db, str(clip.video_id), "clip.published", {
                "clip_id": str(clip.id),
                "platform": req.platform,
                "url": result_obj.get("platform_url", ""),
            })

        return {
            **result_obj,
            "publish_log_id": str(log_entry.id),
        }
    except ValueError as e:
        log_entry.status = "failed"
        log_entry.result = {"error": str(e)}
        await db.commit()
        return {"success": False, "error": str(e), "publish_log_id": str(log_entry.id)}
    except Exception as e:
        log_entry.status = "failed"
        log_entry.result = {"error": str(e)}
        await db.commit()
        return {"success": False, "error": str(e), "publish_log_id": str(log_entry.id)}


@router.get("/history")
async def publish_history(
    clip_id: str | None = Query(None),
    platform: str | None = Query(None),
    status: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """List publish history for the current user."""
    query = select(PublishLog).where(PublishLog.user_id == current_user.id)
    if clip_id:
        query = query.where(PublishLog.clip_id == uuid.UUID(clip_id))
    if platform:
        query = query.where(PublishLog.platform == platform)
    if status:
        query = query.where(PublishLog.status == status)
    query = query.order_by(PublishLog.published_at.desc()).offset(skip).limit(limit)

    result = await db.execute(query)
    logs = result.scalars().all()

    # Count total
    count_q = select(sa_func.count()).select_from(PublishLog).where(PublishLog.user_id == current_user.id)
    if clip_id:
        count_q = count_q.where(PublishLog.clip_id == uuid.UUID(clip_id))
    if platform:
        count_q = count_q.where(PublishLog.platform == platform)
    if status:
        count_q = count_q.where(PublishLog.status == status)
    count_result = await db.execute(count_q)
    total = count_result.scalar()

    return {
        "items": [
            {
                "id": str(log.id),
                "clip_id": str(log.clip_id),
                "platform": log.platform,
                "platform_label": PLATFORM_LABELS.get(log.platform, log.platform),
                "status": log.status,
                "dub_language": log.dub_language,
                "title": log.title or "",
                "description": log.description or "",
                "hashtags": log.hashtags or "",
                "result": log.result,
                "published_at": log.published_at.isoformat() if log.published_at else "",
            }
            for log in logs
        ],
        "total": total,
    }


# --- Webhooks (unchanged) ---

@router.get("/webhook/{video_id}")
async def list_webhooks_endpoint(
    video_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    hooks = await get_webhooks_for_video(db, video_id)
    return [
        {"id": str(h.id), "url": h.url, "events": h.events, "is_active": h.is_active, "created_at": h.created_at.isoformat() if h.created_at else None}
        for h in hooks
    ]

@router.post("/webhook")
async def register_webhook_endpoint(
    req: WebhookRegisterRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        await register_webhook(db, req.video_id, req.url, req.events)
        return {"success": True}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

@router.delete("/webhook/{video_id}")
async def unregister_webhook_endpoint(
    video_id: str,
    url: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await unregister_webhook(db, video_id, url)
    return {"success": True}

"""Social media publishing endpoints."""
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_user
from app.database import get_db
from app.models.clip import Clip
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

class PublishRequest(BaseModel):
    clip_id: str
    platform: str
    title: str = ""
    description: str = ""
    hashtags: str = ""
    access_token: str
    platform_user_id: str | None = None
    schedule_at: str | None = None
    dub_language: str | None = None  # If set, publish the dubbed version in this language

class WebhookRegisterRequest(BaseModel):
    video_id: str
    url: str
    events: list[str] | None = None

@router.post("/clip")
async def publish_clip_endpoint(
    req: PublishRequest,
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

    # Resolve the file URL — use dubbed version if a dub_language is specified
    file_url = clip.file_url
    if req.dub_language and req.dub_language != "original":
        dub_object_name = f"dubs/{clip.video_id}/{clip.id}_{req.dub_language}.mp4"
        try:
            # Verify the dubbed file actually exists in storage
            all_dub_files = list_files(f"dubs/{clip.video_id}/")
            if dub_object_name in all_dub_files:
                file_url = get_presigned_url(dub_object_name)
                logger.info("Publishing dubbed version: lang=%s, clip=%s", req.dub_language, clip.id)
            else:
                logger.warning(
                    "Dubbed file not found for lang=%s clip=%s, falling back to original",
                    req.dub_language, clip.id,
                )
        except Exception as e:
            logger.warning("Failed to resolve dubbed URL, using original: %s", e)

    # Presign the original file_url if it's not already a URL
    if file_url and not file_url.startswith("http"):
        try:
            file_url = get_presigned_url(file_url)
        except Exception:
            pass

    result_obj = await publish_clip(
        file_url,
        req.platform,
        req.title or clip.title or "",
        req.description or clip.caption or "",
        req.hashtags or clip.hashtags or "",
        req.access_token,
        req.platform_user_id,
    )

    if result_obj["success"]:
        await fire_event_async(db, str(clip.video_id), "clip.published", {
            "clip_id": str(clip.id),
            "platform": req.platform,
            "url": result_obj.get("platform_url", ""),
        })

    return result_obj

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

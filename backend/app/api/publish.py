"""Social media publishing endpoints."""
import uuid, logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.security import get_current_user
from app.database import get_db
from app.models.user import User
from app.models.clip import Clip
from app.models.video import Video
from app.services.publishing import publish_clip
from app.services.webhooks import register_webhook, unregister_webhook, fire_event
from pydantic import BaseModel

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
    
    result_obj = await publish_clip(
        clip.file_url,
        req.platform,
        req.title or clip.title or "",
        req.description or clip.caption or "",
        req.hashtags or clip.hashtags or "",
        req.access_token,
        req.platform_user_id,
    )
    
    if result_obj["success"]:
        fire_event(str(clip.video_id), "clip.published", {
            "clip_id": str(clip.id),
            "platform": req.platform,
            "url": result_obj.get("platform_url", ""),
        })
    
    return result_obj

@router.post("/webhook")
async def register_webhook_endpoint(req: WebhookRegisterRequest):
    register_webhook(req.video_id, req.url, req.events)
    return {"success": True}

@router.delete("/webhook/{video_id}")
async def unregister_webhook_endpoint(video_id: str, url: str):
    unregister_webhook(video_id, url)
    return {"success": True}

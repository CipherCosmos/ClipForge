"""User preferences/settings API."""
import logging

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified

from app.core.security import get_current_user
from app.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/settings", tags=["settings"])

DEFAULT_PREFERENCES = {
    "watermark_text": "",
    "primary_color": "#FF6B35",
    "caption_style": "classic",
    "music_track": "",
    "research_location": "US",
    "theme": "dark",
    "enable_moderation": True,
}

@router.get("")
async def get_settings(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    prefs = user.preferences or {}
    merged = {**DEFAULT_PREFERENCES, **prefs}
    return merged

@router.put("")
async def update_settings(
    payload: dict,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    current = dict(user.preferences or {})
    current.update(payload)
    user.preferences = current
    flag_modified(user, "preferences")
    await db.commit()
    merged = {**DEFAULT_PREFERENCES, **current}
    return merged

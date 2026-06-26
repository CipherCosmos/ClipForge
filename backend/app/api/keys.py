"""API key management endpoints."""
import logging

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_keys import generate_api_key
from app.core.security import get_current_user
from app.database import get_db
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/keys", tags=["api_keys"])

@router.get("")
async def get_api_key_status(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    return {"has_key": bool(user and user.api_key_hash)}

@router.post("/generate")
async def create_api_key(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raw_key, hashed_key = generate_api_key()

    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.api_key_hash = hashed_key
    await db.commit()

    return {
        "api_key": raw_key,
        "note": "Save this key — it will not be shown again",
    }

@router.delete("/revoke")
async def revoke_api_key(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.api_key_hash = None
    await db.commit()
    return {"success": True}

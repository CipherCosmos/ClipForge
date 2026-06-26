"""API key management endpoints with names and expiration."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.api_keys import generate_api_key
from app.core.security import get_current_user
from app.database import get_db
from app.models.api_key import ApiKey
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/keys", tags=["api_keys"])


class CreateKeyRequest(BaseModel):
    name: str = "Default"
    expire_days: Optional[int] = None


@router.get("")
async def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiKey).where(ApiKey.user_id == current_user.id).order_by(ApiKey.created_at.desc())
    )
    keys = result.scalars().all()
    return {
        "keys": [
            {
                "id": str(k.id),
                "name": k.name,
                "prefix": k.key_prefix + "...",
                "expires_at": k.expires_at.isoformat() if k.expires_at else None,
                "is_expired": k.is_expired,
                "is_active": k.is_active,
                "last_used_at": k.last_used_at.isoformat() if k.last_used_at else None,
                "created_at": k.created_at.isoformat(),
            }
            for k in keys
        ]
    }


@router.post("/generate")
async def create_api_key(
    body: CreateKeyRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    raw_key, hashed_key, prefix, expires_at = generate_api_key(body.name, body.expire_days)

    api_key = ApiKey(
        user_id=current_user.id,
        name=body.name,
        key_hash=hashed_key,
        key_prefix=prefix,
        expires_at=expires_at,
    )
    db.add(api_key)
    await db.commit()

    return {
        "id": str(api_key.id),
        "name": body.name,
        "api_key": raw_key,
        "prefix": prefix + "...",
        "expires_at": expires_at.isoformat() if expires_at else None,
        "note": "Save this key — it will not be shown again",
    }


@router.delete("/{key_id}")
async def revoke_api_key(
    key_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(ApiKey).where(ApiKey.id == key_id, ApiKey.user_id == current_user.id)
    )
    key = result.scalar_one_or_none()
    if not key:
        raise HTTPException(status_code=404, detail="API key not found")

    key.is_active = False
    await db.commit()
    return {"success": True}

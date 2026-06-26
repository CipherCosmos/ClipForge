"""API key authentication and management with names and expiration."""
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi.security import HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import joinedload

from app.database import async_session
from app.models.api_key import ApiKey
from app.models.user import User

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)


def generate_api_key(name: str = "Default", expire_days: Optional[int] = None) -> tuple[str, str, str, Optional[datetime]]:
    raw = f"cf_{secrets.token_hex(24)}"
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    prefix = raw[:16]
    expires_at = datetime.now(timezone.utc) + timedelta(days=expire_days) if expire_days else None
    return raw, hashed, prefix, expires_at


async def authenticate_api_key(token: str) -> Optional[User]:
    """Look up an API key and return the owning user, or None."""
    prefix = token[:16]

    hashed = hashlib.sha256(token.encode()).hexdigest()
    async with async_session() as session:
        result = await session.execute(
            select(ApiKey)
            .options(joinedload(ApiKey.user))
            .where(ApiKey.key_hash == hashed, ApiKey.is_active == True)
        )
        api_key = result.scalar_one_or_none()
        if api_key is None or api_key.is_expired:
            return None
        user = api_key.user
        if user is None:
            return None
        api_key.last_used_at = datetime.now(timezone.utc)
        await session.commit()
        return user

    return None

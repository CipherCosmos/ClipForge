"""API key authentication for external programmatic access."""
import hashlib
import logging
import secrets
import uuid
from typing import Optional

from fastapi import HTTPException, Security
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select

from app.database import async_session
from app.models.user import User

logger = logging.getLogger(__name__)
security = HTTPBearer(auto_error=False)

_api_key_cache: dict[str, tuple[str, str]] = {}


def generate_api_key() -> tuple[str, str]:
    raw = f"cf_{secrets.token_hex(24)}"
    hashed = hashlib.sha256(raw.encode()).hexdigest()
    return raw, hashed


async def get_user_from_api_key(
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> Optional[User]:
    if credentials is None:
        return None

    api_key = credentials.credentials

    prefix = api_key[:16]
    if prefix in _api_key_cache:
        user_id, plan = _api_key_cache[prefix]

        class _ApiUser:
            def __init__(self):
                self.id = uuid.UUID(user_id)
                self.plan = plan
                self.email = f"api_{user_id[:8]}@clipforge.io"

        return _ApiUser()

    hashed = hashlib.sha256(api_key.encode()).hexdigest()
    async with async_session() as session:
        result = await session.execute(
            select(User).where(User.api_key_hash == hashed)
        )
        user = result.scalar_one_or_none()
        if user:
            _api_key_cache[prefix] = (str(user.id), user.plan)
            return user

    return None


async def require_api_key(
    credentials: HTTPAuthorizationCredentials = Security(security),
) -> User:
    user = await get_user_from_api_key(credentials)
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or missing API key")
    return user

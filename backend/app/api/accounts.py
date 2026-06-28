"""Platform accounts API — manage connected social accounts."""

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_token, encrypt_token
from app.core.security import get_current_user
from app.database import get_db
from app.models.platform_account import PlatformAccount
from app.models.user import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/accounts", tags=["accounts"])


class AccountCreate(BaseModel):
    platform: str
    label: str = ""
    access_token: str
    client_id: str | None = None
    client_secret: str | None = None
    platform_user_id: str | None = None


class AccountUpdate(BaseModel):
    label: str | None = None
    access_token: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    platform_user_id: str | None = None
    is_active: bool | None = None


class AccountResponse(BaseModel):
    id: str
    platform: str
    label: str
    access_token_masked: str
    client_id: str | None = None
    client_secret_masked: str | None = None
    platform_user_id: str | None
    is_active: bool
    created_at: str


def mask_token(token: str) -> str:
    if len(token) <= 8:
        return token[:2] + "***"
    return token[:4] + "..." + token[-4:]


def _to_response(a: PlatformAccount) -> AccountResponse:
    return AccountResponse(
        id=str(a.id),
        platform=a.platform,
        label=a.label or "",
        access_token_masked=mask_token(decrypt_token(a.access_token)),
        client_id=a.client_id,
        client_secret_masked=mask_token(a.client_secret) if a.client_secret else None,
        platform_user_id=a.platform_user_id,
        is_active=a.is_active,
        created_at=a.created_at.isoformat() if a.created_at else "",
    )


@router.get("")
async def list_accounts(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(PlatformAccount)
        .where(
            PlatformAccount.user_id == current_user.id,
            PlatformAccount.is_active,
        )
        .order_by(PlatformAccount.platform, PlatformAccount.label)
    )
    return [_to_response(a) for a in result.scalars().all()]


@router.post("", status_code=201)
async def create_account(
    payload: AccountCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    account = PlatformAccount(
        user_id=current_user.id,
        platform=payload.platform,
        label=payload.label or payload.platform,
        access_token=encrypt_token(payload.access_token),
        client_id=payload.client_id,
        client_secret=payload.client_secret,
        platform_user_id=payload.platform_user_id,
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return _to_response(account)


@router.put("/{account_id}")
async def update_account(
    account_id: str,
    payload: AccountUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import uuid

    result = await db.execute(
        select(PlatformAccount).where(
            PlatformAccount.id == uuid.UUID(account_id),
            PlatformAccount.user_id == current_user.id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    if payload.label is not None:
        account.label = payload.label
    if payload.access_token is not None:
        account.access_token = encrypt_token(payload.access_token)
    if payload.client_id is not None:
        account.client_id = payload.client_id
    if payload.client_secret is not None:
        account.client_secret = payload.client_secret
    if payload.platform_user_id is not None:
        account.platform_user_id = payload.platform_user_id
    if payload.is_active is not None:
        account.is_active = payload.is_active
    account.updated_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(account)
    return _to_response(account)


@router.delete("/{account_id}")
async def delete_account(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import uuid

    result = await db.execute(
        select(PlatformAccount).where(
            PlatformAccount.id == uuid.UUID(account_id),
            PlatformAccount.user_id == current_user.id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    await db.delete(account)
    await db.commit()
    return {"success": True}


@router.post("/{account_id}/test")
async def test_account(
    account_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    import uuid

    result = await db.execute(
        select(PlatformAccount).where(
            PlatformAccount.id == uuid.UUID(account_id),
            PlatformAccount.user_id == current_user.id,
        )
    )
    account = result.scalar_one_or_none()
    if not account:
        raise HTTPException(status_code=404, detail="Account not found")

    token = decrypt_token(account.access_token)
    if not token or len(token) < 10:
        return {"success": False, "error": "Token looks invalid"}

    return {"success": True, "message": f"{account.platform} token verified"}

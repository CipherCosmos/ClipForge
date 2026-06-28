import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ratelimit import limiter
from app.core.security import (
    create_access_token,
    create_refresh_token,
    get_current_user,
    hash_password,
    revoke_refresh_token,
    verify_password,
    verify_refresh_token,
)
from app.database import get_db
from app.models.refresh_token import RefreshToken
from app.models.user import User
from app.schemas.user import (
    EmailVerificationRequest,
    ForgotPasswordRequest,
    RefreshRequest,
    ResetPasswordRequest,
    TokenResponse,
    UserCreate,
    UserResponse,
)
from app.services.email import (
    send_password_reset_email,
    send_verification_email,
    send_welcome_email,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

_password_reset_requests: dict[str, datetime] = {}
_PASSWORD_RESET_LIMIT_MINUTES = 5


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Email already registered",
        )

    raw_verification_token = secrets.token_hex(32)
    user = User(
        email=payload.email,
        password_hash=hash_password(payload.password),
        verification_token=hashlib.sha256(raw_verification_token.encode()).hexdigest(),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = await create_refresh_token(str(user.id), db)

    await send_verification_email(user.email, raw_verification_token)
    await send_welcome_email(user.email)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(request: Request, payload: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    access_token = create_access_token({"sub": str(user.id)})
    refresh_token = await create_refresh_token(str(user.id), db)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh(payload: RefreshRequest, db: AsyncSession = Depends(get_db)):
    user = await verify_refresh_token(payload.refresh_token, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token",
        )

    await revoke_refresh_token(payload.refresh_token, db)

    access_token = create_access_token({"sub": str(user.id)})
    new_refresh_token = await create_refresh_token(str(user.id), db)

    return TokenResponse(
        access_token=access_token,
        refresh_token=new_refresh_token,
        user=UserResponse.model_validate(user),
    )


@router.post("/verify-email", status_code=status.HTTP_200_OK)
async def verify_email(payload: EmailVerificationRequest, db: AsyncSession = Depends(get_db)):
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    result = await db.execute(
        select(User).where(
            User.verification_token == token_hash,
            not User.email_verified,
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired verification token",
        )
    user.email_verified = True
    user.verification_token = None
    await db.commit()
    return {"detail": "Email verified successfully"}


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
@limiter.limit("3/hour")
async def forgot_password(
    request: Request, payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(User).where(User.email == payload.email))
    user = result.scalar_one_or_none()
    if not user:
        return {"detail": "If that email is registered, a reset link has been sent"}

    now = datetime.now(timezone.utc)
    last_request = _password_reset_requests.get(payload.email)
    if last_request and (now - last_request) < timedelta(minutes=_PASSWORD_RESET_LIMIT_MINUTES):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Please wait before requesting another password reset",
        )

    raw_reset_token = secrets.token_hex(32)
    user.reset_token = hashlib.sha256(raw_reset_token.encode()).hexdigest()
    user.reset_token_expires = now + timedelta(hours=1)
    await db.commit()

    _password_reset_requests[payload.email] = now
    await send_password_reset_email(user.email, raw_reset_token)

    return {"detail": "If that email is registered, a reset link has been sent"}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()
    now = datetime.now(timezone.utc)
    result = await db.execute(
        select(User).where(
            User.reset_token == token_hash,
            User.reset_token_expires > now,
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token",
        )
    user.password_hash = hash_password(payload.password)
    user.reset_token = None
    user.reset_token_expires = None
    await db.commit()
    return {"detail": "Password reset successfully"}


@router.post("/logout", status_code=status.HTTP_200_OK)
async def logout(
    current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(RefreshToken).where(
            RefreshToken.user_id == current_user.id,
            not RefreshToken.revoked,
        )
    )
    tokens = result.scalars().all()
    for t in tokens:
        t.revoked = True
    await db.commit()
    return {"detail": "Logged out successfully"}


@router.get("/me", response_model=UserResponse)
async def me(current_user: User = Depends(get_current_user)):
    return UserResponse.model_validate(current_user)

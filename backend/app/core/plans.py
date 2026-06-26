"""Plan gating utilities — enforce free/pro limits."""
import logging

from fastapi import HTTPException

from app.models.user import User

logger = logging.getLogger(__name__)

FREE_LIMITS = {
    "max_videos": 5,
    "max_duration_minutes": 30,
    "max_exports_per_day": 3,
    "watermark_free": True,
    "max_resolution": "720p",
}

PRO_LIMITS = {
    "max_videos": 1000,
    "max_duration_minutes": 99999,
    "max_exports_per_day": 1000,
    "watermark_free": False,
    "max_resolution": "4k",
}


def get_limits(user: User) -> dict:
    if user.plan == "pro":
        return PRO_LIMITS
    return FREE_LIMITS


async def check_upload_limit(user: User, db_session) -> None:
    from sqlalchemy import func, select

    from app.models.video import Video

    limits = get_limits(user)

    result = await db_session.execute(
        select(func.count(Video.id)).where(Video.user_id == user.id)
    )
    count = result.scalar() or 0
    if count >= limits["max_videos"]:
        msg = (
            f"Upload limit reached ({limits['max_videos']} videos)."
            " Upgrade to Pro for unlimited uploads."
        )
        raise HTTPException(status_code=429, detail=msg)


def requires_pro(user: User):
    if user.plan != "pro":
        msg = (
            "This feature requires a Pro subscription."
            " Upgrade to access unlimited exports,"
            " 4K resolution, and watermark-free videos."
        )
        raise HTTPException(status_code=402, detail=msg)
    return user

"""Webhook system for notifying external services of completed jobs.

Persistent DB-backed storage with retry logic (3 attempts, exponential backoff).
"""
import asyncio
import logging
import time
import uuid
from datetime import datetime, timezone
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.video import Video
from app.models.webhook import Webhook

logger = logging.getLogger(__name__)

# ── Async (API) functions ──────────────────────────────────────────────


async def register_webhook(
    db: AsyncSession, video_id: str, url: str, events: list[str] | None = None
) -> Webhook:
    vid = uuid.UUID(video_id)
    result = await db.execute(select(Video).where(Video.id == vid))
    if not result.scalar_one_or_none():
        raise ValueError(f"Video {video_id} not found")
    hook = Webhook(
        video_id=vid,
        url=url,
        events=events or ["job.completed"],
    )
    db.add(hook)
    await db.commit()
    await db.refresh(hook)
    logger.info("Webhook registered: %s -> %s (events=%s)", hook.id, url, hook.events)
    return hook


async def unregister_webhook(db: AsyncSession, video_id: str, url: str) -> bool:
    result = await db.execute(
        select(Webhook).where(
            Webhook.video_id == uuid.UUID(video_id),
            Webhook.url == url,
            Webhook.is_active == True,
        )
    )
    hook = result.scalar_one_or_none()
    if hook:
        hook.is_active = False
        await db.commit()
        logger.info("Webhook deactivated: %s -> %s", hook.id, url)
        return True
    return False


async def get_webhooks_for_video(db: AsyncSession, video_id: str) -> list[Webhook]:
    result = await db.execute(
        select(Webhook).where(
            Webhook.video_id == uuid.UUID(video_id),
            Webhook.is_active == True,
        )
    )
    return list(result.scalars().all())


async def fire_event_async(
    db: AsyncSession, video_id: str, event: str, data: dict[str, Any]
):
    """Fire event to all registered webhooks asynchronously.

    Uses ``asyncio.create_task`` so the caller is not blocked.
    """
    hooks = await get_webhooks_for_video(db, video_id)
    for hook in hooks:
        if event in hook.events or "all" in hook.events:
            asyncio.create_task(
                _fire_with_retry_async(hook, video_id, event, data)
            )


# ── Sync (Celery worker) functions ─────────────────────────────────────


def fire_event_sync(video_id: str, event: str, data: dict[str, Any]):
    """Fire event to all registered webhooks synchronously.

    Opens its own ``SyncSessionLocal`` – intended for Celery workers.
    """
    from app.workers.celery_app import SyncSessionLocal

    session = SyncSessionLocal()
    try:
        hooks = (
            session.query(Webhook)
            .filter(
                Webhook.video_id == uuid.UUID(video_id),
                Webhook.is_active == True,
            )
            .all()
        )
        for hook in hooks:
            if event in hook.events or "all" in hook.events:
                _fire_with_retry_sync(hook, video_id, event, data)
    except Exception:
        logger.exception("fire_event_sync failed for video %s event %s", video_id, event)
    finally:
        session.close()


# ── Internal helpers ───────────────────────────────────────────────────


def _build_payload(video_id: str, event: str, data: dict[str, Any]) -> dict[str, Any]:
    return {
        "event": event,
        "video_id": video_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "data": data,
    }


async def _fire_with_retry_async(
    hook: Webhook, video_id: str, event: str, data: dict[str, Any]
):
    """Attempt a single webhook delivery up to 3 times with exponential backoff."""
    payload = _build_payload(video_id, event, data)
    delays = [1, 3]
    str_id = str(hook.id)

    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.post(hook.url, json=payload)
                resp.raise_for_status()
            logger.info("Webhook %s fired: %s -> %s", str_id, event, hook.url)
            return
        except Exception as e:
            if attempt < 2:
                logger.warning(
                    "Webhook %s attempt %d/3 failed: %s -> %s: %s",
                    str_id, attempt + 1, event, hook.url, e,
                )
                await asyncio.sleep(delays[attempt])
            else:
                logger.error(
                    "Webhook %s failed after 3 attempts: %s -> %s: %s",
                    str_id, event, hook.url, e,
                )


def _fire_with_retry_sync(
    hook: Webhook, video_id: str, event: str, data: dict[str, Any]
):
    """Synchronous delivery with retry – used by Celery workers."""
    payload = _build_payload(video_id, event, data)
    delays = [1, 3]
    str_id = str(hook.id)

    for attempt in range(3):
        try:
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(hook.url, json=payload)
                resp.raise_for_status()
            logger.info("Webhook %s fired: %s -> %s", str_id, event, hook.url)
            return
        except Exception as e:
            if attempt < 2:
                logger.warning(
                    "Webhook %s attempt %d/3 failed: %s -> %s: %s",
                    str_id, attempt + 1, event, hook.url, e,
                )
                time.sleep(delays[attempt])
            else:
                logger.error(
                    "Webhook %s failed after 3 attempts: %s -> %s: %s",
                    str_id, event, hook.url, e,
                )

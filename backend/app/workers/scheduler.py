"""Celery periodic task for scheduled publishing."""
import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import select, update

from app.core.crypto import decrypt_token
from app.models.schedule import Schedule
from app.services.publishing import publish_clip
from app.workers.celery_app import SyncSessionLocal, celery_app

logger = logging.getLogger(__name__)


def get_due_schedules():
    """Fetch schedules where status=pending and scheduled_at <= now()."""
    session = SyncSessionLocal()
    try:
        now = datetime.now(timezone.utc)
        result = session.execute(
            select(Schedule).where(
                Schedule.status == "pending",
                Schedule.scheduled_at <= now,
            )
        )
        return result.scalars().all()
    finally:
        session.close()


async def _publish_schedule(schedule: Schedule) -> dict:
    """Publish a single schedule entry."""
    clip_file_url = schedule.clip.file_url if schedule.clip else ""
    return await publish_clip(
        clip_file_url=clip_file_url,
        platform=schedule.platform,
        title=schedule.title or "",
        description=schedule.description or "",
        hashtags=schedule.hashtags or "",
        access_token=decrypt_token(schedule.access_token),
        platform_user_id=schedule.platform_user_id,
    )


@celery_app.task(name="app.workers.scheduler.check_scheduled_publishes")
def check_scheduled_publishes():
    """Check and execute all due scheduled publications."""
    schedules = get_due_schedules()
    if not schedules:
        logger.info("No due schedules found")
        return

    logger.info("Found %d due schedule(s)", len(schedules))

    for sched in schedules:
        session = SyncSessionLocal()
        try:
            # Re-fetch within session
            db_sched = session.get(Schedule, sched.id)
            if not db_sched or db_sched.status != "pending":
                continue

            db_sched.status = "publishing"
            session.commit()

            try:
                result = asyncio.run(_publish_schedule(db_sched))
                db_sched.result = result
                db_sched.status = "published" if result.get("success") else "failed"
                if not result.get("success"):
                    logger.warning("Schedule %s failed: %s", sched.id, result.get("error"))
            except Exception as e:
                db_sched.status = "failed"
                db_sched.result = {"error": str(e)}
                logger.error("Schedule %s raised exception: %s", sched.id, e)

            session.commit()
        finally:
            session.close()

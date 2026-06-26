import os
import ssl

from celery import Celery
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.config import settings

celery_app = Celery("clipforge")

# SSL config for Upstash Redis (rediss:// TLS connections)
_redis_ssl = settings.CELERY_BROKER_URL.startswith("rediss://")
_ssl_opts = {"ssl_cert_reqs": ssl.CERT_NONE} if _redis_ssl else {}

celery_app.conf.update(
    broker_url=settings.CELERY_BROKER_URL,
    result_backend=settings.CELERY_RESULT_BACKEND,
    broker_use_ssl=_ssl_opts if _redis_ssl else None,
    redis_backend_use_ssl=_ssl_opts if _redis_ssl else None,
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    task_track_started=True,
    task_acks_late=True,
    worker_prefetch_multiplier=4,
    imports=[
        "app.workers.transcription",
        "app.workers.nlp",
        "app.workers.scene_detect",
        "app.workers.join_worker",
        "app.workers.render",
        "app.workers.dubbing",
        "app.workers.scheduler",
        "app.workers.cleanup",
    ],
    beat_schedule={
        "check-scheduled-publishes": {
            "task": "app.workers.scheduler.check_scheduled_publishes",
            "schedule": 60.0,
        },
        "cleanup-stale-jobs": {
            "task": "app.workers.cleanup.run_cleanup",
            "schedule": 300.0,
        },
    },
)

sync_engine = create_engine(
    settings.DATABASE_URL_SYNC,
    pool_pre_ping=True,
    pool_size=int(os.getenv("DB_POOL_SIZE", "10")),
    max_overflow=int(os.getenv("DB_POOL_OVERFLOW", "20")),
    pool_recycle=3600,
    pool_use_lifo=True,
    connect_args={"connect_timeout": 10},
)
SyncSessionLocal = sessionmaker(bind=sync_engine)

celery_app.autodiscover_tasks(["app.workers"])


# ── Fix: dispose sync engine after fork to prevent DB connection sync errors ──
@celery_app.on_after_finalize.connect
def setup_cleanup(sender, **kwargs):
    try:
        from app.workers.cleanup import reset_stale_jobs
        reset_stale_jobs()
    except Exception:
        pass


from celery.signals import worker_process_init


@worker_process_init.connect
def fix_db_connections(**kwargs):
    """Dispose the sync engine after fork so each child creates fresh connections."""
    try:
        sync_engine.dispose()
    except Exception:
        pass

import logging
import os
from contextlib import asynccontextmanager

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from slowapi import _rate_limit_exceeded_handler

from app.api.auth import router as auth_router
from app.api.billing import router as billing_router
from app.api.branding import router as branding_router
from app.api.clips import router as clips_router
from app.api.exports import router as exports_router
from app.api.jobs import router as jobs_router
from app.api.keys import router as keys_router
from app.api.publish import router as publish_router
from app.api.schedule import router as schedule_router
from app.api.research import router as research_router
from app.api.settings import router as settings_router
from app.api.transcript import router as transcript_router
from app.api.videos import router as videos_router
from app.api.ws import router as ws_router
from app.config import settings
from app.core.exceptions import AppException
from app.core.middleware import RequestIDMiddleware
from app.core.ratelimit import limiter
from app.database import engine
from app.services.storage import ensure_bucket

if settings.SENTRY_DSN:
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        environment=settings.ENVIRONMENT,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.05,
    )

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting up — ensure migrations are up to date: alembic upgrade head")
    ensure_bucket()
    yield
    await engine.dispose()


app = FastAPI(
    title="ClipForge API",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)

app.add_middleware(RequestIDMiddleware)

cors_origins = os.getenv("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins.split(",") if cors_origins != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Instrumentator().instrument(app).expose(app)


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": True,
            "detail": exc.detail,
            "error_code": exc.error_code,
            "request_id": getattr(request.state, "request_id", None),
        },
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    request_id = getattr(request.state, "request_id", None)
    logger.error(
        "Unhandled exception request_id=%s path=%s method=%s: %s",
        request_id, request.url.path, request.method, exc,
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": True,
            "detail": "Internal server error",
            "error_code": "internal_error",
            "request_id": request_id,
        },
    )


app.include_router(auth_router)
app.include_router(billing_router)
app.include_router(keys_router)
app.include_router(exports_router)  # BEFORE videos_router (more specific paths)
app.include_router(transcript_router)  # BEFORE videos_router (more specific paths)
app.include_router(videos_router)
app.include_router(clips_router)
app.include_router(jobs_router)
app.include_router(ws_router)
app.include_router(research_router)
app.include_router(branding_router)
app.include_router(settings_router)
app.include_router(publish_router)
app.include_router(schedule_router)


@app.get("/health")
async def health():
    import redis
    from sqlalchemy import text

    from app.database import async_session
    status = {"status": "ok", "checks": {}}

    # DB check
    try:
        async with async_session() as s:
            await s.execute(text("SELECT 1"))
        status["checks"]["database"] = "ok"
    except Exception as e:
        status["checks"]["database"] = f"error: {e}"
        status["status"] = "degraded"

    # Redis check
    try:
        r = redis.from_url(settings.REDIS_URL)
        r.ping()
        r.close()
        status["checks"]["redis"] = "ok"
    except Exception as e:
        status["checks"]["redis"] = f"error: {e}"
        status["status"] = "degraded"

    # Groq check (optional)
    if settings.GROQ_API_KEY:
        status["checks"]["groq"] = "configured"

    return status

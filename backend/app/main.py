import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler

from app.api.auth import router as auth_router
from app.api.keys import router as keys_router
from app.core.ratelimit import limiter
from app.api.clips import router as clips_router
from app.api.jobs import router as jobs_router
from app.api.videos import router as videos_router
from app.api.exports import router as exports_router
from app.api.ws import router as ws_router
from app.api.research import router as research_router
from app.api.publish import router as publish_router
from app.api.branding import router as branding_router
from app.api.settings import router as settings_router
from app.config import settings
from app.database import Base, engine
from app.services.storage import ensure_bucket


@asynccontextmanager
async def lifespan(app: FastAPI):
    ensure_bucket()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="ClipForge API",
    version="0.1.0",
    lifespan=lifespan,
)

app.state.limiter = limiter
app.add_exception_handler(429, _rate_limit_exceeded_handler)

cors_origins = os.getenv("CORS_ORIGINS", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins.split(",") if cors_origins != "*" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(keys_router)
app.include_router(exports_router)  # BEFORE videos_router (more specific paths)
app.include_router(videos_router)
app.include_router(clips_router)
app.include_router(jobs_router)
app.include_router(ws_router)
app.include_router(research_router)
app.include_router(branding_router)
app.include_router(settings_router)
app.include_router(publish_router)


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

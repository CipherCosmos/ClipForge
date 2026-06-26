from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.auth import router as auth_router
from app.api.clips import router as clips_router
from app.api.jobs import router as jobs_router
from app.api.videos import router as videos_router
from app.api.ws import router as ws_router
from app.api.research import router as research_router
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(videos_router)
app.include_router(clips_router)
app.include_router(jobs_router)
app.include_router(ws_router)
app.include_router(research_router)


@app.get("/health")
async def health():
    return {"status": "ok"}

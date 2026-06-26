"""End-to-end API tests with mocked database and storage.

Tests the full API surface: auth, videos, clips, jobs.
Uses dependency overrides to avoid needing PostgreSQL, MinIO, and other services.
"""
import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

os.environ.setdefault("JWT_SECRET", "test-secret-key")
os.environ.setdefault("JWT_ALGORITHM", "HS256")

from app.core.security import get_current_user
from app.database import get_db
from app.main import app
from app.models import PlanEnum, User

SAMPLE_USER = User(
    id=str(uuid.uuid4()),
    email="test@clipforge.dev",
    password_hash="hashed",
    plan=PlanEnum.FREE,
    created_at=datetime.now(timezone.utc),
)


class MockResult:
    def __init__(self, scalar=None, scalars_list=None):
        self._scalar = scalar
        self._scalars_list = scalars_list or []

    def scalar_one_or_none(self):
        return self._scalar

    def scalar(self):
        return self._scalar if self._scalar is not None else 0

    def scalars(self):
        return self

    def all(self):
        return self._scalars_list


class MockAsyncSession:
    async def execute(self, stmt):
        return MockResult(scalar=None, scalars_list=[])

    async def commit(self):
        pass

    async def close(self):
        pass

    async def refresh(self, obj):
        pass

    def add(self, obj):
        pass


@pytest.fixture(autouse=True)
def clear_overrides():
    yield
    app.dependency_overrides.clear()


class TestHealth:
    @pytest.mark.asyncio
    async def test_health_endpoint(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/health")
        assert r.status_code == 200
        data = r.json()
        assert data["status"] in ("ok", "degraded")
        assert "checks" in data


class TestAuthE2E:
    @pytest.mark.asyncio
    async def test_register_validation(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/api/auth/register", json={})
            assert r.status_code == 422

            r = await ac.post("/api/auth/register", json={"email": "test@test.com"})
            assert r.status_code == 422

            r = await ac.post(
                "/api/auth/register",
                json={"email": "not-an-email", "password": "TestPass123!"},
            )
            assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_login_validation(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/api/auth/login", json={})
            assert r.status_code == 422

            r = await ac.post("/api/auth/login", json={"email": "test@test.com"})
            assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_me_requires_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/api/auth/me")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_me_with_auth(self):
        app.dependency_overrides[get_current_user] = lambda: SAMPLE_USER
        app.dependency_overrides[get_db] = lambda: MockAsyncSession()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/api/auth/me")
        assert r.status_code == 200
        data = r.json()
        assert data["email"] == "test@clipforge.dev"
        assert data["plan"] == "free"


class TestVideosE2E:
    @pytest.mark.asyncio
    async def test_list_requires_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/api/videos")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_list_with_auth(self):
        app.dependency_overrides[get_current_user] = lambda: SAMPLE_USER
        app.dependency_overrides[get_db] = lambda: MockAsyncSession()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/api/videos")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data

    @pytest.mark.asyncio
    async def test_import_validation(self):
        app.dependency_overrides[get_current_user] = lambda: SAMPLE_USER
        app.dependency_overrides[get_db] = lambda: MockAsyncSession()

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/api/videos/import", json={})
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_get_video_requires_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(f"/api/videos/{uuid.uuid4()}")
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_video_requires_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.delete(f"/api/videos/{uuid.uuid4()}")
        assert r.status_code == 401


class TestClipsE2E:
    @pytest.mark.asyncio
    async def test_list_clips_requires_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                "/api/clips?video_id=00000000-0000-0000-0000-000000000001"
            )
        assert r.status_code == 401

    @pytest.mark.asyncio
    async def test_get_clip_requires_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(f"/api/clips/{uuid.uuid4()}")
        assert r.status_code == 401


class TestJobsE2E:
    @pytest.mark.asyncio
    async def test_list_jobs_requires_auth(self):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get(
                "/api/jobs?video_id=00000000-0000-0000-0000-000000000001"
            )
        assert r.status_code == 401


class TestSchemaValidation:
    def test_create_video_schema(self):
        from app.schemas.video import VideoCreate

        data = VideoCreate(source_url="https://example.com/vid.mp4")
        assert data.source_url == "https://example.com/vid.mp4"

    def test_create_user_schema(self):
        from app.schemas.user import UserCreate

        data = UserCreate(email="test@test.com", password="securepass123")
        assert data.email == "test@test.com"

    def test_video_response_schema(self):
        from app.schemas.video import VideoResponse

        now = datetime.now(timezone.utc)
        data = VideoResponse(
            id=str(uuid.uuid4()),
            user_id=str(uuid.uuid4()),
            source_url="http://example.com/vid.mp4",
            status="completed",
            duration=120.5,
            thumbnail_url="http://example.com/thumb.jpg",
            created_at=now,
        )
        assert data.status == "completed"
        assert data.duration == 120.5
        assert data.thumbnail_url == "http://example.com/thumb.jpg"

    def test_clip_response_schema(self):
        from app.schemas.clip import ClipResponse

        now = datetime.now(timezone.utc)
        data = ClipResponse(
            id=str(uuid.uuid4()),
            video_id=str(uuid.uuid4()),
            start_time=10.0,
            end_time=30.0,
            score=0.85,
            file_url="http://example.com/clip.mp4",
            thumbnail_url="http://example.com/thumb.jpg",
            dubs={"es": "http://example.com/clip_es.mp4"},
            created_at=now,
        )
        assert data.thumbnail_url == "http://example.com/thumb.jpg"
        assert data.score == 0.85
        assert data.dubs["es"] == "http://example.com/clip_es.mp4"

    def test_job_response_schema(self):
        from app.schemas.job import JobResponse

        now = datetime.now(timezone.utc)
        data = JobResponse(
            id=str(uuid.uuid4()),
            video_id=str(uuid.uuid4()),
            type="transcription",
            status="queued",
            progress=0.0,
            created_at=now,
        )
        assert data.type == "transcription"
        assert data.status == "queued"

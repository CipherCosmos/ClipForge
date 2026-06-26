"""Tests for publishing API endpoints."""
from unittest.mock import MagicMock, patch
import pytest
from httpx import ASGITransport, AsyncClient
from app.database import get_db
from app.main import app


class MockAsyncSession:
    async def execute(self, stmt):
        from tests.test_api_e2e import MockResult
        return MockResult(scalar=None, scalars_list=[])

    async def commit(self):
        pass

    async def close(self):
        pass

    async def refresh(self, obj):
        pass

    def add(self, obj):
        pass

@pytest.mark.asyncio
async def test_publish_clip_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/publish/clip", json={
            "clip_id": "00000000-0000-0000-0000-000000000001",
            "platform": "youtube_shorts",
            "access_token": "test-token",
        })
        assert resp.status_code in (401, 403)

@pytest.mark.asyncio
async def test_register_webhook():
    app.dependency_overrides[get_db] = lambda: MockAsyncSession()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/publish/webhook", json={
            "video_id": "00000000-0000-0000-0000-000000000001",
            "url": "https://example.com/hook",
            "events": ["job.completed"],
        })
        assert resp.status_code in (200, 401)

@pytest.mark.asyncio
async def test_branding_caption_styles():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/branding/caption-styles")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 5
        assert any(s["id"] == "classic" for s in data)

@pytest.mark.asyncio
async def test_branding_music():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/branding/music")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 5

@pytest.mark.asyncio
async def test_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "status" in data

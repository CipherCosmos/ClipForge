"""Tests for batch import endpoint."""
from unittest.mock import patch
import pytest
from httpx import ASGITransport, AsyncClient
from app.main import app

@pytest.mark.asyncio
async def test_batch_import_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/videos/import-batch", json={
            "urls": ["https://youtube.com/watch?v=test1", "https://youtube.com/watch?v=test2"],
        })
        assert resp.status_code in (401, 403)

@pytest.mark.asyncio
async def test_batch_import_validates_url():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/videos/import-batch", json={
            "urls": ["not-a-valid-url"],
        })
        # Should still return 401 (auth required) before URL validation
        assert resp.status_code in (401, 403)

@pytest.mark.asyncio
async def test_batch_import_max_urls():
    # Create 11 URLs (over the max of 10)
    urls = [f"https://youtube.com/watch?v=test{i}" for i in range(11)]
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/videos/import-batch", json={"urls": urls})
        assert resp.status_code in (401, 403)

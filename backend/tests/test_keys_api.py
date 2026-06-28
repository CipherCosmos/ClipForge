"""Tests for API key endpoints."""

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.mark.asyncio
async def test_generate_key_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/keys/generate")
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
async def test_revoke_key_requires_auth():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.delete("/api/keys/revoke")
        assert resp.status_code in (401, 403)

"""Tests for API key system."""
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime, timezone

import pytest

from app.core.api_keys import generate_api_key, authenticate_api_key


def test_generate_api_key_format():
    raw, hashed, prefix, expires = generate_api_key("Test Key", 90)
    assert raw.startswith("cf_")
    assert len(raw) > 20
    assert len(hashed) == 64
    assert prefix == raw[:16]
    assert expires is not None
    assert expires > datetime.now(timezone.utc)


def test_generate_api_key_no_expiry():
    raw, hashed, prefix, expires = generate_api_key("Never Expire")
    assert expires is None


def test_generate_api_key_unique():
    raw1, hashed1, _, _ = generate_api_key()
    raw2, hashed2, _, _ = generate_api_key()
    assert raw1 != raw2
    assert hashed1 != hashed2


@pytest.mark.asyncio
async def test_authenticate_no_key_found():
    with patch("app.core.api_keys.async_session") as mock_session:
        mock_async = AsyncMock()
        mock_session.return_value.__aenter__.return_value = mock_async
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_async.execute.return_value = mock_result

        result = await authenticate_api_key("cf_000000000000000000000000000000000000000000000000")
        assert result is None


@pytest.mark.asyncio
async def test_authenticate_expired_key():
    with patch("app.core.api_keys.async_session") as mock_session:
        mock_async = AsyncMock()
        mock_session.return_value.__aenter__.return_value = mock_async

        mock_api_key = MagicMock()
        mock_api_key.is_expired = True
        mock_api_key.user = None

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_api_key
        mock_async.execute.return_value = mock_result

        result = await authenticate_api_key("cf_111111111111111111111111111111111111111111111111")
        assert result is None

"""Tests for API key system."""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.core.api_keys import generate_api_key, get_user_from_api_key


def test_generate_api_key_format():
    raw, hashed = generate_api_key()
    assert raw.startswith("cf_")
    assert len(raw) > 20
    assert len(hashed) == 64


def test_generate_api_key_unique():
    raw1, hashed1 = generate_api_key()
    raw2, hashed2 = generate_api_key()
    assert raw1 != raw2
    assert hashed1 != hashed2


@pytest.mark.asyncio
async def test_get_user_from_api_key_no_credentials():
    result = await get_user_from_api_key(None)
    assert result is None


@pytest.mark.asyncio
async def test_get_user_from_api_key_invalid():
    mock_creds = MagicMock()
    mock_creds.credentials = "cf_invalid_key"

    with patch("app.core.api_keys.async_session") as mock_session:
        mock_async_session = AsyncMock()
        mock_session.return_value.__aenter__.return_value = mock_async_session

        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_async_session.execute.return_value = mock_result

        result = await get_user_from_api_key(mock_creds)
        assert result is None

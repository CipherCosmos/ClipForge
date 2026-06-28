"""Tests for plan gating."""

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.core.plans import (
    check_upload_limit,
    get_limits,
    requires_pro,
)
from app.models.user import User


def test_free_limits():
    user = MagicMock(spec=User)
    user.plan = "free"
    limits = get_limits(user)
    assert limits["max_videos"] == 5
    assert limits["watermark_free"] is True
    assert limits["max_resolution"] == "720p"


def test_pro_limits():
    user = MagicMock(spec=User)
    user.plan = "pro"
    limits = get_limits(user)
    assert limits["max_videos"] == 1000
    assert limits["watermark_free"] is False


def test_requires_pro_passes():
    user = MagicMock(spec=User)
    user.plan = "pro"
    result = requires_pro(user)
    assert result == user


def test_requires_pro_fails():
    user = MagicMock(spec=User)
    user.plan = "free"
    with pytest.raises(Exception) as exc:
        requires_pro(user)
    assert "Pro subscription" in str(exc.value)


@pytest.mark.asyncio
async def test_check_upload_limit_under():
    user = MagicMock(spec=User)
    user.plan = "free"
    user.id = "test-user-id"

    mock_result = MagicMock()
    mock_result.scalar.return_value = 3

    mock_session = MagicMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    await check_upload_limit(user, mock_session)


@pytest.mark.asyncio
async def test_check_upload_limit_over():
    user = MagicMock(spec=User)
    user.plan = "free"
    user.id = "test-user-id"

    mock_result = MagicMock()
    mock_result.scalar.return_value = 10

    mock_session = MagicMock()
    mock_session.execute = AsyncMock(return_value=mock_result)

    with pytest.raises(Exception) as exc:
        await check_upload_limit(user, mock_session)
    assert "Upload limit" in str(exc.value)

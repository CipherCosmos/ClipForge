"""Tests for webhook system — uses mocked DB session."""
from unittest.mock import MagicMock, patch

import uuid

from app.services.webhooks import fire_event_sync
from app.models.webhook import Webhook


def _make_hook(
    video_id: str,
    url: str,
    events: list[str] | None = None,
    is_active: bool = True,
) -> Webhook:
    wh = Webhook(
        id=uuid.uuid4(),
        video_id=uuid.UUID(video_id),
        url=url,
        events=events or ["job.completed"],
        is_active=is_active,
    )
    return wh


@patch("app.workers.celery_app.SyncSessionLocal")
def test_fire_event_success(mock_session_cls):
    hook = _make_hook("00000000-0000-0000-0000-000000000001", "https://example.com/hook", ["all"])
    mock_session = MagicMock()
    mock_session.query.return_value.filter.return_value.all.return_value = [hook]
    mock_session_cls.return_value = mock_session

    with patch("app.services.webhooks.httpx.Client") as mock_client:
        mock_instance = MagicMock()
        mock_client.return_value.__enter__.return_value = mock_instance
        mock_instance.post.return_value.status_code = 200
        fire_event_sync("00000000-0000-0000-0000-000000000001", "clip.published", {"clip_id": "clip-1"})
        mock_instance.post.assert_called_once()


@patch("app.workers.celery_app.SyncSessionLocal")
def test_fire_event_failure_does_not_raise(mock_session_cls):
    hook = _make_hook("00000000-0000-0000-0000-000000000001", "https://example.com/bad-hook", ["all"])
    mock_session = MagicMock()
    mock_session.query.return_value.filter.return_value.all.return_value = [hook]
    mock_session_cls.return_value = mock_session

    with patch("app.services.webhooks.httpx.Client") as mock_client:
        mock_instance = MagicMock()
        mock_client.return_value.__enter__.return_value = mock_instance
        mock_instance.post.side_effect = Exception("Connection error")
        fire_event_sync("00000000-0000-0000-0000-000000000001", "job.completed", {"status": "done"})


@patch("app.workers.celery_app.SyncSessionLocal")
def test_event_filtering(mock_session_cls):
    """Webhooks registered for 'job.completed' should NOT fire for 'clip.published'."""
    hook = _make_hook("00000000-0000-0000-0000-000000000001", "https://example.com/hook", ["job.completed"])
    mock_session = MagicMock()
    mock_session.query.return_value.filter.return_value.all.return_value = [hook]
    mock_session_cls.return_value = mock_session

    with patch("app.services.webhooks.httpx.Client") as mock_client:
        mock_instance = MagicMock()
        mock_client.return_value.__enter__.return_value = mock_instance
        fire_event_sync("00000000-0000-0000-0000-000000000001", "clip.published", {})
        mock_instance.post.assert_not_called()


@patch("app.workers.celery_app.SyncSessionLocal")
def test_inactive_webhook_not_fired(mock_session_cls):
    """Inactive webhooks should not be returned from the query."""
    mock_session = MagicMock()
    mock_session.query.return_value.filter.return_value.all.return_value = []
    mock_session_cls.return_value = mock_session

    with patch("app.services.webhooks.httpx.Client") as mock_client:
        mock_instance = MagicMock()
        mock_client.return_value.__enter__.return_value = mock_instance
        fire_event_sync("00000000-0000-0000-0000-000000000001", "job.completed", {})
        mock_instance.post.assert_not_called()


@patch("app.workers.celery_app.SyncSessionLocal")
def test_empty_webhooks_no_error(mock_session_cls):
    """No webhooks registered should not raise."""
    mock_session = MagicMock()
    mock_session.query.return_value.filter.return_value.all.return_value = []
    mock_session_cls.return_value = mock_session

    fire_event_sync("00000000-0000-0000-0000-000000000001", "clip.published", {"clip_id": "clip-1"})

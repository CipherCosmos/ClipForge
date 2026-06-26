"""Tests for webhook system."""
from unittest.mock import MagicMock, patch

from app.services.webhooks import fire_event, register_webhook, unregister_webhook


def test_register_webhook():
    register_webhook("video-1", "https://example.com/hook", ["job.completed"])


def test_fire_event_success():
    register_webhook("video-2", "https://example.com/hook2", ["all"])
    with patch("app.services.webhooks.httpx.Client") as mock_client:
        mock_instance = MagicMock()
        mock_client.return_value.__enter__.return_value = mock_instance
        mock_instance.post.return_value.status_code = 200
        fire_event("video-2", "clip.published", {"clip_id": "clip-1"})
        mock_instance.post.assert_called_once()


def test_fire_event_failure_does_not_raise():
    register_webhook("video-3", "https://example.com/bad-hook", ["all"])
    with patch("app.services.webhooks.httpx.Client") as mock_client:
        mock_instance = MagicMock()
        mock_client.return_value.__enter__.return_value = mock_instance
        mock_instance.post.side_effect = Exception("Connection error")
        fire_event("video-3", "job.completed", {"status": "done"})


def test_unregister_webhook():
    register_webhook("video-4", "https://example.com/hook4", ["all"])
    unregister_webhook("video-4", "https://example.com/hook4")
    with patch("app.services.webhooks.httpx.Client") as mock_client:
        mock_instance = MagicMock()
        mock_client.return_value.__enter__.return_value = mock_instance
        fire_event("video-4", "job.completed", {})
        mock_instance.post.assert_not_called()


def test_event_filtering():
    register_webhook("video-5", "https://example.com/hook5", ["job.completed"])
    with patch("app.services.webhooks.httpx.Client") as mock_client:
        mock_instance = MagicMock()
        mock_client.return_value.__enter__.return_value = mock_instance
        fire_event("video-5", "clip.published", {})
        mock_instance.post.assert_not_called()

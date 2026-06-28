"""Tests for music library service."""

from unittest.mock import MagicMock, patch

import pytest

from app.services.music import generate_backing_track, get_track_list


def test_get_track_list():
    tracks = get_track_list()
    assert len(tracks) >= 5
    assert any(t["id"] == "upbeat_corporate" for t in tracks)
    assert all("title" in t for t in tracks)
    assert all("bpm" in t for t in tracks)


def test_generate_backing_track_invalid_id():
    result = generate_backing_track("nonexistent", 30.0, "/tmp/out.mp3")
    assert result is None


@patch("app.services.music.subprocess.run")
def test_generate_backing_track_success(mock_run):
    mock_run.return_value = MagicMock()
    result = generate_backing_track("lo-fi_chill", 30.0, "/tmp/lofi.mp3")
    assert result == "/tmp/lofi.mp3"
    mock_run.assert_called_once()


@pytest.mark.asyncio
@patch("app.services.music.search_pixabay_music")
async def test_search_pixabay_music(mock_search):
    mock_search.return_value = [
        {
            "id": "123",
            "title": "Test Track",
            "url": "http://example.com/audio.mp3",
            "duration": 30,
        }
    ]
    results = await mock_search("upbeat", 5)
    assert len(results) == 1
    assert results[0]["id"] == "123"

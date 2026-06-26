"""Tests for storage service with mocked MinIO/Supabase."""
from unittest.mock import MagicMock, patch
from app.services.storage import get_presigned_url, upload_file, delete_file, list_files

@patch("app.services.storage.get_client")
def test_upload_file(mock_get_client):
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client
    result = upload_file("/tmp/test.txt", "test.txt")
    assert result == "test.txt"

@patch("app.services.storage.get_client")
def test_get_presigned_url(mock_get_client):
    mock_client = MagicMock()
    mock_client.presigned_get_object.return_value = "http://signed/url"
    mock_get_client.return_value = mock_client
    url = get_presigned_url("test.txt")
    assert url == "http://signed/url"

@patch("app.services.storage.get_client")
def test_delete_file(mock_get_client):
    mock_client = MagicMock()
    mock_get_client.return_value = mock_client
    delete_file("test.txt")
    mock_client.remove_object.assert_called_once()

@patch("app.services.storage.get_client")
def test_list_files(mock_get_client):
    mock_client = MagicMock()
    mock_obj = MagicMock()
    mock_obj.object_name = "prefix/test.txt"
    mock_client.list_objects.return_value = [mock_obj]
    mock_get_client.return_value = mock_client
    files = list_files("prefix/")
    assert len(files) == 1

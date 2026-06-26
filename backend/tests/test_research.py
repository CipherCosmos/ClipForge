import json
import pytest
from unittest.mock import patch, MagicMock
from httpx import ASGITransport, AsyncClient
import uuid
from datetime import datetime, timezone

from app.core.security import get_current_user
from app.database import get_db
from app.main import app
from app.models import PlanEnum, User

SAMPLE_USER = User(
    id=str(uuid.uuid4()),
    email="test@clipforge.dev",
    password_hash="hashed",
    plan=PlanEnum.FREE,
    created_at=datetime.now(timezone.utc),
)


class MockAsyncSession:
    async def commit(self):
        pass
    async def close(self):
        pass


@pytest.fixture(autouse=True)
def setup_dependency_overrides():
    app.dependency_overrides[get_current_user] = lambda: SAMPLE_USER
    app.dependency_overrides[get_db] = lambda: MockAsyncSession()
    yield
    app.dependency_overrides.clear()


class TestResearchEndpoints:
    
    @pytest.mark.asyncio
    @patch("app.api.research.httpx.AsyncClient")
    async def test_get_trends_google_success(self, mock_async_client_class):
        mock_client = MagicMock()
        mock_async_client_class.return_value.__aenter__.return_value = mock_client

        # Mock Google Trends RSS feed XML response
        mock_xml = (
            '<rss xmlns:ht="https://trends.google.com/trending/rss"><channel>'
            '<item><title>Bitcoin Price</title><ht:approx_traffic>100K+ searches</ht:approx_traffic></item>'
            '<item><title>Apple Event</title><ht:approx_traffic>50K+ searches</ht:approx_traffic></item>'
            '</channel></rss>'
        )
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.text = mock_xml
        
        async def mock_get(url, *args, **kwargs):
            return mock_response
        mock_client.get = mock_get

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/api/research/trends?source=google&geo=US")
            
        assert r.status_code == 200
        data = r.json()
        assert "trends" in data
        assert len(data["trends"]) == 2
        assert data["trends"][0]["topic"] == "Bitcoin Price"
        assert data["trends"][0]["traffic"] == "100K+ searches"
        assert data["trends"][0]["source"] == "google"

    @pytest.mark.asyncio
    @patch("app.api.research.httpx.AsyncClient")
    async def test_get_trends_reddit_success(self, mock_async_client_class):
        mock_client = MagicMock()
        mock_async_client_class.return_value.__aenter__.return_value = mock_client

        # Mock Reddit Atom feed XML response
        mock_xml = (
            "<feed xmlns='http://www.w3.org/2005/Atom'>"
            "<entry>"
            "<title>Interesting Reddit Post</title>"
            "<link href='https://reddit.com/r/popular/comments/abc/interesting_post'/>"
            "</entry>"
            "</feed>"
        )
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.text = mock_xml
        
        async def mock_get(url, *args, **kwargs):
            return mock_response
        mock_client.get = mock_get

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/api/research/trends?source=reddit")
            
        assert r.status_code == 200
        data = r.json()
        assert "trends" in data
        assert len(data["trends"]) == 1
        assert data["trends"][0]["topic"] == "Interesting Reddit Post"
        assert data["trends"][0]["source"] == "reddit"

    @pytest.mark.asyncio
    @patch("app.api.research.httpx.AsyncClient")
    async def test_get_trends_news_success(self, mock_async_client_class):
        mock_client = MagicMock()
        mock_async_client_class.return_value.__aenter__.return_value = mock_client

        # Mock Google News RSS feed XML response
        mock_xml = (
            "<rss><channel>"
            "<item><title>Major News Headline - CNN</title><link>https://cnn.com/news</link></item>"
            "</channel></rss>"
        )
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.text = mock_xml
        
        async def mock_get(url, *args, **kwargs):
            return mock_response
        mock_client.get = mock_get

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/api/research/trends?source=news&geo=GB")
            
        assert r.status_code == 200
        data = r.json()
        assert "trends" in data
        assert len(data["trends"]) == 1
        assert data["trends"][0]["topic"] == "Major News Headline"
        assert data["trends"][0]["source"] == "news"

    @pytest.mark.asyncio
    @patch("app.api.research.httpx.AsyncClient")
    async def test_analyze_topic_ollama_success(self, mock_async_client_class):
        mock_client = MagicMock()
        mock_async_client_class.return_value.__aenter__.return_value = mock_client

        # Mock Ollama generation response returning expanded JSON
        ollama_response_json = {
            "viral_potential": 0.95,
            "video_concept": "Concept description",
            "suggested_search_query": "search query",
            "punchy_hook": "Listen up!",
            "hook_variations": ["Listen up!", "Wait, look!", "Did you see?"],
            "script_body": "[Visual: show content] Script body text",
            "call_to_action": "Sub!",
            "pin_comment": "Pin this",
            "hashtags": ["one", "two"],
            "viral_triggers": ["FOMO", "Trend Wave"],
            "audio_music_recommendation": "Trap beat",
            "target_audience": "Tech people"
        }
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value={"response": json.dumps(ollama_response_json)})
        
        async def mock_post(url, *args, **kwargs):
            return mock_response
        mock_client.post = mock_post

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/api/research/analyze", json={"topic": "New Tech Event", "tone": "viral"})
            
        assert r.status_code == 200
        data = r.json()
        assert data["viral_potential"] == 0.95
        assert len(data["hook_variations"]) == 3
        assert "FOMO" in data["viral_triggers"]
        assert data["audio_music_recommendation"] == "Trap beat"
        assert data["target_audience"] == "Tech people"

    @pytest.mark.asyncio
    @patch("app.api.research.httpx.AsyncClient")
    async def test_analyze_topic_ollama_failure_fallback(self, mock_async_client_class):
        mock_client = MagicMock()
        mock_async_client_class.return_value.__aenter__.return_value = mock_client
        
        async def mock_post(url, *args, **kwargs):
            raise Exception("Ollama connection error")
        mock_client.post = mock_post

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/api/research/analyze", json={"topic": "Bitcoin Crash", "tone": "clickbait"})
            
        assert r.status_code == 200
        data = r.json()
        # Should return fallback structure
        assert data["viral_potential"] == 0.85
        assert len(data["hook_variations"]) == 3
        assert "hashtags" in data
        assert "viral_triggers" in data
        assert data["audio_music_recommendation"] != ""
        assert data["target_audience"] != ""

    @pytest.mark.asyncio
    @patch("yt_dlp.YoutubeDL")
    async def test_crawl_videos_success(self, mock_ytdl):
        # Mock yt-dlp search entries
        mock_instance = MagicMock()
        mock_instance.extract_info.return_value = {
            "entries": [
                {
                    "title": "Crawl Video 1",
                    "url": "https://www.youtube.com/watch?v=123",
                    "duration": 45,
                    "uploader": "Uploader One",
                    "view_count": 10000
                },
                {
                    "title": "Crawl Video 2 (Long)",
                    "url": "https://www.youtube.com/watch?v=456",
                    "duration": 120,
                    "uploader": "Uploader Two",
                    "view_count": 500000
                }
            ]
        }
        mock_ytdl.return_value.__enter__.return_value = mock_instance

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Check all
            r_all = await ac.post("/api/research/crawl", json={"query": "test query", "video_type": "all"})
            assert r_all.status_code == 200
            assert len(r_all.json()["videos"]) == 2

            # Check shorts only (duration <= 60s)
            r_shorts = await ac.post("/api/research/crawl", json={"query": "test query", "video_type": "shorts"})
            assert r_shorts.status_code == 200
            assert len(r_shorts.json()["videos"]) == 1
            assert r_shorts.json()["videos"][0]["title"] == "Crawl Video 1"

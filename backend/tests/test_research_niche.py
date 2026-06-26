import json
import pytest
from unittest.mock import patch, MagicMock
from httpx import ASGITransport, AsyncClient
import uuid
from datetime import datetime, timezone

from app.core.security import get_current_user
from app.database import get_db
from app.main import app
from app.models import PlanEnum, User, Video, VideoStatusEnum, Clip, Job, JobStatusEnum, JobTypeEnum
from app.services.video import standardize_youtube_url
from app.api.videos import get_or_clone_video_if_exists

SAMPLE_USER = User(
    id=uuid.uuid4(),
    email="test@clipforge.dev",
    password_hash="hashed",
    plan=PlanEnum.FREE,
    created_at=datetime.now(timezone.utc),
)


class MockResult:
    def __init__(self, scalar=None, scalars_list=None):
        self._scalar = scalar
        self._scalars_list = scalars_list or []

    def scalar(self):
        return self._scalar

    def scalar_one_or_none(self):
        return self._scalar

    def scalars(self):
        return self

    def first(self):
        return self._scalar

    def all(self):
        return self._scalars_list


class MockAsyncSession:
    def __init__(self, existing_video=None, clips=None):
        self.existing_video = existing_video
        self.clips = clips or []
        self.added = []

    async def execute(self, stmt):
        # Determine if statement queries Clip or Video
        stmt_str = str(stmt).lower()
        if "clips" in stmt_str:
            return MockResult(scalars_list=self.clips)
        
        # Check if querying other users' videos
        if "status = :status_1" in stmt_str or "completed" in stmt_str:
            return MockResult(scalar=self.existing_video)
        
        # Else querying current user's video (first check)
        return MockResult(scalar=None)

    async def commit(self):
        pass

    async def flush(self):
        for obj in self.added:
            if hasattr(obj, "id") and obj.id is None:
                obj.id = uuid.uuid4()

    async def refresh(self, obj):
        if hasattr(obj, "id") and obj.id is None:
            obj.id = uuid.uuid4()
        if hasattr(obj, "created_at") and obj.created_at is None:
            obj.created_at = datetime.now(timezone.utc)

    def add(self, obj):
        self.added.append(obj)

    def add_all(self, objs):
        self.added.extend(objs)


@pytest.fixture(autouse=True)
def setup_dependency_overrides():
    app.dependency_overrides[get_current_user] = lambda: SAMPLE_USER
    app.dependency_overrides[get_db] = lambda: MockAsyncSession()
    yield
    app.dependency_overrides.clear()


class TestResearchNiche:

    def test_standardize_youtube_url(self):
        urls = [
            ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            ("https://youtu.be/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            ("https://www.youtube.com/shorts/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            ("https://www.youtube.com/embed/dQw4w9WgXcQ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
            ("https://youtube.com/watch?v=dQw4w9WgXcQ&feature=share", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
        ]
        for src, expected in urls:
            assert standardize_youtube_url(src) == expected

    @pytest.mark.asyncio
    @patch("app.api.videos.copy_prefix")
    @patch("app.api.videos.copy_file")
    async def test_get_or_clone_video_if_exists(self, mock_copy_file, mock_copy_prefix):
        original_video_id = uuid.uuid4()
        original_video = Video(
            id=original_video_id,
            user_id=uuid.uuid4(),
            source_url="https://www.youtube.com/watch?v=dQw4w9WgXcQ",
            status=VideoStatusEnum.COMPLETED,
            duration=60.0,
            title="Original Video",
            transcript={"text": "Original Transcript"},
            segments=[{"start": 0, "end": 10, "text": "Original Transcript", "viral_score": 0.9}],
            language="en",
            platform="youtube_shorts"
        )
        original_clips = [
            Clip(
                id=uuid.uuid4(),
                video_id=original_video_id,
                start_time=0.0,
                end_time=10.0,
                caption="Original Caption",
                score=0.9,
                file_url=f"clips/{original_video_id}/0001.mp4",
                thumbnail_url=f"clips/{original_video_id}/0001_thumb.jpg",
                title="Clip Title"
            )
        ]

        db = MockAsyncSession(existing_video=original_video, clips=original_clips)
        
        cloned = await get_or_clone_video_if_exists(
            db,
            "https://youtu.be/dQw4w9WgXcQ",
            "youtube_shorts",
            SAMPLE_USER.id
        )

        assert cloned is not None
        assert cloned.user_id == SAMPLE_USER.id
        assert cloned.status == VideoStatusEnum.COMPLETED
        assert cloned.duration == 60.0
        assert cloned.title == "Original Video"
        
        # Verify storage copying was triggered
        mock_copy_prefix.assert_any_call(f"clips/{original_video_id}/", f"clips/{cloned.id}/")
        
        # Check added models in session
        added_clips = [obj for obj in db.added if isinstance(obj, Clip)]
        added_jobs = [obj for obj in db.added if isinstance(obj, Job)]
        
        assert len(added_clips) == 1
        assert added_clips[0].video_id == cloned.id
        # Verify video ID in the paths was replaced
        assert str(cloned.id) in added_clips[0].file_url
        assert str(original_video_id) not in added_clips[0].file_url

        assert len(added_jobs) == 3
        assert all(job.status == JobStatusEnum.DONE for job in added_jobs)

    @pytest.mark.asyncio
    @patch("app.api.research.httpx.AsyncClient")
    async def test_get_trends_google_niche_search(self, mock_async_client_class):
        mock_client = MagicMock()
        mock_async_client_class.return_value.__aenter__.return_value = mock_client

        mock_xml = (
            "<rss><channel>"
            "<item><title>Niche Sports News - CNN</title><link>https://cnn.com/sports</link></item>"
            "</channel></rss>"
        )
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.text = mock_xml
        
        async def mock_get(url, *args, **kwargs):
            # Assert URL is Google News Search due to niche parameter
            assert "news.google.com/rss/search" in url
            assert "sports" in url
            return mock_response
        mock_client.get = mock_get

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.get("/api/research/trends?source=google&niche=sports")
            
        assert r.status_code == 200
        data = r.json()
        assert len(data["trends"]) == 1
        assert data["trends"][0]["topic"] == "Niche Sports News"
        assert data["trends"][0]["source"] == "google"

    @pytest.mark.asyncio
    @patch("app.services.llm._get_http")
    async def test_validate_topic_success(self, mock_get_http):
        mock_client = MagicMock()
        mock_get_http.return_value = mock_client

        validation_response_json = {
            "credibility_score": 0.9,
            "virality_score": 0.85,
            "niche_alignment": 0.95,
            "is_valid": True,
            "reason": "This is a highly credible and viral sports topic.",
            "recommended_keywords": ["soccer", "championship"],
            "fact_check_report": "Verified by multiple sources."
        }
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value={"response": json.dumps(validation_response_json)})
        mock_client.post.return_value = mock_response

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post("/api/research/validate-topic", json={"topic": "Messi wins championship", "niche": "sports"})
            
        assert r.status_code == 200
        data = r.json()
        assert data["credibility_score"] == 0.9
        assert data["is_valid"] is True
        assert data["fact_check_report"] == "Verified by multiple sources."

    @pytest.mark.asyncio
    @patch("yt_dlp.YoutubeDL")
    @patch("app.api.videos.get_or_clone_video_if_exists")
    async def test_import_trend_cloning(self, mock_get_or_clone, mock_ytdl):
        # Mock YouTube Search
        mock_instance = MagicMock()
        mock_instance.extract_info.return_value = {
            "entries": [
                {
                    "title": "Messi Golden Goal",
                    "url": "https://www.youtube.com/watch?v=goal12345",
                    "duration": 50,
                }
            ]
        }
        mock_ytdl.return_value.__enter__.return_value = mock_instance

        # Mock cloning to return an already processed video
        cloned_video = Video(
            id=uuid.uuid4(),
            user_id=SAMPLE_USER.id,
            source_url="https://www.youtube.com/watch?v=goal12345",
            status=VideoStatusEnum.COMPLETED,
            duration=50.0,
            title="Messi Golden Goal",
            created_at=datetime.now(timezone.utc)
        )
        mock_get_or_clone.return_value = cloned_video

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/research/import-trend",
                json={"topic": "Messi Goal", "niche": "sports", "platform": "youtube_shorts"}
            )

        assert r.status_code == 200
        data = r.json()
        assert data["id"] == str(cloned_video.id)
        assert data["status"] == "completed"

    @pytest.mark.asyncio
    @patch("yt_dlp.YoutubeDL")
    @patch("app.api.videos.get_or_clone_video_if_exists")
    @patch("app.workers.transcription.run_transcription.delay")
    async def test_import_trend_with_direct_url(self, mock_delay, mock_get_or_clone, mock_ytdl):
        # Mock metadata extraction
        mock_instance = MagicMock()
        mock_instance.extract_info.return_value = {
            "title": "Direct Video Title",
            "duration": 120,
            "uploader": "Direct Uploader"
        }
        mock_ytdl.return_value.__enter__.return_value = mock_instance
        mock_get_or_clone.return_value = None  # Force new video creation
        
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            r = await ac.post(
                "/api/research/import-trend",
                json={
                    "topic": "Direct Topic",
                    "niche": "general",
                    "platform": "youtube_shorts",
                    "url": "https://www.youtube.com/watch?v=direct12345"
                }
            )
            
        assert r.status_code == 200
        data = r.json()
        assert data["source_url"] == "https://www.youtube.com/watch?v=direct12345"
        assert data["title"] == "Direct Video Title"
        assert data["duration"] == 120.0
        mock_delay.assert_called_once()

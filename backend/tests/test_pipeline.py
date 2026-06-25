"""Pipeline integration tests — validates the full task chain with mocked external services.

Tests: transcription → NLP scoring → scene detection + audio analysis → render + export.
All external services (Whisper, Ollama, SenseVoice, diarize, MinIO, FFmpeg) are mocked.
"""
import json
import sys
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.models import Job, Video, VideoStatusEnum

SAMPLE_SEGMENTS_RAW = [
    {"start": 0.0, "end": 2.5, "text": "This is an amazing discovery that will change everything."},
    {"start": 2.5, "end": 5.0, "text": "Scientists have found a way to reverse aging in mice."},
    {"start": 5.0, "end": 7.5, "text": "The implications for human health are enormous."},
    {"start": 7.5, "end": 10.0, "text": "This breakthrough could save millions of lives."},
    {"start": 10.0, "end": 12.5, "text": "But there are still many challenges ahead."},
    {"start": 12.5, "end": 15.0, "text": "Researchers are optimistic about the future."},
]


@pytest.fixture
def mock_video():
    """Create a mock Video object with test segments."""
    video_id = uuid.uuid4()
    video = MagicMock(spec=Video)
    video.id = video_id
    video.user_id = uuid.uuid4()
    video.source_url = "https://example.com/test_video.mp4"
    video.status = VideoStatusEnum.PROCESSING
    video.language = "en"
    video.duration = 15.0
    video.title = "Test Video"

    segments = [
        {**seg, "score": 0.0, "emotion_intensity": 0.0, "keyword_density": 0.0,
         "scene_change_intensity": 0.0, "audio_energy": 0.0, "viral_score": 0.0,
         "hook_score": 0.0, "engagement_potential": 0.0}
        for seg in SAMPLE_SEGMENTS_RAW
    ]
    video.segments = segments

    video.transcript = {
        "language": "en",
        "segments": segments,
        "full_text": " ".join(s["text"] for s in SAMPLE_SEGMENTS_RAW),
    }
    return video


@pytest.fixture
def mock_job():
    """Create a mock Job object."""
    return MagicMock(spec=Job)


# ── Step 1: Transcription → Segments ──────────────────────────────────────

class TestTranscriptionStep:
    """Test that transcription correctly converts raw Whisper output to segments."""

    @patch("app.workers.transcription.transcribe_audio")
    @patch("app.workers.transcription.download_file")
    def test_transcription_creates_segments(self, mock_dl, mock_transcribe):
        """Verify transcription worker creates proper segment structure."""
        from app.workers.transcription import run_transcription

        mock_transcribe.return_value = {
            "segments": SAMPLE_SEGMENTS_RAW,
            "language": "en",
        }

        with patch("app.workers.transcription.SyncSessionLocal") as mock_session:
            session = MagicMock()
            mock_session.return_value = session

            video = MagicMock()
            video.id = uuid.uuid4()
            video.source_url = "http://example.com/vid.mp4"
            video.segments = None
            video.transcript = None
            video.language = None
            video.status = VideoStatusEnum.PROCESSING

            session.query.return_value.filter.return_value.first.side_effect = [
                video,  # First query: video
                None,   # Second query: job (no job)
            ]

            # Prevent the downstream chain call from failing
            with patch("app.workers.nlp.run_nlp"):
                run_transcription(str(video.id))

            # Verify segments were created with all required fields
            assert video.segments is not None
            assert len(video.segments) == 6

            for seg in video.segments:
                assert "start" in seg
                assert "end" in seg
                assert "text" in seg
                assert "viral_score" in seg
                assert "hook_score" in seg
                assert "emotion_intensity" in seg
                assert "engagement_potential" in seg
                assert "keyword_density" in seg
                assert "scene_change_intensity" in seg
                assert "audio_energy" in seg

            assert video.transcript is not None
            assert video.transcript["language"] == "en"

            session.commit.assert_called()


# ── Step 2: NLP Scoring ──────────────────────────────────────────────────

class TestNLPScoringStep:
    """Test that NLP scoring correctly calls Ollama and sets scores."""

    @patch("app.workers.nlp._call_ollama")
    @patch("app.workers.nlp.fetch_trending_keywords")
    @patch("app.workers.nlp.SyncSessionLocal")
    def test_nlp_scores_all_segments(self, mock_session_cls, mock_trending, mock_ollama):
        from app.workers.nlp import run_nlp

        mock_trending.return_value = []

        session = MagicMock()
        mock_session_cls.return_value = session

        video_id = uuid.uuid4()
        video = MagicMock()
        video.id = video_id

        # Create mutable segments
        segments = [
            {"start": i * 2.5, "end": (i + 1) * 2.5, "text": seg["text"],
             "hook_score": 0.0, "emotion_intensity": 0.0,
             "engagement_potential": 0.0, "keyword_density": 0.0,
             "viral_score": 0.0, "scene_change_intensity": 0.0, "audio_energy": 0.0}
            for i, seg in enumerate(SAMPLE_SEGMENTS_RAW)
        ]
        video.segments = segments

        session.query.return_value.filter.return_value.first.side_effect = [
            video,  # First query: video
            None,   # Job query
        ]

        # Mock Ollama returning high scores for first segment, low for others
        def ollama_side_effect(text, language=None):
            if "amazing" in text:
                return {"hook_score": 0.9, "emotion_intensity": 0.8,
                        "engagement_potential": 0.85, "keyword_density": 0.5}
            return {"hook_score": 0.3, "emotion_intensity": 0.3,
                    "engagement_potential": 0.3, "keyword_density": 0.2}

        mock_ollama.side_effect = ollama_side_effect

        # Prevent the downstream chain call from failing
        with patch("app.workers.scene_detect.run_scene_detect"):
            run_nlp(str(video_id))

        # First segment should have higher scores
        first = video.segments[0]
        assert first["hook_score"] > 0.5
        assert first["emotion_intensity"] > 0.5

        # Other segments should have lower scores
        other = video.segments[1]
        assert other["hook_score"] <= 0.3


# ── Step 3: Scene Detection + Audio Analysis ─────────────────────────────

class TestSceneDetectStep:
    """Test scene detection + audio analysis + viral score recalculation."""

    def test_scene_intensity_scoring(self):
        """Test scene boundaries correctly assign intensities."""
        from app.workers.scene_detect import _assign_scene_intensity

        segments = [
            {"start": 0.0, "end": 5.0, "scene_change_intensity": 0.0},
            {"start": 5.0, "end": 10.0, "scene_change_intensity": 0.0},
            {"start": 10.0, "end": 15.0, "scene_change_intensity": 0.0},
        ]
        boundaries = [2.5, 7.0, 12.0]  # one in each segment

        result = _assign_scene_intensity(segments, boundaries)

        assert result[0]["scene_change_intensity"] == pytest.approx(1.0 / 3.0)
        assert result[1]["scene_change_intensity"] == pytest.approx(1.0 / 3.0)
        assert result[2]["scene_change_intensity"] == pytest.approx(1.0 / 3.0)

    def test_no_boundaries(self):
        """Test that no boundaries -> all zeros."""
        from app.workers.scene_detect import _assign_scene_intensity

        segments = [{"start": 0.0, "end": 5.0}]
        result = _assign_scene_intensity(segments, [])
        assert result[0]["scene_change_intensity"] == 0.0

    def test_multiple_boundaries_in_segment(self):
        """Test 3+ boundaries -> 1.0 intensity."""
        from app.workers.scene_detect import _assign_scene_intensity

        segments = [{"start": 0.0, "end": 10.0}]
        boundaries = [1.0, 3.0, 5.0, 7.0]  # 4 boundaries
        result = _assign_scene_intensity(segments, boundaries)
        assert result[0]["scene_change_intensity"] == 1.0

    def test_viral_score_with_all_dimensions(self):
        """Test the viral score calculates correctly with all 8 dimensions."""
        from app.workers.scene_detect import _calculate_viral_score

        seg = {
            "hook_score": 0.9,
            "emotion_intensity": 0.8,
            "engagement_potential": 0.85,
            "keyword_density": 0.5,
            "scene_change_intensity": 0.3,
            "audio_event_score": 0.5,
            "audio_energy": 0.4,
            "speaker_confidence": 0.9,
        }
        score = _calculate_viral_score(seg)

        expected = (
            0.25 * 0.9 + 0.20 * 0.8 + 0.15 * 0.85 + 0.10 * 0.5 +
            0.10 * 0.3 + 0.10 * 0.5 + 0.05 * 0.4 + 0.05 * 0.9
        )
        assert score == pytest.approx(expected)


# ── Step 4: Render + Export ──────────────────────────────────────────────

class TestRenderStep:
    """Test clip rendering and exporting logic."""

    def test_get_top_segments(self):
        """Test selection of top-N segments by viral score."""
        from app.workers.render import _get_top_segments

        segments = [
            {"viral_score": 0.9},
            {"viral_score": 0.1},
            {"viral_score": 0.5},
            {"viral_score": 0.0},
            {"viral_score": 0.7},
        ]

        top = _get_top_segments(segments, n=3)
        assert len(top) == 3
        assert top[0]["viral_score"] == 0.9
        assert top[1]["viral_score"] == 0.7
        assert top[2]["viral_score"] == 0.5

    def test_get_top_segments_filters_zero_scores(self):
        """Test that zero-score segments are excluded."""
        from app.workers.render import _get_top_segments

        segments = [
            {"viral_score": 0.0},
            {"viral_score": 0.0},
        ]
        top = _get_top_segments(segments, n=5)
        assert len(top) == 0

    @patch("app.workers.render.httpx.Client")
    def test_metadata_generation(self, mock_client_class):
        """Test Ollama-based metadata generation."""
        from app.workers.render import _generate_clip_metadata

        mock_client = MagicMock()
        mock_client_class.return_value.__enter__.return_value = mock_client

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "response": json.dumps({
                "title": "Amazing Discovery!",
                "caption": "This will blow your mind! #science #discovery",
                "hashtags": "#science,#discovery,#viral",
            })
        }
        mock_client.post.return_value = mock_response

        meta = _generate_clip_metadata("This is an amazing discovery")

        assert meta["title"] == "Amazing Discovery!"
        assert "#science" in meta["hashtags"]

    @patch("app.workers.render.httpx.Client")
    def test_metadata_fallback_on_error(self, mock_client_class):
        """Test metadata falls back gracefully on Ollama error."""
        from app.workers.render import _generate_clip_metadata

        mock_client = mock_client_class.return_value.__enter__.return_value
        mock_client.post.side_effect = ValueError("API down")

        meta = _generate_clip_metadata("Test transcript text")

        assert meta["title"] == ""
        assert meta["caption"] == "Test transcript text"


# ── Step 5: Full Pipeline Chain ──────────────────────────────────────────

class TestPipelineChain:
    """Test the full pipeline chain: event ordering and dependencies."""

    def test_transcription_enqueues_parallel_chord(self):
        """Verify transcription calls chord with run_nlp and run_scene_detect."""
        from app.workers.transcription import run_transcription
        with patch("app.workers.transcription.transcribe_audio") as mock_ta, \
             patch("app.workers.transcription.download_file"), \
             patch("app.workers.transcription.SyncSessionLocal") as mock_sc, \
             patch("celery.chord") as mock_chord:

            session = MagicMock()
            mock_sc.return_value = session
            video = MagicMock()
            video.id = uuid.uuid4()
            video.source_url = "http://example.com/v.mp4"
            video.segments = None
            video.transcript = None

            session.query.return_value.filter.return_value.first.side_effect = [
                video, None
            ]

            mock_ta.return_value = {
                "segments": [{"start": 0.0, "end": 1.0, "text": "test"}],
                "language": "en",
            }

            run_transcription(str(video.id))

            # Verify chord was enqueued
            mock_chord.assert_called_once()

    def test_nlp_returns_segments(self):
        """Verify NLP returns segments for chord."""
        from app.workers.nlp import run_nlp
        with patch("app.workers.nlp._call_ollama") as mock_ollama, \
             patch("app.workers.nlp.fetch_trending_keywords", return_value=[]), \
             patch("app.workers.nlp.SyncSessionLocal") as mock_sc:

            session = MagicMock()
            mock_sc.return_value = session
            video = MagicMock()
            video.id = uuid.uuid4()
            video.segments = [
                {"start": 0.0, "end": 1.0, "text": "this is a longer test sentence",
                 "hook_score": 0.0, "emotion_intensity": 0.0,
                 "engagement_potential": 0.0, "keyword_density": 0.0,
                 "viral_score": 0.0, "scene_change_intensity": 0.0,
                 "audio_energy": 0.0}
            ]

            session.query.return_value.filter.return_value.first.side_effect = [
                video, None
            ]

            mock_ollama.return_value = {
                "hook_score": 0.5, "emotion_intensity": 0.5,
                "engagement_potential": 0.5, "keyword_density": 0.5,
            }

            result = run_nlp(str(video.id))

            assert isinstance(result, list)
            assert result[0]["hook_score"] == 0.5

    def test_scene_detect_returns_segments(self):
        """Verify scene_detect returns segments for chord."""
        from app.workers.scene_detect import run_scene_detect
        with patch("app.workers.scene_detect.download_file"), \
             patch("app.workers.scene_detect.extract_full_audio"), \
             patch("app.workers.scene_detect.SyncSessionLocal") as mock_sc, \
             patch("app.workers.scene_detect._detect_scenes", return_value=[]), \
             patch("tempfile.mkdtemp"):

            session = MagicMock()
            mock_sc.return_value = session
            video = MagicMock()
            video.id = uuid.uuid4()
            video.source_url = "http://example.com/v.mp4"
            video.segments = [
                {"start": 0.0, "end": 2.5, "text": "test",
                 "hook_score": 0.5, "emotion_intensity": 0.5,
                 "engagement_potential": 0.5, "keyword_density": 0.5,
                 "scene_change_intensity": 0.0, "audio_event_score": 0.0,
                 "audio_energy": 0.0, "speaker_confidence": 0.0,
                 "viral_score": 0.0}
            ]

            session.query.return_value.filter.return_value.first.side_effect = [
                video, None
            ]

            with patch("os.path.exists") as mock_exists:
                mock_exists.return_value = False
                result = run_scene_detect(str(video.id))

            assert isinstance(result, list)
            assert "scene_change_intensity" in result[0]


# ── Step 6: Viral Score Formula Validation ───────────────────────────────

class TestViralScoreFormula:
    """Validate the viral score formula produces correct weighted results."""

    def test_hook_dominance(self):
        """Segments with strong hooks should score highest."""
        from app.workers.scene_detect import _calculate_viral_score

        strong_hook = _calculate_viral_score({
            "hook_score": 1.0, "emotion_intensity": 0.0,
            "engagement_potential": 0.0, "keyword_density": 0.0,
            "scene_change_intensity": 0.0, "audio_event_score": 0.0,
            "audio_energy": 0.0, "speaker_confidence": 0.0,
        })
        # Hook weight is 0.25
        assert strong_hook == pytest.approx(0.25)

        strong_emotion = _calculate_viral_score({
            "hook_score": 0.0, "emotion_intensity": 1.0,
            "engagement_potential": 0.0, "keyword_density": 0.0,
            "scene_change_intensity": 0.0, "audio_event_score": 0.0,
            "audio_energy": 0.0, "speaker_confidence": 0.0,
        })
        # Emotion weight is 0.20
        assert strong_emotion == pytest.approx(0.20)

        # Hook should matter more than emotion
        assert strong_hook > strong_emotion

    def test_trend_boost_magnifies_score(self):
        """Trend boost should multiply the final viral score."""
        from app.services.trends import compute_trend_boost
        from app.workers.scene_detect import _calculate_viral_score

        seg = {
            "hook_score": 0.5, "emotion_intensity": 0.5,
            "engagement_potential": 0.5, "keyword_density": 0.5,
            "scene_change_intensity": 0.5, "audio_event_score": 0.5,
            "audio_energy": 0.5, "speaker_confidence": 0.5,
        }

        base_score = _calculate_viral_score(seg)
        boost = compute_trend_boost("AI technology machine learning")

        # Trend boost should be >= 1.0
        assert boost >= 1.0

        # Boosted score should be higher
        boosted = base_score * boost
        assert boosted >= base_score

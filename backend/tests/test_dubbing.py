"""Tests for the AI voice dubbing pipeline."""
import sys
import uuid
from pathlib import Path
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


class TestTranslation:
    """Test the translation service."""

    def test_supported_languages_defined(self):
        from app.services.translation import SUPPORTED_LANGUAGES
        assert len(SUPPORTED_LANGUAGES) >= 20
        assert "en" in SUPPORTED_LANGUAGES
        assert "es" in SUPPORTED_LANGUAGES
        assert "fr" in SUPPORTED_LANGUAGES

    def test_same_language_returns_original(self):
        from app.services.translation import translate_text
        result = translate_text("Hello world", target_lang="en", source_lang="en")
        assert result == "Hello world"

    def test_unsupported_language_returns_original(self):
        from app.services.translation import translate_text
        result = translate_text("Hello world", target_lang="xx", source_lang="en")
        assert result == "Hello world"

    @patch("app.services.translation._get_argos_model")
    def test_translation_calls_model(self, mock_get_model):
        from app.services.translation import translate_text

        mock_model = MagicMock()
        mock_model.translate.return_value = "Hola mundo"
        mock_get_model.return_value = mock_model

        result = translate_text("Hello world", target_lang="es", source_lang="en")
        assert result == "Hola mundo"
        mock_model.translate.assert_called_once_with("Hello world")

    @patch("app.services.translation._get_argos_model", return_value=None)
    def test_translation_fallback(self, mock_get_model):
        from app.services.translation import translate_text

        result = translate_text("Hello world", target_lang="es", source_lang="en")
        assert result == "Hello world"


class TestTTS:
    """Test the text-to-speech service."""

    @patch("app.services.tts.subprocess.run")
    def test_generate_speech_edge_tts(self, mock_run):
        from app.services.tts import generate_speech

        mock_run.return_value.returncode = 0
        mock_run.return_value.stdout = ""
        mock_run.return_value.stderr = ""

        with patch("os.path.getsize", return_value=1024):
            with patch("os.path.exists", return_value=True):
                output = generate_speech("Hello world", "en", "/tmp/test_speech.mp3")
                assert output == "/tmp/test_speech.mp3"

    @patch("app.services.tts.subprocess.run")
    def test_generate_speech_fallback_on_failure(self, mock_run):
        from app.services.tts import generate_speech

        mock_run.side_effect = [
            type("Result", (), {"returncode": 1, "stdout": "", "stderr": "error"})(),
            type("Result", (), {"returncode": 0, "stdout": "", "stderr": ""})(),
        ]

        with patch("os.path.getsize", return_value=1024):
            with patch("os.path.exists", return_value=True):
                output = generate_speech("Hello world", "en", "/tmp/fallback.mp3")
                assert output == "/tmp/fallback.mp3"

    def test_voice_map_coverage(self):
        from app.services.tts import VOICE_MAP

        for core_lang in ["en", "es", "fr", "de", "it", "pt", "zh", "ja", "ko"]:
            assert core_lang in VOICE_MAP, f"Missing voice for {core_lang}"


class TestDubbingPipeline:
    """Test the full dubbing pipeline worker."""

    def test_dub_clip_worker(self):
        from app.workers.dubbing import run_dub_clip

        clip_id = uuid.uuid4()
        video_id = uuid.uuid4()

        clip = MagicMock()
        clip.id = clip_id
        clip.video_id = video_id
        clip.file_url = "http://example.com/clip.mp4"
        clip.caption = "Hello world, this is a test clip."

        video = MagicMock()
        video.id = video_id
        video.language = "en"

        mock_response = MagicMock()
        mock_response.content = b"fake video content"

        mock_http_client = MagicMock()
        mock_http_client.__enter__.return_value = mock_http_client
        mock_http_client.get.return_value = mock_response

        with patch("app.workers.dubbing.SyncSessionLocal") as mock_session_cls, \
             patch("app.workers.dubbing.dub_clip") as mock_dub, \
             patch("app.workers.dubbing.httpx.Client", return_value=mock_http_client), \
             patch("app.workers.dubbing.upload_file") as mock_upload, \
             patch("app.workers.dubbing.get_presigned_url") as mock_presign, \
             patch("app.workers.dubbing.ensure_bucket"):

            session = MagicMock()
            mock_session_cls.return_value = session
            session.query.return_value.filter.return_value.first.side_effect = [
                clip, video
            ]

            mock_dub.return_value = True
            mock_presign.return_value = "http://minio/dubbed.mp4"

            result = run_dub_clip(str(clip_id), "es")

            assert result is not None
            assert result["clip_id"] == str(clip_id)
            assert result["target_lang"] == "es"
            assert "dubbed_url" in result

    def test_dub_video_enqueues_all_clips(self):
        from app.workers.dubbing import run_dub_video

        video_id = uuid.uuid4()

        clips = [
            MagicMock(id=uuid.uuid4(), video_id=video_id),
            MagicMock(id=uuid.uuid4(), video_id=video_id),
            MagicMock(id=uuid.uuid4(), video_id=video_id),
        ]

        with patch("app.workers.dubbing.SyncSessionLocal") as mock_session_cls, \
             patch("app.workers.dubbing.run_dub_clip") as mock_dub_clip:

            session = MagicMock()
            mock_session_cls.return_value = session

            video = MagicMock()
            video.id = video_id
            session.query.return_value.filter.return_value.first.return_value = video
            session.query.return_value.filter.return_value.all.return_value = clips

            run_dub_video(str(video_id), ["es", "fr"])

            assert mock_dub_clip.delay.call_count == 6

    def test_dub_clip_function(self):
        """Test the core dub_clip function logic with mocked subprocess."""
        from app.workers.dubbing import dub_clip

        with patch("app.workers.dubbing.translate_text") as mock_translate, \
             patch("app.workers.dubbing.generate_speech") as mock_speech, \
             patch("app.workers.dubbing.subprocess.run") as mock_run, \
             patch("os.path.exists", return_value=True):

            mock_translate.return_value = "Hola mundo"
            mock_speech.return_value = "/tmp/speech.mp3"

            mock_run.side_effect = [
                type("Result", (), {"stdout": "4.0\n", "returncode": 0})(),
                type("Result", (), {"stdout": "5.0\n", "returncode": 0})(),
                type("Result", (), {"returncode": 0, "stdout": "", "stderr": ""})(),
            ]

            result = dub_clip(
                "/tmp/input.mp4", "/tmp/output.mp4",
                "Hello world", "en", "es",
            )

            assert result is True
            mock_translate.assert_called_once_with("Hello world", "es", "en")

    def test_dub_clip_handles_empty_transcript(self):
        """Empty transcript should not crash."""
        from app.workers.dubbing import run_dub_clip

        with patch("app.workers.dubbing.SyncSessionLocal") as mock_session_cls:
            session = MagicMock()
            mock_session_cls.return_value = session

            clip = MagicMock()
            clip.id = uuid.uuid4()
            clip.caption = ""
            clip.file_url = "http://example.com/clip.mp4"

            video = MagicMock()
            video.language = "en"

            session.query.return_value.filter.return_value.first.side_effect = [
                clip, video
            ]

            result = run_dub_clip(str(clip.id), "es")
            assert result is None

    def test_dub_clip_translation_no_change_returns_false(self):
        """If translation returns the same text, dub_clip should return False."""
        from app.workers.dubbing import dub_clip

        with patch("app.workers.dubbing.translate_text") as mock_translate:
            mock_translate.return_value = "Hello world"  # same as input

            result = dub_clip(
                "/tmp/input.mp4", "/tmp/output.mp4",
                "Hello world", "en", "es",
            )

            assert result is False


class TestDubbingEndToEnd:
    """End-to-end tests for the dubbing workflow."""

    def test_translate_then_tts_roundtrip(self):
        """Verify the conceptual flow: translate then TTS."""
        from app.services.translation import SUPPORTED_LANGUAGES, translate_text
        from app.services.tts import VOICE_MAP

        assert "fr" in SUPPORTED_LANGUAGES
        assert "fr" in VOICE_MAP

        text = "This is a scientific breakthrough."
        translated = translate_text(text, "fr", "en")
        assert isinstance(translated, str)
        assert len(translated) > 0

    def test_supported_languages_listed_in_dubbing(self):
        from app.workers.dubbing import SUPPORTED_LANGUAGES
        assert len(SUPPORTED_LANGUAGES) >= 20
        assert "es" in SUPPORTED_LANGUAGES
        assert "fr" in SUPPORTED_LANGUAGES
        assert "de" in SUPPORTED_LANGUAGES

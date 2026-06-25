from unittest.mock import patch

from app.services.moderation import moderate_segment, moderate_text


class TestModerateText:
    def test_clean_text(self):
        result = moderate_text("Hello, this is a nice video!")
        assert result == {"flagged": False, "categories": []}

    def test_profanity_text(self):
        result = moderate_text("This is shit, I can't believe it")
        assert result["flagged"] is True
        assert "profanity" in result["categories"]

    def test_violence_text(self):
        result = moderate_text("I will kill you")
        assert result["flagged"] is True
        assert "violence" in result["categories"]


class TestModerateSegment:
    @patch("app.services.moderation.moderate_image")
    def test_clean_text_passes(self, mock_moderate_image):
        mock_moderate_image.return_value = {
            "nsfw": False, "confidence": 0.0, "label": "neutral",
        }
        result = moderate_segment("dummy.mp4", "Hello, this is clean", 0.0)
        assert result["passed"] is True
        assert result["text"]["flagged"] is False
        assert result["reason"] == ""

    @patch("app.services.moderation.moderate_image")
    def test_flagged_text_does_not_pass(self, mock_moderate_image):
        mock_moderate_image.return_value = {
            "nsfw": False, "confidence": 0.0, "label": "neutral",
        }
        result = moderate_segment("dummy.mp4", "This is shit", 0.0)
        assert result["passed"] is False
        assert result["text"]["flagged"] is True
        assert "flagged_text" in result["reason"]

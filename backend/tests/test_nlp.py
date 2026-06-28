import pytest

from app.services.scoring import calculate_viral_score


class TestCalculateViralScore:
    def test_all_zeros_returns_zero(self):
        seg = {
            "hook_score": 0.0,
            "emotion_intensity": 0.0,
            "engagement_potential": 0.0,
            "keyword_density": 0.0,
            "scene_change_intensity": 0.0,
            "audio_event_score": 0.0,
            "audio_energy": 0.0,
            "speaker_confidence": 0.0,
        }
        assert calculate_viral_score(seg) == 0.0

    def test_all_ones_returns_one(self):
        seg = {
            "hook_score": 1.0,
            "emotion_intensity": 1.0,
            "engagement_potential": 1.0,
            "keyword_density": 1.0,
            "scene_change_intensity": 1.0,
            "audio_event_score": 1.0,
            "audio_energy": 1.0,
            "speaker_confidence": 1.0,
        }
        assert calculate_viral_score(seg) == pytest.approx(1.0)

    def test_half_values_returns_expected_weighted_sum(self):
        seg = {
            "hook_score": 0.5,
            "emotion_intensity": 0.5,
            "engagement_potential": 0.5,
            "keyword_density": 0.5,
            "scene_change_intensity": 0.5,
            "audio_event_score": 0.5,
            "audio_energy": 0.5,
            "speaker_confidence": 0.5,
        }
        result = calculate_viral_score(seg)
        expected = 0.5 * (0.25 + 0.20 + 0.15 + 0.10 + 0.10 + 0.10 + 0.05 + 0.05)
        assert result == pytest.approx(expected)

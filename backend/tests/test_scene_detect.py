import pytest

from app.services.scoring import calculate_viral_score


class TestSceneDetectViralScore:
    def test_all_dimensions_zero_returns_zero(self):
        seg = {}
        assert calculate_viral_score(seg) == 0.0

    def test_all_dimensions_one_returns_one(self):
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

    def test_single_dimension_at_one_returns_its_weight(self):
        seg = {"hook_score": 1.0}
        assert calculate_viral_score(seg) == 0.25

    def test_multiple_single_dimensions(self):
        assert calculate_viral_score({"emotion_intensity": 1.0}) == 0.20
        assert calculate_viral_score({"engagement_potential": 1.0}) == 0.15
        assert calculate_viral_score({"keyword_density": 1.0}) == 0.10
        assert calculate_viral_score({"scene_change_intensity": 1.0}) == 0.10
        assert calculate_viral_score({"audio_event_score": 1.0}) == 0.10
        assert calculate_viral_score({"audio_energy": 1.0}) == 0.05
        assert calculate_viral_score({"speaker_confidence": 1.0}) == 0.05

    def test_with_trend_boost_factor(self):
        seg = {"hook_score": 1.0, "trend_boost": 2.0}
        base_score = calculate_viral_score(seg)
        final_score = base_score * seg.get("trend_boost", 1.0)
        assert base_score == 0.25
        assert final_score == pytest.approx(0.5)

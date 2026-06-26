"""Tests for viral score calculation."""
from app.services.scoring import calculate_viral_score

def test_perfect_score():
    seg = {k: 1.0 for k in [
        "hook_score", "emotion_intensity", "engagement_potential",
        "keyword_density", "scene_change_intensity", "audio_event_score",
        "audio_energy", "speaker_confidence"
    ]}
    assert calculate_viral_score(seg) == 1.0

def test_zero_score():
    assert calculate_viral_score({}) == 0.0

def test_partial_score():
    seg = {"hook_score": 1.0, "emotion_intensity": 0.5}
    expected = 0.25 * 1.0 + 0.20 * 0.5
    assert calculate_viral_score(seg) == expected

def test_hook_weight():
    seg = {"hook_score": 1.0, "emotion_intensity": 0.0,
           "engagement_potential": 0.0, "keyword_density": 0.0,
           "scene_change_intensity": 0.0, "audio_event_score": 0.0,
           "audio_energy": 0.0, "speaker_confidence": 0.0}
    assert calculate_viral_score(seg) == 0.25

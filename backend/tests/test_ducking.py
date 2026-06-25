from app.services.ducking import build_duck_filter


class TestBuildDuckFilter:
    def test_empty_speech_list_returns_empty_string(self):
        assert build_duck_filter([]) == ""

    def test_single_segment_returns_correct_expression(self):
        result = build_duck_filter([{"start": 0.0, "end": 5.0}])
        assert result == "volume=enable='between(t,0.0,5.0)':volume=-6.0dB"

    def test_multiple_segments_returns_combined_expression(self):
        result = build_duck_filter([
            {"start": 0.0, "end": 5.0},
            {"start": 10.0, "end": 15.0},
        ])
        assert (
            result
            == "volume=enable='between(t,0.0,5.0)+between(t,10.0,15.0)':volume=-6.0dB"
        )

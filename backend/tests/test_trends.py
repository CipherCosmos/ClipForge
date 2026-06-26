from unittest.mock import patch

from app.services.trends import _cache as trends_cache
from app.services.trends import compute_trend_boost, fetch_trending_keywords


class TestComputeTrendBoost:
    def test_empty_text_no_match(self):
        assert compute_trend_boost("", trending=["AI", "tech"]) == 1.0

    def test_no_match_returns_one(self):
        assert compute_trend_boost("hello world", trending=["AI", "tech"]) == 1.0

    def test_one_keyword_returns_one_point_five(self):
        assert compute_trend_boost("AI is the future", trending=["AI", "tech"]) == 1.5

    def test_two_keywords_returns_two(self):
        assert compute_trend_boost("AI tech is great", trending=["AI", "tech"]) == 2.0

    def test_three_plus_keywords_capped_at_three(self):
        result = compute_trend_boost(
            "AI tech crypto bitcoin", trending=["AI", "tech", "crypto", "bitcoin"],
        )
        assert result == 3.0


class TestFetchTrendingKeywords:
    @patch("app.services.trends.httpx.Client")
    def test_returns_list_on_api_failure(self, mock_client):
        import httpx
        mock_client.return_value.__enter__.return_value.get.side_effect = httpx.HTTPError(
            "API unavailable"
        )
        trends_cache.clear()
        trends_cache.update({"keywords": [], "timestamp": 0.0})
        keywords = fetch_trending_keywords()
        assert isinstance(keywords, list)
        assert len(keywords) > 0

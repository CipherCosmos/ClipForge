import pytest
import json
from unittest.mock import patch, MagicMock
from app.services.llm import generate_llm, generate_llm_async
from app.config import settings


class TestLLMService:

    @pytest.fixture(autouse=True)
    def clean_settings(self):
        old_key = settings.GROQ_API_KEY
        settings.GROQ_API_KEY = None
        yield
        settings.GROQ_API_KEY = old_key

    @patch("app.services.llm._get_http")
    def test_generate_llm_ollama_fallback(self, mock_get_http):
        mock_client = MagicMock()
        mock_get_http.return_value = mock_client

        # Mock Ollama response format
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value={"response": "Ollama response text"})
        mock_client.post.return_value = mock_response

        res = generate_llm("test prompt", format_json=False)
        assert res["response"] == "Ollama response text"
        assert mock_client.post.call_count == 1
        # Check that it called local Ollama endpoint
        call_url = mock_client.post.call_args[0][0]
        assert "api/generate" in call_url

    @patch("app.services.llm._get_http")
    def test_generate_llm_groq_routing(self, mock_get_http):
        settings.GROQ_API_KEY = "test-groq-key"

        mock_client = MagicMock()
        mock_get_http.return_value = mock_client

        # Mock Groq chat completions response format
        groq_json = {
            "choices": [
                {
                    "message": {
                        "content": "Groq response text"
                    }
                }
            ]
        }
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value=groq_json)
        mock_client.post.return_value = mock_response

        res = generate_llm("test prompt", format_json=True)
        assert res["response"] == "Groq response text"
        assert mock_client.post.call_count == 1
        
        # Check that it called Groq endpoint with auth headers
        call_url = mock_client.post.call_args[0][0]
        call_headers = mock_client.post.call_args[1]["headers"]
        assert "api.groq.com" in call_url
        assert "Bearer test-groq-key" in call_headers["Authorization"]

    @pytest.mark.asyncio
    @patch("app.services.llm._get_http")
    async def test_generate_llm_async_ollama_fallback(self, mock_get_http):
        mock_client = MagicMock()
        mock_get_http.return_value = mock_client

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value={"response": "Ollama async text"})
        mock_client.post.return_value = mock_response

        res = await generate_llm_async("test prompt", format_json=False)
        assert res["response"] == "Ollama async text"
        call_url = mock_client.post.call_args[0][0]
        assert "api/generate" in call_url

    @pytest.mark.asyncio
    @patch("app.services.llm._get_http")
    async def test_generate_llm_async_groq_routing(self, mock_get_http):
        settings.GROQ_API_KEY = "test-groq-key-async"

        mock_client = MagicMock()
        mock_get_http.return_value = mock_client

        groq_json = {
            "choices": [
                {
                    "message": {
                        "content": "Groq async text"
                    }
                }
            ]
        }
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.raise_for_status = MagicMock()
        mock_response.json = MagicMock(return_value=groq_json)
        mock_client.post.return_value = mock_response

        res = await generate_llm_async("test prompt", format_json=True)
        assert res["response"] == "Groq async text"
        call_url = mock_client.post.call_args[0][0]
        assert "api.groq.com" in call_url

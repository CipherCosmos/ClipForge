import asyncio
import logging
from typing import Any, Dict, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

_http_client: httpx.Client | None = None
def _get_http():
    global _http_client
    if _http_client is None:
        _http_client = httpx.Client(timeout=30.0)
    return _http_client


def generate_llm(
    prompt: str,
    system_prompt: Optional[str] = None,
    format_json: bool = False,
    timeout: float = 30.0
) -> Dict[str, Any]:
    """Route LLM generation to Groq API (if configured) or local Ollama (fallback)."""
    if settings.GROQ_API_KEY:
        try:
            logger.info("Generating via Groq Cloud API (%s)...", settings.GROQ_LLM_MODEL)
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type": "application/json"
            }
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

            payload = {
                "model": settings.GROQ_LLM_MODEL,
                "messages": messages,
                "temperature": 0.2,
            }
            if format_json:
                payload["response_format"] = {"type": "json_object"}

            client = _get_http()
            resp = client.post(url, json=payload, headers=headers)
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            return {"response": content}
        except Exception as e:
            logger.error("Failed to generate via Groq API: %s. Falling back to local Ollama.", e)

    # Fallback to local Ollama
    logger.info("Generating via local Ollama (%s)...", settings.OLLAMA_MODEL)
    url = f"{settings.OLLAMA_URL}/api/generate"
    payload = {
        "model": settings.OLLAMA_MODEL,
        "prompt": prompt,
        "stream": False,
    }
    if format_json:
        payload["format"] = "json"
    if system_prompt:
        payload["system"] = system_prompt

    try:
        client = _get_http()
        resp = client.post(url, json=payload)
        resp.raise_for_status()
        data = resp.json()
        return {"response": data.get("response", "")}
    except Exception as e:
        logger.error("Local Ollama generation failed: %s", e)
        raise e


async def generate_llm_async(
    prompt: str,
    system_prompt: Optional[str] = None,
    format_json: bool = False,
    timeout: float = 30.0
) -> Dict[str, Any]:
    """Async wrapper around generate_llm — runs sync logic in a thread."""
    return await asyncio.to_thread(generate_llm, prompt, system_prompt, format_json, timeout)

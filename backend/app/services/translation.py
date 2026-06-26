"""Translation service using Argos Translate (local, no API key)."""

import logging
import threading
from functools import lru_cache

logger = logging.getLogger(__name__)

SUPPORTED_LANGUAGES = {
    "en": "English",
    "es": "Spanish",
    "fr": "French",
    "de": "German",
    "it": "Italian",
    "pt": "Portuguese",
    "ru": "Russian",
    "zh": "Chinese",
    "ja": "Japanese",
    "ko": "Korean",
    "ar": "Arabic",
    "hi": "Hindi",
    "nl": "Dutch",
    "pl": "Polish",
    "tr": "Turkish",
    "vi": "Vietnamese",
    "th": "Thai",
    "sv": "Swedish",
    "da": "Danish",
    "fi": "Finnish",
    "el": "Greek",
    "cs": "Czech",
    "ro": "Romanian",
    "hu": "Hungarian",
    "he": "Hebrew",
    "id": "Indonesian",
    "ms": "Malay",
    "no": "Norwegian",
    "uk": "Ukrainian",
}


_argos_initialized = False
_argos_lock = threading.Lock()


def _ensure_argos_index():
    global _argos_initialized
    if _argos_initialized:
        return
    with _argos_lock:
        if _argos_initialized:
            return
        try:
            import argostranslate.package
            argostranslate.package.update_package_index()
            _argos_initialized = True
        except Exception as exc:
            logger.debug("Argos index update failed: %s", exc)


@lru_cache(maxsize=32)
def _get_argos_model(lang_pair: str):
    """Load an Argos Translate model for the given language pair.

    Args:
        lang_pair: Language pair string, e.g. "en-es" for English to Spanish.

    Returns:
        An Argos Translate translation model, or None if unavailable.
    """
    try:
        import argostranslate.package
        import argostranslate.translate

        from_code, to_code = lang_pair.split("-")
        _ensure_argos_index()
        available_packages = argostranslate.package.get_available_packages()
        package_to_install = next(
            (
                pkg
                for pkg in available_packages
                if pkg.from_code == from_code and pkg.to_code == to_code
            ),
            None,
        )
        if package_to_install:
            argostranslate.package.install_from_path(
                package_to_install.download()
            )
        return argostranslate.translate.get_translation_from_codes(
            from_code, to_code
        )
    except ImportError:
        logger.debug("argostranslate not installed, translation unavailable")
    except Exception as exc:
        logger.debug("Failed to load Argos model %s: %s", lang_pair, exc)
    return None


def _translate_text_uncached(text: str, target_lang: str, source_lang: str) -> str:
    """Translate text from source_lang to target_lang."""
    if source_lang == target_lang:
        return text
    if target_lang not in SUPPORTED_LANGUAGES:
        logger.warning("Unsupported target language: %s", target_lang)
        return text
    lang_pair = f"{source_lang}-{target_lang}"
    model = _get_argos_model(lang_pair)
    if model is None:
        logger.warning("Translation model unavailable for %s, returning original", lang_pair)
        return text
    try:
        return model.translate(text)
    except Exception as exc:
        logger.warning("Translation failed for %s: %s", lang_pair, exc)
        return text


def translate_text(text: str, target_lang: str, source_lang: str = "en") -> str:
    return _translate_text_uncached(text, target_lang, source_lang)

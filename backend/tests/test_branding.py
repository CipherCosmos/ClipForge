"""Tests for branding service."""
from app.services.branding import BrandConfig, build_caption_style_filter, build_watermark_filter


def test_build_watermark_filter_with_text():
    brand = BrandConfig(watermark_text="@MyChannel")
    filters = build_watermark_filter(brand, 1080, 1920)
    assert len(filters) == 1
    assert "@MyChannel" in filters[0]
    assert "drawtext" in filters[0]


def test_build_watermark_filter_empty():
    brand = BrandConfig()
    filters = build_watermark_filter(brand, 1080, 1920)
    assert filters == []


def test_build_caption_style_classic():
    filters = build_caption_style_filter("Hello world", "classic", 1080, 1920)
    assert len(filters) == 1
    assert "Hello world" in filters[0]
    assert "drawtext" in filters[0]
    assert "white" in filters[0]


def test_build_caption_style_neon():
    filters = build_caption_style_filter("Neon text", "neon", 1080, 1920)
    assert "#00FFFF" in filters[0]


def test_build_caption_style_minimal():
    filters = build_caption_style_filter("Minimal", "minimal", 1080, 1920)
    assert "box=0" in filters[0]


def test_build_caption_style_highlight():
    filters = build_caption_style_filter("Highlight", "highlight", 1080, 1920)
    assert "#FFD700" in filters[0]


def test_build_caption_style_typewriter():
    filters = build_caption_style_filter("Typewriter", "typewriter", 1080, 1920)
    assert "between(t,0,2)" in filters[0]


def test_build_caption_style_fallback():
    filters = build_caption_style_filter("Fallback", "unknown_style", 1080, 1920)
    assert len(filters) == 1

"""Branding and music configuration endpoints."""

import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.services.music import get_track_list, search_pixabay_music

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/branding", tags=["branding"])


class BrandConfigRequest(BaseModel):
    watermark_text: str = ""
    watermark_position: str = "bottom-right"
    primary_color: str = "#FF6B35"
    caption_style: str = "classic"


class MusicTrackResponse(BaseModel):
    id: str
    title: str
    bpm: int
    genre: str
    mood: str
    duration: int
    source: str


CAPTION_STYLES = {
    "classic": "Black background, white text, centered",
    "neon": "Cyan text with magenta glow, bold",
    "minimal": "No background, light text",
    "highlight": "Gold text on orange background, bold",
    "typewriter": "Classic with fade-in animation",
}


@router.get("/caption-styles")
async def list_caption_styles():
    return [{"id": k, "description": v} for k, v in CAPTION_STYLES.items()]


@router.get("/music")
async def list_music():
    return get_track_list()


@router.get("/music/search")
async def search_music(query: str = "", per_page: int = 10):
    results = await search_pixabay_music(query, per_page)
    return {"results": results}

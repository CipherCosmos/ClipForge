import uuid
from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel


class VideoCreate(BaseModel):
    source_url: str
    platform: Optional[str] = "youtube_shorts"


class VideoResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    source_url: str
    status: str
    progress: Optional[float] = None
    duration: Optional[float] = None
    title: Optional[str] = None
    transcript: Optional[Any] = None
    segments: Optional[Any] = None
    language: Optional[str] = None
    platform: Optional[str] = "youtube_shorts"
    viral_score: Optional[float] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class VideoListResponse(BaseModel):
    items: list[VideoResponse]
    total: int

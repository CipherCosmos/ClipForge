import uuid
from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ClipResponse(BaseModel):
    id: uuid.UUID
    video_id: uuid.UUID
    start_time: float
    end_time: float
    caption: Optional[str] = None
    score: float
    file_url: Optional[str] = None
    thumbnail_url: str = ""
    title: str = ""
    hashtags: str = ""
    dubs: dict[str, str] = {}
    created_at: datetime

    model_config = {"from_attributes": True}


class ClipListResponse(BaseModel):
    items: list[ClipResponse]
    total: int

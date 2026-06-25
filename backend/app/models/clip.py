import uuid

from sqlalchemy import Column, DateTime, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class Clip(Base):
    __tablename__ = "clips"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    video_id = Column(
        UUID(as_uuid=True), ForeignKey("videos.id", ondelete="CASCADE"), nullable=False
    )
    start_time = Column(Float, nullable=False)
    end_time = Column(Float, nullable=False)
    caption = Column(String(1024), nullable=True)
    score = Column(Float, default=0.0, nullable=False)
    file_url = Column(String(1024), nullable=True)
    thumbnail_url = Column(String(1024), default="")
    title = Column(String(200), nullable=True)
    hashtags = Column(String(500), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    video = relationship("Video", back_populates="clips")

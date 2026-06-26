import enum
import uuid

from sqlalchemy import Column, DateTime, Enum, Float, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class VideoStatusEnum(str, enum.Enum):
    UPLOADED = "uploaded"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class Video(Base):
    __tablename__ = "videos"
    __table_args__ = (Index("ix_videos_user_id", "user_id"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    source_url = Column(String(1024), nullable=False)
    status = Column(Enum(VideoStatusEnum), default=VideoStatusEnum.UPLOADED, nullable=False)
    duration = Column(Float, nullable=True)
    title = Column(String(512), nullable=True)
    transcript = Column(JSONB, nullable=True)
    segments = Column(JSONB, nullable=True)
    language = Column(String(10), nullable=True)
    platform = Column(String(50), nullable=True, default="youtube_shorts")
    thumbnail_url = Column(String(1024), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    user = relationship("User", backref="videos")
    clips = relationship("Clip", back_populates="video", cascade="all, delete-orphan")
    jobs = relationship("Job", back_populates="video", cascade="all, delete-orphan")

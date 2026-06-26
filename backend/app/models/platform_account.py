import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.database import Base


class PlatformAccount(Base):
    __tablename__ = "platform_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    platform = Column(String(50), nullable=False)  # youtube_shorts, tiktok, instagram_reels, linkedin
    label = Column(String(128), nullable=False, default="")
    access_token = Column(Text, nullable=False)  # Fernet-encrypted
    platform_user_id = Column(String(255), nullable=True)
    client_id = Column(String(255), nullable=True)  # Google OAuth client ID (for YouTube refresh token exchange)
    client_secret = Column(String(255), nullable=True)  # Google OAuth client secret
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", backref="platform_accounts")

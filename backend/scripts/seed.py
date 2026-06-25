"""Seed test user for local development."""

import os
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import settings
from app.core.security import hash_password
from app.database import Base
from app.models.user import User


def seed():
    engine = create_engine(settings.DATABASE_URL_SYNC)
    Base.metadata.create_all(bind=engine)
    db_session = sessionmaker(bind=engine)
    db = db_session()

    existing = db.query(User).filter(User.email == "test@clipforge.dev").first()
    if existing:
        print("Test user already exists, skipping.")
        db.close()
        return

    user = User(
        id=uuid.uuid4(),
        email="test@clipforge.dev",
        password_hash=hash_password("password123"),
        plan="pro",
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    db.commit()
    print(f"Created test user: {user.email} / password123")
    db.close()


if __name__ == "__main__":
    seed()

import sys
from unittest.mock import MagicMock

# Prevent psycopg2 import error during collection of worker modules
# celery_app.py creates a PostgreSQL engine at module level
sys.modules["psycopg2"] = MagicMock()

# Prevent faster_whisper import error during collection of transcription worker
# transcription.py imports from app.services.transcription which imports faster_whisper
sys.modules["faster_whisper"] = MagicMock()

pytest_plugins = ("pytest_asyncio",)

from typing import Optional
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://clipforge:clipforge@localhost:5432/clipforge"
    DATABASE_URL_SYNC: str = "postgresql://clipforge:clipforge@localhost:5432/clipforge"
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "clipforge"
    MINIO_SECRET_KEY: str = "clipforge_secret"
    MINIO_BUCKET: str = "clipforge"
    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:1.5b"
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    WHISPER_MODEL_SIZE: str = "large-v3-turbo"
    SENSEVOICE_DEVICE: str = "cpu"
    
    # Groq Cloud API settings (Free tier endpoints)
    GROQ_API_KEY: Optional[str] = None
    GROQ_LLM_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_WHISPER_MODEL: str = "whisper-large-v3"

    # Supabase Storage settings
    SUPABASE_STORAGE_URL: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None

    # Upstash Redis REST API (for management, separate from REDIS_URL)
    UPSTASH_REDIS_REST_URL: Optional[str] = None
    UPSTASH_REDIS_REST_TOKEN: Optional[str] = None

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

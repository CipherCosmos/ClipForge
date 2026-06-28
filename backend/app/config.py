from typing import Optional

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql+asyncpg://clipforge:clipforge@localhost:5432/clipforge"
    DATABASE_URL_SYNC: str = "postgresql://clipforge:clipforge@localhost:5432/clipforge"
    REDIS_URL: str = "redis://localhost:6379/0"
    CELERY_BROKER_URL: str = "redis://localhost:6379/0"
    CELERY_RESULT_BACKEND: str = "redis://localhost:6379/0"
    MINIO_ENDPOINT: str = "localhost:9002"
    MINIO_ACCESS_KEY: str = "clipforge"
    MINIO_SECRET_KEY: str = "clipforge_dev"
    MINIO_BUCKET: str = "clipforge-media"
    OLLAMA_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "qwen2.5:1.5b"
    JWT_SECRET: str = "change-me-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_MINUTES: int = 60
    WHISPER_MODEL_SIZE: str = "large-v3-turbo"
    SENSEVOICE_DEVICE: str = "auto"

    # Groq Cloud API settings (Free tier endpoints)
    GROQ_API_KEY: Optional[str] = None
    GROQ_LLM_MODEL: str = "llama-3.3-70b-versatile"
    GROQ_WHISPER_MODEL: str = "whisper-large-v3"
    LLM_BATCH_SIZE: int = 25
    LLM_TIMEOUT_GROQ: int = 30
    LLM_TIMEOUT_OLLAMA: int = 120

    # Supabase Storage settings
    SUPABASE_STORAGE_URL: Optional[str] = None
    SUPABASE_SERVICE_ROLE_KEY: Optional[str] = None

    # Upstash Redis REST API (for management, separate from REDIS_URL)
    UPSTASH_REDIS_REST_URL: Optional[str] = None
    UPSTASH_REDIS_REST_TOKEN: Optional[str] = None

    RESEND_API_KEY: Optional[str] = None
    SENDGRID_API_KEY: Optional[str] = None
    EMAIL_PROVIDER: str = "resend"
    FROM_EMAIL: str = "noreply@clipforge.app"
    FRONTEND_URL: str = "http://localhost:3000"
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    YOUTUBE_CLIENT_ID: str = ""
    YOUTUBE_CLIENT_SECRET: str = ""

    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_PUBLISHABLE_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None
    STRIPE_PRO_PRICE_ID: str = "price_monthly_pro"
    STRIPE_PRO_MONTHLY_PRICE: int = 999
    STRIPE_PRO_YEARLY_PRICE: int = 9999

    SENTRY_DSN: Optional[str] = None
    ENVIRONMENT: str = "development"

    CORS_ORIGINS: str = "*"
    DB_POOL_SIZE: int = 10
    DB_POOL_OVERFLOW: int = 20

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

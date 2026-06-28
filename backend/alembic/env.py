import os
from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

import app.models.api_key  # noqa: F401
import app.models.clip  # noqa: F401
import app.models.job  # noqa: F401
import app.models.platform_account  # noqa: F401
import app.models.publish_log  # noqa: F401
import app.models.refresh_token  # noqa: F401
import app.models.schedule  # noqa: F401
import app.models.subscription  # noqa: F401
import app.models.user  # noqa: F401
import app.models.video  # noqa: F401
import app.models.webhook  # noqa: F401
from alembic import context
from app.database import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Allow env var to override the sqlalchemy.url from alembic.ini so CI
# (and any environment with different credentials) doesn't need to edit
# the ini file.
_env_url = os.getenv("DATABASE_URL_SYNC") or os.getenv("DATABASE_URL")
if _env_url:
    config.set_main_option("sqlalchemy.url", _env_url)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()

#!/usr/bin/env python
"""Run Alembic migrations to bring the database up to date."""
import subprocess
import sys
from pathlib import Path


def main() -> None:
    backend_dir = Path(__file__).resolve().parent.parent
    result = subprocess.run(
        ["alembic", "upgrade", "head"],
        cwd=backend_dir,
        capture_output=False,
    )
    sys.exit(result.returncode)


if __name__ == "__main__":
    main()

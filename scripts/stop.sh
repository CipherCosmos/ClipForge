#!/usr/bin/env bash
# ClipForge — Stop script
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PID_FILE="$ROOT/.start-pids"

echo "Stopping ClipForge..."

# Kill local processes
if [ -f "$PID_FILE" ]; then
  while IFS= read -r pid; do
    kill "$pid" 2>/dev/null || true
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

# Also kill by name as fallback
kill -9 $(pgrep -f "uvicorn app.main") 2>/dev/null || true
kill -9 $(pgrep -f "celery.*worker") 2>/dev/null || true
kill -9 $(lsof -ti :3000) 2>/dev/null || true

echo "Local processes stopped."

# Ask about Docker
read -p "Stop Docker containers too? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  cd "$ROOT" && docker compose down
  echo "Docker containers stopped."
fi

echo "Done."

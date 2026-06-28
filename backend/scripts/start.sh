#!/usr/bin/env bash
set -euo pipefail

PID_FILE="/tmp/clipforge_local.pid"

cleanup() {
  echo -e "\nShutting down..."
  if [ -f "$PID_FILE" ]; then
    while IFS= read -r pid; do
      kill "$pid" 2>/dev/null || true
    done < "$PID_FILE"
    sleep 3
    # Force kill any remaining
    while IFS= read -r pid; do
      kill -9 "$pid" 2>/dev/null || true
    done < "$PID_FILE" 2>/dev/null
    rm -f "$PID_FILE"
  fi
  echo -e "Local processes stopped."
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "Starting ClipForge local dev environment..."

# Start services (placeholder — real logic in docker compose)
echo "Services running. Press Ctrl+C to stop."

# Keep alive
while true; do sleep 1; done

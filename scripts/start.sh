#!/usr/bin/env bash

# ──────────────────────────────────────────────
# ClipForge — One-command startup script
# ──────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
LOG="$ROOT/start.log"
PID_FILE="$ROOT/.start-pids"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

cleanup() {
  echo -e "\n${YELLOW}Shutting down...${NC}"
  if [ -f "$PID_FILE" ]; then
    while IFS= read -r pid; do
      kill "$pid" 2>/dev/null || true
    done < "$PID_FILE"
    rm -f "$PID_FILE"
  fi
  # Don't stop Docker containers — they keep running for next start
  echo -e "${GREEN}Local processes stopped. Docker containers keep running.${NC}"
  echo -e "${YELLOW}To stop Docker: docker compose down${NC}"
  exit 0
}
trap cleanup SIGINT SIGTERM

step()  { echo -e "${CYAN}[$1/$TOTAL]${NC} $2"; }
ok()    { echo -e "  ${GREEN}✓${NC} $1"; }
warn()  { echo -e "  ${YELLOW}⚠${NC} $1"; }
fail()  { echo -e "  ${RED}✗${NC} $1"; exit 1; }
title() { echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; echo -e "${CYAN}  $1${NC}"; echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"; }

TOTAL=10

# ── Prerequisites ──────────────────────────────
title "Prerequisites"

step 1 "Checking Docker"
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
  ok "Docker is running"
else
  fail "Docker is not running. Start Docker Desktop first."
fi

step 2 "Checking Python 3"
PYTHON=""
for cmd in python3 python; do
  if command -v "$cmd" &>/dev/null && "$cmd" --version &>/dev/null 2>&1; then
    PYTHON="$cmd"
    break
  fi
done
[ -n "$PYTHON" ] || fail "Python 3 is required"
ok "Using $("$PYTHON" --version)"

step 3 "Checking Node.js"
command -v node &>/dev/null || fail "Node.js is required"
ok "Node $(node --version)"

# ── Docker Services ────────────────────────────
title "Docker Services"

step 4 "Starting infrastructure (PostgreSQL, Redis, MinIO, Ollama)"
cd "$ROOT"
# Bring up only infra services (not api/celery — those run natively for MPS)
docker compose up -d postgres redis minio ollama --remove-orphans >> "$LOG" 2>&1
ok "Infrastructure containers started"

echo "  Waiting for services to be healthy..."
for i in $(seq 1 30); do
  healthy=true
  docker compose exec -T postgres pg_isready -U clipforge &>/dev/null || healthy=false
  docker compose exec -T redis redis-cli ping &>/dev/null || healthy=false
  docker compose exec -T minio mc ready local &>/dev/null 2>&1 || healthy=false
  $healthy && break
  sleep 2
done
if docker compose exec -T postgres pg_isready -U clipforge &>/dev/null && \
   docker compose exec -T redis redis-cli ping &>/dev/null; then
  ok "All infrastructure services healthy"
else
  warn "Some services may not be ready yet — check 'docker compose logs'"
fi

# ── Ollama Model ──────────────────────────────
step 5 "Pulling Ollama model"
MODEL="${OLLAMA_MODEL:-llama3.2}"
if docker compose exec -T ollama ollama list 2>/dev/null | grep -q "$MODEL"; then
  ok "Ollama model '$MODEL' already pulled"
else
  echo "  Pulling '$MODEL' (first pull downloads ~2GB, may take a while)..."
  docker compose exec -T ollama ollama pull "$MODEL" 2>&1 | tail -1
  ok "Ollama model '$MODEL' ready"
fi

# ── MinIO Bucket ──────────────────────────────
step 6 "Creating MinIO bucket"
BUCKET="${MINIO_BUCKET:-clipforge-media}"
docker compose exec -T minio mc alias ls local &>/dev/null 2>&1 || \
  docker compose exec -T minio mc alias set local http://localhost:9000 clipforge clipforge_dev &>/dev/null 2>&1 || true
if docker compose exec -T minio mc ls "local/$BUCKET" &>/dev/null 2>&1; then
  ok "MinIO bucket '$BUCKET' exists"
else
  docker compose exec -T minio mc mb "local/$BUCKET" 2>&1 | head -1
  ok "MinIO bucket '$BUCKET' created"
fi

# ── Python Virtual Environment ────────────────
title "Backend Setup"

step 7 "Setting up Python virtual environment"
VENV="$BACKEND/.venv"
if [ -f "$VENV/bin/activate" ]; then
  ok "Virtual environment exists"
else
  "$PYTHON" -m venv "$VENV"
  ok "Virtual environment created"
fi

source "$VENV/bin/activate"

# Detect platform for torch
ARCH=$(uname -m)
OS=$(uname -s)
if [ "$OS" = "Darwin" ] && [ "$ARCH" = "arm64" ]; then
  export PYTORCH_URL="https://download.pytorch.org/whl/cpu"
  export PIP_EXTRA_INDEX_URL="$PYTORCH_URL"
fi

pip install --quiet --upgrade pip setuptools wheel 2>/dev/null || true

# Check if deps already installed
if python -c "import fastapi, sqlalchemy, celery, minio, torch" 2>/dev/null; then
  ok "Python dependencies already satisfied"
else
  pip install --quiet -r "$BACKEND/requirements.txt" 2>/dev/null || pip install -r "$BACKEND/requirements.txt" 2>&1 | tail -5
  ok "Python dependencies installed"
fi

# ── Database ──────────────────────────────────
step 8 "Initializing database"
python -c "
import sys; sys.path.insert(0, '$BACKEND')
from app.database import engine, Base
import asyncio
async def init():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        print('Tables created')
asyncio.run(init())
" 2>&1 | grep -vE "Class AVF|Traceback|asyncio\.run|proactor" | head -5
ok "Database tables created"

# Seed test user
cd "$BACKEND"
python scripts/seed.py 2>&1 | grep -v "Class AVF" | head -1
cd "$ROOT"
ok "Test user seeded"

# ── Pre-download ML models (first time) ──────
step 9 "Pre-loading AI models (first run only)"
python -c "
import sys; sys.path.insert(0, '$BACKEND')
from app.config import settings
print(f'  Whisper model: {settings.WHISPER_MODEL_SIZE}')
print(f'  Ollama model: {settings.OLLAMA_MODEL}')
# Trigger Whisper model download (non-blocking)
import threading
def preload():
    try:
        from app.services.transcription import get_model
        m = get_model()
        print(f'  Whisper model ready on device: {m.device}')
    except Exception as e:
        print(f'  Whisper preload skipped: {e}')
threading.Thread(target=preload, daemon=True).start()
" 2>&1 | grep -v "Class AVF"
ok "AI model preloading initiated (continues in background)"

# ── Frontend ─────────────────────────────────
title "Frontend Setup"

step 10 "Installing frontend dependencies"
cd "$FRONTEND"
npm install --silent 2>&1 | tail -1
ok "Frontend dependencies installed"
cd "$ROOT"

# ── Start Services ────────────────────────────
title "Starting Services"

echo ""
rm -f "$PID_FILE"

# Backend: API
echo -n "  Starting API server (port 8000)... "
cd "$BACKEND"
source "$VENV/bin/activate"
nohup "$VENV/bin/uvicorn" app.main:app --host 0.0.0.0 --port 8000 > "$ROOT/api.log" 2>&1 &
echo $! >> "$PID_FILE"
sleep 3
if curl -s http://localhost:8000/docs > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
  warn "API may not be ready — check api.log"
fi

# Backend: Celery worker
echo -n "  Starting Celery worker... "
cd "$BACKEND"
source "$VENV/bin/activate"
nohup "$VENV/bin/celery" -A app.workers.celery_app worker --loglevel=info --pool=threads --concurrency=4 > "$ROOT/celery.log" 2>&1 &
echo $! >> "$PID_FILE"
sleep 3
if pgrep -f "celery.*worker" > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${RED}✗${NC}"
  warn "Celery may not be ready — check celery.log"
fi
cd "$ROOT"

# Frontend: Next.js dev server
echo -n "  Starting Frontend (port 3000)... "
cd "$FRONTEND"
npx --yes next dev > "$ROOT/frontend.log" 2>&1 &
echo $! >> "$PID_FILE"
sleep 4
if curl -s http://localhost:3000 > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC}"
else
  echo -e "${YELLOW}⚠${NC}"
  warn "Frontend may not be ready yet — check frontend.log"
fi
cd "$ROOT"

# ── Health Check ─────────────────────────────
title "Health Check"
sleep 2

echo -n "  API (port 8000)........... "
if curl -s http://localhost:8000/docs > /dev/null 2>&1; then echo -e "${GREEN}✓${NC}"; else echo -e "${RED}✗${NC}"; fi

echo -n "  Frontend (port 3000)...... "
if curl -s http://localhost:3000 > /dev/null 2>&1; then echo -e "${GREEN}✓${NC}"; else echo -e "${RED}✗${NC}"; fi

echo -n "  Celery worker............ "
if pgrep -f "celery.*worker" > /dev/null 2>&1; then echo -e "${GREEN}✓${NC}"; else echo -e "${RED}✗${NC}"; fi

echo -n "  PostgreSQL............... "
if docker compose exec -T postgres pg_isready -U clipforge &>/dev/null; then echo -e "${GREEN}✓${NC}"; else echo -e "${RED}✗${NC}"; fi

echo -n "  Redis.................... "
if docker compose exec -T redis redis-cli ping &>/dev/null; then echo -e "${GREEN}✓${NC}"; else echo -e "${RED}✗${NC}"; fi

echo -n "  MinIO.................... "
if curl -s http://localhost:9000/minio/health/live > /dev/null 2>&1; then echo -e "${GREEN}✓${NC}"; else echo -e "${RED}✗${NC}"; fi

echo -n "  Ollama................... "
if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then echo -e "${GREEN}✓${NC}"; else echo -e "${RED}✗${NC}"; fi

# ── Done ──────────────────────────────────────
title "ClipForge is Running"
echo ""
echo -e "  ${GREEN}Frontend:${NC}    http://localhost:3000"
echo -e "  ${GREEN}API docs:${NC}    http://localhost:8000/docs"
echo -e "  ${GREEN}MinIO:${NC}       http://localhost:9001 (clipforge / clipforge_dev)"
echo -e "  ${GREEN}Ollama:${NC}      http://localhost:11434"
echo ""
echo -e "  ${YELLOW}Login:${NC}       test@clipforge.dev / password123"
echo ""
echo -e "  ${CYAN}Logs:${NC}"
echo -e "    API:       tail -f $ROOT/api.log"
echo -e "    Celery:    tail -f $ROOT/celery.log"
echo -e "    Frontend:  tail -f $ROOT/frontend.log"
echo ""
echo -e "  ${YELLOW}Press Ctrl+C to stop all services${NC}"
echo ""

# Wait forever
wait

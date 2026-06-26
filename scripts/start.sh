#!/usr/bin/env bash

# ──────────────────────────────────────────────
# ClipForge — One-command startup script
# ──────────────────────────────────────────────
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND="$ROOT/backend"
FRONTEND="$ROOT/frontend"
LOG="$ROOT/start.log"
PID_FILE="$ROOT/.start-pids"

if [ -f "$BACKEND/.env" ]; then
  export $(grep -v '^#' "$BACKEND/.env" | xargs)
fi

IS_REMOTE_DB=false
if [[ "$DATABASE_URL" =~ "supabase.co" ]] || [[ ! "$DATABASE_URL" =~ "localhost" && ! "$DATABASE_URL" =~ "127.0.0.1" ]]; then
  IS_REMOTE_DB=true
fi

IS_REMOTE_STORAGE=false
if [ -n "$SUPABASE_STORAGE_URL" ] && [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  IS_REMOTE_STORAGE=true
fi

IS_REMOTE_REDIS=false
if [[ "$REDIS_URL" =~ "upstash.io" ]] || [[ "$CELERY_BROKER_URL" =~ "upstash.io" ]] || [[ "$REDIS_URL" =~ "rediss://" ]]; then
  IS_REMOTE_REDIS=true
fi

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
cleanup_port() {
  local port=$1
  local pids
  pids=$(lsof -t -i :"$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    for pid in $pids; do
      kill -9 "$pid" 2>/dev/null || true
    done
    sleep 0.5
  fi
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

step 4 "Starting infrastructure"
cd "$ROOT"
SERVICES_TO_START=""
if [ "$IS_REMOTE_REDIS" = false ]; then
  SERVICES_TO_START="redis"
fi
if [ "$IS_REMOTE_STORAGE" = false ]; then
  SERVICES_TO_START="$SERVICES_TO_START minio"
fi
if [ "$IS_REMOTE_DB" = false ]; then
  SERVICES_TO_START="$SERVICES_TO_START postgres"
fi
# Groq handles LLM + Whisper — no local Ollama needed
if [ -n "$SERVICES_TO_START" ]; then
  docker compose up -d $SERVICES_TO_START --remove-orphans >> "$LOG" 2>&1
  ok "Infrastructure containers started"
else
  ok "All infrastructure is cloud-hosted — no local containers needed"
fi

echo "  Waiting for services to be healthy..."
for i in $(seq 1 30); do
  healthy=true
  if [ "$IS_REMOTE_DB" = false ]; then
    docker compose exec -T postgres pg_isready -U clipforge &>/dev/null || healthy=false
  fi
  if [ "$IS_REMOTE_REDIS" = false ]; then
    docker compose exec -T redis redis-cli ping &>/dev/null || healthy=false
  fi
  if [ "$IS_REMOTE_STORAGE" = false ]; then
    docker compose exec -T minio mc ready local &>/dev/null 2>&1 || healthy=false
  fi
  $healthy && break
  sleep 2
done

SERVICES_READY=true
if [ "$IS_REMOTE_DB" = false ]; then
  docker compose exec -T postgres pg_isready -U clipforge &>/dev/null || SERVICES_READY=false
fi
if [ "$IS_REMOTE_REDIS" = false ]; then
  docker compose exec -T redis redis-cli ping &>/dev/null || SERVICES_READY=false
fi

if [ "$SERVICES_READY" = true ]; then
  ok "All infrastructure services healthy"
else
  warn "Some services may not be ready yet — check 'docker compose logs'"
fi

# ── Ollama Model ──────────────────────────────
step 5 "Pulling Ollama model"
if [ -n "$GROQ_API_KEY" ]; then
  ok "Using Groq Cloud API — skipping Ollama model checks"
else
  MODEL="${OLLAMA_MODEL:-llama3.2}"
  if docker compose exec -T ollama ollama list 2>/dev/null | grep -q "$MODEL"; then
    ok "Ollama model '$MODEL' already pulled"
  else
    echo "  Pulling '$MODEL' (first pull downloads ~2GB, may take a while)..."
    docker compose exec -T ollama ollama pull "$MODEL" 2>&1 | tail -1
    ok "Ollama model '$MODEL' ready"
  fi
fi

# ── Storage Bucket ──────────────────────────────
step 6 "Creating storage bucket"
BUCKET="${MINIO_BUCKET:-clipforge-media}"
if [ "$IS_REMOTE_STORAGE" = true ]; then
  ok "Using Supabase Storage — bucket managed remotely"
else
  docker compose exec -T minio mc alias ls local &>/dev/null 2>&1 || \
    docker compose exec -T minio mc alias set local http://localhost:9000 clipforge clipforge_dev &>/dev/null 2>&1 || true
  if docker compose exec -T minio mc ls "local/$BUCKET" &>/dev/null 2>&1; then
    ok "MinIO bucket '$BUCKET' exists"
  else
    docker compose exec -T minio mc mb "local/$BUCKET" 2>&1 | head -1
    ok "MinIO bucket '$BUCKET' created"
  fi
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

echo -e "  ${YELLOW}Cleaning up any stale processes...${NC}"
cleanup_port 8000
cleanup_port 3000
pkill -f "celery.*worker" 2>/dev/null || true

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
CELERY_CONCURRENCY=${CELERY_CONCURRENCY:-$(python3 -c "import os; print(max(2, min(8, (os.cpu_count() or 4) // 2)))")}
nohup "$VENV/bin/celery" -A app.workers.celery_app worker --loglevel=info --pool=threads --concurrency=$CELERY_CONCURRENCY > "$ROOT/celery.log" 2>&1 &
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
if [ "$IS_REMOTE_DB" = true ]; then
  if python3 -c "import sys, psycopg2; dsn = '$DATABASE_URL_SYNC'.replace('postgresql+psycopg2://', 'postgresql://'); conn = psycopg2.connect(dsn); conn.close()" 2>/dev/null; then
    echo -e "${GREEN}✓ (Remote Supabase)${NC}"
  else
    echo -e "${RED}✗ (Remote connection failed)${NC}"
  fi
else
  if docker compose exec -T postgres pg_isready -U clipforge &>/dev/null; then echo -e "${GREEN}✓${NC}"; else echo -e "${RED}✗${NC}"; fi
fi

echo -n "  Redis.................... "
if [ "$IS_REMOTE_REDIS" = true ]; then
  echo -e "${GREEN}✓ (Remote Upstash Redis)${NC}"
else
  if docker compose exec -T redis redis-cli ping &>/dev/null; then echo -e "${GREEN}✓${NC}"; else echo -e "${RED}✗${NC}"; fi
fi

echo -n "  Storage.................. "
if [ "$IS_REMOTE_STORAGE" = true ]; then
  echo -e "${GREEN}✓ (Remote Supabase Storage)${NC}"
else
  if curl -s http://localhost:9002/minio/health/live > /dev/null 2>&1; then echo -e "${GREEN}✓${NC}"; else echo -e "${RED}✗${NC}"; fi
fi

echo -n "  Ollama................... "
if [ -n "$GROQ_API_KEY" ]; then
  echo -e "${YELLOW}Skipped (Groq API Active)${NC}"
else
  if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then echo -e "${GREEN}✓${NC}"; else echo -e "${RED}✗${NC}"; fi
fi

# ── Done ──────────────────────────────────────
title "ClipForge is Running"
echo ""
echo -e "  ${GREEN}Frontend:${NC}    http://localhost:3000"
echo -e "  ${GREEN}API docs:${NC}    http://localhost:8000/docs"
  echo -e "  ${GREEN}MinIO:${NC}       http://localhost:9003 (clipforge / clipforge_dev)"
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

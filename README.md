# ClipForge

AI-powered **viral short-form video generation** — upload or paste a URL, auto-transcribe in 99+ languages, score for viral potential, and auto-render the top clips.

## Quick Start

**Prerequisites:** Docker, Node.js 20+

```bash
make up          # Start all services
make seed        # Create test user
make pull-models # Pull LLM models (first time)
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| API | http://localhost:8000 |
| MinIO Console | http://localhost:9001 |
| Ollama | http://localhost:11434 |

## How It Works

1. **Upload or import** a video (file or YouTube/URL)
2. **Auto-transcribe** in any of 99+ languages via Whisper `large-v3`
3. **Viral scoring** analyzes every segment across 8 dimensions:
   - **Hook score** (0.25) — strong openers via Ollama LLM
   - **Emotion intensity** (0.20) — emotional impact via Ollama + SenseVoice
   - **Engagement potential** (0.15) — shareability via Ollama LLM
   - **Keyword density** (0.10) — trending keywords via Ollama LLM
   - **Scene change intensity** (0.10) — fast-cut energy via PySceneDetect
   - **Audio event score** (0.10) — laughter/applause/music via SenseVoice
   - **Audio energy** (0.05) — loudness peaks via FFmpeg
   - **Speaker confidence** (0.05) — single speaker clarity via diarize
4. **Auto-render** the top-scoring segments as ready-to-export shorts
5. **Download or publish** your viral clips — no manual editing needed

## Viral Score

Each segment receives a **unified viral score** (0.0–1.0):

```
score = 0.25 * hook_score + 0.20 * emotion_intensity + 0.15 * engagement_potential + 0.10 * keyword_density + 0.10 * scene_change_intensity + 0.10 * audio_event_score + 0.05 * audio_energy + 0.05 * speaker_confidence
```

The system automatically selects the highest-scoring segments for export.

## Architecture

All processing is **free and open-source** — no paid APIs required. Services are split across FastAPI (API gateway, auth, REST), Celery workers (transcription, viral scoring, scene detection, audio/emotion analysis, speaker diarization, clip rendering, exports), MinIO (object storage), PostgreSQL (metadata), Redis (queue broker), and Ollama (local LLM inference). The processing pipeline follows: upload → transcription (Whisper large-v3) → viral scoring (Ollama + HF emotion + SenseVoice) → scene detection (PySceneDetect) → speaker diarization (diarize) → clip rendering (FFmpeg) → export.

## Project Structure

```
├── backend/           # FastAPI + Celery workers
│   ├── app/           # Application code
│   ├── scripts/       # Utility scripts
│   └── tests/         # Pytest tests
├── frontend/          # Next.js + TailwindCSS
└── docker-compose.yml # All services
```

## Development Workflow

1. Add a model → create SQLAlchemy model in `backend/app/models/`
2. Add an endpoint → create router in `backend/app/api/`
3. Run tests: `make test-backend`
4. Lint: `make lint`
5. Add frontend pages in `frontend/`

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://clipforge:clipforge_dev@postgres:5432/clipforge` | PostgreSQL connection |
| `REDIS_URL` | `redis://redis:6379/0` | Redis connection |
| `MINIO_ENDPOINT` | `minio:9000` | MinIO server |
| `MINIO_ACCESS_KEY` | `clipforge` | MinIO access key |
| `MINIO_SECRET_KEY` | `clipforge_dev` | MinIO secret key |
| `OLLAMA_URL` | `http://ollama:11434` | Ollama server |
| `SECRET_KEY` | (random) | JWT signing key |

> **Status:** Phase 1 — Viral Shorts Auto-Generation. Upload/URL → Auto-transcribe (99+ languages, Whisper large-v3) → Viral scoring → Auto-render top clips. Manual export only.

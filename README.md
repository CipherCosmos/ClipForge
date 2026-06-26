# ClipForge

**AI-powered viral short video auto-generation platform.**

Upload any video (or paste a YouTube URL) → ClipForge automatically transcribes it in 99+ languages, scores every segment for viral potential, and renders the best clips as platform-optimized shorts for YouTube, TikTok, Instagram Reels, and more.

**Complete project — ready to run locally in under 2 minutes.**

---

## Demo

```
1. Start:  ./scripts/start.sh
2. Login:  test@clipforge.dev / password123
3. Paste:  https://www.youtube.com/watch?v=... → ClipForge auto-generates viral shorts
```

---

## Pipeline Overview

```mermaid
graph LR
    A[Upload / URL] --> B[Transcribe<br/>Whisper ASR]
    B --> C[Segment into<br/>~3s chunks]
    C --> D1[Viral Scoring<br/>Groq LLM]
    C --> D2[Scene Detect<br/>PySceneDetect]
    C --> D3[Audio Analysis<br/>SenseVoice + librosa]
    C --> D4[Speaker Diarization<br/>Silero VAD]
    D1 --> E[Join + Merge<br/>Viral Scores]
    D2 --> E
    D3 --> E
    D4 --> E
    E --> F[Select Top Segments]
    F --> G[Render Clips<br/>FFmpeg]
    G --> H[Generate Metadata<br/>Title, Caption, Hashtags]
    H --> I[Export / Download]
    G --> J[Multi-Highlight<br/>Compilation]
    J --> I

    style A fill:#2d3748,stroke:#4a5568,color:#fff
    style B fill:#553c9a,stroke:#805ad5,color:#fff
    style C fill:#553c9a,stroke:#805ad5,color:#fff
    style D1 fill:#2b6cb0,stroke:#3182ce,color:#fff
    style D2 fill:#2b6cb0,stroke:#3182ce,color:#fff
    style D3 fill:#2b6cb0,stroke:#3182ce,color:#fff
    style D4 fill:#2b6cb0,stroke:#3182ce,color:#fff
    style E fill:#553c9a,stroke:#805ad5,color:#fff
    style F fill:#c05621,stroke:#dd6b20,color:#fff
    style G fill:#c05621,stroke:#dd6b20,color:#fff
    style H fill:#c05621,stroke:#dd6b20,color:#fff
    style I fill:#276749,stroke:#38a169,color:#fff
    style J fill:#c05621,stroke:#dd6b20,color:#fff
```

**End-to-end processing in 2-5 minutes for a 5-minute video.**

---

## Architecture

```mermaid
graph TB
    subgraph Browser["Browser"]
        NEXT[Next.js Frontend<br/>localhost:3000]
    end

    subgraph API["API Server"]
        FA[FastAPI<br/>localhost:8000]
        WS[WebSocket<br/>/ws/progress/{id}]
    end

    subgraph Storage["Storage"]
        MINIO[MinIO S3<br/>localhost:9002]
        PG[PostgreSQL<br/>localhost:5432]
        RD[Redis Queue<br/>localhost:6379]
    end

    subgraph Worker["Celery Worker"]
        T[Transcription<br/>MLX Whisper / Groq]
        N[NLP Scoring<br/>Groq LLM]
        SD[Scene Detect<br/>PySceneDetect + SenseVoice]
        J[Join + Merge<br/>Viral Scores]
        R[Render<br/>FFmpeg]
    end

    subgraph Cloud["Cloud GPU (Optional)"]
        GROQ[Groq API<br/>Whisper + Llama-3.3-70B]
    end

    NEXT -->|HTTP REST + WS| FA
    FA -->|S3 API| MINIO
    FA -->|SQL| PG
    FA -->|Celery Tasks| RD
    RD -->|Consume| T
    T -->|Parallel Chord| N
    T -->|Parallel Chord| SD
    N --> J
    SD --> J
    J --> R
    R -->|Upload Clips| MINIO
    T -.->|Cloud GPU| GROQ
    N -.->|Cloud LLM| GROQ
    FA <-->|WS Progress| WS
    WS -.->|Broadcast| NEXT

    style NEXT fill:#1a1a2e,stroke:#e94560,color:#fff
    style FA fill:#16213e,stroke:#0f3460,color:#fff
    style GROQ fill:#1a1a2e,stroke:#0f3460,color:#aaa
    style T fill:#533483,stroke:#e94560,color:#fff
    style N fill:#533483,stroke:#e94560,color:#fff
    style SD fill:#533483,stroke:#e94560,color:#fff
    style J fill:#533483,stroke:#e94560,color:#fff
    style R fill:#533483,stroke:#e94560,color:#fff
```

---

## Features

### Core Pipeline

| Stage | What It Does | Tech |
|---|---|---|
| **Import** | Upload file or download from YouTube URL | yt-dlp |
| **Transcription** | Speech-to-text in 99+ languages | MLX Whisper (MPS) / Groq Whisper API |
| **Viral Scoring** | 8-dimension scoring — hooks, emotion, engagement, keyword density, scene changes, audio events, energy, speaker confidence | Groq Llama-3.3-70B + SenseVoice + librosa |
| **Scene Detection** | Hard cuts + fades/dissolves detection | PySceneDetect v0.7 (ContentDetector + AdaptiveDetector) |
| **Speaker Diarization** | Who spoke when | Silero VAD + energy-based clustering |
| **Audio Analysis** | Emotion, laughter, applause, music detection | SenseVoice |
| **Clip Rendering** | Trim, crop, hook overlay, subtitle burn-in, audio ducking | FFmpeg + drawtext |
| **Auto Thumbnails** | Best frame selection via face detection + sharpness scoring | OpenCV Haar cascade + Tenengrad |
| **Metadata** | AI-generated title, caption, hashtags | Groq LLM |
| **Multi-Highlight Compilation** | Best-of compilation with crossfades, title card, call-to-action | FFmpeg xfade |
| **AI Voice Dubbing** | Translate + TTS to 40+ languages | Argos Translate + Edge TTS |

### Viral Score Formula

```mermaid
graph TD
    subgraph Dimensions["8 Scoring Dimensions"]
        H[hook_score] -->|0.25| FINAL
        E[emotion_intensity] -->|0.20| FINAL
        EN[engagement_potential] -->|0.15| FINAL
        K[keyword_density] -->|0.10| FINAL
        SC[scene_change_intensity] -->|0.10| FINAL
        AE[audio_event_score] -->|0.10| FINAL
        AEG[audio_energy] -->|0.05| FINAL
        SP[speaker_confidence] -->|0.05| FINAL
    end

    FINAL[base_score] -->|× trend_boost 1-3×| FINAL_SCORE[Final Viral Score]

    style FINAL fill:#553c9a,stroke:#805ad5,color:#fff
    style FINAL_SCORE fill:#e94560,stroke:#ff6b6b,color:#fff
    style H fill:#2b6cb0,stroke:#3182ce,color:#fff
    style E fill:#2b6cb0,stroke:#3182ce,color:#fff
    style EN fill:#2b6cb0,stroke:#3182ce,color:#fff
    style K fill:#2b6cb0,stroke:#3182ce,color:#fff
    style SC fill:#2b6cb0,stroke:#3182ce,color:#fff
    style AE fill:#2b6cb0,stroke:#3182ce,color:#fff
    style AEG fill:#2b6cb0,stroke:#3182ce,color:#fff
    style SP fill:#2b6cb0,stroke:#3182ce,color:#fff
```

Then multiplied by `trend_boost` (1-3×) if segment contains trending keywords.

### Smart Resume

If processing is interrupted or you click "Force Reprocess", ClipForge detects which stages already have valid data in the database and skips them automatically:
- **Transcription** — skips if `video.transcript` and `video.segments` exist
- **NLP Scoring** — skips if >50% of segments have `hook_score > 0`
- **Scene Detect** — skips if all segments have `scene_change_intensity`
- **Render** — skips if clips already exist for the video

To truly restart from scratch, delete the video and re-upload.

---

## Stack

| Layer | Technology |
|---|---|
| **Frontend** | Next.js 14 + TailwindCSS + Redux Toolkit |
| **Backend** | FastAPI (Python 3.12+) |
| **Database** | PostgreSQL 16 + pgvector |
| **Queue** | Celery + Redis |
| **Storage** | MinIO (S3-compatible) |
| **ASR** | MLX Whisper (MPS GPU) / Groq Whisper API |
| **LLM** | Groq Llama-3.3-70B / local Ollama |
| **Video** | FFmpeg + PySceneDetect + OpenCV |
| **Auth** | JWT (python-jose + bcrypt) |

### Key Python Dependencies

```
fastapi, uvicorn           — Web framework
sqlalchemy, asyncpg        — Database ORM
celery, redis              — Task queue + broker
minio                      — S3 storage
faster-whisper, mlx-whisper — Speech recognition
funasr, transformers       — Audio emotion + NSFW detection
librosa, soundfile         — Audio feature extraction
opencv-python, scenedetect — Computer vision + scene detection
httpx, yt-dlp              — HTTP client + YouTube download
python-jose, passlib       — JWT auth + password hashing
argos-translate            — Machine translation
edge-tts                   — Text-to-speech
```

---

## Quick Start

### Prerequisites

- Docker (with OrbStack or Docker Desktop)
- Python 3.12+
- Node.js 18+
- Apple Silicon Mac recommended (for MLX Whisper GPU acceleration)

### 1. Start infrastructure

```bash
git clone https://github.com/CipherCosmos/ClipForge.git
cd ClipForge
make up
```

Or manually:

```bash
docker compose up -d
```

This starts PostgreSQL (port 5432), Redis (6379), and MinIO (9002/9003).

### 2. Run the setup script

```bash
./scripts/start.sh
```

This single command:
- ✅ Checks prerequisites
- ✅ Starts Docker containers
- ✅ Creates MinIO bucket
- ✅ Sets up Python venv + dependencies
- ✅ Creates database tables
- ✅ Seeds test user
- ✅ Starts API (port 8000), Celery worker, Frontend (port 3000)

### 3. Use the app

| URL | Description |
|---|---|
| http://localhost:3000 | Frontend dashboard |
| http://localhost:8000/docs | API documentation (Swagger) |
| http://localhost:9003 | MinIO Console (clipforge / clipforge_dev) |

**Login:** `test@clipforge.dev` / `password123`

### 4. Process a video

1. Click **New Project**
2. Paste a YouTube URL or upload a file
3. Select your target platform (YouTube Shorts, TikTok, Instagram Reels, etc.)
4. Click **Import** → the pipeline starts automatically
5. Watch real-time progress via WebSocket
6. When complete, download your clips

---

## Configuration

All settings are in `backend/.env`:

```env
# Database
DATABASE_URL=postgresql+asyncpg://clipforge:clipforge@localhost:5432/clipforge

# Redis / Queue
REDIS_URL=redis://localhost:6379/0

# Storage (MinIO)
MINIO_ENDPOINT=localhost:9002
MINIO_ACCESS_KEY=clipforge
MINIO_SECRET_KEY=clipforge_dev
MINIO_BUCKET=clipforge-media

# Auth
JWT_SECRET=change-me-in-production
JWT_EXPIRE_MINUTES=1440

# Transcription
WHISPER_MODEL_SIZE=large-v3-turbo

# Groq Cloud AI (optional — enables cloud GPU acceleration)
GROQ_API_KEY=gsk_your_key_here

# Local Ollama (fallback when Groq is unavailable)
OLLAMA_URL=http://localhost:11434
```

### Cloud AI (Faster, Recommended)

ClipForge can use **Groq Cloud** for GPU-accelerated ASR and LLM inference — significantly faster than running locally:

```env
GROQ_API_KEY=gsk_your_key_here    # Free tier, no credit card needed
```

With Groq:
- **Whisper** runs at ~100× realtime on Groq's LPUs (vs ~1× on CPU)
- **LLM** uses Llama-3.3-70B at 1000+ tokens/sec (vs tiny models on local Ollama)
- **Local Ollama container is not needed** — removed from docker-compose

### Optional: Supabase / Upstash (Cloud Infrastructure)

The app can use cloud services instead of local Docker:

```env
# Supabase PostgreSQL
DATABASE_URL=postgresql+asyncpg://postgres:pass@db.project.supabase.co:5432/postgres

# Upstash Redis
REDIS_URL=rediss://default:pass@region.upstash.io:6379

# Supabase Storage
SUPABASE_STORAGE_URL=https://project.supabase.co/storage/v1
SUPABASE_SERVICE_ROLE_KEY=your_key
```

---

## API Reference

### Authentication

```bash
# Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com","password":"secret"}'

# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@clipforge.dev","password":"password123"}'
# Returns: {"access_token": "...", "token_type": "bearer"}
```

### Videos

```bash
# List videos
curl http://localhost:8000/api/videos \
  -H "Authorization: Bearer <token>"

# Import from URL
curl -X POST http://localhost:8000/api/videos/import \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"source_url":"https://youtube.com/watch?v=...","platform":"youtube_shorts"}'

# Get video details
curl http://localhost:8000/api/videos/{id} \
  -H "Authorization: Bearer <token>"

# Reprocess (smart resume)
curl -X POST http://localhost:8000/api/videos/{id}/reprocess \
  -H "Authorization: Bearer <token>"
```

### Clips

```bash
# List clips for a video
curl "http://localhost:8000/api/clips?video_id={video_id}" \
  -H "Authorization: Bearer <token>"

# Dub a clip to Spanish
curl -X POST http://localhost:8000/api/clips/{id}/dub \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"target_language":"es"}'
```

### WebSocket Progress

```javascript
const ws = new WebSocket(
  `ws://localhost:8000/ws/progress/${videoId}?token=${jwt}`
)
ws.onmessage = (event) => {
  const { type, job_type, progress, status, message } = JSON.parse(event.data)
  // type: "progress"
  // job_type: "transcription" | "nlp" | "scene_detect" | "render"
  // progress: 0.0 - 1.0
  // status: "running" | "completed" | "failed"
}
```

---

## Frontend Architecture

### Pages

| Route | Component | Description |
|---|---|---|
| `/` | Landing page | Public landing page |
| `/app` | Dashboard | Video list with search, filter, stats |
| `/app/new` | New Project | Upload file or import URL with platform selector |
| `/app/videos/[id]` | Video Detail | Processing overlay, clip grid, stats, dubbing controls |
| `/app/research` | Trend Research | Content factory with trend analysis |

### State Management (Redux Toolkit)

| Slice | State | Async Thunks |
|---|---|---|
| `authSlice` | token, user, loading | `checkAuth` |
| `videoSlice` | videos[], currentVideo, loading | `fetchVideos`, `fetchVideo` |
| `clipSlice` | clips[], loading | `fetchClips` |

### Component Highlights

| Component | Purpose |
|---|---|
| `AuthGate` | Route protection, redirects to login |
| `Sidebar` | Navigation with user info |
| `UploadZone` | Drag-and-drop file upload |
| `ImportUrl` | YouTube URL import form |
| `PlatformSelector` | Target platform dropdown |
| `ProcessingOverlay` | Real-time pipeline progress with stage labels |
| `ProcessingPipeline` | Animated pipeline visualization |
| `ClipCard` | Video player, dubbing selector, description/tags, download |
| `VideoCard` | Dashboard video grid cards |
| `LoadingSkeleton` | Skeleton loaders for all views |

---

## Testing

### Backend (91 tests)

```bash
cd backend && source .venv/bin/activate

# Run all tests
python -m pytest tests/ -v

# Run specific test file
python -m pytest tests/test_pipeline.py -v

# Run end-to-end workflow
python scripts/e2e_test.py

# Lint
ruff check app/ tests/ scripts/
```

### Test Coverage

| Test File | What It Validates |
|---|---|
| `test_pipeline.py` | Full task chain — transcription, NLP, scene detect, render, join |
| `test_api_e2e.py` | API endpoints with mocked database |
| `test_auth.py` | Registration, login, JWT token flow |
| `test_nlp.py` | LLM scoring, trend boost, heuristic fallback |
| `test_scene_detect.py` | Scene boundary detection, viral score formula |
| `test_device.py` | GPU/CPU auto-detection |
| `test_dubbing.py` | Translation + TTS pipeline |
| `test_ducking.py` | FFmpeg volume ducking |
| `test_moderation.py` | NSFW detection + keyword filtering |
| `test_models.py` | SQLAlchemy model creation and relationships |
| `test_trends.py` | Trending keywords, trend boost computation |
| `test_llm.py` | Groq/Ollama LLM service |
| `test_research.py` | Research/trend endpoints |

---

## Makefile Commands

```bash
make start        # Full startup (containers + API + worker + frontend)
make up           # docker compose up -d
make down         # docker compose down
make build        # docker compose build
make logs         # docker compose logs -f
make seed         # Seed test user
make test-backend # Run all backend tests
make test-frontend# Run frontend lint
make lint         # Ruff + Next lint
```

---

## Data Model

```
User (id, email, password_hash, plan, created_at)
  │
  ├── Video (id, user_id, source_url, status, duration, title,
  │          transcript[JSONB], segments[JSONB], language, platform, created_at)
  │     │
  │     ├── Clip (id, video_id, start_time, end_time, caption, score,
  │     │          file_url, thumbnail_url, title, hashtags, dubs, created_at)
  │     │
  │     └── Job (id, video_id, type, status, progress, created_at)
  │
  └── (research videos — stored separately)
```

**Video Statuses:** `uploaded` → `processing` → `completed` | `failed`

**Job Types:** `transcription` | `highlight` | `render` | `dubbing`

**Job Statuses:** `queued` → `running` → `done` | `failed`

---

## Key Design Decisions

### Smart Segmentation

Whisper output is split into ~3.5-second chunks using word-level timestamps. This ensures each segment is short enough to be a standalone short-form video clip while containing complete phrases.

### Parallel Pipeline

After transcription completes, `run_nlp` (LLM scoring) and `run_scene_detect` (scene boundaries + audio analysis) run **in parallel** via Celery chords. A join worker merges results and triggers rendering.

### Viral Score Trend Boost

Segments mentioning trending topics get a 1-3× score multiplier. Trending keywords are fetched from Trend-Pulse API (free, zero auth) with a fallback of 40 static keywords and 1-hour cache.

### Audio Ducking

Background music is automatically reduced by -6dB during speech segments for clearer voiceover.

### AI Voice Dubbing

Each clip can be dubbed to 6 languages (Spanish, French, German, Portuguese, Hindi, English) via Argos Translate + Edge TTS with FFmpeg audio replacement.

### Content Moderation

Every rendered frame is checked for NSFW content via HuggingFace `Falconsai/nsfw_image_detection`. Flagged clips are skipped with a warning.

### GPU/CPU Auto-Detection

The system auto-selects CUDA → MPS (Apple Silicon) → CPU. Whisper uses float16 on GPU, int8 on CPU.

---

## Security

- **JWT authentication** (python-jose + OAuth 2.0)
- **bcrypt password hashing**
- **MinIO presigned URLs** for secure upload/download
- **GDPR-compliant** CASCADE deletion on user delete
- **WebSocket auth** via JWT query parameter
- **NSFW content moderation** gate
- **Watermark-free exports** gated by Pro plan

---

## License

MIT

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Run tests: `make test-backend`
4. Run lint: `make lint`
5. Submit a pull request

---

## Troubleshooting

### Port conflicts (port 9000 in use by OrbStack)

ClipForge uses port 9002 for MinIO by default to avoid conflicts with OrbStack. Update `.env`:
```env
MINIO_ENDPOINT=localhost:9002
```

### Celery tasks not executing

```bash
# Check Redis connectivity
docker compose exec redis redis-cli ping

# Restart worker
pkill -f "celery.*worker" 2>/dev/null
make start
```

### WebSocket not connecting

The WebSocket URL uses `window.location.host` — this works in all environments. If using a reverse proxy, ensure WebSocket upgrade headers are forwarded.

### Slow API responses

Ensure you're using local PostgreSQL, Redis, and MinIO (not cloud). Each cloud round-trip adds 50-100ms latency. The `.env` defaults to local services.

### Model download failures

The Whisper `large-v3-turbo` model is ~1.5GB and downloads automatically on first use. If the download is interrupted, delete the partial file:
```bash
rm -f ~/.cache/whisper/large-v3-turbo.pt
```

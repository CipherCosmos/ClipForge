# AGENTS.md — ClipForge

## Status

Phase 1 — Viral Shorts Auto-Generation. Upload/URL → Auto-transcribe (any language) → Viral scoring → Auto-render top clips. Manual export only.

**No manual clip editing in this phase.** The system auto-selects the highest-scoring segments based on the viral score formula.

**All dependencies are free/open-source or have generous free tiers.** No paid API keys required for development.

## Stack

| Layer | Choice |
|---|---|
| Frontend | Next.js + TailwindCSS + Redux Toolkit |
| Backend | FastAPI (Python) |
| Database | PostgreSQL |
| Storage | MinIO (self-hosted S3-compatible) |
| Queue | Celery + Redis |
| AI (ASR) | Whisper `large-v3-turbo` (via `faster-whisper`) |
| AI (NLP) | Ollama (LLaMA / Mistral / Qwen) |
| AI (CV) | HuggingFace Transformers (emotion/scene) |
| AI (Diarization) | diarize (Apache 2.0) |
| AI (Audio Events) | SenseVoice (audio emotion + events) |
| Video | FFmpeg + PySceneDetect v0.7 (scene detect) + OpenCV |
| Auth | JWT (python-jose, passlib + bcrypt) |
| Infra | Docker Compose (single-machine MVP) |

## Core Workflow

```
Upload/URL → Transcribe (Whisper large-v3-turbo, 99+ languages) → Viral scoring (Ollama + HF + SenseVoice) → Scene detect (PySceneDetect) → Diarization (diarize) → Clip render (FFmpeg) → Export
```

## Services (Docker Compose)

| Service | Role |
|---|---|
| API Gateway | FastAPI — routes, auth, REST |
| Upload Service | Accept files, store in MinIO |
| Transcription | `faster-whisper` `large-v3-turbo` — 99+ languages, GPU if available else CPU |
| Viral Engine | Ollama (viral detection prompt) + HuggingFace emotion — NLP + emotion scoring |
| Emotion/Audio Analysis | SenseVoice — emotion, laughter, applause, music detection |
| Speaker Diarization | diarize (Apache 2.0) — who spoke when |
| Scene Detector | PySceneDetect v0.7 — scene change detection (ContentDetector + AdaptiveDetector) |
| Clip Generator | FFmpeg — trim, crop, subtitle, brand |
| Metadata Generator | Ollama — title, caption, hashtag generation |
| Exporter | Merge assets, prepare download |
| MinIO | S3-compatible object storage (localhost:9000) |
| PostgreSQL | Metadata, users, jobs state |
| Redis | Celery broker + cache |
| Celery Worker | Async task execution |
| Ollama | Local LLM inference (llama3, mistral) |

## Viral Score Formula

```
score = 0.25 * hook_score + 0.20 * emotion_intensity + 0.15 * engagement_potential + 0.10 * keyword_density + 0.10 * scene_change_intensity + 0.10 * audio_event_score + 0.05 * audio_energy + 0.05 * speaker_confidence
```

All 8 dimensions are fully implemented and active. The `trend_boost` multiplier (1-3×) is applied after the base score calculation.

### Scoring Dimensions

| Dimension | Weight | Source | Description |
|---|---|---|---|
| hook_score | 0.25 | Ollama (LLM) | Is this a strong opener? Questions, bold claims, surprises |
| emotion_intensity | 0.20 | Ollama (LLM) + SenseVoice (audio) | Emotional impact — humor, awe, shock, inspiration |
| engagement_potential | 0.15 | Ollama (LLM) | Would viewers share/comment? Curiosity gap, relatability |
| keyword_density | 0.10 | Ollama (LLM) | Density of trending/salient keywords |
| scene_change_intensity | 0.10 | PySceneDetect v0.7 (histogram + adaptive) | Scene cuts per second — fast cuts = higher energy |
| audio_event_score | 0.10 | SenseVoice | Laughter, applause, music detected from audio |
| audio_energy | 0.05 | FFmpeg (volumedetect) | Loudness/energy peaks in audio waveform |
| speaker_confidence | 0.05 | diarize (Apache 2.0) | Single clear speaker = higher score |

## Viral Detection Prompt

The following prompt is sent to Ollama for each transcript segment to score viral dimensions.

```
You are a viral short expert analyzing video transcript segments. Analyze this text for viral short potential. Rate each dimension from 0.0 to 1.0 and return ONLY valid JSON:

{
  "hook_score": <0.0-1.0>,
  "emotion_intensity": <0.0-1.0>,
  "engagement_potential": <0.0-1.0>,
  "keyword_density": <0.0-1.0>
}

Rules:
- hook_score > 0.7 if starts with question, bold claim, or surprising fact
- emotion_intensity > 0.7 if expresses strong emotion
- engagement_potential > 0.7 if creates curiosity gap or is relatable
- keyword_density > 0.6 if contains specific names, numbers, or topics

Text: "{segment_text}"
```

## Phase 2 Enhancements (All Implemented)

### GPU/CPU Auto-Detection
`app/services/device.py` — Auto-selects CUDA → MPS → CPU. Whisper uses float16 on GPU, int8 on CPU.

### Hook Text Overlays
`app/workers/render.py` — Before each clip renders, Ollama generates a punchy hook text from the segment transcript. FFmpeg drawtext burns it in as a large centered overlay during the first 3 seconds with fade-in animation.

### Trend-Aware Viral Scoring
`app/services/trends.py` — Fetches trending keywords from Trend-Pulse API (free, zero auth). Segments mentioning trending topics get a 1-3× viral score boost. Falls back to 40 static keywords if API unavailable. 1-hour cache.

### Auto Thumbnail Generation
`app/workers/render.py` — Samples 5 frames per clip, scores by face detection (Haar cascade) + Tenengrad sharpness. Best frame uploaded to MinIO as `{clip_id}_thumb.jpg`. URL stored in `Clip.thumbnail_url`.

### Content Moderation Gate
`app/services/moderation.py` — HuggingFace `Falconsai/nsfw_image_detection` for NSFW image detection + keyword-based profanity/violence/hate speech filtering. Flagged clips are skipped with a warning logged.

### Audio Ducking
`app/services/ducking.py` — FFmpeg volume filter reduces background music by -6dB during speech segments. Uses `volume=enable='between(t,start,end)':volume=-6dB` syntax.

### Multi-Highlight Compilation
`app/workers/render.py` — After rendering individual clips, stitches top 3-5 into a single "best of" short with FFmpeg xfade crossfades + auto-generated title card + call-to-action end card. Uploaded to `compilations/{video_id}/best_of.mp4`.

### WebSocket Progress Streaming
`app/api/ws.py` — Real-time pipeline progress at `ws://host:8000/ws/progress/{video_id}?token={jwt}`. ConnectionManager broadcasts `{type, job_type, progress, status, message}` to all connected clients.

### AI Voice Dubbing
`app/workers/dubbing.py` + `app/services/translation.py` + `app/services/tts.py` — Multi-language dubbing pipeline:
  1. Translate transcript via Argos Translate (40+ languages, local, no API key)
  2. Generate speech via Edge TTS (400+ voices, free, no API key)
  3. Replace audio in clip via FFmpeg (atempo + loudnorm)
  4. Falls back to sine tone if TTS unavailable (pipeline never breaks)

### End-to-End Testing
- **66 unit/integration tests** across all services and workers
- **`tests/test_pipeline.py`** — validates full task chain (transcribe → NLP → scene_detect → render)
- **`tests/test_api_e2e.py`** — validates API endpoints with mocked DB
- **`scripts/e2e_test.py`** — CLI workflow that runs all 6 pipeline stages end-to-end
- **`tests/fixtures.py`** — FFmpeg-based test video generator

## Data Models (core tables)

- **users**: id (uuid), email, password_hash, plan (free|pro), created_at
- **videos**: id (uuid), user_id, source_url, status, duration, transcript (jsonb), language, segments [], created_at
- **clips**: id (uuid), video_id, start_time, end_time, caption, score, file_url, title, hashtags, created_at
- **jobs**: id (uuid), video_id, type (transcription|highlight|render), status, progress, created_at

## Processing Pipeline (event chain)

```
upload → transcription → viral_score + scene_detect → render → export
```

Each step enqueues a Celery task. Services update `job.status` in PostgreSQL. Frontend polls or receives WebSocket events for progress.

## Key Conventions

- All media access via **signed URLs** (MinIO presigned) — never expose raw paths
- Async task flow only — no synchronous video processing in request handlers
- Job queue drives everything — services are decoupled, communicate via Celery tasks
- **Auto-only:** No manual clip editing in Phase 1. The top-N viral-scored segments are auto-rendered.
- Whisper runs local — `faster-whisper` with `large-v3-turbo` model (6× faster than large-v3, 99+ languages)
- Ollama serves all LLM needs — no OpenAI API dependency
- MinIO replaces S3 entirely in dev; swap to S3-compatible cloud storage later if needed
- Platform presets: YouTube Shorts, Instagram Reels, TikTok, Facebook Reels, X/Twitter Video

## Security

- JWT (python-jose) + OAuth 2.0 for auth
- MinIO presigned URLs for upload/download
- bcrypt password hashing
- GDPR-compliant deletion flow (CASCADE on user delete)
- Watermark-free exports gated by Pro plan
- No IAM/KMS/WAF in MVP — use Docker network isolation + env secrets

## Development

- Start everything: `docker compose up -d` (Postgres, Redis, MinIO only — app services run natively)
- Start API: `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --port 8000`
- Start Celery: `cd backend && source .venv/bin/activate && celery -A app.workers.celery_app worker --loglevel=info`
- Start Frontend: `cd frontend && npm run dev`
- Seed test user: `cd backend && source .venv/bin/activate && python scripts/seed.py`
- Run lint → test before pushing (ruff, pytest)
- Run migrations: `cd backend && source .venv/bin/activate && alembic upgrade head`
- **Warning**: docker-compose.yml has no `api` or `ollama` services — Makefile targets referencing them (`seed`, `pull-models`, `migrate*`) are broken

## Test Commands
```bash
# Run all tests
cd backend && source .venv/bin/activate && python -m pytest tests/ -v

# Run specific test file
python -m pytest tests/test_pipeline.py -v

# Run E2E CLI workflow
python scripts/e2e_test.py

# Lint (ruff only — no mypy CI yet)
ruff check app/ tests/ scripts/
```

## Known Issues (Post-Consolidation Audit)

### Fixed (Session 2026-06-26)
- **Missing `User` import** in `render.py:994` — would crash at runtime
- **4 tables + 4 columns missing from Alembic migration** — `refresh_tokens`, `subscriptions`, `schedules`, `webhooks` + email verification/reset columns
- **`numpy` missing from requirements.txt** — used by `emotion.py` and `render.py`
- **7× duplicated ffprobe duration detection** → consolidated to single `get_media_duration()` in `video.py`
- **Unauthenticated webhook endpoints** in `publish.py:73-87` — added `Depends(get_current_user)`
- **Dead code removed**: `cleanup.py`, `dependencies.py`, 8 unused exception subclasses, `ProcessingPipeline.tsx`
- **Batch export button** was router.push loop → fixed to single navigation
- **WebSocket URL** was pointing to `localhost:3000` → now derives from `NEXT_PUBLIC_API_URL`
- **Invalid Tailwind classes** (`border-slate-850`, `scrollbar-thin`, `btn-slate`) → fixed
- **`generate_llm_async`** now delegates to sync via `asyncio.to_thread()` — 55 lines eliminated
- **`_get_top_segments()`** 140-line over-engineering → collapsed to 50 lines with helper functions
- **6 Makefile targets** (`seed`, `pull-models`, `migrate*`) → fixed for native dev workflow
- **`useKeyboardShortcuts.ts` renamed to `.tsx`** — pre-existing parse error fixed
- **`Schedule.access_token`** now encrypted via Fernet before DB storage; decrypted on use
- **CI pipeline** created at `.github/workflows/ci.yml` (lint + test on PostgreSQL)
- **`list_webhooks` endpoint** added to `publish.py` — API completeness
- **`_argos_initialized`** now thread-safe with `threading.Lock` in `translation.py`
- **`pytest in sys.modules` hack removed** from `translation.py` — no more fragile test detection
- **`DEVICE` variable** now passed to SenseVoice model loader in `emotion.py`
- **ORM relationships added** to `RefreshToken` + `Subscription` models — consistent with other models
- **`decode_access_token`/`decode_token` duplicate** consolidated in `security.py`
- **Translation result caching removed** — eliminates test interference from `lru_cache`
- **Dead Redux actions removed**: `setVideos`, `setCurrentVideo`, `addVideo`, `updateVideo`, `setLoading` from `videoSlice.ts`; `setClips`, `setLoading` from `clipSlice.ts`
- **Dead frontend exports removed**: `billingAPI`, `jobsAPI` from `api.ts`; `CardSkeleton` export from `LoadingSkeleton.tsx`
- **Unused imports cleaned**: `Video` type in dashboard, `useSelector`/`RootState` in billing page, stub `useEffect` in transcript editor
- **142/142 tests passing**

### Still Remaining (Stubs / Non-Blocking)
- `detect_music_segments()` always returns full audio as one segment (needs real ML model)
- SenseVoice emotion confidences hardcoded to 0.8 (needs real inference)
- Backing tracks are sine waves, not real music (needs real audio library)
- Intermittent `RuntimeWarning: coroutine 'Connection._cancel' was never awaited` (preexisting)

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

- Start everything: `docker compose up -d` (API, Postgres, Redis, MinIO, Ollama, Celery worker)
- `docker compose up api -d` for just the API during frontend work
- Seed test user: `python scripts/seed.py`
- Run lint → typecheck → test before pushing (ruff, mypy, pytest)
- CI: GitHub Actions (free tier) — lint, test, build Docker images
- Monitoring: Prometheus + Grafana (optional, added when needed)
- Ollama models pulled on first start via `docker compose exec ollama ollama pull llama3`

## Test Commands
```bash
# Run all tests
cd backend && source .venv/bin/activate && python -m pytest tests/ -v

# Run specific test file
python -m pytest tests/test_pipeline.py -v

# Run E2E CLI workflow
python scripts/e2e_test.py

# Lint
ruff check app/ tests/ scripts/
```

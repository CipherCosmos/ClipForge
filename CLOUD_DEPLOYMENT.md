# Cloud Deployment Guide — ClipForge

## Architecture Overview

```
                    ┌──────────────┐
                    │  Cloudflare  │
                    │  (CDN/DNS)   │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
        ┌─────▼─────┐ ┌───▼────┐ ┌────▼────┐
        │  Frontend │ │  API   │ │ Celery  │
        │  (Vercel) │ │ (Render│ │  Worker │
        │           │ │ /Fly)  │ │ (Fly)   │
        └───────────┘ └───┬────┘ └────┬────┘
                          │            │
              ┌───────────┼────────────┼──────────┐
              │           │            │          │
        ┌─────▼─────┐ ┌──▼───┐ ┌──────▼─────┐ ┌──▼────┐
        │ PostgreSQL│ │Redis │ │   MinIO    │ │Ollama │
        │ (Neon/RDS)│ │(Redis│ │ (Cloudflare│ │(RunPod│
        │           │ │Cloud)│ │   R2/S3)   │ │/modal)│
        └───────────┘ └──────┘ └────────────┘ └───────┘
```

## Option 1: Fly.io (Recommended — best GPU support)

### Prerequisites
- `flyctl` CLI installed
- Fly.io account with GPU support requested
- Stripe account (for billing)
- Resend/SendGrid account (for emails)
- Sentry account (optional, for error tracking)

### Step 1: Launch PostgreSQL on Neon (serverless, free tier available)
1. Sign up at https://neon.tech
2. Create a project → copy connection string
3. Add `?sslmode=require` to the asyncpg URL
4. Set `DATABASE_URL` and `DATABASE_URL_SYNC` in Fly secrets

### Step 2: Launch Redis on Redis Cloud (free 30MB tier)
1. Sign up at https://redis.com/redis-cloud
2. Create a free subscription → copy URL
3. Set `REDIS_URL`, `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` in Fly secrets

### Step 3: Launch MinIO on Cloudflare R2 (S3-compatible, free 10GB)
1. Sign up at https://cloudflare.com/r2
2. Create a bucket → generate API token
3. Set `MINIO_ENDPOINT`, `MINIO_ACCESS_KEY`, `MINIO_SECRET_KEY`, `MINIO_BUCKET` in Fly secrets
4. OR skip R2 and use `SUPABASE_STORAGE_URL` + `SUPABASE_SERVICE_ROLE_KEY` instead

### Step 4: Deploy API Server
```bash
# In backend/ directory
fly launch --name clipforge-api --region iad

# Set secrets (ALL of these)
fly secrets set \
  DATABASE_URL="postgresql+asyncpg://..." \
  DATABASE_URL_SYNC="postgresql+psycopg2://..." \
  REDIS_URL="redis://..." \
  CELERY_BROKER_URL="redis://..." \
  CELERY_RESULT_BACKEND="redis://..." \
  MINIO_ENDPOINT="..." \
  MINIO_ACCESS_KEY="..." \
  MINIO_SECRET_KEY="..." \
  MINIO_BUCKET="clipforge-media" \
  JWT_SECRET="$(openssl rand -hex 32)" \
  JWT_ALGORITHM="HS256" \
  JWT_EXPIRE_MINUTES="1440" \
  CORS_ORIGINS="https://clipforge.vercel.app" \
  GROQ_API_KEY="gsk_..." \
  SENTRY_DSN="https://..." \
  ENVIRONMENT="production" \
  RESEND_API_KEY="re_..." \
  FROM_EMAIL="noreply@clipforge.app" \
  FRONTEND_URL="https://clipforge.vercel.app" \
  STRIPE_SECRET_KEY="sk_live_..." \
  STRIPE_PUBLISHABLE_KEY="pk_live_..." \
  STRIPE_WEBHOOK_SECRET="whsec_..."

# Deploy
fly deploy
```

### Step 5: Deploy Celery Worker
Create `fly.toml` in `backend/worker/`:
```toml
app = "clipforge-worker"
primary_region = "iad"

[env]
  # Same env vars as API

[[services]]
  internal_port = 8080
  processes = ["app"]

[mounts]
  source = "worker-data"
  destination = /data
```

Deploy with:
```bash
fly deploy --image clipforge-api:latest --app clipforge-worker
fly scale count clipforge-worker=2

# Run the scheduler too
fly deploy --image clipforge-api:latest --app clipforge-scheduler
# Override command to: celery -A app.workers.celery_app beat --loglevel=info
```

### Step 6: Deploy Frontend to Vercel
```bash
# In frontend/ directory
vercel --prod

# Set env vars in Vercel dashboard:
# NEXT_PUBLIC_API_URL=https://clipforge-api.fly.dev/api
```

### Step 7: Run Migrations
```bash
fly ssh console -a clipforge-api
cd /app
alembic upgrade head
exit
```

### Step 8: Set up Stripe Webhook
```bash
stripe listen --forward-to https://clipforge-api.fly.dev/api/billing/webhook
# Copy the webhook secret to STRIPE_WEBHOOK_SECRET
```

## Option 2: Render.com (Simpler, but no GPU)

### Prerequisites
- Render account
- Neon Postgres + Redis Cloud (same as above)

### Services to create:
1. **Web Service**: `backend/` — FastAPI with `gunicorn -k uvicorn.workers.UvicornWorker app.main:app`
2. **Cron Job**: `backend/` — `celery -A app.workers.celery_app beat --loglevel=info` (every 60s)
3. **Background Worker**: `backend/` — `celery -A app.workers.celery_app worker --loglevel=info --concurrency=2`
4. **Static Site**: `frontend/` — Next.js, build command: `npm run build`, publish dir: `.next`

### Render Blueprint (`render.yaml`):
```yaml
services:
  - type: web
    name: clipforge-api
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: alembic upgrade head && gunicorn -k uvicorn.workers.UvicornWorker app.main:app --bind 0.0.0.0:$PORT
    envVars:
      - key: DATABASE_URL
        sync: false
      - key: REDIS_URL
        sync: false
      # ... all other env vars

  - type: worker
    name: clipforge-worker
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: celery -A app.workers.celery_app worker --loglevel=info --concurrency=2
    envVars:
      - key: DATABASE_URL_SYNC
        sync: false
      # ... same env vars

  - type: cron
    name: clipforge-scheduler
    env: python
    buildCommand: pip install -r requirements.txt
    startCommand: celery -A app.workers.celery_app beat --loglevel=info
    scheduling:
      minute: "*"
    envVars:
      - key: DATABASE_URL_SYNC
        sync: false
      # ... same env vars

  - type: web
    name: clipforge-frontend
    env: node
    buildCommand: npm ci && npm run build
    startCommand: npm start
    envVars:
      - key: NEXT_PUBLIC_API_URL
        value: https://clipforge-api.onrender.com/api
```

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | — | Async PostgreSQL URL (`postgresql+asyncpg://...`) |
| `DATABASE_URL_SYNC` | **Yes** | — | Sync PostgreSQL URL (`postgresql+psycopg2://...`) |
| `REDIS_URL` | **Yes** | — | Redis connection string |
| `CELERY_BROKER_URL` | **Yes** | — | Redis URL for Celery broker |
| `CELERY_RESULT_BACKEND` | **Yes** | — | Redis URL for Celery results |
| `MINIO_ENDPOINT` | **Yes** | — | S3-compatible storage endpoint |
| `MINIO_ACCESS_KEY` | **Yes** | — | Storage access key |
| `MINIO_SECRET_KEY` | **Yes** | — | Storage secret key |
| `MINIO_BUCKET` | **Yes** | `clipforge-media` | Storage bucket name |
| `JWT_SECRET` | **Yes** | — | 32+ char random string |
| `JWT_ALGORITHM` | No | `HS256` | JWT signing algorithm |
| `JWT_EXPIRE_MINUTES` | No | `1440` | Access token TTL |
| `CORS_ORIGINS` | **Yes** | `*` | Comma-separated allowed origins |
| `GROQ_API_KEY` | No | — | Groq Cloud API key (for Whisper + LLM) |
| `OLLAMA_URL` | No | `http://localhost:11434` | Local LLM URL |
| `OLLAMA_MODEL` | No | `qwen2.5:1.5b` | Ollama model name |
| `SENTRY_DSN` | No | — | Sentry error tracking DSN |
| `ENVIRONMENT` | No | `development` | `production` / `staging` / `development` |
| `RESEND_API_KEY` | No | — | Resend email API key |
| `SENDGRID_API_KEY` | No | — | SendGrid email API key (fallback) |
| `EMAIL_PROVIDER` | No | `resend` | `resend` or `sendgrid` |
| `FROM_EMAIL` | No | `noreply@clipforge.app` | Sender email address |
| `FRONTEND_URL` | No | `http://localhost:3000` | Frontend URL for email links |
| `STRIPE_SECRET_KEY` | No | — | Stripe secret key |
| `STRIPE_PUBLISHABLE_KEY` | No | — | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | No | — | Stripe webhook signing secret |
| `DB_POOL_SIZE` | No | `10` | Database connection pool size |
| `DB_POOL_OVERFLOW` | No | `20` | Max overflow connections |

## Monitoring
- **Sentry**: Error tracking at https://sentry.io (free 5k events/month)
- **Prometheus**: API metrics at `https://your-api.fly.dev/metrics`
- **Grafana**: Self-hosted or Grafana Cloud (free tier available)

## GPU Workers (for Whisper + MLX)
Fly.io supports GPU instances. To use:
```bash
fly machine update <machine-id> --vm-gpu-kind a100-pcie-40gb
```
This makes CUDA available for faster-whisper. The app auto-detects CUDA.

For Apple Silicon (MLX), deploy to a MacStadium or use local Mac Mini.

## Scaling Notes
- API: 2-4 instances behind Fly.io load balancer
- Workers: 2-4 instances (they auto-scale based on queue depth)
- PostgreSQL: Neon auto-scales to 0 on idle
- Redis: Redis Cloud free tier handles up to 30MB
- Storage: R2 free tier includes 10GB/month

## Security Checklist
- [ ] JWT_SECRET is a strong random string
- [ ] CORS_ORIGINS set to specific frontend domain (not `*`)
- [ ] Database credentials are unique and strong
- [ ] Stripe webhook secret is set
- [ ] Sentry is enabled
- [ ] Email API keys are set
- [ ] SSL is enforced (Fly.io/Render handle this)
- [ ] Rate limiting is active (5/min auth, 10/min upload)
- [ ] MINIO endpoint uses HTTPS in production

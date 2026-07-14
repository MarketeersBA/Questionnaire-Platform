# Environment Variables Reference

> **Audience:** Developers and operators configuring local, staging, or production environments.  
> **Purpose:** Canonical catalog of environment variables from `.env.example`, `backend/config.py`, Vite, and rollout flag modules.  
> **Related:** [local-development.md](local-development.md) · [../operations/security-and-secrets.md](../operations/security-and-secrets.md)

---

## Critical Variables (Required)

Application **fails to start** if these are missing (`backend/config.py`):

| Variable | Example | Description |
|----------|---------|-------------|
| `MONGO_URI` | `mongodb://localhost:27018/survey_platform` | MongoDB connection string |
| `SECRET_KEY` | 64-char random string | JWT signing key — **must match across API + pptx-worker** |
| `ADMIN_USERNAME` | `admin` | Initial admin username (seeded on startup) |
| `ADMIN_PASSWORD` | strong password | Initial admin password |

---

## Core Application

| Variable | Default | Description |
|----------|---------|-------------|
| `ENV` | `development` | `development` \| `staging` \| `production` |
| `DATABASE_NAME` | `survey_platform` | MongoDB database name |
| `ALGORITHM` | `HS256` | JWT algorithm |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | JWT lifetime (minutes) |
| `ALLOWED_ORIGINS` | `""` | Comma-separated CORS origins |
| `GOOGLE_CLIENT_ID` | `""` | Google OAuth client ID (optional) |
| `LOG_LEVEL` | `INFO` | Logging verbosity (`.env.example`) |

### Production AWS Secrets

When `ENV=production`, `Settings.load_secrets_override()` loads from AWS Secrets Manager:

- Secret name: `questioner/production/secrets` (region `eu-west-1`)
- Keys override matching `Settings` attributes
- Failure raises `RuntimeError` — production boot fails closed

---

## Redis

| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_URL` | `redis://localhost:6370` | Redis connection URL |
| `CACHE_TTL` | `3600` | AI insight cache TTL (seconds) |

Used for: rate limiting (SlowAPI), AI cache, PPTX job queue.

---

## OpenAI / Analytics

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | `""` | OpenAI API key — AI narratives disabled if empty |
| `OPENAI_MODEL` | `gpt-4o-mini` | Model for chart insights |
| `ANALYTICS_RESOURCES_DIR` | `backend/resources/analytics` | Prompts, themes, templates |
| `ANALYTICS_OUTPUT_DIR` | `out/reports` | Report file output directory |
| `ANALYTICS_DEVELOPER_MODE` | `false` | Dev shortcuts / verbose analytics |

---

## Voice Feedback

| Variable | Default | Description |
|----------|---------|-------------|
| `WHISPER_MODE` | `api` | `api` or `local` transcription |
| `WHISPER_MODEL_SIZE` | `base` | Local Whisper model size |
| `MAX_AUDIO_DURATION_S` | `120` | Max recording length |
| `MAX_AUDIO_FILE_MB` | `10` | Max upload size |
| `VOICE_RESOURCES_DIR` | `backend/resources/voice_feedback` | Voice NLP assets |

---

## Product Test Media

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_PACKAGING_IMAGE_MB` | `5` | Packaging heatmap image limit |
| `MAX_PRODUCT_TEST_IMAGE_MB` | `5` | Trial photo limit |
| `MAX_PRODUCT_TEST_VIDEO_MB` | `25` | Trial video limit |
| `MAX_PRODUCT_TEST_VIDEO_DURATION_S` | `60` | Max video duration |
| `PRODUCT_TEST_MEDIA_ABANDONED_TTL_HOURS` | `24` | Abandoned upload TTL |
| `PRODUCT_TEST_MEDIA_UNREFERENCED_GRACE_HOURS` | `1` | Grace before orphan cleanup |
| `PRODUCT_TEST_MEDIA_SCAN_ENABLED` | `false` | Malware scan hook |
| `PRODUCT_TEST_MEDIA_SCAN_STUB_CLEAN` | `true` | Stub scanner marks clean |
| `PRODUCT_TEST_MEDIA_BLOCK_PENDING_ANALYST` | `true` | Block analyst view until scanned |
| `PRODUCT_TEST_MEDIA_STARTUP_CLEANUP` | `false` | Run cleanup on API boot |

---

## PPTX Export

From `.env.example` and `backend/utils/pptx_rollout_flags.py`:

| Variable | Default | Description |
|----------|---------|-------------|
| `PPTX_RENDER_MODE` | `hybrid` | `hybrid` \| `native` |
| `PPTX_ROLLOUT_STAGE` | `comparison` | Rollout stage label |
| `PPTX_QUEUE_ENABLED` | `true` | Redis worker queue vs BackgroundTasks |
| `PPTX_STALE_RECOVERY_ENABLED` | `true` | Auto-fail stale jobs on poll |
| `PPTX_CAPTURE_PROGRESS_ENABLED` | `true` | Per-chart progress in status API |
| `PPTX_EXPORT_FRONTEND_BASE_URL` | `http://frontend:5173` | Playwright navigates here |
| `PPTX_CAPTURE_API_BASE_URL` | `http://backend:8080` | Preflight API probe (Docker internal) |
| `PPTX_CAPTURE_TOKEN_TTL_MINUTES` | `20` | Capture JWT lifetime |
| `PPTX_CAPTURE_AUTH_ROLE` | `admin` | Role claim on capture JWT |
| `PPTX_QUEUE_KEY` | `pptx:jobs` | Redis queue key |
| `PPTX_LEASE_SECONDS` | `1800` | Job lease duration |
| `PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE` | `false` | **Emergency only** — static JWT override |
| `PPTX_CAPTURE_STARTUP_RETRIES` | `12` | Preflight retry count |
| `PPTX_VALIDATION_MODE` | — | PPTX validation strictness |

---

## Module Rollout (Phase 9)

| Variable | Side | Default | Stages |
|----------|------|---------|--------|
| `MODULE_ROLLOUT_STAGE` | Backend | `full` | `seed_only` → `generic_renderer` → `pf_from_db` → `usage_pricing` → `analytics_aliases` → `full` |
| `VITE_MODULE_ROLLOUT_STAGE` | Frontend | `full` | Must align with backend for respondent UI |

API: `GET /modules/rollout` — returns active flags.

Detail: [../releases/module-rollout.md](../releases/module-rollout.md)

---

## Trial Media Rollout (Frontend)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_TRIAL_MEDIA_ROLLOUT_STAGE` | `schema_only` | Product test trial media feature stages |

---

## Frontend (Vite)

Variables must be prefixed with `VITE_` to reach the browser bundle.

| Variable | Example | Description |
|----------|---------|-------------|
| `VITE_API_URL` | `http://localhost:8081` | Axios base URL; default `/api` uses Vite proxy |
| `VITE_PUBLIC_SURVEY_BASE_URL` | `http://localhost:5173` | Base for generated respondent links |
| `VITE_MODULE_ROLLOUT_STAGE` | `full` | Frontend module rollout mirror |
| `VITE_TRIAL_MEDIA_ROLLOUT_STAGE` | `schema_only` | Trial media rollout |

Set in root `.env` (Docker) or `frontend/.env.local` (native dev).

---

## Docker Compose Overrides

`infra/docker/docker-compose.yml` overrides some `.env` values inside containers:

| Service | Override | Why |
|---------|----------|-----|
| `backend` | `MONGO_URI=mongodb://mongodb:27017/...` | Docker network hostname |
| `backend` | `REDIS_URL=redis://redis:6379/0` | Docker network hostname |
| `pptx-worker` | `PPTX_CAPTURE_API_BASE_URL=http://backend:8080` | Internal preflight probe |

Host-machine tools (native uvicorn) use `localhost` ports from `.env.example`.

---

## CI / GitHub Actions

Workflows inject test secrets inline:

| Variable | CI value |
|----------|----------|
| `MONGO_URI` | `mongodb://localhost:27017/test_db` |
| `REDIS_URL` | `redis://localhost:6379` |
| `SECRET_KEY` | `ci-test-secret` |
| `ADMIN_USERNAME` / `ADMIN_PASSWORD` | `admin` / `password` or `admin123` |

See [ci-cd.md](../operations/ci-cd.md).

---

## Quick Validation

```bash
# From repo root with venv active
python -c "from backend.config import settings; print(settings.DATABASE_NAME, settings.ENV)"
```

If this raises `ValueError` about missing variables, fix `.env` before starting the API.

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [local-development.md](local-development.md) | Setup using these variables |
| [security-and-secrets.md](../operations/security-and-secrets.md) | Secret rotation, production hardening |
| [rollback-runbooks.md](../operations/rollback-runbooks.md) | Feature flag rollback |

---

*Phase 4 — [docs/README.md](../README.md)*

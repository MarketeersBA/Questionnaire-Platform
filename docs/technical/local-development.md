# Local Development Setup

> **Audience:** Developers setting up Questioner on a workstation.  
> **Purpose:** Single canonical guide for local environment setup — replaces scattered instructions and fixes port/command drift.  
> **Related:** [environment-variables.md](environment-variables.md) · [../operations/troubleshooting.md](../operations/troubleshooting.md) · [../guides/admin-guide.md](../guides/admin-guide.md)

> **Supersedes:** [setup_instructions.md](../setup_instructions.md) (redirect only).

---

## Prerequisites

| Tool | Version | Notes |
|------|---------|-------|
| **Python** | 3.10+ (3.11 in CI) | Backend + scripts |
| **Node.js** | 18+ recommended | Frontend (16+ minimum) |
| **Docker** | Latest | Recommended for MongoDB, Redis, full stack |
| **Git** | Any | Clone repository |

Optional: `ffmpeg` (voice), Playwright browsers (PPTX worker — installed in Docker image).

---

## Port Reference (Canonical)

Use this table to avoid confusion across README, `.env`, and Docker:

| Service | Host URL (local) | Notes |
|---------|------------------|-------|
| **Frontend (Vite)** | `http://localhost:5173` | Dev server |
| **Backend API** | `http://localhost:8081` | Matches `.env.example` `VITE_API_URL` |
| **Swagger UI** | `http://localhost:8081/docs` | Same host as API |
| **MongoDB** | `localhost:27018` | Docker Compose maps `27018→27017` |
| **Redis** | `localhost:6370` | Docker Compose maps `6370→6379` |
| **Nginx (Docker)** | `https://localhost` (443) | Full stack with TLS |

> **Drift note:** Root `README.md` may reference port `8000` — use **8081** when following `.env.example`.

---

## Setup Path A — Docker Compose (Recommended)

Best for: full stack, PPTX worker, Redis queue, nginx proxy, team parity.

### 1. Clone and configure

```bash
git clone <repo-url> questioner
cd questioner
cp .env.example .env
```

Edit `.env` — minimum required (see [environment-variables.md](environment-variables.md)):

```env
SECRET_KEY=<64-char-random-string>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password>
MONGO_URI=mongodb://localhost:27018/survey_platform
REDIS_URL=redis://localhost:6370/0
OPENAI_API_KEY=<optional-for-ai-reports>
```

### 2. Start infrastructure + app

```bash
cd infra/docker
docker compose up -d --build
```

Services started:

| Container | Role |
|-----------|------|
| `questioner_mongodb` | MongoDB |
| `questioner_redis` | Redis |
| `questioner_backend` | FastAPI (`8081→8080`) |
| `questioner_frontend` | Vite dev server |
| `questioner_pptx_worker` | PPTX export worker |
| `questioner_nginx` | HTTPS reverse proxy |

### 3. Verify

```bash
curl http://localhost:8081/
# {"message":"Survey Platform API is running"}

curl http://localhost:5173/
# HTML from Vite
```

### 4. Log in

- Portal: `http://localhost:5173` (or `https://localhost` via nginx if certs mounted)
- Credentials: values from `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`)
- Default dev example in old docs was `admin` / `admin123` — **use your `.env` values**

### 5. Optional seeds

**Product Test question banks:**

```bash
# From repo root
.\scripts\seed-pt.ps1          # Windows
./scripts/seed-pt.sh           # Linux/macOS

python -m backend.scripts.seed_product_test_data --verify-only
```

**Question modules (Phase 9):**

```bash
python -m backend.scripts.seed_question_modules --dry-run
python -m backend.scripts.seed_question_modules
```

---

## Setup Path B — Native (Backend + Frontend)

Best for: fast Python/React iteration without Docker app containers. Still need MongoDB + Redis running (Docker or local).

### 1. Start MongoDB and Redis

**Option — Docker for data only:**

```bash
cd infra/docker
docker compose up -d mongodb redis
```

This exposes MongoDB on **27018** and Redis on **6370** (per `docker-compose.yml`).

### 2. Backend

From **repository root** (required for `backend.main:app` imports):

```bash
python -m venv venv

# Windows
.\venv\Scripts\activate
# Linux/macOS
source venv/bin/activate

pip install -r backend/requirements.txt
cp .env.example .env
# Edit .env — ensure MONGO_URI and REDIS_URL match running services
```

Start API:

```bash
# Windows PowerShell / Linux / macOS — from repo root
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8081
```

Verify: `http://localhost:8081/docs`

> **Do not** use `uvicorn main:app` from `backend/` unless `PYTHONPATH` includes repo root. Canonical command: `uvicorn backend.main:app` from root.

### 3. Frontend

```bash
cd frontend
npm install
```

Create `frontend/.env.local` (or use root `.env` with Vite vars):

```env
VITE_API_URL=http://localhost:8081
VITE_PUBLIC_SURVEY_BASE_URL=http://localhost:5173
```

Start dev server:

```bash
npm run dev
```

Verify: `http://localhost:5173`

Vite proxies `/api` → backend when using default `VITE_API_URL=/api` and proxy in `vite.config.ts` (Docker hostname `backend:8080`). For **native** dev, set `VITE_API_URL=http://localhost:8081` so Axios hits the API directly.

### 4. PPTX worker (optional)

For background PPTX exports outside Docker:

```bash
# Separate terminal, repo root, same venv
python -m backend.workers.pptx_worker
```

Requires `PPTX_QUEUE_ENABLED=true`, Redis, and matching `SECRET_KEY` / `PPTX_*` vars in `.env`.

---

## First Survey Walkthrough

1. Log in to `http://localhost:5173`
2. Create a **template** (`/templates`)
3. Create a **survey** (`/create-survey`)
4. Configure Layer 1 screening (e.g. age 18–35)
5. Generate **tokens** on survey detail page
6. Open respondent link: `http://localhost:5173/s/<TOKEN>`
7. Complete Layer 1 → Layer 2 (in-app gateway recommended)

Guide: [admin-guide.md](../guides/admin-guide.md) · Lifecycle: [survey-lifecycle.md](../guides/survey-lifecycle.md)

---

## Google Forms Integration (Legacy Layer 2)

Only needed if survey uses **Google Forms** path instead of in-app gateway.

1. Create a Google Form with a **Short Answer** question titled `Token`
2. Open Apps Script editor → paste [scripts/external/google-apps-script.js](../../scripts/external/google-apps-script.js)
3. Set `WEBHOOK_URL` to your backend:

   ```
   https://<your-host>/webhook/google-form
   ```

4. For local dev, expose backend via **ngrok** or similar:

   ```
   ngrok http 8081
   # WEBHOOK_URL=https://xxxx.ngrok-free.app/webhook/google-form
   ```

5. Run `setupTrigger()` once in Apps Script to authorize

Detail: [webhooks-and-integrations.md](../api/webhooks-and-integrations.md)

---

## Development Workflows

Full test matrix, linting, and handover gates: [testing-and-qa.md](testing-and-qa.md)

| Task | Command |
|------|---------|
| Backend smoke tests | `pytest backend/tests/test_module_rollout_flags.py -o addopts= -q` |
| Capture auth tests | `pytest backend/tests/capture_auth -o addopts= -q` |
| Frontend tests | `cd frontend && npm run test` |
| Lint (Python) | `ruff check backend/` |
| Seed Product Test | `python -m backend.scripts.seed_product_test_data` |
| Phase 9 QA | `python -m backend.scripts.run_phase9_qa` |

---

## Environment Files

| File | Purpose |
|------|---------|
| `.env` (repo root) | Backend + Docker Compose `env_file` |
| `.env.example` | Template — copy to `.env` |
| `frontend/.env.local` | Optional Vite overrides for native dev |

Full variable catalog: [environment-variables.md](environment-variables.md)

---

## Common Setup Mistakes

| Mistake | Fix |
|---------|-----|
| API on wrong port | Use **8081** per `.env.example`; set `VITE_API_URL` to match |
| Mongo connection refused | Docker: use port **27018**; in-compose backend uses `mongodb:27017` |
| Redis connection refused | Use port **6370** on host; `redis://localhost:6370/0` |
| `ModuleNotFoundError: backend` | Run uvicorn from **repo root**, not `backend/` |
| CORS errors | Add frontend origin to `ALLOWED_ORIGINS` in `.env` |
| Missing critical env | `SECRET_KEY`, `MONGO_URI`, `ADMIN_*` required at startup |

More: [troubleshooting.md](../operations/troubleshooting.md)

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [environment-variables.md](environment-variables.md) | Full env var reference |
| [system-overview.md](system-overview.md) | Architecture |
| [../operations/deployment.md](../operations/deployment.md) | Staging/production deploy |
| [../handover/teammate-handover-checklist.md](../handover/teammate-handover-checklist.md) | Onboarding |

---

*Phase 4 — [docs/README.md](../README.md)*

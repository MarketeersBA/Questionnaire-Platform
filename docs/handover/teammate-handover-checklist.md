# Teammate Handover Checklist

> **Purpose:** Practical onboarding sequence for anyone taking over the Questioner platform.  
> **How to use:** Pick your track(s), complete items in order, and check boxes as you go.  
> **Hub:** Return to the main index anytime: [docs/README.md](../README.md)

---

## Before You Start

Fill in these details with your team lead before Day 1:

| Item | Your value |
|------|------------|
| **Handover owner** | _name / contact_ |
| **Environment access** (GitHub, MongoDB, Redis, OpenAI, AWS) | _granted Y/N_ |
| **Staging URL** | _url_ |
| **Production URL** | _url_ |
| **Default admin credentials** (dev only) | See [local-development.md](../technical/local-development.md) — credentials from `.env` (`ADMIN_USERNAME` / `ADMIN_PASSWORD`). |

---

## Choose Your Track

You do not need every track. Select based on role:

| Track | Who | Sections |
|-------|-----|----------|
| **A — Product & operations** | PMs, client leads, new admins | A1 → A5 |
| **B — Engineering** | Frontend/backend developers | B1 → B8 |
| **C — DevOps & releases** | Deploy, infra, incident response | C1 → C6 |
| **D — Analytics & reporting** | Analysts, data engineers, AI/report owners | D1 → D7 |

**Recommended for full platform ownership:** Complete Track A, then B + C + D in parallel.

---

## Track A — Product & Operations (Non-Technical)

### A1 — Platform context (Day 1, ~30 min)

- [ ] Read [executive-overview.md](../handover/executive-overview.md) and [product-overview.md](../handover/product-overview.md)
- [ ] Skim [docs/README.md](../README.md) — documentation hub and audience paths
- [ ] Understand the two-layer model: **Layer 1** (screening) → **Layer 2** (evaluation)
- [ ] Know the four main actors: **admin**, **analyst**, **respondent**, **client** (when applicable)

**Validation:** Explain in your own words why tokens exist and what happens when a respondent fails Layer 1.

---

### A2 — Run the platform locally (Day 1, ~1–2 hours)

- [ ] Follow [technical/local-development.md](../technical/local-development.md)
- [ ] Start MongoDB (local or Atlas URI in `.env`)
- [ ] Start backend and frontend dev servers
- [ ] Log in to admin dashboard (`admin` / `admin123` in dev — see setup doc)
- [ ] Open Swagger UI when API is running (`/docs` on the API port)

**Validation:** You can reach the dashboard and see the survey/token UI without errors.

---

### A3 — Walk through one survey lifecycle (Day 1–2, ~1 hour)

- [ ] Create or inspect a **template** (survey blueprint)
- [ ] Create a **survey** from that template
- [ ] Generate at least one **token**
- [ ] Open the public link: `http://localhost:5173/s/<TOKEN>`
- [ ] Complete Layer 1 screening (pass and fail scenarios if possible)
- [ ] Observe token status changes (`unused` → `passed` / `failed` → `submitted`)

**Reference:** [survey-lifecycle.md](../guides/survey-lifecycle.md), [respondent-flow.md](../guides/respondent-flow.md)

**Validation:** Trace where respondent data lands (respondents, responses collections — see [data/collections-reference.md](../data/collections-reference.md)).

---

### A4 — Admin & analyst workflows (Day 2, ~1 hour)

- [ ] Explore token management and survey dashboard
- [ ] Understand how reports are generated (web view + optional PPTX)
- [ ] If your role includes exports: read [analyst-guide.md](../guides/analyst-guide.md)

**Guides:** [admin-guide.md](../guides/admin-guide.md), [analyst-guide.md](../guides/analyst-guide.md)

**Validation:** List three actions only an admin can do vs an analyst.

---

### A5 — Glossary & stakeholders (Day 2, ~30 min)

- [ ] Review [glossary.md](glossary.md)
- [ ] Until then, note these terms from context: **token**, **template**, **survey**, **blueprint**, **Layer 1/2**, **BA/PF**, **module**, **webhook**
- [ ] Identify who on your team owns: product decisions, deployments, analytics tuning, client communication

**Validation:** You can explain "blueprint vs survey" and "token batch" to a non-technical colleague.

---

## Track B — Engineering (Technical)

### B1 — Environment & repo layout (Day 1, ~1 hour)

- [ ] Clone repo and complete [local-development.md](../technical/local-development.md)
- [ ] Review repo structure in [docs/README.md](../README.md#repository-quick-reference)
- [ ] Copy `.env.example` → `.env` and configure MongoDB, Redis, OpenAI (if testing analytics)

**Validation:** `uvicorn` starts without import errors; frontend connects to API.

---

### B2 — System architecture (Day 1–2, ~2 hours)

- [ ] Read [technical/system-overview.md](../technical/system-overview.md) end-to-end
- [ ] Study the admin → respondent → analytics flow diagram in that doc
- [ ] Note both Layer 2 paths: **in-app gateway** (current) vs **Google Forms + webhook** (legacy)

**Canonical doc:** [technical/system-overview.md](../technical/system-overview.md) · Risk review: [architecture-review.md](../technical/architecture-review.md)

**Validation:** Draw (on paper or whiteboard) the path from `POST /tokens/generate` to a stored Layer 2 response.

---

### B3 — Backend entry points (Day 2, ~2 hours)

- [ ] Read `backend/main.py` — mounted routers, startup hooks (indexes, PPTX reconciliation, AI warmup)
- [ ] Skim `backend/config.py` — env-driven settings and rollout flags
- [ ] Browse `backend/routers/` — identify auth, public, surveys, tokens, analytics, exports, webhook
- [ ] Browse `backend/services/` — business logic layer

**Planned doc:** [technical/backend-architecture.md](../technical/backend-architecture.md) — see also `backend/main.py`, routers, services

**Validation:** Name the router that serves `/s/{token}` and what it returns.

---

### B4 — Frontend entry points (Day 2, ~1–2 hours)

- [ ] Read `frontend/src/App.tsx` — routes and role guards (`PrivateRoute`, `AnalystRoute`, `AdminRoute`)
- [ ] Read `frontend/src/services/api.ts` — API base URL and auth headers
- [ ] Skim key pages: Dashboard, CreateSurvey, PublicSurvey, SurveyReport, Analytics

**Canonical doc:** [technical/frontend-architecture.md](../technical/frontend-architecture.md)

**Validation:** List which routes require admin vs analyst vs any authenticated user.

---

### B5 — Data model (Day 3, ~1–2 hours)

- [ ] Read [data/database-overview.md](../data/database-overview.md) — core collections and relationships
- [ ] Read [data/collections-reference.md](../data/collections-reference.md) — fields and indexes
- [ ] Understand template **snapshot** on survey creation (immutability)
- [ ] Review Product Test data layer if relevant: [data/product-test-data-layer.md](../data/product-test-data-layer.md)
- [ ] Seeds and verification: [data/seeds-and-fixtures.md](../data/seeds-and-fixtures.md)

**Canonical docs:** [data/database-overview.md](../data/database-overview.md), [data/collections-reference.md](../data/collections-reference.md)

**Validation:** Explain why changing a template does not alter an active survey's questions.

---

### B6 — Auth & roles (Day 3, ~1 hour)

- [ ] Trace JWT login flow in `backend/routers/auth.py` (or equivalent)
- [ ] Confirm roles: `admin`, `analyst`, `client`
- [ ] Test a protected endpoint without token (expect 401)

**Canonical doc:** [technical/auth-and-roles.md](../technical/auth-and-roles.md)

**Validation:** Describe how the frontend stores and sends the JWT.

---

### B7 — Integrations (Day 3–4, as needed)

- [ ] Google Forms path: `scripts/external/google-apps-script.js` + [webhooks-and-integrations.md](../api/webhooks-and-integrations.md)
- [ ] Webhook receiver: `backend/routers/webhook.py`
- [ ] Exports API: [api/exports-api.md](../api/exports-api.md)

**Canonical doc:** [api/webhooks-and-integrations.md](../api/webhooks-and-integrations.md), [api/api-overview.md](../api/api-overview.md)

**Validation:** Describe when webhook vs in-app gateway is used for Layer 2.

---

### B8 — Testing (Day 4, ~2 hours)

- [ ] Locate `backend/tests/` — pytest suites (analytics, product test, voice, PPTX)
- [ ] Run backend tests per team convention (e.g. `pytest` from repo root or `backend/`)
- [ ] Run frontend tests if applicable (`npm test` in `frontend/`)

**Canonical doc:** [technical/testing-and-qa.md](../technical/testing-and-qa.md)

**Validation:** You can run at least one backend test file successfully locally.

## Track C — DevOps & Releases

### C1 — Deployment overview (Day 1, ~1 hour)

- [ ] Read [operations/deployment.md](../operations/deployment.md) — GitHub secrets, Docker
- [ ] Inspect `infra/docker/` — Compose files for dev/prod/test
- [ ] Inspect `backend/Dockerfile` — multi-stage build
- [ ] Note: [docs/deployment.md](../deployment.md) redirects to [operations/deployment.md](../operations/deployment.md)

**Canonical docs:** [operations/deployment.md](../operations/deployment.md), [operations/ci-cd.md](../operations/ci-cd.md)

**Validation:** List required GitHub secrets for CI/CD.

---

### C2 — CI/CD pipelines (Day 2, ~1 hour)

- [ ] Review `.github/workflows/ci.yml` — lint, test, services (MongoDB, Redis)
- [ ] Review deploy workflows (staging/production if present)
- [ ] Understand Docker image publish flow (DockerHub secrets)

**Validation:** Describe what runs on every PR vs on merge to main.

---

### C3 — Environment variables (Day 2, ~1 hour)

- [ ] Walk through `.env.example` at repo root
- [ ] Cross-reference `backend/config.py` for production-critical vars
- [ ] Note rollout flags: `MODULE_ROLLOUT_STAGE`, `VITE_MODULE_ROLLOUT_STAGE` (see module rollout doc)

**Canonical doc:** [technical/environment-variables.md](../technical/environment-variables.md)

**Validation:** Identify vars required for analytics (OpenAI) and PPTX workers (Redis, Playwright).

---

### C4 — Feature rollouts (Day 3, ~1 hour)

- [ ] Read [releases/module-rollout.md](../releases/module-rollout.md) — staged module enablement + QA matrix
- [ ] Read [releases/pptx-export-rollout.md](../releases/pptx-export-rollout.md) — env matrix, auth, rollback
- [ ] Daily PPTX reference: [analytics/pptx-export.md](../analytics/pptx-export.md)

**Canonical docs:** [releases/module-rollout.md](../releases/module-rollout.md), [releases/pptx-export-rollout.md](../releases/pptx-export-rollout.md)

**Validation:** Know how to disable a rollout stage safely without a full redeploy (env flags).

---

### C5 — Monitoring & troubleshooting (Day 3–4, ongoing)

- [ ] Identify health/readiness endpoints in `backend/main.py`
- [ ] Know where logs go in Docker vs local
- [ ] Document common issues your team has seen (append to planned troubleshooting doc)

**Canonical docs:** [operations/monitoring-and-health.md](../operations/monitoring-and-health.md), [operations/troubleshooting.md](../operations/troubleshooting.md)

**Validation:** You can confirm MongoDB and Redis connectivity when the API fails to start.

---

### C6 — Security handover (Day 4, ~1 hour)

- [ ] Confirm production does **not** use default `admin`/`admin123`
- [ ] Review JWT secret configuration
- [ ] Review webhook URL exposure (ngrok for local only)
- [ ] List secrets stored in GitHub vs AWS vs `.env`

**Canonical doc:** [operations/security-and-secrets.md](../operations/security-and-secrets.md)

**Validation:** You know who rotates OpenAI and MongoDB credentials.

---

## Track D — Analytics & Reporting

### D1 — Analytics overview (Day 1, ~1 hour)

- [ ] Read [analytics/analytics-overview.md](../analytics/analytics-overview.md)
- [ ] Skim pipeline in [analytics/ai-reporting-pipeline.md](../analytics/ai-reporting-pipeline.md)

**Canonical doc:** [analytics/analytics-overview.md](../analytics/analytics-overview.md)

**Validation:** Name the stages: Ingestor → Aggregator → ChartInsight → ReportOrchestrator.

---

### D2 — AI reporting pipeline (Day 2, ~2–3 hours)

- [ ] Read [AI_ARCHITECTURE.md](../../backend/analytics_module/AI_ARCHITECTURE.md) for deep AI component detail
- [ ] Locate key modules under `backend/analytics_module/`
- [ ] Understand `survey_reports` collection and report generation API

**Canonical doc:** [analytics/ai-reporting-pipeline.md](../analytics/ai-reporting-pipeline.md)

**Validation:** Explain what triggers a new report vs serving a cached one.

---

### D3 — PPTX export (Day 2–3, ~2 hours)

- [ ] Read [analytics/pptx-export.md](../analytics/pptx-export.md) — daily operations reference
- [ ] Read [releases/pptx-export-rollout.md](../releases/pptx-export-rollout.md) — rollout verification
- [ ] Inspect `backend/workers/pptx_worker.py` and queue setup
- [ ] Understand hybrid capture (Playwright + python-pptx)

**Canonical docs:** [analytics/pptx-export.md](../analytics/pptx-export.md), [releases/pptx-export-rollout.md](../releases/pptx-export-rollout.md)

**Validation:** Describe the async job flow from "export requested" to downloadable file.

---

### D4 — Brand Analyzer (Day 3, as needed)

- [ ] Business context: [brand-analyzer-business-guide.md](../analytics/brand-analyzer-business-guide.md) → [BUSINESS_GUIDE.md](../../backend/analytics_module/src/BrandAnalyzer/BUSINESS_GUIDE.md)
- [ ] Technical detail: [brand-analyzer-technical-guide.md](../analytics/brand-analyzer-technical-guide.md) → [DOCUMENTATION.md](../../backend/analytics_module/src/BrandAnalyzer/DOCUMENTATION.md)
- [ ] Parity checklist: [BRAND_AWARENESS_PARITY_CHECKLIST.md](../../backend/analytics_module/BRAND_AWARENESS_PARITY_CHECKLIST.md)

**Validation:** Know which doc to give a client vs a developer.

---

### D5 — Exports API (Day 3, ~1 hour)

- [ ] Read [api/exports-api.md](../api/exports-api.md) — BA/PF and product-scalers endpoints
- [ ] Test structure endpoints with JWT (`/exports/test/ba-pf`, `/exports/test/product-scalers`) if API is running
- [ ] Confirm host/port: canonical dev API is **8081** (not legacy `:3001`)

**Canonical doc:** [api/exports-api.md](../api/exports-api.md)

**Validation:** Successfully download a test Excel export.

---

### D6 — Product Test data (if applicable)

- [ ] Read [data/product-test-data-layer.md](../data/product-test-data-layer.md)
- [ ] Read [data/seeds-and-fixtures.md](../data/seeds-and-fixtures.md) for seed commands
- [ ] Run seed script: `scripts/seed-pt.ps1` (Windows) or `seed-pt.sh` (Unix)
- [ ] Verify: `python -m backend.scripts.seed_product_test_data --verify-only`

**Validation:** Product Test survey creation does not fail on missing question bank.

---

### D7 — Voice feedback (if applicable)

- [ ] Explore `backend/voice_feedback/` and frontend voice dashboard components
- [ ] Understand GridFS storage for audio uploads

**Validation:** Know whether your deployment has voice feedback enabled.

---

## Handover Sign-Off

Complete when you can confidently answer **yes** to all that apply to your role:

| # | Sign-off question | Y/N |
|---|-------------------|-----|
| 1 | I can run the platform locally | |
| 2 | I understand the survey/token/respondent lifecycle | |
| 3 | I know where architecture and API docs live | |
| 4 | I know how to deploy or who owns deployment | |
| 5 | I understand the analytics/report generation path | |
| 6 | I know which docs are canonical vs legacy/interim | |
| 7 | I have access to all required secrets and environments | |
| 8 | I know who to ask for product, infra, and analytics decisions | |

**Handed over by:** _________________ **Date:** _________  
**Received by:** _________________ **Date:** _________  
**Notes / open items:**

```
-
-
-
```

---

## Quick Links

| Resource | Link |
|----------|------|
| Documentation hub | [docs/README.md](../README.md) |
| Executive overview | [executive-overview.md](executive-overview.md) |
| Product overview | [product-overview.md](product-overview.md) |
| Survey lifecycle | [survey-lifecycle.md](../guides/survey-lifecycle.md) |
| Admin guide | [admin-guide.md](../guides/admin-guide.md) |
| Analyst guide | [analyst-guide.md](../guides/analyst-guide.md) |
| Project README | [README.md](../../README.md) |
| Local setup | [technical/local-development.md](../technical/local-development.md) |
| Architecture | [technical/system-overview.md](../technical/system-overview.md) |
| Architecture review | [technical/architecture-review.md](../technical/architecture-review.md) |
| Testing & QA | [technical/testing-and-qa.md](../technical/testing-and-qa.md) |
| Backend | [technical/backend-architecture.md](../technical/backend-architecture.md) |
| Frontend | [technical/frontend-architecture.md](../technical/frontend-architecture.md) |
| Auth & roles | [technical/auth-and-roles.md](../technical/auth-and-roles.md) |
| Database overview | [data/database-overview.md](../data/database-overview.md) |
| Collections reference | [data/collections-reference.md](../data/collections-reference.md) |
| API overview | [api/api-overview.md](../api/api-overview.md) |
| Exports API | [api/exports-api.md](../api/exports-api.md) |
| Analytics overview | [analytics/analytics-overview.md](../analytics/analytics-overview.md) |
| AI pipeline | [analytics/ai-reporting-pipeline.md](../analytics/ai-reporting-pipeline.md) |
| PPTX export | [analytics/pptx-export.md](../analytics/pptx-export.md) |
| Deployment | [operations/deployment.md](../operations/deployment.md) |
| CI/CD | [operations/ci-cd.md](../operations/ci-cd.md) |
| Troubleshooting | [operations/troubleshooting.md](../operations/troubleshooting.md) |
| Testing & QA | [testing-and-qa.md](../technical/testing-and-qa.md) |
| Module rollout | [releases/module-rollout.md](../releases/module-rollout.md) |
| PPTX rollout | [releases/pptx-export-rollout.md](../releases/pptx-export-rollout.md) |

---

*Part of Phase 7 documentation handover — see [docs/README.md](../README.md) for the full document map.*

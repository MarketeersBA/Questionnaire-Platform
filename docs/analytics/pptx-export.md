# PPTX Export

> **Audience:** Analysts and operators using PowerPoint export; developers debugging capture/worker issues.  
> **Purpose:** Stable daily-reference for PPTX generation — architecture, workflow, configuration, troubleshooting.  
> **Related:** [ai-reporting-pipeline.md](ai-reporting-pipeline.md) · [../releases/pptx-export-rollout.md](../releases/pptx-export-rollout.md) · [../operations/troubleshooting.md](../operations/troubleshooting.md)

> **Rollout / env matrix:** [releases/pptx-export-rollout.md](../releases/pptx-export-rollout.md) (detailed phased deployment).

---

## What PPTX Export Does

Generates a **PowerPoint presentation** from an existing web report:

- Native slides built with `python-pptx`
- Native chart builders are the default path (no browser dependency in normal runs)
- Optional Playwright capture remains available only in explicit `hybrid` mode from `ReportExportFrame` route
- Runs as **background job** via Redis queue + `pptx-worker` container

---

## Architecture

```mermaid
flowchart LR
    ui[SurveyReport UI] -->|POST generate-pptx| api[analytics router]
    api -->|enqueue| redis[(Redis queue)]
    redis --> worker[pptx_worker.py]
    worker -->|mint JWT| capture[Playwright capture]
    capture --> frame[ReportExportFrame /s/.../export-frame]
    worker --> native[python-pptx builders]
    native --> file[PPTX file]
    file --> ui|poll status + download|
```

| Component | Path |
|-----------|------|
| API enqueue | `backend/routers/analytics.py` |
| Job state | `backend/utils/pptx_job_state.py` |
| Queue | `backend/workers/pptx_queue.py` |
| Worker | `backend/workers/pptx_worker.py` |
| Hybrid capture | `backend/analytics_module/pptx_builder/hybrid_export/` |
| Export frame UI | `frontend/src/pages/ReportExportFrame.tsx` |

---

## User Workflow (Analyst)

1. Generate **web report** first (report must exist in `survey_reports`)
2. Open Survey Report page
3. Click **Export PPTX** (or Export modal)
4. UI polls `GET /analytics/report/{survey_id}/status`
5. Download when `pptx_status` indicates ready
6. Spot-check slides before client delivery

Guide: [../guides/analyst-guide.md](../guides/analyst-guide.md)

---

## Render Modes

| Mode | Env | Description |
|------|-----|-------------|
| `native` | `PPTX_RENDER_MODE=native` or unset | Programmatic-only export; guaranteed default path |
| `hybrid` | `PPTX_RENDER_MODE=hybrid` | Opt-in compatibility mode (Playwright capture + native composition) |

---

## Required Configuration

Backend **and** `pptx-worker` must share:

```env
SECRET_KEY=<identical on both services>
PPTX_RENDER_MODE=native
PPTX_QUEUE_ENABLED=true
PPTX_EXPORT_FRONTEND_BASE_URL=http://frontend:5173
PPTX_CAPTURE_API_BASE_URL=http://backend:8080
```

| Variable | Purpose |
|----------|---------|
| `PPTX_STALE_RECOVERY_ENABLED` | Auto-fail stuck jobs |
| `PPTX_CAPTURE_PROGRESS_ENABLED` | Per-chart progress in status API |
| `PPTX_CAPTURE_TOKEN_TTL_MINUTES` | Capture JWT lifetime (default 20) |
| `PPTX_FALLBACK_TABLE_WHITELIST` | Optional CSV allowlist for chart IDs/types allowed to use `fallback_table` without failing production validation |

Full list: [../technical/environment-variables.md](../technical/environment-variables.md)

---

## Hybrid Capture Authentication (Opt-in)

Modern flow (no static user JWT in `.env`):

1. Worker mints short-lived **capture JWT** (`sub=pptx-capture`)
2. Preflight probes `GET /analytics/report/{survey_id}` with that JWT
3. Playwright opens export-frame route with capture token
4. Charts must reach `data-export-ready="true"`

Detail: [../technical/auth-and-roles.md](../technical/auth-and-roles.md)

---

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/analytics/report/{survey_id}/generate-pptx` | Start export job |
| `GET` | `/analytics/report/{survey_id}/status` | Poll progress |
| `POST` | `/analytics/report/{survey_id}/cancel-pptx` | Cancel job |
| `POST` | `/analytics/report/{survey_id}/rebuild-pptx` | Force rebuild |
| `GET` | `/analytics/admin/pptx-diagnostics` | Ops diagnostics |

---

## Verification

### Phase F — Native E2E (taste-test deck)

Full-screen taste-test export with `PPTX_RENDER_MODE=native`, PRODUCTION validator, and per-chart coverage report:

```bash
# Run Phase F verification (writes deck + JSON/MD coverage to artifacts/)
python -m backend.scripts.run_pptx_e2e_verification

# Or via pytest
pytest backend/tests/analytics/test_pptx_e2e_native.py -o addopts="" -v

# Optional: persist artifacts during pytest
PPTX_E2E_WRITE_ARTIFACT=1 pytest backend/tests/analytics/test_pptx_e2e_native.py -o addopts=""
```

Artifacts land under `backend/tests/analytics/artifacts/pptx_e2e/<fixture>/`:
- `*_native_e2e.pptx` — generated deck
- `native_e2e_coverage.json` — machine-readable per-chart report
- `native_e2e_coverage.md` — human-readable summary table

### Hybrid capture auth (opt-in)

```bash
# Inside worker container
docker exec questioner_pptx_worker python -m backend.scripts.verify_capture_auth_rollout \
  --survey-id <survey-id> --probe-api

# Expected log patterns
# [Capture-Preflight] Environment OK
# [Capture-Session] Minted capture JWT
# [BrowserCapture] chart_capture_success
```

Pre-deploy tests:

```bash
pytest backend/tests/capture_auth -o addopts= -q
```

---

## Common Issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `auth_invalid` | `SECRET_KEY` mismatch | Align backend + worker `.env` |
| `capture_timeout` | 401 loop on report API | Fix capture auth; see rollout doc |
| Job stuck queued | Worker down | `docker compose up -d pptx-worker` |
| Empty charts | Frontend URL wrong | Check `PPTX_EXPORT_FRONTEND_BASE_URL` |
| Stale after restart | Expected with recovery | Retry with `force_retry=true` |

More: [../operations/troubleshooting.md](../operations/troubleshooting.md)

---

## Rollout and Flags

- Default rollout stays behind existing runtime flags (`PPTX_RENDER_MODE`, `PPTX_ROLLOUT_STAGE`, validation gating mode).
- Native mode is now baseline; switch to `hybrid` only when explicitly validating legacy capture compatibility.
- Validation gate blocks decks with unsupported fallback-table charts unless explicitly allowlisted.

---

## Quick Rollback

| Symptom | Env change |
|---------|------------|
| Queue issues | `PPTX_QUEUE_ENABLED=false` |
| Native regressions requiring temporary capture path | `PPTX_RENDER_MODE=hybrid` |
| Stale failures | `PPTX_STALE_RECOVERY_ENABLED=false` |

Full runbook: [../operations/rollback-runbooks.md](../operations/rollback-runbooks.md)

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [../releases/pptx-export-rollout.md](../releases/pptx-export-rollout.md) | Phased rollout matrix |
| [../releases/pptx-export-rollout.md](../releases/pptx-export-rollout.md) | Phased rollout matrix |
| [ai-reporting-pipeline.md](ai-reporting-pipeline.md) | Report generation |

---

*Phase 5 — [docs/README.md](../README.md)*

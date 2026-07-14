# PPTX Export Rollout Guide

> **Audience:** Release managers and operators deploying or validating PPTX export.  
> **Purpose:** Phased rollout matrix, capture auth verification, env flags, and rollback.  
> **Related:** [../analytics/pptx-export.md](../analytics/pptx-export.md) (daily reference) · [../operations/rollback-runbooks.md](../operations/rollback-runbooks.md)

> **Canonical location.** Legacy path: [../PPTX_EXPORT_ROLLOUT.md](../PPTX_EXPORT_ROLLOUT.md) (redirect).

---

## Feature Flags

| Variable | Default | Purpose |
|----------|---------|---------|
| `PPTX_QUEUE_ENABLED` | `true` | Redis queue + `pptx-worker` service |
| `PPTX_STALE_RECOVERY_ENABLED` | `true` | Auto-fail stale jobs on poll; enqueue recovery |
| `PPTX_CAPTURE_PROGRESS_ENABLED` | `true` | Per-chart progress (40–64%), elapsed/idle in status |

When a flag is `false`, the related behavior is disabled without removing code paths.

Daily operations reference: [../analytics/pptx-export.md](../analytics/pptx-export.md)

---

## Capture Auth (Phases 1–7) — Default Behavior

Hybrid export **no longer** requires copying a login JWT into `.env`.

| Layer | Behavior |
|-------|----------|
| **Worker** | Mints a fresh capture JWT per job (`sub=pptx-capture`, 10–30 min TTL) using `SECRET_KEY` |
| **Preflight** | Before Playwright: `GET /api/analytics/report/{survey_id}` with that JWT — fails fast on `auth_invalid` |
| **API** | `get_current_user_or_capture_user` on `GET /analytics/report/{survey_id}` only |
| **Export frame** | `analytics.getReport(..., { exportFrame: true })` — no 401 → login redirect loop |

### Required Environment (backend + pptx-worker)

```env
SECRET_KEY=<same value on both services>
PPTX_RENDER_MODE=hybrid
PPTX_EXPORT_FRONTEND_BASE_URL=http://frontend:5173
PPTX_CAPTURE_TOKEN_TTL_MINUTES=20
PPTX_CAPTURE_AUTH_ROLE=admin
```

Optional:

```env
# Hit API directly instead of Vite /api proxy (Docker: http://backend:8080).
# Preflight probes /analytics/report/{survey_id} (no /api prefix on the backend).
# PPTX_CAPTURE_API_BASE_URL=http://backend:8080
```

### Emergency Override (debug only)

Do **not** use in normal operation.

```env
PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE=true
# Plus set PPTX_CAPTURE_AUTH_TOKEN in the worker process environment only (not documented in .env.example).
```

### Export-Frame Error Codes (Playwright / diagnostics)

`report_auth_missing`, `report_auth_invalid`, `report_auth_denied`, `report_not_found`, `report_generating`

### Backend Export Failure Codes (UI / job status)

`auth_missing`, `auth_invalid`, `capture_auth_denied`, `capture_auth_config` — **not** mislabeled as `capture_timeout` when preflight catches auth first.

---

## Environment Matrix

### Development (local / docker-compose)

```env
PPTX_RENDER_MODE=hybrid
PPTX_QUEUE_ENABLED=true
PPTX_STALE_RECOVERY_ENABLED=true
PPTX_CAPTURE_PROGRESS_ENABLED=true
PPTX_EXPORT_FRONTEND_BASE_URL=http://frontend:5173
SECRET_KEY=<shared-with-api>
```

1. `docker-compose up -d --build` (backend, frontend, redis, pptx-worker)
2. Confirm worker logs: `[Capture-Preflight] Environment OK` and **no** requirement for `PPTX_CAPTURE_AUTH_TOKEN`
3. Run rollout verification (optional):

   ```bash
   docker exec questioner_pptx_worker python -m backend.scripts.verify_capture_auth_rollout \
     --survey-id <your-survey-id> --probe-api
   ```

4. Start an export from Survey Report → status poll should show chart progress
5. `docker-compose restart pptx-worker` mid-export → job should fail stale or re-queue
6. Admin: `GET /analytics/admin/pptx-diagnostics`

### Staging

Same flags as dev. **Forced worker restart test:**

```bash
docker-compose restart pptx-worker
curl -H "Authorization: Bearer $USER_JWT" \
  "https://staging.example/analytics/report/$SURVEY_ID/status?debug=true"
```

Validate:

- `pptx_stale` / `user_message` reflects interruption
- Retry export with `?force_retry=true` succeeds
- Logs contain `[PPTX-Obs]` transitions and `[PPTX-Metrics]` snapshots
- Worker logs show `[Capture-Session] Minted capture JWT` and **no** repeated `401` on report API during capture

### Production

Roll out in order:

1. **Week 1:** `PPTX_QUEUE_ENABLED=true`, worker scaled to 1 replica, stale recovery **on**
2. **Week 2:** Enable hybrid capture (`PPTX_RENDER_MODE=hybrid`) for pilot surveys; monitor capture failure rate
3. **Week 3:** Full traffic; set `PPTX_CAPTURE_PROGRESS_ENABLED=true` if not already

Monitor 429 rate on `/status` (polling limits).

---

## Phase 7 — Rollout Verification Checklist

After deploy, confirm **all** of the following:

| Check | Pass criteria |
|-------|----------------|
| SECRET_KEY | Same value on `questioner_backend` and `questioner_pptx_worker` |
| No static JWT | `PPTX_CAPTURE_AUTH_TOKEN` unset (or override disabled) |
| Unit/integration tests | `pytest backend/tests/capture_auth -o addopts= -q` → all green |
| Rollout script | `verify_capture_auth_rollout.py --probe-api` → PASSED |
| Worker startup | `[Capture-Preflight] Environment OK` in `docker logs questioner_pptx_worker` |
| Export run | No `401 Unauthorized` on `/api/analytics/report/{survey_id}` in worker/frontend logs |
| Export run | Charts reach `data-export-ready="true"` without batch timeout |
| Failed auth | Preflight or UI shows `auth_invalid` within seconds, not 2250s `capture_timeout` |

### Log Patterns to **Stop** Seeing (old behavior)

```
401 Unauthorized ... /api/analytics/report/
Export timed out during 'capturing_charts' after 2250s
frame_not_ready / __export_ready__ (when root cause was 401 redirect)
```

### Log Patterns You **Should** See (new behavior)

```
[Capture-Session] Minted capture JWT | survey=... report=... job=...
[Capture-Preflight-Auth] Report API probe | survey=... status=200
[BrowserCapture] chart_capture_success
```

### Cleanup Checklist (Phase 7 — before retrying export)

1. **Remove** `PPTX_CAPTURE_AUTH_TOKEN` from `.env` (leave unset; do not paste login JWTs).
2. Keep `PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE=false`.
3. Confirm **identical** `SECRET_KEY` on `questioner_backend` and `questioner_pptx_worker` (from `.env` via `env_file`).
4. Rebuild and restart after pulling Phases 1–7 code:

   ```bash
   docker-compose up -d --build backend frontend pptx-worker
   ```

5. Run verification inside the worker:

   ```bash
   docker exec questioner_pptx_worker python -m backend.scripts.verify_capture_auth_rollout \
     --survey-id <your-survey-id> --probe-api
   ```

   Expect `PASSED`. If you see `auth_invalid` with HTTP 401, `SECRET_KEY` differs between services. HTTP 404 means the survey report is missing in Mongo — generate the report first.

6. Retry PPTX export from the UI; tail logs:

   ```bash
   docker logs -f questioner_pptx_worker
   ```

### Focused Test Command (pre-promote)

```bash
pytest backend/tests/capture_auth \
  backend/tests/test_capture_auth.py \
  backend/tests/test_capture_session.py \
  backend/tests/test_capture_preflight_auth.py \
  backend/tests/test_report_capture_auth.py \
  -o addopts= -q
```

```bash
cd frontend && npm run test -- src/export/reportLoadErrors.test.ts
```

---

## Rollback

| Symptom | Action |
|---------|--------|
| Queue/redis issues | `PPTX_QUEUE_ENABLED=false` (legacy BackgroundTasks) |
| Aggressive stale failures | `PPTX_STALE_RECOVERY_ENABLED=false` |
| Poll/UI noise | `PPTX_CAPTURE_PROGRESS_ENABLED=false` |
| Capture failures | `PPTX_RENDER_MODE=native` |
| Auth debug only | `PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE=true` + temporary JWT on worker |

Full runbook: [../operations/rollback-runbooks.md](../operations/rollback-runbooks.md)

---

## Duplicate survey_reports Index

If startup logs mention `E11000` on `survey_id`:

```bash
python -m backend.scripts.cleanup_duplicate_survey_reports --dry-run
python -m backend.scripts.cleanup_duplicate_survey_reports --apply --recreate-index
```

---

*Phase 6 — [docs/README.md](../README.md)*

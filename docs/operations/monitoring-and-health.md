# Monitoring & Health

> **Audience:** Operators and on-call engineers.  
> **Purpose:** Health endpoints, logs, queue status, database checks, and expected service state.  
> **Related:** [deployment.md](deployment.md) · [troubleshooting.md](troubleshooting.md)

---

## Expected Service State

| Service | Healthy signal | Unhealthy signal |
|---------|----------------|------------------|
| **backend** | `GET /` returns 200 JSON | Connection refused, 5xx, startup `ValueError` on env |
| **frontend** | HTTP 200 on `/` | Blank page, Vite error overlay |
| **mongodb** | Backend connects, queries succeed | `ServerSelectionTimeoutError` |
| **redis** | Queue ops succeed | `ConnectionError`, rate limit failures |
| **pptx-worker** | Logs show job consumption | No log activity, repeated preflight failures |
| **nginx** | 443 responds, `/api/` proxies | 502 Bad Gateway |

---

## Health Endpoints

### API root (implemented)

```
GET /
```

**Response:**
```json
{"message": "Survey Platform API is running"}
```

Use for basic liveness. Available without authentication.

### Docker HEALTHCHECK (expected)

`backend/Dockerfile` and `docker-compose.prod.yml` reference:

```
GET http://localhost:8080/health
```

> **Known gap:** `/health` is referenced in Docker health checks but **not implemented** in `backend/main.py` today. Until added, use `GET /` for liveness or add a dedicated `/health` route returning `{ "status": "ok" }`.

### Swagger / OpenAPI

```
GET /docs
```

Confirms API process + router load. Requires browser or `curl` on `/openapi.json`.

---

## Operational Diagnostics (Authenticated)

Admin/analyst JWT required unless noted.

| Endpoint | Purpose |
|----------|---------|
| `GET /analytics/admin/pptx-diagnostics` | PPTX queue flags, worker health summary |
| `GET /analytics/admin/pptx-diagnostics/{survey_id}` | Per-survey export diagnostics |
| `GET /analytics/report/{survey_id}/status` | Report generation + PPTX job status |
| `GET /analytics/admin/ai-quota-status` | OpenAI quota usage |
| `GET /analytics/admin/ai-alerts` | AI cost/alert feed |
| `GET /analytics/orphans` | Orphan webhook submissions |
| `GET /modules/rollout` | Module rollout stage flags |
| `GET /product-test-questions/status` | Product Test bank health |

### Product Test bank health

```bash
curl -H "Authorization: Bearer $JWT" \
  http://localhost:8081/product-test-questions/status
```

Expect `healthy: true` when banks seeded.

---

## Log Locations

| Environment | Where to look |
|-------------|---------------|
| **Docker backend** | `docker logs questioner_backend` |
| **Docker pptx-worker** | `docker logs questioner_pptx_worker` |
| **Docker frontend** | `docker logs questioner_frontend` |
| **Native uvicorn** | Terminal stdout |
| **Gunicorn prod** | Container stdout / CloudWatch if configured |

### High-signal log patterns

| Pattern | Meaning |
|---------|---------|
| `Admin user seeded successfully` | Startup seed OK |
| `Database indexes ensured` | Index creation OK |
| `PPTX startup reconciliation` | Orphan job recovery ran |
| `[Capture-Preflight] Environment OK` | Worker can reach frontend + API |
| `[Capture-Session] Minted capture JWT` | PPTX capture auth working |
| `401 Unauthorized ... /analytics/report/` | **Bad** — SECRET_KEY mismatch or stale capture token |
| `CRITICAL SECURITY ERROR: Missing` | Required env vars missing |
| `E11000` on `survey_id` | Duplicate survey_reports — run cleanup script |

---

## Redis Queue Checks

PPTX jobs use Redis keys (defaults from `pptx_queue.py`):

| Key | Purpose |
|-----|---------|
| `pptx:jobs` | Job queue |
| `pptx:jobs:dedup` | Deduplication set |
| `pptx:lease:*` | Active job leases |

### Manual inspection

```bash
# Connect to Redis (Docker host port 6370)
redis-cli -p 6370

LLEN pptx:jobs
SMEMBERS pptx:jobs:dedup
KEYS pptx:lease:*
```

| Observation | Interpretation |
|-------------|----------------|
| `LLEN` growing, worker idle | Worker down or stuck |
| Jobs pop but fail in logs | Capture/auth/Playwright issue |
| Empty queue, exports stuck | `PPTX_QUEUE_ENABLED=false` or enqueue failure |

---

## MongoDB Checks

### Connectivity

```bash
mongosh "mongodb://localhost:27018/survey_platform" --eval "db.runCommand({ ping: 1 })"
```

### Collection sanity

```javascript
db.tokens.countDocuments()
db.responses.countDocuments()
db.survey_reports.countDocuments()
db.users.findOne({ role: "admin" })
```

### Index issues

If startup warns about `survey_reports.survey_id` unique index:

```bash
python -m backend.scripts.cleanup_duplicate_survey_reports --dry-run
python -m backend.scripts.cleanup_duplicate_survey_reports --apply --recreate-index
```

---

## PPTX Worker Health

### Startup validation script

```bash
docker exec questioner_pptx_worker python -m backend.scripts.verify_capture_auth_rollout \
  --survey-id <survey-id> --probe-api
```

Expect: **PASSED**

### Runtime monitoring

```bash
docker logs -f questioner_pptx_worker
```

During export, expect chart capture success logs — not 2250s `capture_timeout` from auth loops.

---

## Monitoring Checklist (Daily / On-Call)

- [ ] `curl` API root — 200
- [ ] Portal login succeeds
- [ ] Redis ping from backend network
- [ ] MongoDB ping
- [ ] `pptx-worker` container running (if exports enabled)
- [ ] No sustained 5xx in nginx/backend logs
- [ ] PPTX diagnostics endpoint — queue flags as expected
- [ ] Disk space on reports volume

---

## Alerting Recommendations

| Metric | Threshold | Action |
|--------|-----------|--------|
| API 5xx rate | > 1% for 5 min | Check logs, MongoDB, Redis |
| PPTX job failure rate | > 10% | Check capture auth, Playwright, frontend URL |
| MongoDB connections | Near pool limit | Scale or optimize queries |
| Redis memory | > 80% | Evict cache or scale |
| Orphan submissions spike | Sudden increase | Google Forms webhook / token integrity |

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [troubleshooting.md](troubleshooting.md) | Fix common failures |
| [deployment.md](deployment.md) | Service topology |
| [environment-variables.md](../technical/environment-variables.md) | Config reference |

---

*Phase 4 — [docs/README.md](../README.md)*

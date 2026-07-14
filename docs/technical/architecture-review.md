# Architecture Review (April 2026)

> **Audience:** Staff engineers, tech leads, and senior developers evaluating risks and refactoring priorities.  
> **Purpose:** Staff-engineering assessment — known limitations, readiness scores, and architecture-level refactoring directions.  
> **Related:** [system-overview.md](system-overview.md) (current architecture) · [testing-and-qa.md](testing-and-qa.md) · [../operations/security-and-secrets.md](../operations/security-and-secrets.md)

> **Migrated from:** `architecture_analysis.md.resolved` (Steps 6–8). That file has been removed; use this document for the historical review content.

**Review date:** 2026-04-21 · **Scope:** Full codebase at repo root

---

## Since This Review (2026-07)

Several items from the original assessment have progressed. Treat scores below as **point-in-time**; verify current state in code and [system-overview.md](system-overview.md).

| Original concern | Current status |
|------------------|----------------|
| No CI/CD visible | GitHub Actions: `ci.yml`, `backend-tests.yml` — see [ci-cd.md](../operations/ci-cd.md) |
| Indexes only on `survey_reports` | `ensure_indexes()` now covers reports, voice, modules, sessions, heatmap, PT media — see `backend/database.py` |
| No test coverage | Large `backend/tests/` matrix + [testing-and-qa.md](testing-and-qa.md) |
| Google Forms mandatory | In-app Layer 2 gateway is primary path; Forms remain legacy |
| Module system | Phase 9 DB-driven modules shipped — [module-rollout.md](../releases/module-rollout.md) |
| PPTX capture auth | Capture JWT rollout complete — [pptx-export-rollout.md](../releases/pptx-export-rollout.md) |

**Still relevant:** webhook auth gap, quota race window, client-side role guards (UX only), large god files, Egypt market hardcoding, `/health` vs Dockerfile expectation.

---

## Problems & Limitations

### Critical issues

#### 1. Google Form dependency creates a fragile bridge

- **Problem:** Legacy surveys required manually created Google Forms, Apps Script, and webhook wiring.
- **Impact:** Operational bottleneck; webhook failures can lose Layer 2 responses (`orphan_submissions` logs only — no retry).
- **Mitigation:** Prefer **in-app gateway** for all new studies. See [webhooks-and-integrations.md](../api/webhooks-and-integrations.md).

#### 2. Token-to-response linking is fragile (legacy path)

- **Problem:** Google Form webhook relies on respondents not modifying the pre-filled token field.
- **Impact:** Corrupted tokens become orphan submissions with no retroactive link.

#### 3. Race condition window in quota enforcement

- **Problem:** L1 quota checks may use read-then-write patterns rather than fully atomic updates under extreme concurrency.
- **Impact:** Over-quota respondents could slip through in high-traffic scenarios.

### Moderate issues

#### 4. Large file sizes / god objects

- **Problem:** `PublicSurvey.tsx`, `aggregator.py`, and `models.py` are very large single modules.
- **Impact:** Harder to maintain, test, and onboard.

#### 5. Duplicated logic across routers

- **Problem:** Helpers such as `extract_layer1_questions()` and `GATE_ANSWER_MAP` have appeared in multiple router files.
- **Impact:** Bug fixes must be applied in multiple places.

#### 6. Hardcoded Egypt-specific data

- **Problem:** Area options and SES scoring are hardcoded in public flow code.
- **Impact:** Other markets require code changes unless extracted to configuration.

#### 7. Index coverage on hot paths

- **Problem (original):** Token lookups on every public request needed explicit indexes.
- **Status:** Partially addressed — verify `tokens` and `responses` indexes match production query patterns in `database.py`.

#### 8. localStorage-based auth (frontend)

- **Problem:** JWT and roles in `localStorage`; route guards are client-side.
- **Impact:** Frontend routing is UX-only; **backend** `get_current_user` must enforce RBAC. See [auth-and-roles.md](auth-and-roles.md).

### Minor issues

#### 9. No request validation on webhook

- **Problem:** `/webhook/google-form` has no authentication or signature verification.
- **Impact:** Data poisoning risk if URL is exposed.

#### 10. Import inside function bodies

- **Problem:** Circular-import workarounds with lazy imports in routers.
- **Impact:** Code smell; module graph coupling.

---

## Readiness Assessment (April 2026)

| Dimension | Score | Justification |
|-----------|-------|---------------|
| **Scalability** | **4/10** | Quota races, legacy Form bottleneck, horizontal scaling story immature |
| **Maintainability** | **3/10** | God objects, duplication, market hardcoding |
| **Extensibility** | **6/10** | Template abstraction, layered analytics, module system direction |
| **Production readiness** | **4/10** | Webhook auth, rate limiting, monitoring gaps |

**Overall (at review time): 4.25/10** — functional prototype-grade, not production-ready at scale without hardening.

Re-run this assessment after major refactors or before enterprise deployment.

---

## Refactoring Directions

### Direction 1: Eliminate Google Forms dependency entirely

- Make `google_form_id` / `google_form_url` **optional** where still required in models
- Route new surveys through internal gateway by default
- Deprecate webhook path; keep for backward compatibility only

### Direction 2: Database hardening

- Compound indexes on `tokens(token)`, `tokens(survey_id, status)`, `responses(survey_id, source)`, `responses(token)`
- Atomic quota via `findOneAndUpdate` with conditional `$inc`
- TTL on `tokens.expires_at` for cleanup

### Direction 3: Modularize the codebase

- Split `models.py` by domain (`models/survey.py`, `models/token.py`, etc.)
- Decompose `PublicSurvey.tsx` into screening, evaluation, completion sub-flows
- Extract shared L1 helpers and locale/market config (areas, SES, demographics)

### Direction 4: Secure public endpoints

- HMAC webhook signature verification
- Rate limits on `/s/{token}` and submission endpoints
- Server-side session validation instead of client-only role checks

### Direction 5: Observability & reliability

- Structured logging with correlation IDs across token lifecycle
- Dead-letter queue + retry for failed webhooks
- Health checks for MongoDB and Redis (align API with Docker `HEALTHCHECK`)
- AI cost dashboards using existing telemetry fields

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [system-overview.md](system-overview.md) | Current canonical architecture |
| [backend-architecture.md](backend-architecture.md) | Routers, services, workers |
| [security-and-secrets.md](../operations/security-and-secrets.md) | Auth and secrets |
| [troubleshooting.md](../operations/troubleshooting.md) | Operational issues |

---

*Phase 7 — [docs/README.md](../README.md)*

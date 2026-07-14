# Security & Secrets

> **Audience:** Operators, security reviewers, and lead developers.  
> **Purpose:** Secret handling, JWT hardening, webhook security, credential rotation, and production checklist.  
> **Related:** [auth-and-roles.md](../technical/auth-and-roles.md) · [environment-variables.md](../technical/environment-variables.md) · [deployment.md](deployment.md)

---

## Security Model Summary

| Actor | Auth mechanism | Trust boundary |
|-------|----------------|----------------|
| **Portal users** | JWT (bcrypt password → HS256 token) | Backend validates every request |
| **Respondents** | Opaque survey token in URL | Token state machine + expiry |
| **PPTX capture** | Short-lived capture JWT (`sub=pptx-capture`) | Scoped to report-read routes |
| **Google webhook** | **None today** | Known gap — see Webhook Security |

---

## Critical Secrets

| Secret | Where stored | Rotation |
|--------|--------------|----------|
| `SECRET_KEY` | `.env` / AWS Secrets Manager | Invalidate all JWTs; restart API + worker simultaneously |
| `ADMIN_PASSWORD` | `.env` / AWS | Change in DB + `.env`; or create new admin user |
| `MONGO_URI` | `.env` / AWS | Atlas credential rotation; update connection string |
| `REDIS_URL` | `.env` / AWS | Update URL if password changed |
| `OPENAI_API_KEY` | `.env` / AWS / GitHub Secrets | Revoke old key in OpenAI dashboard |
| `DOCKERHUB_TOKEN` | GitHub Secrets | Regenerate PAT in DockerHub |

### SECRET_KEY requirements

- Minimum **64 random characters** recommended
- **Must be identical** on `backend` and `pptx-worker` services
- Never commit to git — `.env` is gitignored
- Production: load from AWS Secrets Manager (`questioner/production/secrets`)

Generate example:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## JWT Security

| Setting | Default | Recommendation |
|---------|---------|----------------|
| `ALGORITHM` | HS256 | Keep HS256 unless migrating to RS256 with key pair |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 1440 (24h) | Reduce to 480 (8h) or less for production |
| Storage (frontend) | `localStorage` | XSS risk — consider httpOnly cookies in future |

### Backend enforcement

All protected routes use FastAPI dependencies — never trust frontend `AdminRoute` alone.

| Dependency | Enforces |
|------------|----------|
| `get_current_user` | Valid JWT, active user, rejects capture tokens |
| `get_current_active_admin` | `role == admin` |
| `get_current_active_analyst` | `role in (admin, analyst)` |

Detail: [auth-and-roles.md](../technical/auth-and-roles.md)

---

## Default Credentials

| Context | Risk |
|---------|------|
| `.env.example` placeholders | Safe — not real secrets |
| Old docs referencing `admin`/`admin123` | **Change immediately** in any shared environment |
| CI test passwords | Isolated to CI — never use in production |

### Production hardening

- [ ] Rotate `ADMIN_PASSWORD` before go-live
- [ ] Disable public signup if not needed (`/auth/signup`)
- [ ] Audit `users` collection for unexpected accounts
- [ ] Set strong `SECRET_KEY` unique per environment

---

## CORS & HTTP Headers

### CORS

```env
ALLOWED_ORIGINS=https://app.yourdomain.com,https://staging.yourdomain.com
```

**Never** use `ALLOWED_ORIGINS=*` in production.

### Security headers (`main.py` middleware)

| Header | Value |
|--------|-------|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Strict-Transport-Security` | `max-age=31536000` |
| `Content-Security-Policy` | Stricter in `ENV=production` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |

---

## Webhook Security

`POST /webhook/google-form` — **no authentication** in current code.

| Risk | Impact |
|------|--------|
| URL discovery | Attacker submits fake Layer 2 responses |
| Token guessing | Unlikely (UUID) but orphan logging only |

### Recommended mitigations

1. **Shared secret header** — Apps Script sends `X-Webhook-Secret`
2. **IP allowlist** — Google Apps Script egress ranges
3. **Request signing** — HMAC of payload
4. **Rate limiting** — SlowAPI on webhook path

Until implemented: restrict webhook URL knowledge; monitor `orphan_submissions`.

---

## PPTX Capture Token Security

| Property | Value |
|----------|-------|
| Subject | `pptx-capture` |
| TTL | `PPTX_CAPTURE_TOKEN_TTL_MINUTES` (default 20) |
| Scope | Allowlisted report GET routes only |
| Minted by | Worker per job — not user JWT |

### Emergency override (disable in production)

```env
PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE=true
# PPTX_CAPTURE_AUTH_TOKEN=<temporary-jwt>  # worker only
```

Remove after debugging. Normal operation uses server-minted tokens.

---

## OpenAI Key Handling

| Practice | Detail |
|----------|--------|
| Scope | Server-side only — never in `VITE_*` vars |
| CI | `mock_key` in tests |
| Rotation | Update env + restart backend; no client action |
| Cost control | Monitor `/analytics/admin/ai-quota-status` |

---

## MongoDB Credentials

| Practice | Detail |
|----------|--------|
| Connection string | Contains username/password — treat as secret |
| Network | Atlas IP allowlist or VPC peering |
| Least privilege | App user: readWrite on `survey_platform` only |
| Backups | Atlas automated backups enabled |

---

## AWS Secrets Manager (Production)

`backend/config.py`:

```python
secrets = load_aws_secrets("questioner/production/secrets", region="eu-west-1")
```

| Requirement | Detail |
|-------------|--------|
| IAM role | ECS task role with `secretsmanager:GetSecretValue` |
| Fail closed | Production boot fails if secrets unavailable |
| Key names | Must match `Settings` attribute names |

---

## GitHub Secrets

| Secret | Exposure |
|--------|----------|
| `DOCKERHUB_TOKEN` | CI only — push images |
| `MONGO_URI_PROD` | Deploy workflows when implemented |
| Never | Commit secrets in workflow YAML literals for prod |

---

## Rate Limiting

SlowAPI + Redis (`backend/utils/rate_limit.py`):

- Protects public endpoints from abuse
- Proxy-aware client IP keys
- Configure Redis URL for distributed rate limits

---

## Audit Logging

`audit_logs` collection via `utils/audit_utils.log_action()`:

- Signup events logged
- Extend for admin mutations (user create/delete)

---

## Production Security Checklist

### Before launch
- [ ] Unique `SECRET_KEY` per environment
- [ ] Admin password rotated from dev defaults
- [ ] `ALLOWED_ORIGINS` explicit list
- [ ] `ENV=production`
- [ ] TLS terminated at nginx / ALB
- [ ] MongoDB and Redis not publicly exposed
- [ ] `.env` not in Docker image layers
- [ ] Webhook URL not published

### Ongoing
- [ ] Rotate `SECRET_KEY` and `OPENAI_API_KEY` on schedule
- [ ] Review `users` collection quarterly
- [ ] Monitor orphan submissions and failed auth
- [ ] Keep dependencies updated (CI + Dependabot)
- [ ] Review PPTX diagnostics for auth anomalies

---

## Incident Response — Credential Compromise

| If compromised | Immediate action |
|----------------|------------------|
| `SECRET_KEY` | Rotate; restart all API + worker instances; force user re-login |
| `ADMIN_PASSWORD` | Reset password; review audit logs |
| `OPENAI_API_KEY` | Revoke in OpenAI dashboard; issue new key |
| `MONGO_URI` | Rotate Atlas password; update secrets |
| Webhook abuse | Rotate webhook URL path; add secret validation |

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [auth-and-roles.md](../technical/auth-and-roles.md) | RBAC detail |
| [troubleshooting.md](troubleshooting.md) | Auth failure fixes |
| [rollback-runbooks.md](rollback-runbooks.md) | Disable risky features |

---

*Phase 4 — [docs/README.md](../README.md)*

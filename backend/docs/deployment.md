# Deployment & CI/CD (Redirect)

> **This file has been consolidated into the docs hub.**

| Topic | Canonical document |
|-------|-------------------|
| Deployment | [docs/operations/deployment.md](../../docs/operations/deployment.md) |
| CI/CD | [docs/operations/ci-cd.md](../../docs/operations/ci-cd.md) |
| Environment variables | [docs/technical/environment-variables.md](../../docs/technical/environment-variables.md) |
| Local setup | [docs/technical/local-development.md](../../docs/technical/local-development.md) |

### GitHub Secrets (quick reference)

| Secret | Purpose |
|--------|---------|
| `DOCKERHUB_USERNAME` | Docker image registry |
| `DOCKERHUB_TOKEN` | Registry authentication |
| `OPENAI_API_KEY` | Production AI analytics |
| `MONGO_URI_PROD` | Production MongoDB |
| `REDIS_URL_PROD` | Production Redis |

### Docker image

Multi-stage build: [backend/Dockerfile](../Dockerfile) — Python 3.11, Gunicorn + Uvicorn workers, Playwright Chromium.

---

*Redirect — Phase 4 documentation restructure*

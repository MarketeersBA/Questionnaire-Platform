# Questioner

Token-based survey qualification and market-research platform — **FastAPI**, **MongoDB**, and **React**.

Design templates → issue secure tokens → screen respondents (Layer 1) → evaluate (Layer 2) → generate AI-powered reports and exports.

---

## Documentation

**Full handover hub:** **[docs/README.md](docs/README.md)**

| I want to… | Start here |
|------------|------------|
| Onboard as admin/analyst | [docs/handover/teammate-handover-checklist.md](docs/handover/teammate-handover-checklist.md) |
| Set up locally | [docs/technical/local-development.md](docs/technical/local-development.md) |
| Understand architecture | [docs/technical/system-overview.md](docs/technical/system-overview.md) |
| Run tests / QA gates | [docs/technical/testing-and-qa.md](docs/technical/testing-and-qa.md) |
| Deploy or operate | [docs/operations/deployment.md](docs/operations/deployment.md) |

---

## Quick start

```bash
git clone <repo-url> questioner && cd questioner
cp .env.example .env          # configure MongoDB, Redis, SECRET_KEY
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8081   # from repo root

cd frontend && npm install && npm run dev       # http://localhost:5173
```

- **API / Swagger:** http://localhost:8081/docs  
- **Product Test seeding:** [docs/data/product-test-data-layer.md](docs/data/product-test-data-layer.md)

---

## Repository layout

| Path | Purpose |
|------|---------|
| `backend/` | FastAPI app, analytics engine, workers |
| `frontend/` | React + Vite UI |
| `docs/` | Canonical documentation hub |
| `infra/` | Docker Compose, Nginx, deploy artifacts |
| `scripts/` | Seeds, diagnostics, doc link validation |

---

## Stack

React 18 · TypeScript · Vite · FastAPI · MongoDB · Redis · OpenAI · python-pptx · Playwright

---

© 2026 Questioner Team

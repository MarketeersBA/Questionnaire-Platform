# Exports API

> **Audience:** Analysts, data engineers, and external pipeline integrators.  
> **Purpose:** Excel export endpoints for survey research data — BA/PF, product scalers, product test.  
> **Related:** [api-overview.md](api-overview.md) · [../guides/analyst-guide.md](../guides/analyst-guide.md) · [../technical/auth-and-roles.md](../technical/auth-and-roles.md)

> **Supersedes:** [ANALYST_GUIDE.md](../../ANALYST_GUIDE.md) (redirect in place).

---

## Base URL

All export routes are under the **`/exports`** prefix.

| Environment | Example base |
|-------------|--------------|
| Native dev | `http://localhost:8081/exports` |
| Via nginx | `https://<host>/api/exports` |

> **Fixed:** Legacy `ANALYST_GUIDE.md` used port `3001` — canonical dev port is **8081** per `.env.example`.

---

## Authentication

All live export endpoints require a valid portal JWT.

| Header | Value |
|--------|-------|
| `Authorization` | `Bearer <JWT_TOKEN>` |
| `Accept` | `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (recommended) |

Obtain token:

```bash
curl -X POST "http://localhost:8081/auth/token" \
  -d "username=admin&password=YOUR_PASSWORD"
```

---

## Quick Start

```bash
# 1. Get JWT (see above)
export JWT="eyJ..."

# 2. Download BA/PF structure sample (no live survey needed)
curl -X GET "http://localhost:8081/exports/test/ba-pf" \
  -H "Authorization: Bearer $JWT" \
  --output TEST_BA_PF_STRUCTURE.xlsx

# 3. Download live export for a survey
curl -X GET "http://localhost:8081/exports/ba-pf/<SURVEY_ID>" \
  -H "Authorization: Bearer $JWT" \
  --output BA_PF_Export.xlsx
```

---

## Endpoint Reference

| Method | Path | Auth | Output | Rows |
|--------|------|------|--------|------|
| `GET` | `/exports/ba-pf/{survey_id}` | JWT | Flat Excel | One per respondent |
| `GET` | `/exports/product-scalers/{survey_id}` | JWT | Stacked Excel | One per brand per respondent |
| `GET` | `/exports/product-test/{survey_id}` | JWT | Multi-sheet Excel | Scalar + trial media metadata |
| `GET` | `/exports/test/ba-pf` | JWT | Structure sample | `TEST_BA_PF_STRUCTURE.xlsx` |
| `GET` | `/exports/test/product-scalers` | JWT | Structure sample | `TEST_SCALERS_STRUCTURE.xlsx` |

Router: `backend/routers/exports.py`

---

## Export Types

### 1. Brand Awareness & Purchase Funnel (BA & PF)

**Path:** `GET /exports/ba-pf/{survey_id}`

- **Format:** Flat (one row per respondent)
- **Parity target:** `BAandPF.xlsx` legacy reference
- **Columns:** Driven by `module_snapshots` and `analytical_mapping` on the survey document
- **Modules included:** Brand awareness, purchase funnel, usage, pricing (when present in snapshots)

### 2. Product Scalers (Stacked)

**Path:** `GET /exports/product-scalers/{survey_id}`

- **Format:** Stacked (one row per brand per respondent)
- **Parity target:** `pivot_scalers.xlsx`
- **Column keys:** `{brand}_{question_id}` with human labels from template
- **Demographics:** Gender, Age attached per row for pivoting

### 3. Product Test Export

**Path:** `GET /exports/product-test/{survey_id}`

- **Sheet 1:** Scalar evaluations (numeric/text; excludes media references)
- **Sheet 2:** Trial media metadata with authenticated download URLs (not binary embedded)

Uses `product_test_analytics_service` for flat evaluation extraction.

---

## Structure Verification (Test Endpoints)

Use before building ingestion scripts — **no live survey data required**.

| Endpoint | Output file |
|----------|-------------|
| `GET /exports/test/ba-pf` | `TEST_BA_PF_STRUCTURE.xlsx` |
| `GET /exports/test/product-scalers` | `TEST_SCALERS_STRUCTURE.xlsx` |

---

## Data Mapping Logic

### Brand Awareness (BA)

| Export column | Source logic |
|---------------|--------------|
| `TOPOFMIND` | Extracted from `aw_q1` |
| `Aided_Awareness` | Binary `1/0` from MCQ list in `aw_q3` |
| `Unaided_Awareness` | `1/0` if `(aw_q1 == brand) OR (brand in aw_q2)` |

### Product Scalers (PS)

| Aspect | Logic |
|--------|-------|
| Keys | Layer 2 evaluation questions: `{brand}_{qid}` |
| Labels | From template labels (e.g. `AfterTaste`, `Texture`) |
| Pivot | Each brand row tagged with respondent `Gender`, `Age` |

### Module-aware exports (Phase 9)

When `MODULE_ROLLOUT_STAGE` ≥ `analytics_aliases`, ingestor/export alias normalization applies via `module_answer_aliases.py`.

---

## Postman Tips

1. **Authorization** tab → Bearer Token → paste JWT
2. **Send and Download** (arrow next to Send) for binary Excel
3. Start with `/exports/test/*` endpoints, then switch to live `survey_id`

---

## Error Responses

| Code | Cause |
|------|-------|
| `401` | Missing/expired JWT |
| `400` | Invalid `survey_id` format |
| `404` | Survey not found or no responses to export |

---

## Prerequisites for Live Exports

- Survey has `submitted` responses (Layer 2 complete)
- `survey_id` is valid MongoDB ObjectId string
- User has analyst or admin JWT

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [../guides/analyst-guide.md](../guides/analyst-guide.md) | Analyst workflow |
| [../data/collections-reference.md](../data/collections-reference.md) | `responses` schema |
| [../releases/module-rollout.md](../releases/module-rollout.md) | Module export aliases |
| [api-overview.md](api-overview.md) | Full API map |

---

*Phase 5 — [docs/README.md](../README.md)*

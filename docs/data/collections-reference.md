# Collections Reference

> **Audience:** Backend developers, data engineers, analysts exporting raw data.  
> **Purpose:** Per-collection reference for MongoDB in Questioner (`DATABASE_NAME` default: `survey_platform`).  
> **Related:** [database-overview.md](database-overview.md) · [seeds-and-fixtures.md](seeds-and-fixtures.md)

---

## Collection Index (Alphabetical)

| Collection | Domain | Description |
|------------|--------|-------------|
| `ai_insight_cache` | Analytics | Cached OpenAI responses with prompt hashing |
| `attribute_banks` | Taste test | Sensory attribute libraries by category |
| `audit_logs` | Admin | Administrative action audit trail |
| `brand_attribute_banks` | Brand attrs | Brand-specific attribute registry |
| `feedback_clusters` | Voice | Thematic clusters from voice NLP |
| `feedback_reports` | Voice | Synthesized voice feedback reports |
| `master_questions` | Taste test | Master question bank |
| `module_snapshots` | *(embedded)* | Stored on `surveys.module_snapshots`, not separate collection |
| `orphan_submissions` | Webhook | Failed Google Form / unmatched payloads |
| `package_test_questions` | Product Test | Packaging evaluation question bank |
| `packaging_heatmap_aggregates` | Product Test | Aggregated tap heatmap data |
| `packaging_heatmap_feedback` | Product Test | Per-respondent heatmap taps |
| `product_test_bank_meta` | Product Test | Seed metadata for PT banks |
| `product_test_configs` | Product Test | Study-level PT configuration |
| `product_test_media_assets` | Product Test | Trial media registry (links GridFS) |
| `product_test_questions` | Product Test | IHUT sensory question bank |
| `purchase_funnels` | Modules | Per-survey purchase funnel config |
| `question_modules` | Modules | Versioned DB-driven module definitions |
| `respondents` | Core | Upserted respondent profiles (by phone) |
| `responses` | Core | Layer 1 / Layer 2 answer documents |
| `structural_questions` | Legacy | Structural question import target |
| `survey_reports` | Analytics | Generated web reports + PPTX job state |
| `survey_sessions` | Core | In-progress session persistence |
| `surveys` | Core | Live study instances |
| `taste_test_configs` | Taste test | Taste test study configurations |
| `taste_test_questions` | Taste test | Taste-specific questions |
| `templates` | Core | Versioned survey blueprints |
| `tokens` | Core | Respondent access keys + status |
| `users` | Auth | Portal accounts |
| `voice_alerts` | Voice | Voice pipeline alerts |
| `voice_feedbacks` | Voice | Voice recording metadata + analysis |

---

## Core Collections

### `users`

| Field | Type | Notes |
|-------|------|-------|
| `username` | string | Login identifier |
| `email` | string | Optional |
| `role` | string | `admin`, `analyst`, `client` |
| `is_active` | bool | Disabled users cannot authenticate |
| `hashed_password` | string | bcrypt — never returned in API |
| `created_at` | datetime | |

### `templates`

| Field | Type | Notes |
|-------|------|-------|
| `name` | string | Blueprint name |
| `version` | int | Incremented on edit |
| `type` | string | Study type |
| `layer1_structure` | object | Screening questions |
| `layer2_structure` | object | Evaluation questions |
| `is_deleted` | bool | Soft delete |

**Index:** `(name, version)` unique

### `surveys`

| Field | Type | Notes |
|-------|------|-------|
| `company_name` | string | Client / study name |
| `template_id` | string | Source template |
| `template_version` | int | Version at create time |
| `template_snapshot_schema` | object | Frozen blueprint |
| `module_snapshots` | object | Frozen module trees keyed by module_id |
| `analytical_mapping` | object | Export/analytics aliases |
| `screening_config` | object | Gates, quotas |
| `internal_brands_data` / `competitor_brands_data` | array | Brand lists |
| `purchase_funnel` | object | Inline PF config (legacy) |
| `product_test_snapshot` | object | PT blueprint snapshot |
| `google_form_id` / `google_form_url` | string | Legacy L2 path |
| `status` | string | Operational state |
| `quota_state` | object | Quota counters |

### `tokens`

| Field | Type | Notes |
|-------|------|-------|
| `token` | string (UUID) | Primary lookup key |
| `survey_id` | string | Parent survey |
| `status` | string | `unused`, `passed`, `failed`, `submitted` |
| `phone` | string | Set after L1 |
| `batch_id` | string | Generation batch |
| `expires_at` | datetime | Optional expiry |
| `excluded` | bool | Excluded from reporting |
| `layer1_passed` | bool | Screening outcome flag |

**Indexes:** `token` unique, `status`, `survey_id`, `created_at`

### `responses`

| Field | Type | Notes |
|-------|------|-------|
| `survey_id` | string | |
| `token` | string | |
| `phone` | string | |
| `source` | string | `layer1`, `layer2`, `in_app_gateway` |
| `answers` | object | Raw or structured answers |
| `submitted_at` | datetime | |

### `respondents`

| Field | Type | Notes |
|-------|------|-------|
| `phone` | string | Unique key — upserted on L1 |
| Demographics | object | Name, age, gender, area, etc. |
| `created_at` / `updated_at` | datetime | |

**Index:** `phone` unique

### `survey_sessions`

| Field | Type | Notes |
|-------|------|-------|
| `token` | string | Unique session key |
| `survey_id` | string | |
| `state` | object | In-progress answers / step |
| `last_updated` | datetime | |

**Index:** `token` unique

---

## Analytics Collections

### `survey_reports`

| Field | Type | Notes |
|-------|------|-------|
| `survey_id` | string | Unique per survey |
| `status` | string | Generation / PPTX job status |
| `slides` | array | Web report slide objects |
| `generated_at` | datetime | |
| `pptx_status` | string | Queue job state |
| `pptx_path` | string | Output file path |
| AI fields | object | Executive summary, SWOT, etc. |

**Indexes:** `survey_id` unique, `status`, `generated_at`

### `ai_insight_cache`

| Field | Type | Notes |
|-------|------|-------|
| `cache_key` / prompt hash | string | Deduplication |
| `model` | string | OpenAI model used |
| `response` | object | Cached AI output |
| `cost` | number | Token cost tracking |
| `created_at` | datetime | TTL invalidation |

### `orphan_submissions`

| Field | Type | Notes |
|-------|------|-------|
| `payload` | object | Raw webhook body |
| `reason` | string | e.g. `missing_token`, `invalid_transition` |
| `timestamp` | datetime | |

### `audit_logs`

| Field | Type | Notes |
|-------|------|-------|
| `user` | string | Actor |
| `action` | string | e.g. `signup` |
| `resource_type` | string | |
| `resource_id` | string | |
| `timestamp` | datetime | |

---

## Module Collections

### `question_modules`

| Field | Type | Notes |
|-------|------|-------|
| `module_id` | string | e.g. `purchase_funnel`, `brand_usage` |
| `version` | int | Immutable versions |
| `is_active` | bool | Active version flag |
| `sections` | array | Module question tree |
| `questions` | array | `ModuleQuestion` objects |

**Indexes:** `(module_id, version)` unique, `is_active`

### `purchase_funnels`

Per-survey funnel configuration (may overlap with `surveys.purchase_funnel`).

---

## Product Test Collections

| Collection | Purpose |
|------------|---------|
| `product_test_questions` | IHUT question bank |
| `package_test_questions` | Packaging question bank |
| `product_test_bank_meta` | Last seed time, source (`excel`/`fixture`) |
| `product_test_configs` | Study configs |
| `product_test_media_assets` | Trial upload registry |
| `packaging_heatmap_aggregates` | `(survey_id, question_id)` aggregates |
| `packaging_heatmap_feedback` | Raw tap events |

Detail: [product-test-data-layer.md](product-test-data-layer.md)

---

## Taste Test Collections (Legacy / Parallel)

| Collection | Purpose |
|------------|---------|
| `taste_test_configs` | Study configuration |
| `taste_test_questions` | Category-scoped questions |
| `master_questions` | Master bank |
| `attribute_banks` | Sensory attributes |
| `brand_attribute_banks` | Brand attribute registry |

---

## Voice Feedback Collections

| Collection | Purpose |
|------------|---------|
| `voice_feedbacks` | Per-answer audio metadata, transcription, NLP |
| `feedback_clusters` | Cluster themes |
| `feedback_reports` | Dashboard synthesis |
| `voice_alerts` | Alert engine output |

GridFS: `voice_recordings` bucket stores audio binaries.

---

## GridFS Collections

MongoDB creates `.files` and `.chunks` suffix collections per bucket:

- `voice_recordings.files` / `.chunks`
- `packaging_images.files` / `.chunks`
- `product_test_media.files` / `.chunks`

---

## Indexes

### Startup (`database.ensure_indexes`)

- `survey_reports`: `survey_id` unique, `status`, `generated_at`
- `voice_feedbacks`: `(survey_id, question_id)`, `created_at`, `status`
- `question_modules`: `(module_id, version)` unique, `is_active`
- `survey_sessions`: `token` unique, `last_updated`
- `packaging_heatmap_aggregates`: `(survey_id, question_id)` unique
- `product_test_media_assets`: `asset_id` unique, lifecycle indexes

### Script (`python -m backend.utils.db_indexes`)

Additional indexes on `templates`, `tokens`, `surveys`, `respondents`, `orphan_submissions`, `attribute_banks`, `taste_test_*`, `master_questions`.

---

## Query Patterns

| Use case | Query |
|----------|-------|
| Respondent list | `tokens.find({ survey_id, status })` |
| Join L1+L2 | `responses.find({ survey_id, token })` |
| Report | `survey_reports.find_one({ survey_id })` |
| Orphan audit | `orphan_submissions.find().sort({ timestamp: -1 })` |
| Module active version | `question_modules.find_one({ module_id, is_active: true })` |

---

## Related Documentation

| Document | Purpose |
|----------|---------|
| [database-overview.md](database-overview.md) | ERD and principles |
| [product-test-data-layer.md](product-test-data-layer.md) | PT seeding |
| [../analytics/analytics-overview.md](../analytics/analytics-overview.md) | Report pipeline outputs |

---

*Phase 5 — [docs/README.md](../README.md)*

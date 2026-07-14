# Brand Awareness Parity Checklist (Phase 8)

This checklist compares Brand Awareness semantics across:

- **Direct BA contract (new)**: `backend/analytics_module/aggregator.py` (`brand_awareness_stacked`)
- **Legacy BA**: `backend/analytics_module/src/MySlides/brand_awareness.py` + `backend/analytics_module/src/Calculations/percentages.py`
- **Exports BA**: `backend/routers/exports.py` (`/exports/ba-pf/{survey_id}`)

No refactor is performed in this phase. This is a parity audit only.

## Status Legend

- **Aligned**: same behavior/contract intent
- **Partially Aligned**: close intent, but shape/rules differ
- **Mismatched**: materially different behavior or missing contract element

## Side-by-Side Parity Matrix

| Capability | Direct BA (new) | Legacy BA (MySlides + percentages) | Exports BA (`routers/exports.py`) | Status |
|---|---|---|---|---|
| Canonical output object list (`brand`, `tom_pct`, `other_unaided_pct`, `aided_pct`, `total_awareness_pct`) | Yes (`data.objects`) | No explicit object-list contract (DataFrame metrics by index) | No (flat respondent export fields) | **Partially Aligned** |
| Stacked chart contract (`stacked_bar`, labels, datasets) | Yes (`chart_type=stacked_bar`) | No (`grouped`/slide-oriented) | No (Excel rows, no chart contract) | **Mismatched** |
| Series order fixed (`TOM`, `Other_Unaided`, `Aided`) | Yes (explicit dataset order + metadata) | Metric order exists but chart shape differs | N/A (no series chart) | **Partially Aligned** |
| Sorting (`total_awareness_pct desc`, tie by brand asc) | Yes (single deterministic sort) | Sorts by `Total Awareness` (tie rule not explicit) | Not applicable (respondent rows) | **Partially Aligned** |
| Per-respondent exclusive waterfall (TOM > Other_Unaided > Aided) | Yes (implemented in aggregator) | Indirectly expected via decode pipeline; percentage function itself is additive | No (Aided and Unaided can overlap) | **Partially Aligned** |
| Explicit `Not_Aware` handling | Yes (`not_aware_pct` in rows) | No explicit metric in BA item | No | **Mismatched** |
| Alias normalization support | Yes (`brand_alias_map`, identity fallback) | Yes (AI/JSON mapping in response decoder path) | No explicit alias mapping path | **Partially Aligned** |
| Master brand list gating (ignore non-master brands) | Yes (`brand_master_list`) | Implicit via decoded columns/codebook path | Uses survey brand list but no canonical alias gate | **Partially Aligned** |
| Total awareness formula | `TOM + Other_Unaided + Aided` (post-exclusive tagging) | `perc_of_all_values_total(["tom","unaided","aided"])` additive by aligned indices | No explicit total-awareness field | **Partially Aligned** |
| Awareness key mapping flexibility (`tom`, `unaided`, `aided`) | Yes (`awareness_keys` via analytical_mapping + defaults) | Yes (project_inputs mapping in legacy pipeline) | No (hardcoded `aw_q1`, `aw_q2`, `aw_q3`) | **Mismatched** |
| Label threshold metadata (`label_threshold_pct`) | Yes (`0.03` default in metadata) | No web metadata contract (PPT layer differs) | No | **Mismatched** |

## Detailed Notes by Path

### 1) Direct BA Contract (new)

- Source: `backend/analytics_module/aggregator.py` (`brand_awareness_stacked`)
- Key characteristics:
  - Uses `SurveyData.brand_master_list`, `brand_alias_map`, `awareness_keys`
  - Applies respondent-level exclusive waterfall
  - Produces both:
    - object list contract (`data.objects`)
    - stacked chart contract (`data.labels`, `data.datasets`)
  - Adds UX metadata:
    - `series_order`
    - `series_colors`
    - `label_threshold_pct`

### 2) Legacy BA (MySlides + percentages)

- Sources:
  - `backend/analytics_module/src/MySlides/brand_awareness.py`
  - `backend/analytics_module/src/Calculations/percentages.py`
- Key characteristics:
  - BA metrics defined as:
    - `TOM = perc_of_all_values("tom")`
    - `Other-Unaided = perc_of_all_values("unaided")`
    - `Aided = perc_of_all_values("aided")`
    - `Total Awareness = perc_of_all_values_total(["tom","unaided","aided"])`
  - Sort by `Total Awareness`
  - Designed for slide/table DataFrame pipeline, not direct web stacked-bar contract
  - Exclusivity depends on upstream decode logic, not enforced in `perc_of_all_values_total` itself

### 3) Exports BA (`/exports/ba-pf`)

- Source: `backend/routers/exports.py`
- Key characteristics:
  - Hardcoded awareness keys (`aw_q1`, `aw_q2`, `aw_q3`)
  - Exposes respondent-level columns:
    - `TOPOFMIND`
    - `AidedAwareness_<brand>`
    - `UnAidedAwareness_<brand>` where unaided includes TOM (`aw_q1 OR aw_q2`)
  - Does not provide:
    - exclusive waterfall decomposition
    - total-awareness output field
    - chart contract output

## Final Classification Summary

- **Aligned**: none at full semantic+contract parity
- **Partially Aligned**:
  - Total awareness intent exists in direct and legacy
  - Brand-awareness components exist in all paths, but with different decomposition/shape
- **Mismatched**:
  - Web contract shape (stacked bar + object list) is direct-only
  - Exports semantics differ (hardcoded keys, overlap behavior, no total-awareness field)
  - Legacy remains slide-first DataFrame path, not direct web contract

## Recommended Follow-up (No Changes in This Phase)

1. Define a shared BA semantic spec as a single source of truth (waterfall, keys, brand gating).
2. Add a small adapter layer for exports to emit the same BA object contract (in addition to flat columns).
3. Add regression fixtures with 6 respondent edge cases and compare outputs across direct/legacy/exports.

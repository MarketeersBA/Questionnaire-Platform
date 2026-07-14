"""
Staged rollout flags for DB-driven survey modules (Phase 9).

Rollout order:
  1. seed_only          — backend + seed; no user-facing module UI
  2. generic_renderer   — ConfigurableModuleStep / ModuleQuestionRenderer
  3. pf_from_db         — purchase funnel from question_modules / snapshots
  4. usage_pricing      — brand_usage + brand_pricing_behavior modules
  5. analytics_aliases  — ingestor/export alias normalization (backend)
  6. full               — all stages enabled
"""
from __future__ import annotations

import os
from typing import Any, Dict, List

STAGES: List[str] = [
    "seed_only",
    "generic_renderer",
    "pf_from_db",
    "usage_pricing",
    "analytics_aliases",
    "full",
]


def _env_stage() -> str:
    raw = os.getenv("MODULE_ROLLOUT_STAGE", "full").strip().lower()
    return raw if raw in STAGES else "full"


def _stage_index(stage: str) -> int:
    try:
        return STAGES.index(stage)
    except ValueError:
        return STAGES.index("full")


def is_at_least_stage(min_stage: str) -> bool:
    return _stage_index(_env_stage()) >= _stage_index(min_stage)


def is_module_db_seed_enabled() -> bool:
    """Phases 1–2: question_modules collection seeded (always on post-deploy)."""
    return True


def is_generic_renderer_enabled() -> bool:
    """Phase 3: generic module renderer in PublicSurvey."""
    return is_at_least_stage("generic_renderer")


def is_pf_from_db_enabled() -> bool:
    """Phase 4: purchase funnel resolved from DB / module_snapshots."""
    return is_at_least_stage("pf_from_db")


def is_usage_pricing_modules_enabled() -> bool:
    """Phases 5–6: brand_usage + brand_pricing_behavior runtime."""
    return is_at_least_stage("usage_pricing")


def is_analytics_alias_layer_enabled() -> bool:
    """Phase 7: module_answer_aliases in ingestor/exports."""
    return is_at_least_stage("analytics_aliases")


def get_module_rollout_payload() -> Dict[str, Any]:
    stage = _env_stage()
    return {
        "module_rollout_stage": stage,
        "module_db_seed_enabled": is_module_db_seed_enabled(),
        "module_generic_renderer_enabled": is_generic_renderer_enabled(),
        "module_pf_from_db_enabled": is_pf_from_db_enabled(),
        "module_usage_pricing_enabled": is_usage_pricing_modules_enabled(),
        "module_analytics_aliases_enabled": is_analytics_alias_layer_enabled(),
        "rollout_order": STAGES,
    }

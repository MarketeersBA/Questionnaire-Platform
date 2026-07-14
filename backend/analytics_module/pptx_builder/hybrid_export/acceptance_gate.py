from __future__ import annotations

import os
from typing import Any, Dict, List

from ..chart_resolver import PPTXChartResolver
from .rollout import PPTXRolloutStage, resolve_rollout_stage


def _truthy_env(name: str) -> bool:
  return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def evaluate_resolver_acceptance_invariants(
  charts: List[Dict[str, Any]],
  *,
  expected_backend_key,
) -> Dict[str, Any]:
  resolver = PPTXChartResolver()
  failures: List[Dict[str, str]] = []

  for chart in charts:
    chart_id = str(chart.get("chart_id") or "")
    expected_key = expected_backend_key(chart)
    resolution = resolver.resolve(chart)
    if resolution.registry_key != expected_key:
      failures.append(
        {
          "chart_id": chart_id,
          "expected_registry_key": expected_key,
          "actual_registry_key": resolution.registry_key,
        }
      )
    if resolution.uses_fallback_table:
      failures.append(
        {
          "chart_id": chart_id,
          "expected_registry_key": expected_key,
          "actual_registry_key": "fallback_table",
        }
      )

  return {
    "passed": not failures,
    "checked_chart_count": len(charts),
    "failure_count": len(failures),
    "failures": failures,
  }


def acceptance_allows_native_quarantine(
  *,
  rollout_stage: PPTXRolloutStage | None = None,
  resolver_invariants: Dict[str, Any] | None = None,
) -> bool:
  if _truthy_env("PPTX_NATIVE_QUARANTINE_DISABLE"):
    return False

  stage = rollout_stage or resolve_rollout_stage()
  if stage == PPTXRolloutStage.FLAGGED:
    return False

  invariants = resolver_invariants or {}
  if not invariants.get("passed"):
    return False

  if stage == PPTXRolloutStage.DEFAULT:
    return True

  return _truthy_env("PPTX_NATIVE_QUARANTINE")

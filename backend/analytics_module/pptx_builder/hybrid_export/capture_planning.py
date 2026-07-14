from __future__ import annotations

from typing import Any, Dict, List, Optional

from .capture_models import ChartCaptureRequest
from .success_criteria import build_phase0_scope_manifest


def build_capture_requests_from_report(
  report_doc: Dict[str, Any],
  export_request: Optional[Dict[str, Any]] = None,
) -> List[ChartCaptureRequest]:
  manifest = build_phase0_scope_manifest(report_doc, export_request)
  requests: List[ChartCaptureRequest] = []
  for item in manifest.capture_candidates:
    requests.append(
      ChartCaptureRequest(
        chart_id=str(item.get("chart_id") or ""),
        chart_type=str(item.get("chart_type") or "table"),
        chart_title=str(item.get("title") or item.get("chart_id") or "") or None,
      )
    )
  return requests

from __future__ import annotations

from typing import Any, Dict, List, Optional


def is_image_backed_render(journal_entry: Dict[str, Any]) -> bool:
  render_mode = str(journal_entry.get("render_mode") or "")
  registry_key = str(journal_entry.get("registry_key") or "")
  return render_mode == "image_capture" or registry_key == "image_capture"


def index_capture_manifest(
  capture_manifest: Optional[Dict[str, Any]],
) -> Dict[str, Dict[str, Any]]:
  if not capture_manifest:
    return {}

  indexed: Dict[str, Dict[str, Any]] = {}
  for record in capture_manifest.get("captures", []) or []:
    if not isinstance(record, dict):
      continue
    chart_id = str(record.get("chart_id") or "")
    if chart_id:
      indexed[chart_id] = record
  return indexed


def capture_metadata_for_chart(
  chart_id: str,
  capture_manifest: Optional[Dict[str, Any]],
) -> Dict[str, Any]:
  record = index_capture_manifest(capture_manifest).get(chart_id, {})
  return {
    "chart_id": chart_id,
    "capture_status": record.get("status"),
    "capture_error": record.get("error"),
    "viewport_url": record.get("viewport_url"),
    "theme": record.get("theme"),
    "frame": record.get("frame"),
    "image_path": record.get("image_path"),
    "image_bytes": record.get("image_bytes"),
    "image_width": record.get("width"),
    "image_height": record.get("height"),
    "attempts": record.get("attempts"),
    "duration_ms": record.get("duration_ms"),
  }


def summarize_capture_manifest(capture_manifest: Optional[Dict[str, Any]]) -> Dict[str, Any]:
  captures = list((capture_manifest or {}).get("captures", []) or [])
  success_count = sum(1 for item in captures if item.get("status") == "success")
  failure_count = sum(1 for item in captures if item.get("status") != "success")
  return {
    "capture_candidate_count": len(captures),
    "capture_success_count": success_count,
    "capture_failure_count": failure_count,
    "artifact_root": (capture_manifest or {}).get("artifact_root"),
  }


def evaluate_image_backed_forensics(
  *,
  journal_entry: Dict[str, Any],
  slide_summary: Dict[str, Any],
  capture_record: Optional[Dict[str, Any]],
) -> List[str]:
  blocked_reasons: List[str] = []
  render_status = journal_entry.get("render_status")

  if render_status in {"failed", "skipped_empty_data"}:
    blocked_reasons.append(str(render_status))
  if slide_summary.get("has_error_placeholder"):
    blocked_reasons.append("analysis_interrupted")

  if capture_record and capture_record.get("status") != "success":
    blocked_reasons.append(str(capture_record.get("error") or "capture_failed"))

  if render_status == "rendered":
    picture_count = int(slide_summary.get("picture_count", 0))
    if picture_count <= 0 and not slide_summary.get("has_error_placeholder"):
      blocked_reasons.append("missing_captured_image_shape")
  elif render_status not in {"rendered", "failed", "skipped_empty_data"}:
    blocked_reasons.append("missing_render_status")

  return blocked_reasons


def evaluate_download_readiness(
  *,
  export_manifest: Dict[str, Any],
  pptx_path: Optional[str],
) -> Dict[str, Any]:
  issues: List[str] = []
  if not pptx_path:
    issues.append("missing_pptx_path")
  if not export_manifest.get("passes_gate"):
    issues.append("validation_gate_failed")
  if export_manifest.get("failed_chart_count", 0) > 0:
    issues.append("failed_chart_renders_present")
  capture_summary = export_manifest.get("capture_validation", {})
  if capture_summary.get("capture_failure_count", 0) > 0:
    issues.append("capture_failures_present")

  return {
    "ready_for_download": not issues,
    "issues": issues,
  }

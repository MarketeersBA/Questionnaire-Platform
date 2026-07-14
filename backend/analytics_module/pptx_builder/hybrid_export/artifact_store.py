from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any, Dict, List

from .capture_config import resolve_capture_artifact_dir
from .capture_models import BrowserCaptureManifest


def cleanup_capture_artifacts(output_root: Path, report_id: str) -> None:
  artifact_dir = resolve_capture_artifact_dir(output_root, report_id)
  if artifact_dir.exists():
    shutil.rmtree(artifact_dir, ignore_errors=True)


def apply_capture_manifest_to_report(
  report_doc: Dict[str, Any],
  manifest: BrowserCaptureManifest,
) -> Dict[str, Any]:
  capture_by_id = {
    record.chart_id: record
    for record in manifest.captures
    if record.status == "success" and record.image_path
  }

  charts = report_doc.get("charts", []) or []
  for chart in charts:
    if not isinstance(chart, dict):
      continue
    chart_id = str(chart.get("chart_id") or "")
    record = capture_by_id.get(chart_id)
    if not record:
      continue
    chart["pptx_capture_path"] = record.image_path
    chart["pptx_capture_status"] = record.status
    chart["pptx_capture_width"] = record.width
    chart["pptx_capture_height"] = record.height

  return report_doc


def capture_manifest_metadata(manifest: BrowserCaptureManifest) -> Dict[str, Any]:
  payload = manifest.as_dict()
  payload["captures"] = [
    {
      **record.as_dict(),
      "image_path": record.image_path,
    }
    for record in manifest.captures
  ]
  return payload


def failed_capture_records(manifest: BrowserCaptureManifest) -> List[Dict[str, Any]]:
  failures = []
  for record in manifest.captures:
    if record.status == "success":
      continue
    payload = record.as_dict()
    if record.diagnostic_bundle_path:
      payload["diagnostic_bundle_path"] = record.diagnostic_bundle_path
    failures.append(payload)
  return failures

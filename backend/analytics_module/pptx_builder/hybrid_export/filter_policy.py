from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, Optional


EXPORT_DATASET_BASE_REPORT = "base_report"
EXPORT_DATASET_PERSISTED_SLICE = "persisted_slice"


@dataclass(frozen=True)
class FilterPolicy:
  include_ephemeral_ui_filters: bool
  require_persisted_slice_payload: bool
  persisted_slice_field: str
  description: str

  def as_dict(self) -> Dict[str, object]:
    return {
      "include_ephemeral_ui_filters": self.include_ephemeral_ui_filters,
      "require_persisted_slice_payload": self.require_persisted_slice_payload,
      "persisted_slice_field": self.persisted_slice_field,
      "description": self.description,
    }


PHASE0_FILTER_POLICY = FilterPolicy(
  include_ephemeral_ui_filters=False,
  require_persisted_slice_payload=True,
  persisted_slice_field="export_slice",
  description=(
    "Phase 0 exports the persisted base report only. "
    "Ephemeral UI filters are ignored unless a persisted slice payload is attached to the export request."
  ),
)


def resolve_export_dataset(
  report_doc: Dict[str, Any],
  export_request: Optional[Dict[str, Any]] = None,
) -> str:
  export_request = export_request or {}
  slice_payload = export_request.get(PHASE0_FILTER_POLICY.persisted_slice_field)
  if slice_payload:
    return EXPORT_DATASET_PERSISTED_SLICE
  if report_doc.get(PHASE0_FILTER_POLICY.persisted_slice_field):
    return EXPORT_DATASET_PERSISTED_SLICE
  return EXPORT_DATASET_BASE_REPORT

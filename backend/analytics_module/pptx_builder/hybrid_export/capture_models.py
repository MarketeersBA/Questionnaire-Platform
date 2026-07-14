from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import Any, Dict, List, Optional


@dataclass(frozen=True)
class CaptureSessionContext:
  auth_token: Optional[str] = None
  local_storage: Dict[str, str] = field(default_factory=dict)
  role: Optional[str] = None
  # Provenance for logging/diagnostics (not injected into localStorage).
  source: Optional[str] = None
  survey_id: Optional[str] = None
  report_id: Optional[str] = None
  job_id: Optional[str] = None

  def storage_entries(self) -> Dict[str, str]:
    entries = dict(self.local_storage)
    if self.auth_token:
      entries.setdefault("token", self.auth_token)
    if self.role:
      entries.setdefault("role", self.role)
    return entries


@dataclass(frozen=True)
class ChartCaptureRequest:
  chart_id: str
  chart_type: str
  chart_title: Optional[str] = None
  theme: Optional[str] = None
  frame: Optional[str] = None


@dataclass(frozen=True)
class ChartCaptureRecord:
  chart_id: str
  chart_type: str
  status: str
  image_path: Optional[str]
  image_bytes: Optional[int]
  width: Optional[int]
  height: Optional[int]
  viewport_url: str
  theme: str
  frame: str
  attempts: int
  error: Optional[str]
  duration_ms: int
  failure_kind: Optional[str] = None
  diagnostic_bundle_path: Optional[str] = None

  def as_dict(self) -> Dict[str, Any]:
    return asdict(self)


@dataclass(frozen=True)
class BrowserCaptureManifest:
  report_id: str
  survey_id: str
  artifact_root: str
  captures: List[ChartCaptureRecord] = field(default_factory=list)

  @property
  def success_count(self) -> int:
    return sum(1 for item in self.captures if item.status == "success")

  @property
  def failure_count(self) -> int:
    return sum(1 for item in self.captures if item.status != "success")

  def as_dict(self) -> Dict[str, Any]:
    return {
      "report_id": self.report_id,
      "survey_id": self.survey_id,
      "artifact_root": self.artifact_root,
      "success_count": self.success_count,
      "failure_count": self.failure_count,
      "captures": [item.as_dict() for item in self.captures],
    }

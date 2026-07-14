"""Frozen Phase 0 scope and success criteria for hybrid PPTX export."""

from .capture_session import (
    CAPTURE_SESSION_SOURCE_ENV_OVERRIDE,
    CAPTURE_SESSION_SOURCE_MINTED,
    CaptureSessionResolution,
    capture_auth_token_override_enabled,
    resolve_capture_session_for_batch,
)
from .capture_auth import (
    CAPTURE_TOKEN_PURPOSE,
    CAPTURE_TOKEN_SUBJECT,
    CaptureAuthError,
    CaptureTokenClaims,
    CaptureTokenSettings,
    build_capture_session_context,
    capture_token_ttl_seconds,
    create_capture_access_token,
    decode_capture_access_token,
)
from .capture_config import BrowserCaptureConfig, resolve_capture_artifact_dir
from .capture_models import (
    BrowserCaptureManifest,
    CaptureSessionContext,
    ChartCaptureRecord,
    ChartCaptureRequest,
)
from .capture_planning import build_capture_requests_from_report
from .acceptance_gate import acceptance_allows_native_quarantine, evaluate_resolver_acceptance_invariants
from .migration_comparison import (
  build_migration_comparison_manifest,
  build_pipeline_render_snapshot,
  compare_pipeline_snapshots,
)
from .native_builder_policy import (
  FROZEN_NATIVE_PILOT_REGISTRY_KEYS,
  evaluate_native_builder_expansion,
  is_intentional_editable_slide,
  is_native_builder_quarantined,
  should_prefer_hybrid_render,
  summarize_native_builder_policy,
)
from .orchestration import HybridExportOrchestrator
from .progress import PPTXExportStage, STAGE_PROGRESS
from .render_mode import PPTXRenderMode, resolve_render_mode
from .rollout import PPTXRolloutStage, describe_rollout_policy, resolve_rollout_stage
from .capture_defaults import (
    CAPTURE_DEFAULTS,
    CaptureDefaults,
    chart_body_capture_pixels,
    chart_body_viewport_pixels,
    slide_canvas_pixels,
)
from .filter_policy import (
    EXPORT_DATASET_BASE_REPORT,
    EXPORT_DATASET_PERSISTED_SLICE,
    FilterPolicy,
    resolve_export_dataset,
)
from .pilot_catalog import (
    PILOT_CHART_FAMILIES,
    PILOT_CHART_IDS,
    PilotChartFamily,
    pilot_family_for_chart,
)
from .scope import (
    ExportTarget,
    SlideRenderMode,
    classify_intent_render_mode,
    is_chart_capture_candidate,
    narrative_slide_types,
)
from .success_criteria import (
    Phase0ScopeManifest,
    build_phase0_scope_manifest,
    evaluate_phase0_readiness,
)

__all__ = [
    "CAPTURE_SESSION_SOURCE_ENV_OVERRIDE",
    "CAPTURE_SESSION_SOURCE_MINTED",
    "CAPTURE_TOKEN_PURPOSE",
    "CAPTURE_TOKEN_SUBJECT",
    "CaptureSessionResolution",
    "BrowserCaptureConfig",
    "BrowserCaptureManifest",
    "CaptureAuthError",
    "CaptureSessionContext",
    "CaptureTokenClaims",
    "CaptureTokenSettings",
    "ChartCaptureRecord",
    "ChartCaptureRequest",
    "CAPTURE_DEFAULTS",
    "CaptureDefaults",
    "EXPORT_DATASET_BASE_REPORT",
    "EXPORT_DATASET_PERSISTED_SLICE",
    "ExportTarget",
    "FROZEN_NATIVE_PILOT_REGISTRY_KEYS",
    "HybridExportOrchestrator",
    "PPTXExportStage",
    "PPTXRenderMode",
    "PPTXRolloutStage",
    "PILOT_CHART_FAMILIES",
    "PILOT_CHART_IDS",
    "Phase0ScopeManifest",
    "PilotChartFamily",
    "SlideRenderMode",
    "acceptance_allows_native_quarantine",
    "build_capture_requests_from_report",
    "build_capture_session_context",
    "capture_auth_token_override_enabled",
    "capture_token_ttl_seconds",
    "create_capture_access_token",
    "decode_capture_access_token",
    "build_migration_comparison_manifest",
    "build_phase0_scope_manifest",
    "build_pipeline_render_snapshot",
    "chart_body_capture_pixels",
    "chart_body_viewport_pixels",
    "classify_intent_render_mode",
    "compare_pipeline_snapshots",
    "describe_rollout_policy",
    "evaluate_native_builder_expansion",
    "evaluate_phase0_readiness",
    "evaluate_resolver_acceptance_invariants",
    "is_chart_capture_candidate",
    "is_intentional_editable_slide",
    "is_native_builder_quarantined",
    "narrative_slide_types",
    "pilot_family_for_chart",
    "resolve_capture_artifact_dir",
    "resolve_capture_session_for_batch",
    "resolve_render_mode",
    "resolve_rollout_stage",
    "resolve_export_dataset",
    "should_prefer_hybrid_render",
    "slide_canvas_pixels",
    "summarize_native_builder_policy",
    "STAGE_PROGRESS",
]

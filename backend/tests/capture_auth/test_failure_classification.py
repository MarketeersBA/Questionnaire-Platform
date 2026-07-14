"""Phase 6 — preflight errors classify to auth-specific export codes."""
from __future__ import annotations

from backend.analytics_module.pptx_builder.hybrid_export.capture_preflight import (
    CaptureEnvironmentError,
    CapturePreflightIssue,
)
from backend.analytics_module.pptx_builder.hybrid_export.pptx_failure import (
    ERROR_AUTH_INVALID,
    ERROR_CAPTURE_AUTH_DENIED,
    classify_pptx_failure,
)


def test_classify_preflight_auth_invalid():
    exc = CaptureEnvironmentError(
        [
            CapturePreflightIssue(
                code=ERROR_AUTH_INVALID,
                message="Capture token was rejected",
                remediation="Fix SECRET_KEY",
            )
        ]
    )
    code, _, _, guidance = classify_pptx_failure(exc, stage="capturing_charts")
    assert code == ERROR_AUTH_INVALID
    assert "SECRET_KEY" in guidance


def test_classify_preflight_capture_auth_denied():
    exc = CaptureEnvironmentError(
        [
            CapturePreflightIssue(
                code=ERROR_CAPTURE_AUTH_DENIED,
                message="Forbidden",
                remediation="Deploy Phase 2",
            )
        ]
    )
    code, _, _, _ = classify_pptx_failure(exc, stage="capturing_charts")
    assert code == ERROR_CAPTURE_AUTH_DENIED

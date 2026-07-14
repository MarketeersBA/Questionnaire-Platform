"""Phase 4 — failure classification, timeouts, and structured errors."""
import asyncio

from backend.analytics_module.pptx_builder.hybrid_export.export_timeouts import (
    PptxExportTimeouts,
)
from backend.analytics_module.pptx_builder.hybrid_export.pptx_failure import (
    ERROR_AUTH_INVALID,
    ERROR_AUTH_MISSING,
    ERROR_CAPTURE_AUTH_DENIED,
    ERROR_CANCELLED,
    ERROR_CAPTURE_TIMEOUT,
    ERROR_ENGINE_ERROR,
    ERROR_EXPORT_TIMEOUT,
    ERROR_FRONTEND_NOT_READY,
    ERROR_STORAGE_ERROR,
    ERROR_VALIDATION_FAILED,
    ERROR_WORKER_INTERRUPTED,
    PptxExportCancelled,
    PptxExportTimeout,
    build_classified_error,
    classify_pptx_failure,
    retry_guidance_for_code,
)
from backend.utils.pptx_job_state import build_structured_error


def test_classify_cancelled():
    code, msg, retryable, guidance = classify_pptx_failure(
        PptxExportCancelled(stage="capturing_charts")
    )
    assert code == ERROR_CANCELLED
    assert retryable is True
    assert "cancel" in guidance.lower() or "new export" in guidance.lower()


def test_classify_capture_timeout():
    exc = PptxExportTimeout("capturing_charts", 90)
    code, _, retryable, _ = classify_pptx_failure(exc, stage="capturing_charts")
    assert code == ERROR_CAPTURE_TIMEOUT
    assert retryable is True


def test_classify_export_timeout_non_capture():
    exc = PptxExportTimeout("assembling_deck", 600)
    code, _, _, _ = classify_pptx_failure(exc, stage="assembling_deck")
    assert code == ERROR_EXPORT_TIMEOUT


def test_classify_frontend_not_ready():
    exc = RuntimeError("frame_not_ready: __export_ready__ never set")
    code, _, _, guidance = classify_pptx_failure(exc, stage="capturing_charts")
    assert code == ERROR_FRONTEND_NOT_READY
    assert guidance


def test_classify_auth_missing():
    exc = RuntimeError("[auth_missing] PPTX_CAPTURE_AUTH_TOKEN is not set")
    code, _, _, _ = classify_pptx_failure(exc)
    assert code == ERROR_AUTH_MISSING


def test_classify_auth_invalid_401():
    exc = RuntimeError("401 unauthorized — capture token rejected")
    code, _, _, _ = classify_pptx_failure(exc, stage="capturing_charts")
    assert code == ERROR_AUTH_INVALID


def test_classify_capture_auth_denied_403():
    exc = RuntimeError("403 forbidden from report API")
    code, _, _, _ = classify_pptx_failure(exc, stage="capturing_charts")
    assert code == ERROR_CAPTURE_AUTH_DENIED


def test_classify_validation_failed():
    exc = ValueError("Integrity validation failed forensic gate")
    code, _, _, _ = classify_pptx_failure(exc, stage="validating")
    assert code == ERROR_VALIDATION_FAILED


def test_classify_storage_error():
    exc = OSError("No space left on device")
    code, _, _, _ = classify_pptx_failure(exc, stage="ready")
    assert code == ERROR_STORAGE_ERROR


def test_classify_worker_interrupted():
    exc = RuntimeError("Job marked stale — worker interrupted")
    code, _, _, _ = classify_pptx_failure(exc)
    assert code == ERROR_WORKER_INTERRUPTED


def test_classify_asyncio_timeout_capture_stage():
    code, _, _, _ = classify_pptx_failure(
        asyncio.TimeoutError(), stage="capturing_charts"
    )
    assert code == ERROR_CAPTURE_TIMEOUT


def test_classify_generic_engine():
    code, _, _, _ = classify_pptx_failure(Exception("boom"), stage="preparing")
    assert code == ERROR_ENGINE_ERROR


def test_build_classified_error_includes_retry_guidance():
    payload = build_classified_error(
        PptxExportCancelled(),
        stage="capturing_charts",
        chart_id="chart_1",
    )
    assert payload["code"] == ERROR_CANCELLED
    assert payload["stage"] == "capturing_charts"
    assert payload["chart_id"] == "chart_1"
    assert payload["retry_guidance"]


def test_build_structured_error_uses_guidance_helper():
    err = build_structured_error(
        code=ERROR_CAPTURE_TIMEOUT,
        message="Timed out",
        stage="capturing_charts",
    )
    assert err["retry_guidance"] == retry_guidance_for_code(ERROR_CAPTURE_TIMEOUT, True)


def test_export_timeouts_stage_mapping():
    t = PptxExportTimeouts(
        total_export=3600,
        capture_batch=1200,
        per_chart=90,
        preparing=300,
        assembling=600,
        validating=300,
    )
    assert t.stage_timeout("capturing_charts") == 1200
    assert t.stage_timeout("assembling_deck") == 600
    assert t.stage_timeout("validating") == 300

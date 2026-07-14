"""Phase 3 — per-batch capture session resolution."""
from __future__ import annotations

import os

import pytest

from backend.analytics_module.pptx_builder.hybrid_export.capture_auth import (
    CAPTURE_TOKEN_SUBJECT,
    create_capture_access_token,
    decode_capture_access_token,
)
from backend.analytics_module.pptx_builder.hybrid_export.capture_session import (
    CAPTURE_SESSION_SOURCE_ENV_OVERRIDE,
    CAPTURE_SESSION_SOURCE_MINTED,
    CAPTURE_SESSION_SOURCE_PROVIDED,
    capture_auth_token_override_enabled,
    resolve_capture_session_for_batch,
)
from backend.config import settings


@pytest.fixture(autouse=True)
def _secret_key(monkeypatch):
    monkeypatch.setattr(settings, "SECRET_KEY", "test-secret-phase3")
    monkeypatch.setattr(settings, "ALGORITHM", "HS256")
    monkeypatch.delenv("PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE", raising=False)
    monkeypatch.delenv("PPTX_CAPTURE_AUTH_TOKEN", raising=False)


def test_default_path_mints_fresh_token():
    resolution = resolve_capture_session_for_batch(
        survey_id="survey-abc",
        report_id="report-1",
        job_id="job-9",
    )
    assert resolution.source == CAPTURE_SESSION_SOURCE_MINTED
    assert resolution.ttl_seconds is not None
    session = resolution.session
    assert session.source == CAPTURE_SESSION_SOURCE_MINTED
    assert session.survey_id == "survey-abc"
    assert session.report_id == "report-1"
    assert session.job_id == "job-9"

    entries = session.storage_entries()
    assert entries["token"]
    assert entries["role"] in {"admin", "analyst"}

    claims = decode_capture_access_token(
        entries["token"],
        expected_survey_id="survey-abc",
    )
    assert claims.subject == CAPTURE_TOKEN_SUBJECT
    assert claims.report_id == "report-1"
    assert claims.job_id == "job-9"


def test_each_batch_gets_distinct_token():
    first = resolve_capture_session_for_batch(survey_id="s1", job_id="job-a").session.auth_token
    second = resolve_capture_session_for_batch(survey_id="s1", job_id="job-b").session.auth_token
    assert first and second
    assert first != second


def test_env_override_requires_flag(monkeypatch):
    monkeypatch.setenv("PPTX_CAPTURE_AUTH_TOKEN", "x" * 40)
    assert not capture_auth_token_override_enabled()
    resolution = resolve_capture_session_for_batch(survey_id="s1")
    assert resolution.source == CAPTURE_SESSION_SOURCE_MINTED


def test_env_override_uses_static_token(monkeypatch):
    static = create_capture_access_token(survey_id="s1", role="analyst")
    monkeypatch.setenv("PPTX_CAPTURE_AUTH_TOKEN", static)
    monkeypatch.setenv("PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE", "true")

    resolution = resolve_capture_session_for_batch(survey_id="s1")
    assert resolution.source == CAPTURE_SESSION_SOURCE_ENV_OVERRIDE
    assert resolution.session.auth_token == static
    assert resolution.session.storage_entries()["token"] == static


def test_orchestration_run_capture_batch_mints_session(monkeypatch):
    from backend.analytics_module.pptx_builder.hybrid_export.capture_models import (
        BrowserCaptureManifest,
    )
    from backend.analytics_module.pptx_builder.hybrid_export.orchestration import (
        HybridExportOrchestrator,
    )
    from backend.analytics_module.pptx_builder.hybrid_export.render_mode import (
        PPTXRenderMode,
    )

    captured: dict = {}

    class _FakeWorker:
        def capture_batch(self, **kwargs):
            captured.update(kwargs)
            return BrowserCaptureManifest(
                report_id=kwargs["report_id"],
                survey_id=kwargs["survey_id"],
                artifact_root="/tmp",
                captures=[],
            )

    orch = HybridExportOrchestrator(
        output_root=__import__("pathlib").Path("."),
        worker=_FakeWorker(),
        render_mode=PPTXRenderMode.HYBRID,
    )
    orch.run_capture_batch(
        "report-99",
        "survey-88",
        [],
        job_id="job-77",
        skip_preflight=True,
    )
    session = captured["session"]
    assert session.source == CAPTURE_SESSION_SOURCE_MINTED
    assert session.survey_id == "survey-88"
    assert session.report_id == "report-99"
    assert session.job_id == "job-77"
    assert session.storage_entries()["token"]


def test_caller_provided_session_passthrough():
    from backend.analytics_module.pptx_builder.hybrid_export.capture_models import (
        CaptureSessionContext,
    )

    provided = CaptureSessionContext(
        auth_token="caller-token",
        role="admin",
        source="provided",
    )
    resolution = resolve_capture_session_for_batch(
        survey_id="s1",
        session=provided,
    )
    assert resolution.source == CAPTURE_SESSION_SOURCE_PROVIDED
    assert resolution.session.auth_token == "caller-token"

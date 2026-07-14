"""Phase 1 — server-owned PPTX capture access tokens."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from backend.analytics_module.pptx_builder.hybrid_export.capture_auth import (
    ALLOWED_CAPTURE_ROLES,
    CAPTURE_TOKEN_AUDIENCE,
    CAPTURE_TOKEN_PURPOSE,
    CAPTURE_TOKEN_SUBJECT,
    CaptureAuthError,
    CaptureTokenExpiredError,
    CaptureTokenInvalidError,
    CaptureTokenSettings,
    CaptureTokenSurveyMismatchError,
    build_capture_session_context,
    create_capture_access_token,
    decode_capture_access_token,
)
from backend.config import settings


@pytest.fixture(autouse=True)
def _secret_key(monkeypatch):
    monkeypatch.setattr(settings, "SECRET_KEY", "test-secret-key-for-capture-phase1")
    monkeypatch.setattr(settings, "ALGORITHM", "HS256")


def test_create_token_embeds_required_claims():
    token = create_capture_access_token(
        survey_id="69f86a4564a3943cd07f8cc6",
        role="analyst",
        report_id="69f86a80d15ab61175e4283c",
        job_id="job-abc",
        expires_minutes=15,
        token_settings=CaptureTokenSettings(
            ttl_minutes=20,
            default_role="admin",
            audience=CAPTURE_TOKEN_AUDIENCE,
        ),
    )

    claims = decode_capture_access_token(
        token,
        expected_survey_id="69f86a4564a3943cd07f8cc6",
    )

    assert claims.subject == CAPTURE_TOKEN_SUBJECT
    assert claims.purpose == CAPTURE_TOKEN_PURPOSE
    assert claims.role == "analyst"
    assert claims.survey_id == "69f86a4564a3943cd07f8cc6"
    assert claims.report_id == "69f86a80d15ab61175e4283c"
    assert claims.job_id == "job-abc"
    assert claims.expires_at is not None


def test_expired_token_raises():
    past = datetime.now(timezone.utc) - timedelta(minutes=5)
    payload = {
        "sub": CAPTURE_TOKEN_SUBJECT,
        "purpose": CAPTURE_TOKEN_PURPOSE,
        "aud": CAPTURE_TOKEN_AUDIENCE,
        "role": "admin",
        "survey_id": "survey-1",
        "exp": past,
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    with pytest.raises(CaptureTokenExpiredError):
        decode_capture_access_token(token, expected_survey_id="survey-1")


def test_wrong_purpose_rejected():
    payload = {
        "sub": CAPTURE_TOKEN_SUBJECT,
        "purpose": "other-purpose",
        "role": "admin",
        "survey_id": "survey-1",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    with pytest.raises(CaptureTokenInvalidError):
        decode_capture_access_token(token)


def test_survey_mismatch_raises():
    token = create_capture_access_token(
        survey_id="survey-a",
        role="admin",
        expires_minutes=20,
    )

    with pytest.raises(CaptureTokenSurveyMismatchError):
        decode_capture_access_token(token, expected_survey_id="survey-b")


def test_invalid_role_on_mint():
    with pytest.raises(CaptureAuthError):
        create_capture_access_token(survey_id="s1", role="client")


@pytest.mark.parametrize("role", sorted(ALLOWED_CAPTURE_ROLES))
def test_allowed_roles(role: str):
    token = create_capture_access_token(survey_id="s1", role=role, expires_minutes=20)
    claims = decode_capture_access_token(token, expected_survey_id="s1")
    assert claims.role == role


def test_ttl_clamped_from_env(monkeypatch):
    monkeypatch.setenv("PPTX_CAPTURE_TOKEN_TTL_MINUTES", "5")
    cfg = CaptureTokenSettings.from_env()
    assert cfg.ttl_minutes == 10

    monkeypatch.setenv("PPTX_CAPTURE_TOKEN_TTL_MINUTES", "120")
    cfg = CaptureTokenSettings.from_env()
    assert cfg.ttl_minutes == 30


def test_build_capture_session_context_injects_storage():
    ctx = build_capture_session_context(
        survey_id="survey-xyz",
        role="admin",
        report_id="report-1",
    )
    entries = ctx.storage_entries()
    assert "token" in entries
    assert entries["token"]
    assert entries["role"] == "admin"
    claims = decode_capture_access_token(
        entries["token"],
        expected_survey_id="survey-xyz",
    )
    assert claims.role == "admin"

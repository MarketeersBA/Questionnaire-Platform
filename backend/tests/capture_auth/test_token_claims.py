"""Phase 6 — capture token minting, claims, and expiration."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from jose import jwt

from backend.analytics_module.pptx_builder.hybrid_export.capture_auth import (
    CAPTURE_TOKEN_PURPOSE,
    CAPTURE_TOKEN_SUBJECT,
    CaptureTokenExpiredError,
    CaptureTokenInvalidError,
    CaptureTokenSurveyMismatchError,
    create_capture_access_token,
    decode_capture_access_token,
)
from backend.config import settings
from backend.tests.capture_auth.conftest import SURVEY_MATCH, SURVEY_OTHER


def test_minted_token_carries_required_claims(bearer_capture_token):
    token = bearer_capture_token(
        survey_id=SURVEY_MATCH,
        role="analyst",
        report_id="report-abc",
    )
    claims = decode_capture_access_token(token, expected_survey_id=SURVEY_MATCH)

    assert claims.subject == CAPTURE_TOKEN_SUBJECT
    assert claims.purpose == CAPTURE_TOKEN_PURPOSE
    assert claims.role == "analyst"
    assert claims.survey_id == SURVEY_MATCH
    assert claims.report_id == "report-abc"
    assert claims.expires_at is not None


def test_expiration_within_configured_ttl_window(bearer_capture_token):
    token = bearer_capture_token(survey_id=SURVEY_MATCH, expires_minutes=15)
    payload = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
        options={"verify_aud": False},
    )
    exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
    now = datetime.now(timezone.utc)
    assert now < exp <= now + timedelta(minutes=16)


def test_expired_token_rejected(bearer_capture_token):
    token = bearer_capture_token(survey_id=SURVEY_MATCH, expires_minutes=15)
    payload = jwt.decode(
        token,
        settings.SECRET_KEY,
        algorithms=[settings.ALGORITHM],
        options={"verify_aud": False, "verify_exp": False},
    )
    payload["exp"] = datetime.now(timezone.utc) - timedelta(minutes=1)
    expired = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)

    with pytest.raises(CaptureTokenExpiredError):
        decode_capture_access_token(expired, expected_survey_id=SURVEY_MATCH)


def test_wrong_survey_rejected_at_decode(bearer_capture_token):
    token = bearer_capture_token(survey_id=SURVEY_MATCH)
    with pytest.raises(CaptureTokenSurveyMismatchError):
        decode_capture_access_token(token, expected_survey_id=SURVEY_OTHER)


def test_invalid_purpose_rejected():
    payload = {
        "sub": CAPTURE_TOKEN_SUBJECT,
        "purpose": "not_capture",
        "role": "admin",
        "survey_id": SURVEY_MATCH,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=10),
    }
    token = jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)
    with pytest.raises(CaptureTokenInvalidError):
        decode_capture_access_token(token)

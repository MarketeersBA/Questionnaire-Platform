"""
Server-owned JWTs for headless PPTX browser capture (Phase 1).

Playwright injects the returned bearer token into ``localStorage`` as ``token``,
matching the frontend Axios interceptor in ``frontend/src/services/api.ts``.
No static user login JWT should be copied into ``PPTX_CAPTURE_AUTH_TOKEN`` for
normal operation — workers mint a fresh token per export job.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from jose import JWTError, jwt

from backend.config import settings

from .capture_models import CaptureSessionContext

# Claim contract — must stay stable across worker, API, and tests.
CAPTURE_TOKEN_SUBJECT = "pptx-capture"
CAPTURE_TOKEN_PURPOSE = "pptx_capture"
CAPTURE_TOKEN_AUDIENCE = "pptx-export-capture"

ALLOWED_CAPTURE_ROLES = frozenset({"admin", "analyst"})

# Error codes (aligned with pptx_failure taxonomy for later phases).
CODE_CAPTURE_AUTH_INVALID = "capture_auth_invalid"
CODE_CAPTURE_AUTH_EXPIRED = "capture_auth_expired"
CODE_CAPTURE_AUTH_SURVEY_MISMATCH = "capture_auth_survey_mismatch"
CODE_CAPTURE_AUTH_CONFIG = "capture_auth_config"


class CaptureAuthError(Exception):
    """Base error for capture-token minting or validation."""

    def __init__(
        self,
        message: str,
        *,
        code: str = CODE_CAPTURE_AUTH_INVALID,
        details: Optional[Dict[str, Any]] = None,
    ):
        super().__init__(message)
        self.code = code
        self.details = details or {}


class CaptureTokenExpiredError(CaptureAuthError):
    def __init__(self, message: str = "Capture access token has expired"):
        super().__init__(message, code=CODE_CAPTURE_AUTH_EXPIRED)


class CaptureTokenInvalidError(CaptureAuthError):
    pass


class CaptureTokenSurveyMismatchError(CaptureAuthError):
    pass


@dataclass(frozen=True)
class CaptureTokenClaims:
    """Validated claims extracted from a capture JWT."""

    subject: str
    purpose: str
    role: str
    survey_id: str
    report_id: Optional[str] = None
    job_id: Optional[str] = None
    expires_at: Optional[datetime] = None

    def as_dict(self) -> Dict[str, Any]:
        return {
            "sub": self.subject,
            "purpose": self.purpose,
            "role": self.role,
            "survey_id": self.survey_id,
            "report_id": self.report_id,
            "job_id": self.job_id,
            "exp": self.expires_at.isoformat() if self.expires_at else None,
        }


@dataclass(frozen=True)
class CaptureTokenSettings:
    """TTL and role defaults for minting capture tokens."""

    ttl_minutes: int
    default_role: str
    audience: str

    @classmethod
    def from_env(cls) -> "CaptureTokenSettings":
        raw_ttl = os.environ.get("PPTX_CAPTURE_TOKEN_TTL_MINUTES", "20")
        try:
            ttl = int(raw_ttl)
        except ValueError:
            ttl = 20
        ttl = max(10, min(30, ttl))

        role = (os.environ.get("PPTX_CAPTURE_AUTH_ROLE") or "admin").strip().lower()
        if role not in ALLOWED_CAPTURE_ROLES:
            role = "admin"

        audience = (
            os.environ.get("PPTX_CAPTURE_TOKEN_AUDIENCE") or CAPTURE_TOKEN_AUDIENCE
        ).strip()

        return cls(ttl_minutes=ttl, default_role=role, audience=audience)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _require_secret_key() -> str:
    key = (settings.SECRET_KEY or "").strip()
    if not key:
        raise CaptureAuthError(
            "SECRET_KEY is not configured; cannot mint capture tokens.",
            code=CODE_CAPTURE_AUTH_CONFIG,
        )
    return key


def _normalize_survey_id(survey_id: str) -> str:
    normalized = str(survey_id or "").strip()
    if not normalized:
        raise CaptureAuthError(
            "survey_id is required to mint a capture access token.",
            code=CODE_CAPTURE_AUTH_INVALID,
        )
    return normalized


def _normalize_role(role: str) -> str:
    normalized = (role or "").strip().lower()
    if normalized not in ALLOWED_CAPTURE_ROLES:
        raise CaptureAuthError(
            f"Capture role must be one of {sorted(ALLOWED_CAPTURE_ROLES)}; got {role!r}.",
            code=CODE_CAPTURE_AUTH_INVALID,
        )
    return normalized


def create_capture_access_token(
    *,
    survey_id: str,
    role: Optional[str] = None,
    report_id: Optional[str] = None,
    job_id: Optional[str] = None,
    expires_minutes: Optional[int] = None,
    token_settings: Optional[CaptureTokenSettings] = None,
) -> str:
    """
    Mint a short-lived JWT for Playwright export-frame access.

    The token is scoped to ``survey_id`` and carries analyst/admin ``role`` so
    protected report APIs authorize chart data loading during capture.
    """
    cfg = token_settings or CaptureTokenSettings.from_env()
    resolved_role = _normalize_role(role or cfg.default_role)
    resolved_survey = _normalize_survey_id(survey_id)
    ttl = expires_minutes if expires_minutes is not None else cfg.ttl_minutes
    ttl = max(10, min(30, int(ttl)))

    expire = _utc_now() + timedelta(minutes=ttl)
    payload: Dict[str, Any] = {
        "sub": CAPTURE_TOKEN_SUBJECT,
        "purpose": CAPTURE_TOKEN_PURPOSE,
        "aud": cfg.audience,
        "role": resolved_role,
        "survey_id": resolved_survey,
        "exp": expire,
    }
    if report_id:
        payload["report_id"] = str(report_id).strip()
    if job_id:
        payload["job_id"] = str(job_id).strip()

    return jwt.encode(payload, _require_secret_key(), algorithm=settings.ALGORITHM)


def decode_capture_access_token(
    token: str,
    *,
    expected_survey_id: Optional[str] = None,
) -> CaptureTokenClaims:
    """
    Decode and validate a capture JWT.

    Raises :class:`CaptureTokenExpiredError`, :class:`CaptureTokenInvalidError`,
    or :class:`CaptureTokenSurveyMismatchError` on failure.
    """
    if not (token or "").strip():
        raise CaptureTokenInvalidError(
            "Capture access token is empty.",
            code=CODE_CAPTURE_AUTH_INVALID,
        )

    try:
        payload = jwt.decode(
            token.strip(),
            _require_secret_key(),
            algorithms=[settings.ALGORITHM],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError as exc:
        raise CaptureTokenExpiredError(
            "Capture access token has expired.",
        ) from exc
    except JWTError as exc:
        raise CaptureTokenInvalidError(
            "Capture access token is invalid or malformed.",
        ) from exc

    claims = _validate_payload(payload, expected_survey_id=expected_survey_id)
    return claims


def _validate_payload(
    payload: Dict[str, Any],
    *,
    expected_survey_id: Optional[str] = None,
) -> CaptureTokenClaims:
    subject = payload.get("sub")
    if subject != CAPTURE_TOKEN_SUBJECT:
        raise CaptureTokenInvalidError(
            f"Invalid capture token subject: expected {CAPTURE_TOKEN_SUBJECT!r}, got {subject!r}.",
            code=CODE_CAPTURE_AUTH_INVALID,
        )

    purpose = payload.get("purpose")
    if purpose != CAPTURE_TOKEN_PURPOSE:
        raise CaptureTokenInvalidError(
            f"Invalid capture token purpose: expected {CAPTURE_TOKEN_PURPOSE!r}, got {purpose!r}.",
            code=CODE_CAPTURE_AUTH_INVALID,
        )

    role = payload.get("role")
    if role not in ALLOWED_CAPTURE_ROLES:
        raise CaptureTokenInvalidError(
            f"Invalid capture token role: {role!r}.",
            code=CODE_CAPTURE_AUTH_INVALID,
        )

    survey_id = str(payload.get("survey_id") or "").strip()
    if not survey_id:
        raise CaptureTokenInvalidError(
            "Capture token is missing survey_id.",
            code=CODE_CAPTURE_AUTH_INVALID,
        )

    if expected_survey_id is not None:
        expected = str(expected_survey_id).strip()
        if expected and survey_id != expected:
            raise CaptureTokenSurveyMismatchError(
                f"Capture token survey_id {survey_id!r} does not match expected {expected!r}.",
                code=CODE_CAPTURE_AUTH_SURVEY_MISMATCH,
                details={"expected_survey_id": expected, "token_survey_id": survey_id},
            )

    exp_raw = payload.get("exp")
    expires_at: Optional[datetime] = None
    if exp_raw is not None:
        if isinstance(exp_raw, datetime):
            expires_at = exp_raw if exp_raw.tzinfo else exp_raw.replace(tzinfo=timezone.utc)
        else:
            expires_at = datetime.fromtimestamp(float(exp_raw), tz=timezone.utc)

    report_id = payload.get("report_id")
    job_id = payload.get("job_id")

    return CaptureTokenClaims(
        subject=str(subject),
        purpose=str(purpose),
        role=str(role),
        survey_id=survey_id,
        report_id=str(report_id).strip() if report_id else None,
        job_id=str(job_id).strip() if job_id else None,
        expires_at=expires_at,
    )


def build_capture_session_context(
    *,
    survey_id: str,
    role: Optional[str] = None,
    report_id: Optional[str] = None,
    job_id: Optional[str] = None,
    token_settings: Optional[CaptureTokenSettings] = None,
) -> CaptureSessionContext:
    """
    Mint a capture token and return a :class:`CaptureSessionContext` ready for
    Playwright ``add_init_script`` localStorage injection.
    """
    cfg = token_settings or CaptureTokenSettings.from_env()
    resolved_role = _normalize_role(role or cfg.default_role)
    resolved_survey = _normalize_survey_id(survey_id)
    token = create_capture_access_token(
        survey_id=resolved_survey,
        role=resolved_role,
        report_id=report_id,
        job_id=job_id,
        token_settings=cfg,
    )
    return CaptureSessionContext(
        auth_token=token,
        role=resolved_role,
        source="minted",
        survey_id=resolved_survey,
        report_id=str(report_id).strip() if report_id else None,
        job_id=str(job_id).strip() if job_id else None,
    )


def capture_token_ttl_seconds(
    token_settings: Optional[CaptureTokenSettings] = None,
) -> int:
    """Expose configured TTL as seconds for timeouts and logging."""
    cfg = token_settings or CaptureTokenSettings.from_env()
    return cfg.ttl_minutes * 60

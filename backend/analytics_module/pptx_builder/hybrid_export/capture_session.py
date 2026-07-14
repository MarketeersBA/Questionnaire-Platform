"""
Resolve Playwright capture sessions for hybrid PPTX export (Phase 3).

Default path: mint a fresh capture JWT per batch via :func:`build_capture_session_context`.
Emergency/debug: set ``PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE=true`` **and** paste
``PPTX_CAPTURE_AUTH_TOKEN`` to reuse a static bearer (not recommended).
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass
from typing import Literal, Optional

from backend.config import settings

from .capture_auth import (
    CaptureAuthError,
    CaptureTokenSettings,
    build_capture_session_context,
    capture_token_ttl_seconds,
    decode_capture_access_token,
)
from .capture_models import CaptureSessionContext

logger = logging.getLogger("pptx.capture.session")

CaptureSessionSource = Literal["minted", "env_override", "provided"]

CAPTURE_SESSION_SOURCE_MINTED: CaptureSessionSource = "minted"
CAPTURE_SESSION_SOURCE_ENV_OVERRIDE: CaptureSessionSource = "env_override"
CAPTURE_SESSION_SOURCE_PROVIDED: CaptureSessionSource = "provided"

_ENV_OVERRIDE_FLAG = "PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE"


def _truthy_env(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def capture_auth_token_override_enabled() -> bool:
    """When true, use ``PPTX_CAPTURE_AUTH_TOKEN`` instead of minting (debug only)."""
    return _truthy_env(_ENV_OVERRIDE_FLAG)


@dataclass(frozen=True)
class CaptureSessionResolution:
    """Result of resolving auth for a capture batch."""

    session: CaptureSessionContext
    source: CaptureSessionSource
    ttl_seconds: Optional[int] = None


def _session_from_env_override(survey_id: str) -> CaptureSessionContext:
    token = os.environ.get("PPTX_CAPTURE_AUTH_TOKEN", "").strip()
    if not token:
        raise CaptureAuthError(
            "PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE is enabled but PPTX_CAPTURE_AUTH_TOKEN is empty.",
            code="capture_auth_config",
        )
    if len(token) < 20:
        raise CaptureAuthError(
            "PPTX_CAPTURE_AUTH_TOKEN looks too short for a JWT override.",
            code="capture_auth_invalid",
        )

    role = (os.environ.get("PPTX_CAPTURE_AUTH_ROLE") or "admin").strip().lower()
    try:
        claims = decode_capture_access_token(token, expected_survey_id=survey_id)
        role = claims.role
    except CaptureAuthError:
        # Allow pasted login JWTs during emergency override (legacy behavior).
        logger.warning(
            "[Capture-Session] Env override token is not a capture JWT; "
            "using PPTX_CAPTURE_AUTH_ROLE=%s without survey binding validation.",
            role,
        )

    return CaptureSessionContext(
        auth_token=token,
        role=role,
        source=CAPTURE_SESSION_SOURCE_ENV_OVERRIDE,
        survey_id=survey_id,
    )


def resolve_capture_session_for_batch(
    *,
    survey_id: str,
    report_id: Optional[str] = None,
    job_id: Optional[str] = None,
    session: Optional[CaptureSessionContext] = None,
    token_settings: Optional[CaptureTokenSettings] = None,
) -> CaptureSessionResolution:
    """
    Build or accept a :class:`CaptureSessionContext` for one Playwright capture batch.

    Each call mints a new JWT unless ``session`` is passed explicitly or env override
    is enabled for debugging.
    """
    normalized_survey = str(survey_id or "").strip()
    if not normalized_survey:
        raise CaptureAuthError(
            "survey_id is required to resolve a capture session.",
            code="capture_auth_invalid",
        )

    if session is not None:
        if session.auth_token:
            logger.info(
                "[Capture-Session] Using caller-provided session | survey=%s source=%s",
                normalized_survey,
                session.source or CAPTURE_SESSION_SOURCE_PROVIDED,
            )
        return CaptureSessionResolution(
            session=session,
            source=CAPTURE_SESSION_SOURCE_PROVIDED,
        )

    if capture_auth_token_override_enabled():
        logger.warning(
            "[Capture-Session] PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE is enabled — "
            "using static env token (debug/emergency only) | survey=%s",
            normalized_survey,
        )
        ctx = _session_from_env_override(normalized_survey)
        return CaptureSessionResolution(
            session=CaptureSessionContext(
                auth_token=ctx.auth_token,
                role=ctx.role,
                local_storage=dict(ctx.local_storage),
                source=CAPTURE_SESSION_SOURCE_ENV_OVERRIDE,
                survey_id=normalized_survey,
                report_id=str(report_id).strip() if report_id else None,
                job_id=str(job_id).strip() if job_id else None,
            ),
            source=CAPTURE_SESSION_SOURCE_ENV_OVERRIDE,
        )

    cfg = token_settings or CaptureTokenSettings.from_env()
    ctx = build_capture_session_context(
        survey_id=normalized_survey,
        report_id=report_id,
        job_id=job_id,
        token_settings=cfg,
    )
    session_with_meta = CaptureSessionContext(
        auth_token=ctx.auth_token,
        role=ctx.role,
        local_storage=dict(ctx.local_storage),
        source=CAPTURE_SESSION_SOURCE_MINTED,
        survey_id=normalized_survey,
        report_id=str(report_id).strip() if report_id else None,
        job_id=str(job_id).strip() if job_id else None,
    )
    ttl = capture_token_ttl_seconds(cfg)
    logger.info(
        "[Capture-Session] Minted capture JWT | survey=%s report=%s job=%s role=%s ttl_sec=%s",
        normalized_survey,
        report_id or "-",
        job_id or "-",
        session_with_meta.role,
        ttl,
    )
    return CaptureSessionResolution(
        session=session_with_meta,
        source=CAPTURE_SESSION_SOURCE_MINTED,
        ttl_seconds=ttl,
    )

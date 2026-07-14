"""
Report API auth probes for hybrid PPTX preflight (Phase 4).

Verifies a minted capture JWT can reach ``GET /api/analytics/report/{survey_id}``
before Playwright begins an expensive multi-chart batch.
"""
from __future__ import annotations

import logging
import os
from typing import Optional
from urllib.parse import urlparse

from .capture_config import BrowserCaptureConfig
from .pptx_failure import (
    ERROR_AUTH_INVALID,
    ERROR_AUTH_MISSING,
    ERROR_CAPTURE_AUTH_DENIED,
    ERROR_CAPTURE_AUTH_CONFIG,
)

logger = logging.getLogger("pptx.capture.preflight.auth")


def resolve_report_api_base_url(
    config: Optional[BrowserCaptureConfig] = None,
) -> str:
    """
    Base URL used for the report API probe.

    Defaults to ``PPTX_EXPORT_FRONTEND_BASE_URL`` (Vite proxy ``/api`` → backend).
    Override with ``PPTX_CAPTURE_API_BASE_URL`` to hit the API container directly.
    """
    explicit = os.environ.get("PPTX_CAPTURE_API_BASE_URL", "").strip()
    if explicit:
        return explicit.rstrip("/")
    cfg = config or BrowserCaptureConfig.from_env()
    return (cfg.frontend_base_url or "").strip().rstrip("/")


def _report_api_path_prefix(api_base_url: str) -> str:
    """
    Frontend Vite proxy serves ``/api/analytics/...``; the FastAPI app mounts
    analytics at ``/analytics/...`` without the ``/api`` prefix.
    """
    direct = os.environ.get("PPTX_CAPTURE_API_BASE_URL", "").strip().rstrip("/")
    normalized = (api_base_url or "").strip().rstrip("/")
    if direct and normalized == direct:
        return "/analytics"
    return "/api/analytics"


def build_report_api_probe_url(api_base_url: str, survey_id: str) -> str:
    base = api_base_url.rstrip("/")
    sid = str(survey_id or "").strip()
    prefix = _report_api_path_prefix(api_base_url)
    return f"{base}{prefix}/report/{sid}"


def check_capture_report_api_access(
    *,
    api_base_url: str,
    survey_id: str,
    bearer_token: str,
    timeout_sec: float,
) -> Optional["CapturePreflightIssue"]:
    """
    Probe the same report endpoint the export frame calls, with a capture bearer token.

    Accepts HTTP 200/202 as success (auth + route OK). Maps 401/403 to auth failure codes.
    """
    from .capture_preflight import CapturePreflightIssue

    import httpx

    token = (bearer_token or "").strip()
    if not token:
        return CapturePreflightIssue(
            code=ERROR_AUTH_MISSING,
            message="Capture session has no bearer token for report API preflight.",
            remediation=(
                "Ensure SECRET_KEY is configured on pptx-worker so capture JWTs can be minted."
            ),
        )

    if not api_base_url:
        return CapturePreflightIssue(
            code=ERROR_CAPTURE_AUTH_CONFIG,
            message="Report API base URL is empty for capture auth preflight.",
            remediation=(
                "Set PPTX_EXPORT_FRONTEND_BASE_URL or PPTX_CAPTURE_API_BASE_URL."
            ),
        )

    parsed = urlparse(api_base_url)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return CapturePreflightIssue(
            code=ERROR_CAPTURE_AUTH_CONFIG,
            message=f"Report API base URL is invalid: {api_base_url!r}",
            remediation="Use http://host:port (frontend or backend base).",
        )

    probe_url = build_report_api_probe_url(api_base_url, survey_id)
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}

    try:
        with httpx.Client(timeout=timeout_sec, follow_redirects=True) as client:
            response = client.get(probe_url, headers=headers)
    except httpx.RequestError as exc:
        logger.warning(
            "[Capture-Preflight-Auth] Report API unreachable | url=%s err=%s",
            probe_url,
            exc,
        )
        return CapturePreflightIssue(
            code=ERROR_AUTH_INVALID,
            message=f"Cannot reach report API for auth probe: {exc}",
            remediation=(
                "Confirm pptx-worker can reach the API (PPTX_CAPTURE_API_BASE_URL or "
                "frontend proxy). Check docker network and that the backend is running."
            ),
        )

    status = response.status_code
    logger.info(
        "[Capture-Preflight-Auth] Report API probe | survey=%s status=%s url=%s",
        survey_id,
        status,
        probe_url,
    )

    if status in (200, 202):
        return None

    if status == 401:
        return CapturePreflightIssue(
            code=ERROR_AUTH_INVALID,
            message=(
                f"Capture token was rejected by the report API (HTTP 401) for survey {survey_id!r}."
            ),
            remediation=(
                "Ensure pptx-worker SECRET_KEY matches the API server SECRET_KEY. "
                "Redeploy worker and API together after rotating secrets."
            ),
        )

    if status == 403:
        return CapturePreflightIssue(
            code=ERROR_CAPTURE_AUTH_DENIED,
            message=(
                f"Capture token is forbidden from reading the report API (HTTP 403) "
                f"for survey {survey_id!r}."
            ),
            remediation=(
                "Confirm Phase 2 capture auth is deployed on the API and the token role "
                "is admin or analyst."
            ),
        )

    if status == 404:
        return CapturePreflightIssue(
            code=ERROR_AUTH_INVALID,
            message=(
                f"Report API returned HTTP 404 for survey {survey_id!r} during auth probe."
            ),
            remediation=(
                "Ensure the survey report exists and is ready before export. "
                "If the survey id is wrong, retry from the correct report."
            ),
        )

    if status >= 500:
        return CapturePreflightIssue(
            code=ERROR_AUTH_INVALID,
            message=f"Report API returned HTTP {status} during capture auth preflight.",
            remediation="Inspect backend logs; the API may be down or misconfigured.",
        )

    return CapturePreflightIssue(
        code=ERROR_AUTH_INVALID,
        message=f"Unexpected HTTP {status} from report API auth probe.",
        remediation="Check API logs and capture token configuration.",
    )

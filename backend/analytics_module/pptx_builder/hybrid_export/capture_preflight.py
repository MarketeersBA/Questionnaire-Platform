"""
Hybrid PPTX browser capture — startup validation and pre-batch health checks (Phase 4).

Per-job preflight mints a capture JWT and probes ``GET /api/analytics/report/{survey_id}``
before Playwright starts an expensive multi-chart batch.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import List, Optional
from urllib.parse import urlparse

from backend.config import settings

from .capture_auth import CaptureAuthError
from .capture_config import BrowserCaptureConfig
from .capture_session import capture_auth_token_override_enabled, resolve_capture_session_for_batch
from .pptx_failure import (
    ERROR_AUTH_MISSING,
    ERROR_CAPTURE_AUTH_CONFIG,
)
from .render_mode import PPTXRenderMode, resolve_render_mode

logger = logging.getLogger("pptx.capture.preflight")

_CODE_BASE_URL_INVALID = "frontend_base_url_invalid"
_CODE_BASE_URL_MISSING = "frontend_base_url_missing"
_CODE_FRONTEND_UNREACHABLE = "frontend_unreachable"
_CODE_EXPORT_FRAME_UNREACHABLE = "export_frame_unreachable"
_CODE_EXPORT_FRAME_BAD_RESPONSE = "export_frame_bad_response"


@dataclass(frozen=True)
class CapturePreflightIssue:
    code: str
    message: str
    remediation: str


@dataclass
class CapturePreflightResult:
    ok: bool
    issues: List[CapturePreflightIssue] = field(default_factory=list)

    @property
    def primary_code(self) -> str:
        return self.issues[0].code if self.issues else "capture_environment"

    def raise_if_failed(self) -> None:
        if not self.ok:
            raise CaptureEnvironmentError(self.issues)


class CaptureEnvironmentError(RuntimeError):
    """Worker cannot run hybrid capture — configuration or connectivity failure."""

    def __init__(self, issues: List[CapturePreflightIssue]):
        self.issues = issues
        self.primary_code = issues[0].code if issues else "capture_environment"
        lines = ["Hybrid PPTX capture environment is not ready:"]
        for issue in issues:
            lines.append(f"  [{issue.code}] {issue.message}")
            lines.append(f"    → {issue.remediation}")
        super().__init__("\n".join(lines))


def hybrid_capture_enabled() -> bool:
    return resolve_render_mode() == PPTXRenderMode.HYBRID


def _preflight_timeout_sec() -> float:
    raw = os.getenv("PPTX_CAPTURE_PREFLIGHT_TIMEOUT_SEC", "15")
    try:
        return max(3.0, float(raw))
    except ValueError:
        return 15.0


def _probe_survey_id(explicit: Optional[str] = None) -> str:
    return (explicit or os.getenv("PPTX_CAPTURE_HEALTH_PROBE_SURVEY_ID") or "health-probe").strip()


def validate_capture_configuration(
    config: Optional[BrowserCaptureConfig] = None,
) -> CapturePreflightResult:
    """Validate env vars required for hybrid capture (no network I/O)."""
    config = config or BrowserCaptureConfig.from_env()
    issues: List[CapturePreflightIssue] = []

    base = (config.frontend_base_url or "").strip()
    if not base:
        issues.append(
            CapturePreflightIssue(
                code=_CODE_BASE_URL_MISSING,
                message="PPTX_EXPORT_FRONTEND_BASE_URL is empty.",
                remediation=(
                    "Set PPTX_EXPORT_FRONTEND_BASE_URL to your Vite app URL "
                    "(e.g. http://frontend:5173 in Docker)."
                ),
            )
        )
    else:
        parsed = urlparse(base)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            issues.append(
                CapturePreflightIssue(
                    code=_CODE_BASE_URL_INVALID,
                    message=f"PPTX_EXPORT_FRONTEND_BASE_URL is not a valid URL: {base!r}",
                    remediation="Use http://host:port or https://host without a trailing path.",
                )
            )

    issues.extend(_validate_capture_auth_configuration())

    return CapturePreflightResult(ok=not issues, issues=issues)


def _validate_capture_auth_configuration() -> List[CapturePreflightIssue]:
    """
    Default: worker mints capture JWTs (requires SECRET_KEY only).
    Override: static PPTX_CAPTURE_AUTH_TOKEN when PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE=true.
    """
    issues: List[CapturePreflightIssue] = []

    if capture_auth_token_override_enabled():
        token = os.environ.get("PPTX_CAPTURE_AUTH_TOKEN", "").strip()
        if not token:
            issues.append(
                CapturePreflightIssue(
                    code=ERROR_AUTH_MISSING,
                    message=(
                        "PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE is enabled but "
                        "PPTX_CAPTURE_AUTH_TOKEN is empty."
                    ),
                    remediation=(
                        "Paste a JWT into PPTX_CAPTURE_AUTH_TOKEN or disable "
                        "PPTX_CAPTURE_AUTH_TOKEN_OVERRIDE to use server-minted tokens."
                    ),
                )
            )
        elif len(token) < 20:
            issues.append(
                CapturePreflightIssue(
                    code=ERROR_AUTH_MISSING,
                    message="PPTX_CAPTURE_AUTH_TOKEN looks too short to be a valid JWT.",
                    remediation="Paste the full bearer token from a successful login session.",
                )
            )
        return issues

    secret = (settings.SECRET_KEY or "").strip()
    if not secret:
        issues.append(
            CapturePreflightIssue(
                code=ERROR_CAPTURE_AUTH_CONFIG,
                message="SECRET_KEY is not configured; worker cannot mint capture JWTs.",
                remediation=(
                    "Set SECRET_KEY in .env (same value as the API server) and restart pptx-worker."
                ),
            )
        )

    return issues


def build_export_frame_probe_url(
    base_url: str,
    survey_id: str,
) -> str:
    base = base_url.rstrip("/")
    return (
        f"{base}/surveys/{survey_id}/export-frame"
        "?chart_id=__pptx_health_probe__&theme=light&frame=chart_body"
    )


def check_frontend_base_reachable(
    base_url: str,
    *,
    timeout_sec: Optional[float] = None,
) -> Optional[CapturePreflightIssue]:
    """HTTP GET the frontend root — confirms DNS/TCP and dev server up."""
    import httpx

    timeout = timeout_sec or _preflight_timeout_sec()
    root = base_url.rstrip("/") + "/"
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            response = client.get(root)
    except httpx.RequestError as exc:
        return CapturePreflightIssue(
            code=_CODE_FRONTEND_UNREACHABLE,
            message=f"Cannot reach frontend at {root}: {exc}",
            remediation=(
                "Ensure the frontend container is running and "
                "PPTX_EXPORT_FRONTEND_BASE_URL matches docker-compose service hostname."
            ),
        )

    if response.status_code >= 500:
        return CapturePreflightIssue(
            code=_CODE_FRONTEND_UNREACHABLE,
            message=f"Frontend returned HTTP {response.status_code} for {root}",
            remediation="Check frontend logs; Vite may still be starting or crashed.",
        )
    return None


def check_export_frame_probe(
    base_url: str,
    survey_id: str,
    *,
    timeout_sec: Optional[float] = None,
) -> Optional[CapturePreflightIssue]:
    """
    Lightweight GET of export-frame before Playwright starts.
    Accepts 2xx/3xx/401/403 as 'route exists'; fails on 5xx or connection errors.
    """
    import httpx

    timeout = timeout_sec or _preflight_timeout_sec()
    probe_url = build_export_frame_probe_url(base_url, survey_id)
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True) as client:
            response = client.get(probe_url)
    except httpx.RequestError as exc:
        return CapturePreflightIssue(
            code=_CODE_EXPORT_FRAME_UNREACHABLE,
            message=f"Cannot reach export-frame URL: {exc}",
            remediation=(
                "Verify the survey route exists and frontend serves "
                "/surveys/:id/export-frame (see ReportExportFrame.tsx)."
            ),
        )

    if response.status_code >= 500:
        return CapturePreflightIssue(
            code=_CODE_EXPORT_FRAME_BAD_RESPONSE,
            message=f"export-frame probe returned HTTP {response.status_code}",
            remediation="Inspect frontend logs for crashes loading the export frame route.",
        )

    body = response.text or ""
    if len(body) < 80:
        return CapturePreflightIssue(
            code=_CODE_EXPORT_FRAME_BAD_RESPONSE,
            message="export-frame probe returned an unexpectedly small HTML body.",
            remediation=(
                "Confirm Vite is serving the SPA and the export-frame route is registered in App.tsx."
            ),
        )

    if response.status_code == 404 and "export-frame" not in body.lower():
        return CapturePreflightIssue(
            code=_CODE_EXPORT_FRAME_BAD_RESPONSE,
            message=f"export-frame probe returned HTTP 404 for {probe_url}",
            remediation="Check frontend routing and PPTX_EXPORT_FRONTEND_BASE_URL path.",
        )

    return None


def _run_capture_auth_preflight(
    *,
    survey_id: str,
    report_id: Optional[str] = None,
    job_id: Optional[str] = None,
    config: Optional[BrowserCaptureConfig] = None,
    timeout_sec: Optional[float] = None,
) -> List[CapturePreflightIssue]:
    """Mint (or override) a capture token and verify report API access for the job survey."""
    from .capture_preflight_auth import (
        check_capture_report_api_access,
        resolve_report_api_base_url,
    )

    issues: List[CapturePreflightIssue] = []
    normalized_survey = str(survey_id or "").strip()
    if not normalized_survey:
        issues.append(
            CapturePreflightIssue(
                code=ERROR_CAPTURE_AUTH_CONFIG,
                message="survey_id is required for capture auth preflight.",
                remediation="Internal error — export job must pass a valid survey_id.",
            )
        )
        return issues

    try:
        resolution = resolve_capture_session_for_batch(
            survey_id=normalized_survey,
            report_id=report_id,
            job_id=job_id,
        )
    except CaptureAuthError as exc:
        code = getattr(exc, "code", None) or ERROR_CAPTURE_AUTH_CONFIG
        if code not in (ERROR_AUTH_MISSING, ERROR_CAPTURE_AUTH_CONFIG):
            code = ERROR_CAPTURE_AUTH_CONFIG
        issues.append(
            CapturePreflightIssue(
                code=str(code),
                message=f"Cannot mint capture token: {exc}",
                remediation=(
                    "Set SECRET_KEY on pptx-worker to match the API server, then restart the worker."
                ),
            )
        )
        return issues

    token = (resolution.session.auth_token or "").strip()
    cfg = config or BrowserCaptureConfig.from_env()
    api_base = resolve_report_api_base_url(cfg)
    auth_issue = check_capture_report_api_access(
        api_base_url=api_base,
        survey_id=normalized_survey,
        bearer_token=token,
        timeout_sec=timeout_sec or _preflight_timeout_sec(),
    )
    if auth_issue:
        issues.append(auth_issue)
    return issues


def run_capture_preflight(
    *,
    survey_id: Optional[str] = None,
    report_id: Optional[str] = None,
    job_id: Optional[str] = None,
    config: Optional[BrowserCaptureConfig] = None,
    skip_network: bool = False,
    include_auth_probe: bool = False,
) -> CapturePreflightResult:
    """
    Full preflight: config + optional HTTP probes.

    ``include_auth_probe`` is used for per-job checks with a real ``survey_id``.
    Worker startup passes ``include_auth_probe=False`` (no target survey yet).
    """
    config = config or BrowserCaptureConfig.from_env()
    result = validate_capture_configuration(config)
    if not result.ok or skip_network:
        return result

    issues = list(result.issues)
    timeout = _preflight_timeout_sec()

    base_issue = check_frontend_base_reachable(
        config.frontend_base_url,
        timeout_sec=timeout,
    )
    if base_issue:
        issues.append(base_issue)

    probe_sid = _probe_survey_id(survey_id)
    frame_issue = check_export_frame_probe(
        config.frontend_base_url,
        probe_sid,
        timeout_sec=timeout,
    )
    if frame_issue:
        issues.append(frame_issue)

    if include_auth_probe and survey_id:
        issues.extend(
            _run_capture_auth_preflight(
                survey_id=survey_id,
                report_id=report_id,
                job_id=job_id,
                config=config,
                timeout_sec=timeout,
            )
        )

    return CapturePreflightResult(ok=not issues, issues=issues)


def validate_worker_capture_environment() -> None:
    """
    Called at pptx-worker startup. Fails fast when hybrid mode cannot capture.
    Includes a retry loop to account for frontend startup latency in Docker.
    """
    if not hybrid_capture_enabled():
        logger.info(
            "[Capture-Preflight] Skipping worker validation — render mode is not hybrid"
        )
        return

    import time
    max_retries = int(os.getenv("PPTX_CAPTURE_STARTUP_RETRIES", "12"))
    retry_delay = int(os.getenv("PPTX_CAPTURE_STARTUP_RETRY_DELAY", "5"))

    logger.info("[Capture-Preflight] Validating hybrid capture environment…")
    
    for attempt in range(max_retries):
        result = run_capture_preflight(skip_network=False, include_auth_probe=False)
        if result.ok:
            logger.info(
                "[Capture-Preflight] Environment OK | base=%s",
                os.getenv("PPTX_EXPORT_FRONTEND_BASE_URL"),
            )
            return

        # If failures are network-related, we retry (Vite might still be compiling or starting)
        is_network_fail = any(i.code in (_CODE_FRONTEND_UNREACHABLE, _CODE_EXPORT_FRAME_UNREACHABLE) for i in result.issues)
        
        if is_network_fail and attempt < max_retries - 1:
            logger.warning(
                "[Capture-Preflight] Frontend not reachable yet (attempt %d/%d). Retrying in %ds...",
                attempt + 1, 
                max_retries, 
                retry_delay
            )
            time.sleep(retry_delay)
            continue
        
        # If we reach here, it's either not a network fail (e.g. config error) or we exhausted retries
        for issue in result.issues:
            logger.error(
                "[Capture-Preflight] %s | %s | remediation=%s",
                issue.code,
                issue.message,
                issue.remediation,
            )
        result.raise_if_failed()


def run_pre_capture_checks(
    survey_id: str,
    *,
    report_id: Optional[str] = None,
    job_id: Optional[str] = None,
    config: Optional[BrowserCaptureConfig] = None,
) -> CapturePreflightResult:
    """Run immediately before Playwright batch — includes report API auth probe."""
    if not hybrid_capture_enabled():
        return CapturePreflightResult(ok=True)

    logger.info(
        "[Capture-Preflight] Pre-batch checks | survey=%s report=%s job=%s",
        survey_id,
        report_id or "-",
        job_id or "-",
    )
    result = run_capture_preflight(
        survey_id=survey_id,
        report_id=report_id,
        job_id=job_id,
        config=config,
        skip_network=False,
        include_auth_probe=True,
    )
    if not result.ok:
        logger.error(
            "[Capture-Preflight] Failed before chart capture | primary_code=%s issues=%s",
            result.primary_code,
            [i.code for i in result.issues],
        )
    return result

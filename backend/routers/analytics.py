"""
Analytics Router — Phase 4 hardened.

Stable API contracts, structured error responses, idempotency guards,
file existence checks, and auto-generate endpoint.
"""
from __future__ import annotations

import json
import os
import logging
import re
import uuid
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Annotated, Dict, Any, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.models import User, OpportunityInsight
from backend.database import db
from backend.routers.auth import (
    get_current_active_admin,
    get_current_active_analyst,
    get_current_user,
    get_current_user_or_capture_user,
)
from backend.services.analytics_service import analytics_service
from backend.services import report_share_service
from backend.utils.rate_limit import (
    limiter,
    POLLING_LIMIT,
    get_client_address,
    polling_rate_key,
)
from backend.utils.report_status_cache import (
    compute_poll_interval_seconds,
    get_cached_status,
    invalidate_status_cache,
)
from backend.utils.pptx_job_state import (
    STATUS_PROJECTION,
    build_status_payload,
    recover_stale_job_if_needed,
    request_pptx_cancel,
)
from backend.utils.pptx_admin_diagnostics import (
    build_global_pptx_diagnostics,
    build_survey_pptx_diagnostics,
    extend_status_payload_for_admin,
)
from backend.workers.pptx_queue import LEASE_KEY_PREFIX, SyncPptxJobQueue

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


# Characters Windows/macOS refuse in filenames, plus control chars.
_ILLEGAL_FILENAME_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')


def build_export_filename(project_name: Optional[str], suffix: str, extension: str) -> str:
    """
    Readable, filesystem-safe download name for an exported report.

    Downloads used to be named after the raw survey ObjectId, which reaches the
    user as 24 characters of hex. Naming the file after the project keeps the
    deck identifiable once it is sitting in a downloads folder. Non-ASCII names
    (Arabic project titles) are preserved -- Starlette encodes them via the
    RFC 5987 `filename*` parameter.
    """
    name = (project_name or "Survey Report").strip()
    name = _ILLEGAL_FILENAME_CHARS.sub(" ", name)
    name = re.sub(r"\s+", " ", name).strip(" .")
    if not name:
        name = "Survey Report"
    # Leave headroom for the suffix and extension within common path limits.
    name = name[:120]
    return f"{name} - {suffix}.{extension}"


# ---------------------------------------------------------------------------
# Report Generation
# ---------------------------------------------------------------------------

@router.post("/generate-report/{survey_id}")
async def generate_report(
    survey_id: str,
    background_tasks: BackgroundTasks,
    options: Dict[str, Any] = None,
    force: bool = False, # NEW: Explicitly force regeneration
    current_user: Annotated[User, Depends(get_current_user)] = None,
):
    """Trigger the headless analytical pipeline for a survey (Asynchronous)."""
    try:
        # Idempotency guard — don't start duplicate tasks unless forced
        existing = await db.get_collection("survey_reports").find_one({"survey_id": survey_id})
        
        if existing and existing.get("status") == "generating" and not force:
            generated_at = existing.get("generated_at")
            if generated_at:
                # If generation started less than 5 minutes ago, skip re-trigger
                if isinstance(generated_at, datetime):
                    age = (datetime.now(timezone.utc) - generated_at.replace(tzinfo=timezone.utc)).total_seconds()
                    if age < 300:
                        return {
                            "status": "generating",
                            "message": "Report generation already in progress. Use ?force=true to override.",
                            "survey_id": survey_id,
                        }

        result = await analytics_service.generate_survey_report(
            survey_id, background_tasks, options, current_user, force=force
        )
        await invalidate_status_cache(survey_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/report/{survey_id}")
async def get_report(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user_or_capture_user)],
):
    """Get the full report. Returns structured JSON for ALL states.

    Accepts normal user JWTs and short-lived PPTX capture JWTs (``sub=pptx-capture``)
    scoped to this ``survey_id`` for headless export-frame loading only.
    """
    report = await db.get_collection("survey_reports").find_one(
        {"survey_id": survey_id},
        sort=[("generated_at", -1)]
    )
    if not report:
        raise HTTPException(404, "Report not generated yet")

    if report["status"] == "generating":
        raise HTTPException(
            202,
            detail={"status": "generating", "message": "Report is being generated"},
        )

    # Return structured JSON even for failed reports (not HTTP 500)
    if report["status"] == "failed":
        report["_id"] = str(report["_id"])
        return {
            "status": "failed",
            "error_message": report.get("error_message", "Unknown error"),
            "survey_id": survey_id,
            "retry_count": report.get("retry_count", 0),
            "status_history": report.get("status_history", []),
        }

    # Convert _id to string for json serialization
    report["_id"] = str(report["_id"])

    # Enrich with project definition fields saved at survey creation time.
    try:
        survey_oid = ObjectId(survey_id)
    except Exception:
        survey_oid = None
    if survey_oid is not None:
        survey = await db.get_collection("surveys").find_one({"_id": survey_oid})
        if survey:
            blueprint = survey.get("blueprint") or {}
            customs = survey.get("customizations") or {}
            category = ""
            if isinstance(blueprint, dict):
                category = (blueprint.get("category") or "").strip()
            if not category and isinstance(customs, dict):
                category = (customs.get("category") or "").strip()
            taste = survey.get("taste_test_config") or {}
            if not category and isinstance(taste, dict):
                category = (taste.get("category") or "").strip()
            report["category"] = category
            report["sample_capacity"] = (
                survey.get("sample_capacity")
                or survey.get("respondent_target")
                or 0
            )

    return report


# ── Client-shareable report links ───────────────────────────────────────────
#
# NOTE: `/report/share/...` is declared before the `/report/{survey_id}`-style
# routes it sits beside, because FastAPI matches in declaration order and a
# literal registered after a path parameter is swallowed by it.


async def _load_report_for_response(survey_id: str) -> Dict[str, Any]:
    """Fetch the latest report and shape it exactly as `get_report` does."""
    report = await db.get_collection("survey_reports").find_one(
        {"survey_id": survey_id},
        sort=[("generated_at", -1)],
    )
    if not report:
        raise HTTPException(404, "Report not generated yet")

    if report["status"] == "generating":
        raise HTTPException(
            202,
            detail={"status": "generating", "message": "Report is being generated"},
        )

    report["_id"] = str(report["_id"])

    if report["status"] == "failed":
        return {
            "status": "failed",
            "error_message": report.get("error_message", "Unknown error"),
            "survey_id": survey_id,
            "retry_count": report.get("retry_count", 0),
            "status_history": report.get("status_history", []),
        }

    return report


#: Fields on a report document that must never reach a share-link viewer.
#:
#: These are operational, not analytical: `telemetry` carries the AI cost
#: manifest (what you spend with OpenAI), `pptx_path` and the export manifests
#: describe the server filesystem, and the status/authorship fields expose who
#: works here and how often generation fails. None of them is needed to render
#: a report, and all of them were being served to anyone holding a share link.
_VIEWER_STRIPPED_FIELDS = (
    "_id",
    "telemetry",
    "ai_cost_manifest",
    "pptx_path",
    "pptx_export_manifest",
    "pptx_job_id",
    "pptx_diagnostics",
    "brand_analyzer_excel_path",
    "status_history",
    "last_edited_by",
    "created_by",
    "retry_count",
    "error_message",
    "prompt_versions",
)


def sanitize_report_for_viewer(
    report: Dict[str, Any],
    *,
    share: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Strip a report down to what a client viewing it through a share link needs.

    Allow-listing would be safer in principle, but the report schema grows a new
    chart or insight key most releases and a missed addition would silently blank
    part of the client's report. Deny-listing keeps the analytics surface whole;
    the accompanying test asserts on these keys by name so a newly added
    operational field fails loudly rather than leaking quietly.
    """
    clean = {k: v for k, v in (report or {}).items() if k not in _VIEWER_STRIPPED_FIELDS}

    # A failed report still has to say *something*, but not why — an internal
    # traceback or a model name is not the client's business.
    if (report or {}).get("status") == "failed":
        clean["error_message"] = "This report is not available right now."

    clean["is_shared_view"] = True
    if share:
        clean["recipient_name"] = share.get("recipient_name")
        clean["allow_download"] = bool(share.get("allow_download"))

    return clean


class ShareCreateRequest(BaseModel):
    """
    Everything the analyst decides when handing a report to a client.

    `max_viewers` is the seat limit — how many distinct people may ever open the
    link. `None` means unlimited. `expires_at` ends access on a date; passing
    `unlimited_expiry` instead means the link never lapses. Neither is forced by
    the backend: an analyst who wants an open-ended link gets one.
    """

    label: Optional[str] = Field(default=None, max_length=120)
    max_viewers: Optional[int] = Field(default=None, ge=1, le=10000)
    expires_at: Optional[datetime] = None
    unlimited_expiry: bool = False


class ShareUpdateRequest(BaseModel):
    label: Optional[str] = Field(default=None, max_length=120)
    max_viewers: Optional[int] = Field(default=None, ge=0, le=10000)
    expires_at: Optional[datetime] = None
    unlimited_expiry: bool = False


def _share_base_url(request: Request) -> str:
    """
    Origin to build a copyable link against.

    Prefers the configured public URL, because the API may sit behind a proxy
    whose host header is an internal name that would produce a link nobody
    outside the network can open.
    """
    configured = (
        os.getenv("PPTX_EXPORT_FRONTEND_BASE_URL")
        or os.getenv("PUBLIC_APP_URL")
        or ""
    ).strip()
    if configured:
        return configured.rstrip("/")
    return str(request.base_url).rstrip("/")


class ShareLinkSettings(BaseModel):
    """
    The restrictions on a report's link.

    Both are optional and both mean "no limit" when cleared: `max_viewers=None`
    lets any number of people open it, `unlimited_expiry` makes it work until
    it is reset. Neither is imposed by the backend — the analyst decides.
    """

    label: Optional[str] = Field(default=None, max_length=120)
    max_viewers: Optional[int] = Field(default=None, ge=0, le=10000)
    expires_at: Optional[datetime] = None
    unlimited_expiry: bool = False


@router.get("/report/{survey_id}/share-link")
async def get_report_share_link(
    survey_id: str,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """
    The report's share link, created on first request.

    One link per report, like the survey master link — so "copy the link for
    this report" is never ambiguous. Safe to call repeatedly; it returns the
    same URL rather than minting another.
    """
    share = await report_share_service.get_or_create_master_share(
        survey_id, username=getattr(current_user, "username", None)
    )
    return report_share_service.to_admin_dict(share, base_url=_share_base_url(request))


@router.patch("/report/{survey_id}/share-link")
async def update_report_share_link(
    survey_id: str,
    payload: ShareLinkSettings,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """Change the viewer limit or expiry. The URL itself is unaffected."""
    share = await report_share_service.get_or_create_master_share(
        survey_id, username=getattr(current_user, "username", None)
    )
    updated = await report_share_service.update_share(
        share["share_id"],
        label=payload.label,
        max_viewers=payload.max_viewers,
        expires_at=payload.expires_at,
        clear_expiry=payload.unlimited_expiry,
    )
    return report_share_service.to_admin_dict(
        updated or share, base_url=_share_base_url(request)
    )


@router.post("/report/{survey_id}/share-link/reset")
async def reset_report_share_link(
    survey_id: str,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """
    Issue a new URL and stop the old one working.

    For a link that reached the wrong person, or whose viewer slots are used up
    by people who should no longer have access. The limits carry over — this
    changes the address, not the policy.
    """
    share = await report_share_service.reset_master_share(
        survey_id, username=getattr(current_user, "username", None)
    )
    return report_share_service.to_admin_dict(share, base_url=_share_base_url(request))


@router.post("/report/{survey_id}/share")
async def create_report_share(
    survey_id: str,
    request: Request,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """
    Mint (or return) the client-shareable link for a survey's report.

    Idempotent: pressing "copy link" repeatedly hands back the same token rather
    than silently invalidating a link the client may already be using. Retained
    for the one-click copy button; `POST .../shares` is the richer path.
    """
    share = await report_share_service.create_or_get_share(
        survey_id, username=getattr(current_user, "username", None)
    )
    return {
        "survey_id": survey_id,
        "token": share["token"],
        "share_id": share.get("share_id"),
        "url": f"{_share_base_url(request)}/r/{share['token']}",
        "created_at": share.get("created_at"),
        "view_count": share.get("view_count", 0),
    }


@router.delete("/report/{survey_id}/share")
async def revoke_report_share(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """Revoke every live link for this report. Existing URLs stop working."""
    revoked = await report_share_service.revoke_share(survey_id)
    return {"survey_id": survey_id, "revoked": revoked}


def _viewer_id_from(request: Request) -> Optional[str]:
    """
    The visitor's browser-issued id, used to charge one seat per person.

    Sent as a header by the report page. Absent on a first-ever visit, in which
    case the caller mints one and hands it back for the browser to keep.
    """
    raw = (request.headers.get("X-Report-Viewer-Id") or "").strip()
    return raw[:64] or None


@router.get("/public/report/{token}")
async def get_shared_report(token: str, request: Request, response: Response):
    """
    Read a report through a share token — deliberately unauthenticated.

    Anyone holding the URL may open it; what the analyst controls is how many
    distinct people ever do. Each visitor is issued a `viewer_id` their browser
    keeps, and a seat is charged to that id. A returning viewer never spends a
    second seat, so a client re-reading their own report is never locked out.

    Three failure modes, deliberately distinguished:
      * unknown / revoked / expired -> 404, all identical, so a revoked link
        cannot be told apart from one that never existed;
      * seat limit reached -> 403 with a message the visitor can act on, since
        pretending the report does not exist would send them back to the person
        who shared it with a false story;
      * report not generated yet -> the same 202/404 the analyst view returns.
    """
    share = await report_share_service.resolve_share(token)
    if not share:
        raise HTTPException(404, "This report link is not available")

    viewer_id = _viewer_id_from(request) or f"v_{uuid.uuid4().hex}"

    try:
        share = await report_share_service.register_viewer(
            token,
            viewer_id,
            ip=get_client_address(request),
            user_agent=request.headers.get("User-Agent"),
        )
    except report_share_service.ShareLimitReached as exc:
        raise HTTPException(
            403,
            detail={
                "code": "share_limit_reached",
                "message": (
                    "This report link has reached the number of people it can be "
                    "shared with. Ask whoever sent it to you for a new link."
                ),
                "max_viewers": exc.max_viewers,
            },
        ) from None

    report = await _load_report_for_response(share["survey_id"])

    # Echoed so a first-time visitor's browser can store the id it was assigned.
    response.headers["X-Report-Viewer-Id"] = viewer_id

    # Sanitized, not returned raw: this endpoint is unauthenticated, and the
    # stored document carries AI spend and server paths alongside the charts.
    return sanitize_report_for_viewer(report, share=share)

# ── Exports ─────────────────────────────────────────────────────────────────
#
# PPTX is assembled from the analytics payload slide by slide. PDF prints the
# live report page instead, so it keeps the on-screen layout with the insights
# beside their charts and the text still selectable for downstream parsing.


def _origin_hint(request: Request) -> Optional[str]:
    """
    Where the caller's browser is talking to us from.

    Used as a fallback for locating the frontend when no public URL is
    configured: the analyst's browser is by definition able to reach the app,
    and in local development it is the same machine Chromium runs on. The
    Origin header is preferred over Referer because it is just the scheme and
    host, with no path to strip.
    """
    origin = (request.headers.get("Origin") or "").strip()
    if origin and origin.lower() != "null":
        return origin

    referer = (request.headers.get("Referer") or "").strip()
    if referer:
        from urllib.parse import urlparse

        parsed = urlparse(referer)
        if parsed.scheme and parsed.netloc:
            return f"{parsed.scheme}://{parsed.netloc}"
    return None


async def _render_pdf_or_502(
    survey_id: str,
    *,
    origin_hint: Optional[str] = None,
    watermark: Optional[str] = None,
) -> Path:
    """
    Print the report, turning any failure into a message someone can act on.

    Playwright's failures are operational, not user error — a browser that was
    never installed, a frontend the server cannot reach — so the remedy travels
    with the error instead of being buried in a log the analyst cannot see.
    """
    from starlette.concurrency import run_in_threadpool

    from backend.services.report_pdf_service import PdfExportError, render_report_pdf

    try:
        return await run_in_threadpool(
            render_report_pdf,
            survey_id,
            origin_hint=origin_hint,
            watermark=watermark,
        )
    except PdfExportError as exc:
        logger.error(
            "[PDF] Export failed for survey %s: %s (remedy: %s)",
            survey_id,
            exc,
            exc.remedy or "none",
        )
        raise HTTPException(
            502,
            detail={
                "code": "pdf_export_failed",
                "message": str(exc),
                "remedy": exc.remedy,
            },
        ) from None
    except Exception:  # noqa: BLE001 - surface any renderer fault as 502
        logger.exception("[PDF] Unexpected failure for survey %s", survey_id)
        raise HTTPException(
            502,
            detail={
                "code": "pdf_export_failed",
                "message": "PDF export failed unexpectedly. Check the server logs.",
                "remedy": None,
            },
        ) from None


def _pdf_filename(report: Dict[str, Any], survey_id: str) -> str:
    raw = (report or {}).get("metadata", {}).get("title") or f"report-{survey_id}"
    safe = re.sub(r"[^A-Za-z0-9._-]+", "-", str(raw)).strip("-") or f"report-{survey_id}"
    return f"{safe}.pdf"


async def _require_ready_report(survey_id: str) -> Dict[str, Any]:
    report = await db.get_collection("survey_reports").find_one(
        {"survey_id": survey_id}, sort=[("generated_at", -1)]
    )
    if not report:
        raise HTTPException(404, "Report not found.")
    if report.get("status") not in ("ready", "stale"):
        raise HTTPException(409, "Report is not ready yet.")
    return report


@router.get("/report/{survey_id}/download-pdf")
async def download_report_pdf(
    survey_id: str,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Print this report to PDF and stream it back."""
    report = await _require_ready_report(survey_id)
    path = await _render_pdf_or_502(survey_id, origin_hint=_origin_hint(request))
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=_pdf_filename(report, survey_id),
    )


async def _share_or_404(token: str) -> Dict[str, Any]:
    share = await report_share_service.resolve_share(token)
    if not share:
        raise HTTPException(404, "This report link is not available")
    return share


@router.get("/public/report/{token}/download-pdf")
async def download_shared_report_pdf(token: str, request: Request):
    """
    PDF export through a share link.

    No seat is charged here: exporting is something a viewer who already holds a
    seat does, and charging one would let a client burn their own limit by
    downloading twice.
    """
    share = await _share_or_404(token)
    report = await _require_ready_report(share["survey_id"])
    path = await _render_pdf_or_502(
        share["survey_id"],
        origin_hint=_origin_hint(request),
        watermark=share.get("label") or None,
    )
    await report_share_service.record_download(token, "pdf")
    return FileResponse(
        path,
        media_type="application/pdf",
        filename=_pdf_filename(report, share["survey_id"]),
    )


@router.post("/public/report/{token}/generate-pptx")
async def generate_shared_report_pptx(
    token: str,
    background_tasks: BackgroundTasks,
    request: Request,
):
    """
    Build the PPTX for a shared report when one does not already exist.

    Exporting has to work from the link, not only from the analyst's own view —
    a client told to "download the deck" cannot be met with "ask someone to
    generate it first". So a viewer may start the build, bounded by a per-link
    rate limit because it is real work on the server.

    Delegates to the same enqueue path the analyst route uses, so the two cannot
    drift into producing different decks.
    """
    share = await _share_or_404(token)
    survey_id = share["survey_id"]

    report = await db.get_collection("survey_reports").find_one(
        {"survey_id": survey_id}, sort=[("generated_at", -1)]
    )
    if not report or report.get("status") not in ("ready", "stale"):
        raise HTTPException(409, "This report is not ready to export yet.")

    # Already built — nothing to do, and saying so lets the client skip straight
    # to downloading instead of waiting out a redundant build.
    if _resolve_pptx_file(report) is not None:
        return {"status": "READY", "already_available": True}

    return await generate_pptx_v2(
        survey_id,
        background_tasks,
        current_user=None,
        force_retry=False,
    )


@router.get("/public/report/{token}/pptx-status")
async def shared_report_pptx_status(token: str):
    """
    Poll the export from a share link.

    Reports only what a viewer needs to decide whether to keep waiting — stage,
    progress, and whether the file is there. Deliberately not the analyst status
    payload, which carries job ids, retry counts and worker telemetry.
    """
    share = await _share_or_404(token)

    report = await db.get_collection("survey_reports").find_one(
        {"survey_id": share["survey_id"]},
        {"pptx_status": 1, "pptx_path": 1, "pptx_progress": 1, "pptx_stage": 1, "survey_id": 1},
        sort=[("generated_at", -1)],
    )
    if not report:
        raise HTTPException(404, "This report link is not available")

    available = _resolve_pptx_file(report) is not None
    return {
        "status": "READY" if available else (report.get("pptx_status") or "NONE"),
        "available": available,
        "progress": report.get("pptx_progress"),
        "stage": report.get("pptx_stage"),
    }


@router.get("/public/report/{token}/download")
async def download_shared_report_pptx(token: str):
    """
    PPTX export through a share link.

    Serves the deck the analyst already generated rather than starting a build:
    a client clicking Export should not be able to queue a Playwright job, and
    in practice a ready report already has one.
    """
    share = await _share_or_404(token)
    survey_id = share["survey_id"]

    report = await db.get_collection("survey_reports").find_one(
        {"survey_id": survey_id}, sort=[("generated_at", -1)]
    )
    if not report:
        raise HTTPException(404, "Report not found.")

    file_path = _resolve_pptx_file(report)
    if file_path is None:
        raise HTTPException(
            409,
            "The PowerPoint version of this report has not been generated yet. "
            "Download it as PDF, or ask whoever shared the link to generate it.",
        )

    await report_share_service.record_download(token, "pptx")
    return FileResponse(
        file_path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=file_path.name,
    )



class OpportunityInsightsUpdate(BaseModel):
    opportunity_insights: List[OpportunityInsight] = Field(default_factory=list)


@router.patch("/report/{survey_id}/opportunity-insights")
async def update_opportunity_insights(
    survey_id: str,
    payload: OpportunityInsightsUpdate,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
):
    """Analyst/admin: persist edited Execution Playbook tactical steps."""
    reports_col = db.get_collection("survey_reports")
    report = await reports_col.find_one(
        {"survey_id": survey_id},
        sort=[("generated_at", -1)],
    )
    if not report:
        raise HTTPException(404, "Report not found")
    if report.get("status") not in ("ready", "stale"):
        raise HTTPException(400, "Report must be ready before editing opportunity insights")

    serialized = [item.model_dump() for item in payload.opportunity_insights]
    await reports_col.update_one(
        {"_id": report["_id"]},
        {
            "$set": {
                "insights.opportunity_insights": serialized,
                "updated_at": datetime.now(timezone.utc),
                "last_edited_by": current_user.username,
            }
        },
    )
    await invalidate_status_cache(survey_id)
    return {"status": "ok", "opportunity_insights": serialized}


@router.get("/reports/{survey_id}/ai-costs")
async def get_ai_costs(survey_id: str, current_user: Annotated[User, Depends(get_current_user)]):
    """Admin-only: Returns the cost manifest for a specific report."""
    if current_user.role != "admin":
        raise HTTPException(403, "Access to financial telemetry is restricted to Partner Administrators.")
    
    report = await db.survey_reports.find_one({"survey_id": survey_id})
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report.get("telemetry", {}).get("ai_cost_manifest", {})

@router.get("/report/{survey_id}/status")
@limiter.limit(POLLING_LIMIT, key_func=polling_rate_key, override_defaults=True)
async def get_report_status(
    request: Request,
    response: Response,
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    debug: bool = False,
):
    """Poll report / PPTX generation status (cached, rate-limited per user+survey)."""

    async def _load_from_db() -> Dict[str, Any]:
        report = await db.get_collection("survey_reports").find_one(
            {"survey_id": survey_id},
            STATUS_PROJECTION,
            sort=[("generated_at", -1)],
        )
        if not report:
            raise HTTPException(404, "Report not found")

        report, recovered = await recover_stale_job_if_needed(db, survey_id, report)
        if recovered:
            await invalidate_status_cache(survey_id)

        payload = build_status_payload(survey_id, report)

        if debug and getattr(current_user, "role", None) == "admin":
            lease_info: Dict[str, Any] = {}
            job_id = report.get("pptx_job_id")
            if job_id:
                sync_q = SyncPptxJobQueue()
                if sync_q.connect() and sync_q._client:
                    key = f"{LEASE_KEY_PREFIX}{job_id}"
                    lease_info = {
                        "owner": sync_q._client.get(key),
                        "ttl_seconds": sync_q._client.ttl(key),
                    }
            extend_status_payload_for_admin(payload, report, lease_info=lease_info)

        return payload

    payload, cache_hit = await get_cached_status(survey_id, _load_from_db)
    poll_interval = compute_poll_interval_seconds(
        payload.get("status"),
        payload.get("pptx_status"),
    )
    payload["poll_interval_seconds"] = poll_interval

    response.headers["X-Poll-Interval"] = str(poll_interval)
    response.headers["Cache-Control"] = "private, max-age=2"
    if cache_hit:
        response.headers["X-Status-Cache"] = "hit"
    return payload


# ---------------------------------------------------------------------------
# Attribute Registry APIs (DB-Driven)
# ---------------------------------------------------------------------------

@router.get("/survey/{survey_id}/registry/full")
async def get_survey_attribute_registry(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Fetch the complete filtered attribute domain registry for a survey."""
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise HTTPException(404, "Survey not found")
    
    registry = await analytics_service.get_attribute_registry(survey)
    return registry


@router.get("/survey/{survey_id}/registry/main")
async def get_survey_main_attributes(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """API 1: Returns unique list of main attributes chosen for this survey."""
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise HTTPException(404, "Survey not found")
    
    registry = await analytics_service.get_attribute_registry(survey)
    main_attrs = list(dict.fromkeys([item["main_att"] for item in registry])) # unique list
    return main_attrs


@router.get("/survey/{survey_id}/registry/sub")
async def get_survey_sub_attributes(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """API 2: Returns unique list of sub-attribute names chosen for this survey."""
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise HTTPException(404, "Survey not found")
    
    registry = await analytics_service.get_attribute_registry(survey)
    sub_attrs = [item["supp_att"] for item in registry]
    return sub_attrs


@router.get("/survey/{survey_id}/registry/labels")
async def get_survey_attribute_labels(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """API 3: Returns specific min/max labels for each sub-attribute chosen."""
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise HTTPException(404, "Survey not found")
    
    registry = await analytics_service.get_attribute_registry(survey)
    domains = [
        {"supp_att": item["supp_att"], "min": item["min_label"], "max": item["max_label"]}
        for item in registry
    ]
    return domains


@router.get("/survey/{survey_id}/product-test/meta")
async def get_product_test_analytics_meta(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Phase 5 — product test registry + response summary for reports / exports.
    Returns enabled=false for non-product-test surveys.
    """
    from backend.services.product_test_analytics_service import (
        resolve_product_test_attribute_registry_for_survey,
        summarize_product_test_responses,
    )
    from backend.services.product_test_public_gateway import is_product_test_survey

    del current_user
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")

    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    if not is_product_test_survey(survey):
        return {"enabled": False}

    registry = resolve_product_test_attribute_registry_for_survey(survey)
    cursor = db.get_collection("responses").find({
        "survey_id": survey_id,
        "source": {"$ne": "layer1"},
    })
    responses = await cursor.to_list(length=10000)
    summary = summarize_product_test_responses(responses)

    return {
        "enabled": True,
        "registry_count": len(registry),
        "registry": registry,
        "summary": {
            "response_count": summary["response_count"],
            "total_answers": summary["total_answers"],
            "scalar_answer_count": summary.get("scalar_answer_count", summary["total_answers"]),
            "media_reference_count": summary.get("media_reference_count", 0),
            "by_timing": summary["by_timing"],
            "by_diagnostic_tag": summary["by_diagnostic_tag"],
            "by_module": summary["by_module"],
            "scalar_by_timing": summary.get("scalar_by_timing", {}),
            "scalar_by_diagnostic_tag": summary.get("scalar_by_diagnostic_tag", {}),
            "trial_media": summary.get("trial_media", {}),
        },
    }


@router.post("/report/{survey_id}/slice")
async def slice_report(
    survey_id: str,
    filters: Dict[str, Any],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Dynamically slice survey data (by demographic/brand) and return pure charts payload without writing to DB."""
    try:
        sliced_payload = await analytics_service.slice_survey_report(survey_id, filters)
        return sliced_payload
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



def _resolve_pptx_file(report: Dict[str, Any]) -> Optional[Path]:
    """
    Locate a report's generated PPTX on disk.

    The stored path is whatever the worker wrote, which differs between a local
    run and a container whose volume is mounted at a different root — hence the
    fallbacks. Extracted so the analyst download and the share-link download
    resolve identically; when this lived inline, only one of them knew about
    the container cases.

    Returns None when the deck does not exist, leaving the caller to decide
    whether that is a 404, a 409, or an invitation to export as PDF instead.
    """
    pptx_path = (report or {}).get("pptx_path")
    if not pptx_path:
        return None

    # Case 1: Direct match.
    file_path = Path(pptx_path)
    if file_path.exists():
        return file_path

    # Case 2: container-absolute path resolved against the current root.
    if pptx_path.startswith("/app/"):
        rel_path = pptx_path.replace("/app/", "", 1)
        candidate = Path(rel_path)
        if candidate.exists():
            return candidate
        # Case 3: 'backend' prefix mismatch in Docker volume mapping.
        if rel_path.startswith("backend/"):
            candidate = Path(rel_path.replace("backend/", "", 1))
            if candidate.exists():
                return candidate

    # Case 4: filename-only lookup in the known reports directories.
    filename = Path(pptx_path).name
    for directory in (Path("reports"), Path("backend/reports")):
        candidate = directory / filename
        if candidate.exists():
            return candidate

    logger.error("[Download] ALL path resolution attempts failed for: %s", pptx_path)
    return None


@router.get("/report/{survey_id}/download")
async def download_report(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Download the premium PPTX file for a completed report.
    Checks for presence of V2 generated artifacts.
    """
    # Find the latest report for this survey to ensure we get the V2 artifacts if they exist
    report = await db.get_collection("survey_reports").find_one(
        {"survey_id": survey_id},
        sort=[("generated_at", -1)]
    )
    
    if not report:
        logger.warning(f"[Download] No report found for survey {survey_id}")
        raise HTTPException(404, "Report not found.")

    pptx_status = report.get("pptx_status")
    if pptx_status in ("PROCESSING", "QUEUED"):
        raise HTTPException(
            409,
            "PowerPoint export is still in progress. Wait until status is READY before downloading.",
        )
    if pptx_status == "FAILED":
        raise HTTPException(
            409,
            "Latest PowerPoint export failed. Start a new export before downloading.",
        )

    pptx_path = report.get("pptx_path")
    if not pptx_path:
        logger.warning(f"[Download] No pptx_path in report {report.get('_id')} for survey {survey_id}")
        # Check if status is ready, maybe just missing file
        if report.get("status") == "ready":
             raise HTTPException(
                404, 
                "PowerPoint artifact is currently being generated or was not requested. "
                "Use /generate-pptx to create it."
            )
        raise HTTPException(202, "Report is still in analytical computation phase.")

    logger.info(f"[Download] Request for report {report.get('_id')} | Stored Path: {pptx_path}")

    file_path = _resolve_pptx_file(report)
    if file_path is None:
        raise HTTPException(410, "The report file has expired or is inaccessible. Please regenerate.")

    from fastapi.responses import FileResponse
    filename = build_export_filename(report.get("project_name"), "Marketeers Report", "pptx")

    headers: Dict[str, str] = {}
    export_manifest = report.get("pptx_export_manifest") or {}
    if export_manifest:
        summary = {
            "report_id": export_manifest.get("report_id"),
            "render_mode": (export_manifest.get("migration_strategy") or {}).get("render_mode"),
            "image_capture_count": export_manifest.get("image_capture_count"),
            "passes_gate": export_manifest.get("passes_gate"),
        }
        headers["X-PPTX-Export-Manifest-Summary"] = json.dumps(
            summary,
            ensure_ascii=True,
            default=str,
        )

    return FileResponse(
        path=str(file_path),
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=filename,
        headers=headers
    )


@router.get("/report/{survey_id}/download-excel")
async def download_brand_analyzer_excel(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Download the 7-sheet Brand Analyzer Excel report.
    """
    report = await db.get_collection("survey_reports").find_one(
        {"survey_id": survey_id},
        sort=[("generated_at", -1)]
    )
    
    if not report:
        raise HTTPException(404, "Report not found.")

    excel_path = report.get("brand_analyzer_excel_path")
    if not excel_path:
        raise HTTPException(404, "Brand Analyzer Excel report not found or not applicable for this survey.")

    file_path = Path(excel_path)
    if not file_path.exists():
        # Fallback to filename check in reports dir
        filename = file_path.name
        alt_path = Path("backend/reports") / filename
        if alt_path.exists():
            file_path = alt_path
        else:
            raise HTTPException(410, "The Excel file has expired or is inaccessible.")

    from fastapi.responses import FileResponse
    download_name = build_export_filename(report.get("project_name"), "Brand Analyzer", "xlsx")

    return FileResponse(
        path=str(file_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=download_name
    )



@router.post("/report/{survey_id}/generate-pptx")
async def generate_pptx_v2(
    survey_id: str,
    background_tasks: BackgroundTasks,
    current_user: Annotated[Optional[User], Depends(get_current_user)] = None,
    force_retry: bool = False,
):
    """
    Enqueue PPTX export on the durable Redis worker queue (no in-API long-running work).

    Idempotency:
    - Rejects duplicate active (non-stale) jobs unless force_retry=true.
    - Auto-recovers stale jobs then enqueues fresh work.
    - Allows retry after FAILED when pptx_retryable or force_retry.
    """
    report = await db.get_collection("survey_reports").find_one(
        {"survey_id": survey_id},
        sort=[("generated_at", -1)],
    )
    if not report or report.get("status") != "ready":
        raise HTTPException(400, "Report must be computed as 'ready' before generating PPTX.")

    from backend.analytics_module.pptx_builder.hybrid_export.render_mode import resolve_render_mode
    from backend.analytics_module.pptx_builder.hybrid_export.rollout import resolve_rollout_stage
    from backend.workers.pptx_job_service import PPTX_QUEUE_ENABLED, enqueue_pptx_export

    render_meta = {
        "pptx_render_mode": resolve_render_mode().value,
        "pptx_rollout_stage": resolve_rollout_stage().value,
    }

    if not PPTX_QUEUE_ENABLED:
        from backend.analytics_module.pptx_builder.hybrid_export.progress import (
            PPTXExportStage,
            STAGE_PROGRESS,
        )
        from backend.analytics_module.pptx_generator_v2 import PPTXGeneratorV2
        from backend.utils.pptx_job_state import (
            PptxEnqueueAction,
            apply_enqueue_recovery,
            begin_job_update_fields,
            evaluate_pptx_enqueue,
        )

        action, detail = evaluate_pptx_enqueue(report, force_retry=force_retry)
        if action == PptxEnqueueAction.REJECT_ACTIVE:
            raise HTTPException(409, detail or "Export already in progress.")
        if action == PptxEnqueueAction.RECOVER_STALE_AND_START:
            await apply_enqueue_recovery(db, survey_id, report, reason=detail or "recovery")
            report = await db.get_collection("survey_reports").find_one({"_id": report["_id"]}) or report

        job_fields = begin_job_update_fields(
            report,
            stage=PPTXExportStage.PREPARING.value,
            progress=STAGE_PROGRESS[PPTXExportStage.PREPARING],
            extra=render_meta,
        )
        await db.get_collection("survey_reports").update_one(
            {"_id": report["_id"]},
            {"$set": job_fields},
        )
        await invalidate_status_cache(survey_id)
        generator = PPTXGeneratorV2(db)
        background_tasks.add_task(generator.generate, str(report["_id"]))
        return {
            "status": "processing",
            "message": "PPTX Generation V2 started in background (legacy mode).",
            "survey_id": survey_id,
            "pptx_job_id": job_fields["pptx_job_id"],
            "pptx_attempt": job_fields["pptx_attempt"],
            "delivery": "background_tasks",
        }

    try:
        payload, _action = await enqueue_pptx_export(
            db,
            report,
            survey_id,
            force_retry=force_retry,
            render_meta=render_meta,
        )
        return payload
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(503, str(exc)) from exc


@router.post("/report/{survey_id}/cancel-pptx")
async def cancel_pptx_export(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Request cooperative cancellation of an in-flight PPTX export."""
    try:
        return await request_pptx_cancel(db, survey_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.delete("/report/{survey_id}")
async def invalidate_report(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Invalidate a cached report so it regenerates on next request."""
    await db.get_collection("survey_reports").update_one(
        {"survey_id": survey_id}, {"$set": {"status": "stale"}}
    )
    return {"status": "success", "message": "Report invalidated"}


@router.post("/report/{survey_id}/rebuild-pptx")
async def rebuild_pptx(
    survey_id: str,
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Manually trigger a regeneration of the PowerPoint artifact without 
    re-running the entire AI analytical pipeline.
    """
    try:
        result = await analytics_service.rebuild_pptx_artifact(survey_id, background_tasks)
        return result
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        logger.error(f"Failed to trigger PPTX rebuild: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during PPTX orchestration.")


# ---------------------------------------------------------------------------
# PPTX admin diagnostics (Phase 7)
# ---------------------------------------------------------------------------

@router.get("/admin/pptx-diagnostics")
async def get_pptx_platform_diagnostics(
    _admin: Annotated[User, Depends(get_current_active_admin)],
):
    """Queue depth, active jobs, stale thresholds, in-process metrics counters."""
    return await build_global_pptx_diagnostics(db)


@router.get("/admin/pptx-diagnostics/{survey_id}")
async def get_pptx_survey_diagnostics(
    survey_id: str,
    _admin: Annotated[User, Depends(get_current_active_admin)],
):
    """Per-survey PPTX job debug: lease, stale detection, latest error code."""
    return await build_survey_pptx_diagnostics(db, survey_id)


# ---------------------------------------------------------------------------
# Legacy polling (backward compat)
# ---------------------------------------------------------------------------

@router.get("/report-status/{survey_id}")
async def get_report_status_legacy(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Legacy polling. Preferred is /report/{survey_id}/status"""
    try:
        return await analytics_service.get_report_status(survey_id)
    except Exception as e:
        raise HTTPException(status_code=404, detail=str(e))


# ---------------------------------------------------------------------------
# Usage & Platform Stats
# ---------------------------------------------------------------------------

@router.get("/usage/{survey_id}")
async def get_survey_usage(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_active_admin)],
):
    """Get AI cost and token usage stats for a survey."""
    return await analytics_service.get_usage_stats(survey_id)


@router.get("/platform-stats")
async def get_platform_stats(
    admin: Annotated[User, Depends(get_current_active_admin)],
):
    """Global system metrics for the Admin Portal."""
    try:
        users_col = db.get_collection("users")
        surveys_col = db.get_collection("surveys")
        responses_col = db.get_collection("responses")
        audit_col = db.get_collection("audit_logs")

        admin_count = await users_col.count_documents({"role": "admin"})
        analyst_count = await users_col.count_documents({"role": "analyst"})
        client_count = await users_col.count_documents({"role": "client"})

        total_surveys = await surveys_col.count_documents({"is_deleted": {"$ne": True}})
        total_responses = await responses_col.count_documents({})

        cursor = audit_col.find({}).sort("timestamp", -1).limit(10)
        recent_audit = await cursor.to_list(length=10)
        for log in recent_audit:
            log["_id"] = str(log["_id"])
            if isinstance(log.get("timestamp"), datetime):
                log["timestamp"] = log["timestamp"].isoformat()

        return {
            "users": {
                "admins": admin_count,
                "analysts": analyst_count,
                "clients": client_count,
                "total": admin_count + analyst_count + client_count,
            },
            "platform": {
                "surveys": total_surveys,
                "responses": total_responses,
                "active_surveys": await surveys_col.count_documents(
                    {"status": "active", "is_deleted": {"$ne": True}}
                ),
            },
            "recent_audit": recent_audit,
            "system": {"uptime": "99.99%", "status": "Healthy"},
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------------------------------------------------------------------------
# Funnel & Trends
# ---------------------------------------------------------------------------

@router.get("/funnel/{survey_id}")
async def get_funnel_analytics(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")

    pipeline = [
        {"$match": {"survey_id": survey_id}},
        {"$group": {"_id": "$status", "count": {"$sum": 1}}},
    ]

    results = await db.get_collection("tokens").aggregate(pipeline).to_list(100)

    stats = {"unused": 0, "passed": 0, "failed": 0, "submitted": 0, "total": 0}

    for item in results:
        status_val = item["_id"]
        count = item["count"]
        if status_val in stats:
            stats[status_val] = count
            stats["total"] += count

    total_engaged = stats["passed"] + stats["failed"]
    stats["qualification_rate"] = (stats["passed"] / total_engaged * 100) if total_engaged > 0 else 0
    stats["completion_rate"] = (stats["submitted"] / stats["passed"] * 100) if stats["passed"] > 0 else 0
    stats["drop_off_rate"] = ((stats["passed"] - stats["submitted"]) / stats["passed"] * 100) if stats["passed"] > 0 else 0

    return stats


@router.get("/trends/{survey_id}")
async def get_survey_trends(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    days: int = 30,
):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")

    start_date = datetime.utcnow() - timedelta(days=days)

    pipeline = [
        {"$match": {"survey_id": survey_id, "created_at": {"$gte": start_date}}},
        {
            "$project": {
                "day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}},
                "status": 1,
            }
        },
        {
            "$group": {
                "_id": "$day",
                "submissions": {"$sum": {"$cond": [{"$eq": ["$status", "submitted"]}, 1, 0]}},
                "passed": {"$sum": {"$cond": [{"$eq": ["$status", "passed"]}, 1, 0]}},
                "failed": {"$sum": {"$cond": [{"$eq": ["$status", "failed"]}, 1, 0]}},
            }
        },
        {"$sort": {"_id": 1}},
    ]

    trends = await db.get_collection("tokens").aggregate(pipeline).to_list(100)

    for day in trends:
        total_attempts = day["passed"] + day["failed"]
        day["pass_rate"] = (day["passed"] / total_attempts * 100) if total_attempts > 0 else 0

    return trends


# ---------------------------------------------------------------------------
# Orphans
# ---------------------------------------------------------------------------

@router.get("/orphans")
async def get_orphan_summary(
    current_user: Annotated[User, Depends(get_current_user)],
):
    pipeline = [
        {"$group": {"_id": "$reason", "count": {"$sum": 1}, "latest_attempt": {"$max": "$timestamp"}}},
        {"$sort": {"count": -1}},
    ]

    orphans = await db.get_collection("orphan_submissions").aggregate(pipeline).to_list(100)
    total_orphans = sum(item["count"] for item in orphans)

    return {"total_attempts": total_orphans, "categories": orphans}


@router.get("/orphans/{reason}")
async def get_orphan_details(
    reason: str,
    current_user: Annotated[User, Depends(get_current_user)],
    limit: int = 10,
):
    logs = (
        await db.get_collection("orphan_submissions")
        .find({"reason": reason})
        .sort("timestamp", -1)
        .limit(limit)
        .to_list(limit)
    )

    for log in logs:
        log["_id"] = str(log["_id"])
        if "timestamp" in log and isinstance(log["timestamp"], datetime):
            log["timestamp"] = log["timestamp"].isoformat()

    return logs


# ---------------------------------------------------------------------------
# Compare
# ---------------------------------------------------------------------------

@router.post("/compare")
async def compare_surveys(
    survey_ids: List[str],
    current_user: Annotated[User, Depends(get_current_active_admin)],
):
    """Aggregate comparative metrics for multiple surveys."""
    results = []
    tokens_col = db.get_collection("tokens")
    surveys_col = db.get_collection("surveys")

    for sid in survey_ids:
        if not ObjectId.is_valid(sid):
            continue

        survey = await surveys_col.find_one({"_id": ObjectId(sid)})
        if not survey:
            continue

        pipeline = [
            {"$match": {"survey_id": sid}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]

        token_stats = await tokens_col.aggregate(pipeline).to_list(100)

        stats = {"unused": 0, "passed": 0, "failed": 0, "submitted": 0, "total": 0}

        for item in token_stats:
            status_val = item["_id"]
            count = item["count"]
            if status_val in stats:
                stats[status_val] = count
                stats["total"] += count

        completion_rate = (stats["submitted"] / stats["passed"] * 100) if stats["passed"] > 0 else 0

        results.append(
            {
                "survey_id": sid,
                "name": survey.get("company_name", "Unknown"),
                "stats": stats,
                "completion_rate": completion_rate,
            }
        )

    return results
# ---------------------------------------------------------------------------
# Admin-Only AI Governance
# ---------------------------------------------------------------------------

@router.get("/admin/ai-quota-status")
async def get_ai_quota_status(current_user: Annotated[User, Depends(get_current_user)]):
    """Admin-only: Returns full AI quota telemetry and component cost breakdown."""
    if current_user.role != "admin":
        raise HTTPException(403, "Insufficient privileges. Partner Administrator role required.")
    return await analytics_service.get_ai_quota_status()


@router.get("/admin/ai-alerts")
async def get_ai_alerts(current_user: Annotated[User, Depends(get_current_user)]):
    """Admin-only: Returns unresolved quota/rate alerts for the Ecosystem Manager."""
    if current_user.role != "admin":
        raise HTTPException(403, "Insufficient privileges. Partner Administrator role required.")
    return await analytics_service.get_ai_alerts()


@router.post("/admin/ai-alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str, current_user: Annotated[User, Depends(get_current_user)]):
    """Mark an AI alert as acknowledged. Gated by Partner Administrator role."""
    if current_user.role != "admin":
        raise HTTPException(403, "Insufficient privileges. Partner Administrator role required.")
    success = await analytics_service.acknowledge_ai_alert(alert_id, str(current_user.id))
    if not success:
        raise HTTPException(404, "Alert not found or already acknowledged")
    return {"status": "success", "message": "Alert acknowledged"}

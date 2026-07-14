"""
Analytics Router — Phase 4 hardened.

Stable API contracts, structured error responses, idempotency guards,
file existence checks, and auto-generate endpoint.
"""
from __future__ import annotations

import json
import os
import logging
from pathlib import Path
from datetime import datetime, timedelta, timezone
from typing import Annotated, Dict, Any, List, Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Request, Response
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
from backend.utils.rate_limit import limiter, POLLING_LIMIT, polling_rate_key
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
    return report


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
    
    # Robust Path Resolution
    file_path = Path(pptx_path)
    
    # Case 1: Direct Match
    if file_path.exists():
        logger.info(f"[Download] Found file at primary path: {file_path}")
    
    # Case 2: Docker Environment Fallback (Internal Absolute -> Relative)
    elif pptx_path.startswith("/app/"):
        rel_path = pptx_path.replace("/app/", "", 1)
        file_path = Path(rel_path)
        logger.info(f"[Download] Attempting relative fallback: {rel_path}")
        if not file_path.exists():
             # Case 3: 'backend' prefix mismatch in Docker volume mapping
             if rel_path.startswith("backend/"):
                 deep_rel = rel_path.replace("backend/", "", 1)
                 file_path = Path(deep_rel)
                 logger.info(f"[Download] Attempting deep relative fallback: {deep_rel}")
    
    # Case 4: Filename-only check in known reports dir
    if not file_path.exists():
        filename = Path(pptx_path).name
        direct_check = Path("reports") / filename
        if direct_check.exists():
           file_path = direct_check
           logger.info(f"[Download] Found file via direct directory check: {direct_check}")
        else:
           # Legacy/Contextual check
           direct_check_v2 = Path("backend/reports") / filename
           if direct_check_v2.exists():
               file_path = direct_check_v2
               logger.info(f"[Download] Found file via contextual check: {direct_check_v2}")

    if not file_path.exists():
        logger.error(f"[Download] ALL path resolution attempts failed for: {pptx_path}")
        raise HTTPException(410, "The report file has expired or is inaccessible. Please regenerate.")

    from fastapi.responses import FileResponse
    project_name = (report.get("project_name") or "Survey").replace("/", "_").replace("\\", "_")
    filename = f"{project_name}_MarketInsights.pptx"

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
    project_name = (report.get("project_name") or "Survey").replace("/", "_").replace("\\", "_")
    download_name = f"{project_name}_BrandAnalyzer_Full.xlsx"

    return FileResponse(
        path=str(file_path),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=download_name
    )



@router.post("/report/{survey_id}/generate-pptx")
async def generate_pptx_v2(
    survey_id: str,
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_user)],
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

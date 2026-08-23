from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated, Optional
from bson import ObjectId
from datetime import datetime

from backend.models import User
from backend.database import db
from backend.routers.auth import get_current_user
from backend.services.packaging_heatmap_asset_service import get_packaging_image_from_config

router = APIRouter(prefix="/responses", tags=["responses"])


def _clean(doc: dict) -> dict:
    """Convert ObjectId fields to strings for JSON serialisation."""
    if "_id" in doc:
        doc["_id"] = str(doc["_id"])
    for k, v in doc.items():
        if isinstance(v, ObjectId):
            doc[k] = str(v)
        elif isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc


# ─── 1. Survey-level overview ────────────────────────────────────────
@router.get("/survey/{survey_id}/overview")
async def get_responses_overview(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)]
):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")

    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    # Aggregate token statuses
    token_pipeline = [
        {"$match": {"survey_id": survey_id}},
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "excluded_count": {"$sum": {"$cond": [{"$eq": ["$excluded", True]}, 1, 0]}}
        }}
    ]
    token_agg = await db.get_collection("tokens").aggregate(token_pipeline).to_list(20)
    status_counts = {item["_id"]: item["count"] for item in token_agg}
    excluded_counts = {item["_id"]: item.get("excluded_count", 0) for item in token_agg}

    total_tokens = sum(status_counts.values())
    submitted = status_counts.get("submitted", 0)
    passed = status_counts.get("passed", 0)
    failed = status_counts.get("failed", 0)
    unused = status_counts.get("unused", 0)
    
    total_excluded = sum(excluded_counts.values())
    submitted_excluded = excluded_counts.get("submitted", 0)

    # Count actual response documents
    response_count = await db.get_collection("responses").count_documents({
        "survey_id": survey_id, "source": {"$ne": "layer1"}
    })

    # ── Target Gating: compute quota totals and readiness ──────────
    quota_tracking = survey.get("quota_tracking") or {}
    from backend.services.quota_enforcement import compute_target_reached, resolve_respondent_target
    respondent_target = resolve_respondent_target(survey)

    if quota_tracking:
        # Sum across all demographic buckets
        quota_target = sum(q.get("target", 0) for q in quota_tracking.values())
        quota_current = sum(q.get("current", 0) for q in quota_tracking.values())
    else:
        # Fallback to simple respondent_target / submitted count
        quota_target = respondent_target
        quota_current = submitted - submitted_excluded # Only count valid completions

    target_reached = compute_target_reached(quota_target, quota_current)

    # Check if a report already exists for this survey
    report_doc = await db.get_collection("survey_reports").find_one(
        {"survey_id": survey_id}, {"status": 1}
    )
    report_status = report_doc["status"] if report_doc else None

    pt_config = survey.get("product_test_config") or {}
    hm_images: dict = {}
    for side in ("front", "back"):
        asset = get_packaging_image_from_config(pt_config, side)
        if asset:
            hm_images[side] = asset.model_dump(mode="json")

    return {
        "survey_id": survey_id,
        "company_name": survey.get("company_name", ""),
        "status": survey.get("status", "draft"),
        "respondent_target": respondent_target,
        "respondent_count": survey.get("respondent_count", 0),
        "token_summary": {
            "total": total_tokens,
            "unused": unused,
            "passed": passed,
            "failed": failed,
            "submitted": submitted,
            "excluded": total_excluded
        },
        "verified_complete": submitted - submitted_excluded,
        "verified_incomplete": passed - excluded_counts.get("passed", 0),
        "rejected": failed - excluded_counts.get("failed", 0),
        "pending": unused,
        "excluded_count": total_excluded,
        "response_count": response_count,
        # ── Report Target Gating ──
        "quota_target": quota_target,
        "quota_current": quota_current,
        "target_reached": target_reached,
        "report_status": report_status,
        "module_snapshots": survey.get("module_snapshots") or {},
        "analytical_mapping": survey.get("analytical_mapping") or {},
        "packaging_heatmap": {
            "enabled": bool(pt_config.get("packaging_heatmap_enabled")) and bool(hm_images.get("front")),
            "images": hm_images,
        },
    }


# ─── 2. Paginated respondent list ────────────────────────────────────
@router.get("/survey/{survey_id}/respondents")
async def get_respondents(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
    lifecycle: Optional[str] = None,   # verified_complete | verified_incomplete | rejected | pending
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 30,
):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")

    tokens_col = db.get_collection("tokens")
    responses_col = db.get_collection("responses")

    # Build token filter
    token_filter = {"survey_id": survey_id}
    if lifecycle == "verified_complete":
        token_filter["status"] = "submitted"
        token_filter["excluded"] = {"$ne": True}
    elif lifecycle == "verified_incomplete":
        token_filter["status"] = "passed"
        token_filter["excluded"] = {"$ne": True}
    elif lifecycle == "rejected":
        token_filter["status"] = "failed"
        token_filter["excluded"] = {"$ne": True}
    elif lifecycle == "pending":
        token_filter["status"] = "unused"
        token_filter["excluded"] = {"$ne": True}
    elif lifecycle == "excluded":
        token_filter["excluded"] = True

    # Fetch tokens
    skip = (page - 1) * page_size
    total = await tokens_col.count_documents(token_filter)
    token_docs = await tokens_col.find(token_filter).sort("created_at", -1).skip(skip).limit(page_size).to_list(page_size)

    # Batch-fetch all responses for these tokens
    token_strs = [t["token"] for t in token_docs]
    response_docs = await responses_col.find({
        "survey_id": survey_id,
        "token": {"$in": token_strs}
    }).to_list(500)

    # Index responses by token
    responses_by_token = {}
    for r in response_docs:
        tk = r["token"]
        if tk not in responses_by_token:
            responses_by_token[tk] = {"layer1": None, "layer2": None}
        source = r.get("source", "")
        if source == "layer1":
            responses_by_token[tk]["layer1"] = r
        else:
            responses_by_token[tk]["layer2"] = r

    items = []
    for t in token_docs:
        tk = t["token"]
        resp_data = responses_by_token.get(tk, {"layer1": None, "layer2": None})
        l1 = resp_data["layer1"]
        l2 = resp_data["layer2"]

        # Compute lifecycle state
        status = t.get("status", "unused")
        if status == "submitted":
            lifecycle_state = "verified_complete"
        elif status == "passed":
            lifecycle_state = "verified_incomplete"
        elif status == "failed":
            lifecycle_state = "rejected"
        else:
            lifecycle_state = "pending"

        # Extract respondent info from L1 answers
        l1_answers = (l1.get("answers") if l1 else {}) or {}
        respondent_name = l1_answers.get("name") or l1_answers.get("Full Name / الاسم بالكامل") or ""
        respondent_phone = t.get("phone") or l1.get("phone", "") if l1 else t.get("phone", "")
        respondent_gender = l1_answers.get("gender_auto") or l1_answers.get("Gender / النوع") or ""
        respondent_age = l1_answers.get("age_auto") or l1_answers.get("Age Range / الفئة العمرية") or ""

        # Rejection reason (from gate quota logic)
        rejection_reason = None
        if lifecycle_state == "rejected":
            # Check if layer1_passed is explicitly False
            if t.get("layer1_passed") is False:
                rejection_reason = "Did not meet screening criteria (quota full or demographic mismatch)"
            else:
                rejection_reason = "Failed screening validation"

        # Search filter (post-query for name/phone)
        if search:
            q = search.lower()
            if q not in respondent_name.lower() and q not in str(respondent_phone).lower() and q not in tk.lower():
                continue

        item = {
            "token": tk,
            "token_id": str(t["_id"]),
            "lifecycle_state": lifecycle_state,
            "respondent_name": respondent_name,
            "respondent_phone": respondent_phone,
            "respondent_gender": respondent_gender,
            "respondent_age": respondent_age,
            "rejection_reason": rejection_reason,
            "created_at": t.get("created_at").isoformat() if t.get("created_at") else None,
            "last_accessed": t.get("last_accessed").isoformat() if t.get("last_accessed") else None,
            "submitted_at": l2.get("submitted_at").isoformat() if l2 and l2.get("submitted_at") else (
                l1.get("submitted_at").isoformat() if l1 and l1.get("submitted_at") else None
            ),
            "has_l1": l1 is not None,
            "has_l2": l2 is not None,
            "l1_answer_count": len(l1_answers),
            "l2_answer_count": len(l2.get("answers", {})) if l2 else 0,
            "excluded": t.get("excluded", False),
            "exclusion_reason": t.get("exclusion_reason"),
        }
        items.append(item)

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


# ─── 3. Single respondent detail ─────────────────────────────────────
@router.get("/survey/{survey_id}/respondent/{token}")
async def get_respondent_detail(
    survey_id: str,
    token: str,
    current_user: Annotated[User, Depends(get_current_user)]
):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")

    token_doc = await db.get_collection("tokens").find_one({
        "survey_id": survey_id, "token": token
    })
    if not token_doc:
        raise HTTPException(status_code=404, detail="Token not found")

    # Fetch all responses for this token
    responses = await db.get_collection("responses").find({
        "survey_id": survey_id, "token": token
    }).to_list(10)

    l1_response = None
    l2_response = None
    for r in responses:
        src = r.get("source", "")
        if src == "layer1":
            l1_response = _clean(r)
        else:
            l2_response = _clean(r)

    status = token_doc.get("status", "unused")
    if status == "submitted":
        lifecycle_state = "verified_complete"
    elif status == "passed":
        lifecycle_state = "verified_incomplete"
    elif status == "failed":
        lifecycle_state = "rejected"
    else:
        lifecycle_state = "pending"

    l1_answers = (l1_response.get("answers") if l1_response else {}) or {}

    rejection_reason = None
    if lifecycle_state == "rejected":
        if token_doc.get("layer1_passed") is False:
            rejection_reason = "Did not meet screening criteria (quota full or demographic mismatch)"
        else:
            rejection_reason = "Failed screening validation"

    # Build timeline events
    timeline = []
    if token_doc.get("created_at"):
        timeline.append({
            "event": "Link Generated",
            "timestamp": token_doc["created_at"].isoformat() if isinstance(token_doc["created_at"], datetime) else token_doc["created_at"],
            "icon": "link"
        })
    if token_doc.get("last_accessed"):
        timeline.append({
            "event": "Survey Accessed",
            "timestamp": token_doc["last_accessed"].isoformat() if isinstance(token_doc["last_accessed"], datetime) else token_doc["last_accessed"],
            "icon": "eye"
        })
    if l1_response and l1_response.get("submitted_at"):
        event_name = "Screening Passed" if lifecycle_state != "rejected" else "Screening Failed"
        timeline.append({
            "event": event_name,
            "timestamp": l1_response["submitted_at"] if isinstance(l1_response["submitted_at"], str) else l1_response["submitted_at"].isoformat(),
            "icon": "shield-check" if lifecycle_state != "rejected" else "shield-x"
        })
    if l2_response and l2_response.get("submitted_at"):
        timeline.append({
            "event": "Full Response Submitted",
            "timestamp": l2_response["submitted_at"] if isinstance(l2_response["submitted_at"], str) else l2_response["submitted_at"].isoformat(),
            "icon": "check-circle"
        })

    return {
        "token": token,
        "lifecycle_state": lifecycle_state,
        "rejection_reason": rejection_reason,
        "respondent_name": l1_answers.get("name") or l1_answers.get("Full Name / الاسم بالكامل") or "",
        "respondent_phone": token_doc.get("phone") or (l1_response.get("phone") if l1_response else "") or "",
        "respondent_gender": l1_answers.get("gender_auto") or l1_answers.get("Gender / النوع") or "",
        "respondent_age": l1_answers.get("age_auto") or l1_answers.get("Age Range / الفئة العمرية") or "",
        "respondent_area": l1_answers.get("area") or l1_answers.get("Location / Area / المحافظة أو المنطقة") or "",
        "respondent_ses": l1_answers.get("calculated_ses_class") or "",
        "timeline": timeline,
        "l1_answers": l1_answers,
        "l2_answers": l2_response.get("answers") if l2_response else {},
        "created_at": token_doc.get("created_at").isoformat() if token_doc.get("created_at") and isinstance(token_doc.get("created_at"), datetime) else token_doc.get("created_at"),
        "submitted_at": l2_response.get("submitted_at") if l2_response else None,
        "excluded": token_doc.get("excluded", False),
        "exclusion_reason": token_doc.get("exclusion_reason"),
        "excluded_at": token_doc.get("excluded_at").isoformat() if token_doc.get("excluded_at") and isinstance(token_doc.get("excluded_at"), datetime) else None,
    }

@router.patch("/survey/{survey_id}/respondent/{token}/exclude")
async def toggle_respondent_exclusion(
    survey_id: str,
    token: str,
    payload: dict,
    current_user: Annotated[User, Depends(get_current_user)]
):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")

    excluded = payload.get("excluded", False)
    reason = payload.get("exclusion_reason")

    tokens_col = db.get_collection("tokens")
    surveys_col = db.get_collection("surveys")

    # Find token
    token_doc = await tokens_col.find_one({"survey_id": survey_id, "token": token})
    if not token_doc:
        raise HTTPException(status_code=404, detail="Token not found")

    already_excluded = token_doc.get("excluded", False)
    if already_excluded == excluded:
        return {"message": "Status already set", "excluded": excluded}

    from backend.services.quota_enforcement import (
        release_token_quota_reservation,
        resolve_respondent_target,
        resolve_quota_buckets,
        try_reserve_quota_slots,
    )

    if token_doc.get("status") == "submitted" and not excluded and token_doc.get("quota_reserved"):
        survey_doc = await surveys_col.find_one({"_id": ObjectId(survey_id)})
        l1_response = await db.get_collection("responses").find_one(
            {"survey_id": survey_id, "token": token, "source": "layer1"}
        )
        l1_answers = l1_response.get("answers", {}) if l1_response else {}
        reservation = await try_reserve_quota_slots(
            surveys_col,
            survey_id,
            global_target=resolve_respondent_target(survey_doc or {}),
            buckets=resolve_quota_buckets(
                l1_answers,
                (survey_doc or {}).get("gate_quotas") or {},
            ),
        )
        if not reservation.ok:
            raise HTTPException(
                status_code=409,
                detail="Cannot restore respondent because survey quota is full.",
            )

    # Update token
    update_data = {
        "excluded": excluded,
        "exclusion_reason": reason if excluded else None,
        "excluded_at": datetime.utcnow() if excluded else None
    }
    
    await tokens_col.update_one(
        {"_id": token_doc["_id"]},
        {"$set": update_data}
    )

    # Adjust survey quota slots when a submitted response is excluded or restored
    if token_doc.get("status") == "submitted":
        if token_doc.get("quota_reserved"):
            if excluded:
                await release_token_quota_reservation(surveys_col, survey_id, token_doc)
        else:
            inc_value = -1 if excluded else 1
            await surveys_col.update_one(
                {"_id": ObjectId(survey_id)},
                {"$inc": {"respondent_count": inc_value}},
            )

    return {"message": "Response status updated", "excluded": excluded}

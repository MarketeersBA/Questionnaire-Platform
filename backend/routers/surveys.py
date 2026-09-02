from fastapi import APIRouter, Depends, HTTPException, status
from typing import Any, Dict, List, Annotated, Optional
from bson import ObjectId

from datetime import datetime, timedelta
from backend.models import Survey, SurveyCreate, User, SurveyUpdate
from backend.database import db
from backend.routers.auth import get_current_user, get_current_active_analyst
from backend.utils.logging_utils import logger
from backend.utils.audit_utils import log_action
from backend.services.analytics_service import analytics_service
from backend.services.orchestration_service import orchestration_service
from backend.services.product_test_orchestration import (
    migrate_legacy_l2_to_product_test_snapshot,
    resolve_orchestration_language,
    strip_product_test_from_l2,
)
from backend.services.product_test_public_gateway import is_product_test_survey
from backend.services.product_test_snapshot_migration import (
    ensure_brand_aware_product_test_snapshot,
)
from backend.utils.blueprint_overlay import overlay_blueprint_edits

async def _apply_orchestrated_schema(target: dict, orchestrated_schema: dict) -> None:
    """Persist orchestrated layers and dedicated product_test_snapshot."""
    language = resolve_orchestration_language(target)

    pt_snapshot = orchestrated_schema.get("product_test_snapshot")
    if not pt_snapshot and not target.get("product_test_snapshot"):
        legacy_l2 = target.get("template_snapshot_l2")
        pt_snapshot = migrate_legacy_l2_to_product_test_snapshot(legacy_l2, language)

    # Phase 5: lazy brand expansion when Parameters have brands but snapshot is legacy.
    pt_snapshot = await ensure_brand_aware_product_test_snapshot(
        target,
        orchestration_service,
        current_snapshot=pt_snapshot or target.get("product_test_snapshot"),
    )

    target["template_snapshot_schema"] = orchestrated_schema
    target["template_snapshot_questions"] = (
        orchestrated_schema["layer1_structure"]["sections"][0]["questions"]
        if orchestrated_schema["layer1_structure"]["sections"]
        else []
    )
    target["template_snapshot_l2"] = strip_product_test_from_l2(
        orchestrated_schema.get("layer2_structure")
    )
    if pt_snapshot:
        target["product_test_snapshot"] = pt_snapshot


router = APIRouter(prefix="/surveys", tags=["surveys"])

CONFIGURABLE_MODULE_IDS = ("purchase_funnel", "brand_usage", "brand_pricing_behavior", "brand_analyzer")


def _module_enabled_on_create(survey_in: SurveyCreate, module_id: str) -> bool:
    if module_id in (survey_in.selected_modules or []):
        return True
    if module_id in (survey_in.module_sequence or []):
        return True
    if module_id == "purchase_funnel":
        return bool((survey_in.purchase_funnel or {}).get("is_enabled"))
    if module_id == "brand_usage":
        return bool((survey_in.brand_usage or {}).get("is_enabled"))
    if module_id == "brand_pricing_behavior":
        return bool((survey_in.brand_pricing_behavior or {}).get("is_enabled"))
    if module_id == "brand_analyzer":
        return bool((survey_in.brand_analyzer.is_enabled if survey_in.brand_analyzer else False))
    if module_id == "product_test":
        return bool(survey_in.product_test_config) or survey_in.type == "product_test"
    return False


async def _ensure_module_snapshots(survey_in: SurveyCreate) -> dict:
    from backend.services.question_module_service import question_module_service

    snapshots = dict(getattr(survey_in, "module_snapshots", {}) or {})
    for module_id in CONFIGURABLE_MODULE_IDS:
        if not _module_enabled_on_create(survey_in, module_id):
            continue
        if snapshots.get(module_id):
            continue
        active = await question_module_service.get_active_module(module_id)
        if active:
            logger.info(f"Auto-snapshotting active module: {module_id}")
            snapshots[module_id] = question_module_service.build_snapshot(active)
    return snapshots

@router.get("/stats")
async def get_survey_stats(
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Aggregate real-time statistics for the dashboard."""
    try:
        surveys_col = db.get_collection("surveys")
        responses_col = db.get_collection("responses")
        tokens_col = db.get_collection("tokens")

        # 0. RBAC Filter
        query_filter = {"is_deleted": {"$ne": True}}
        user_filter = {}
        if current_user.role == "client":
            query_filter["created_by"] = current_user.username
            user_filter["created_by"] = current_user.username

        # 1. Survey counts
        total_surveys = await surveys_col.count_documents(query_filter)
        active_surveys = await surveys_col.count_documents({**query_filter, "status": "active"})
        
        # 2. Response counts (Join with survey to filter by user)
        # For simplicity if analyst/admin, count all. If client, we need to find their surveys first.
        if current_user.role == "client":
            user_surveys = await surveys_col.find({"created_by": current_user.username}, {"_id": 1}).to_list(None)
            survey_ids = [str(s["_id"]) for s in user_surveys]
            total_responses = await responses_col.count_documents({"survey_id": {"$in": survey_ids}})
            total_tokens = await tokens_col.count_documents({"survey_id": {"$in": survey_ids}})
            qualified_tokens = await tokens_col.count_documents({"survey_id": {"$in": survey_ids}, "status": {"$in": ["passed", "submitted"]}})
        else:
            total_responses = await responses_col.count_documents({})
            total_tokens = await tokens_col.count_documents({})
            qualified_tokens = await tokens_col.count_documents({"status": {"$in": ["passed", "submitted"]}})
            
        match_rate = (qualified_tokens / total_tokens * 100) if total_tokens > 0 else 0
        
        # 4. Engagement Volume aggregation (Monthly)
        pipeline = [
            {
                "$project": {
                    "month": {"$month": "$submitted_at"},
                    "year": {"$year": "$submitted_at"}
                }
            },
            {
                "$group": {
                    "_id": {"month": "$month", "year": "$year"},
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"_id.year": 1, "_id.month": 1}},
            {"$limit": 6}
        ]
        
        response_growth = await responses_col.aggregate(pipeline).to_list(6)
        
        month_map = {1: "Jan", 2: "Feb", 3: "Mar", 4: "Apr", 5: "May", 6: "Jun", 
                     7: "Jul", 8: "Aug", 9: "Sep", 10: "Oct", 11: "Nov", 12: "Dec"}
        
        engagement_chart = []
        for item in response_growth:
            m = month_map.get(item["_id"]["month"], "???")
            engagement_chart.append({"name": m, "surveys": item["count"]})
            
        # Fallback if no response data exists yet
        if not engagement_chart:
            current_month = datetime.utcnow().month
            engagement_chart = [{"name": month_map[current_month], "surveys": total_responses}]

        return {
            "total_surveys": total_surveys,
            "active_surveys": active_surveys,
            "total_responses": total_responses,
            "match_rate": round(match_rate, 1),
            "engagement_chart": engagement_chart,
            "uptime": "99.9",
            "accuracy": round(94.2, 1)
        }
    except Exception as e:
        logger.error(f"Error aggregating dashboard stats: {e}")
        return {
            "total_surveys": 0,
            "active_surveys": 0,
            "total_responses": 0,
            "match_rate": 0,
            "engagement_chart": [{"name": "No Data", "surveys": 0}],
            "uptime": "0.0",
            "accuracy": 0.0
        }

def extract_layer1_questions(doc: dict) -> list:
    """Robustly extract questions from both legacy and structured template formats."""
    questions = doc.get("layer1_questions", [])
    if not isinstance(questions, list): questions = []
    
    l1_struct = doc.get("layer1_structure", {})
    if isinstance(l1_struct, dict):
        # 1. Try nested sections (standard for imported templates)
        sections = l1_struct.get("sections", [])
        if sections and isinstance(sections, list):
            for section in sections:
                if isinstance(section, dict):
                    qs = section.get("questions", [])
                    if isinstance(qs, list):
                        for q in qs:
                            if q not in questions: questions.append(q)
        
        # 2. Try direct questions in structure
        struct_qs = l1_struct.get("questions", [])
        if struct_qs and isinstance(struct_qs, list):
            for q in struct_qs:
                if q not in questions: questions.append(q)
                
    # Deduplicate by ID to be safe
    seen = set()
    deduped = []
    for q in questions:
        qid = q.get("id") or str(q.get("label"))
        if qid not in seen:
            seen.add(qid)
            deduped.append(q)
    return deduped

@router.get("/check-code/{code}")
async def check_survey_code(
    code: str,
    current_user: Annotated[User, Depends(get_current_user)],
    exclude_id: Optional[str] = None
):
    """Check if a survey code is already taken by a non-deleted survey."""
    surveys_col = db.get_collection("surveys")
    query = {
        "survey_code": code,
        "is_deleted": {"$ne": True}
    }
    if exclude_id:
        from bson import ObjectId
        query["_id"] = {"$ne": ObjectId(exclude_id)}

    existing = await surveys_col.find_one(query)
    return {"exists": existing is not None}

@router.post("/", response_model=Survey)
async def create_survey(
    survey_in: SurveyCreate,
    current_user: Annotated[User, Depends(get_current_user)]
):
    logger.info(f"--- CREATING SURVEY: {survey_in.company_name} | Requested Links: {survey_in.links_count} ---")
    
    # 1. Fetch template and ensure it's not deleted
    if not ObjectId.is_valid(survey_in.template_id):
         raise HTTPException(status_code=400, detail="Invalid template ID")
    
    templates_col = db.get_collection("templates")
    template_doc = await templates_col.find_one({"_id": ObjectId(survey_in.template_id)})
    
    if not template_doc or template_doc.get("is_deleted"):
        raise HTTPException(status_code=400, detail="Template not found or deleted")

    # 2. Extract immutable snapshot robustly
    questions = survey_in.template_snapshot_questions
    if questions is None:
        questions = extract_layer1_questions(template_doc)
        logger.info(f"Fallback: Extracted {len(questions)} questions from template")
    else:
        logger.info(f"Using provided snapshot of {len(questions)} questions")

    schema = survey_in.template_snapshot_schema
    if schema is None:
        schema = template_doc.get("layer1_question_schema", {})
        if not schema and "layer1_structure" in template_doc:
            schema = template_doc["layer1_structure"].get("schema", {})
        logger.info("Fallback: Extracted schema from template")

    l2_snapshot = survey_in.template_snapshot_l2
    if l2_snapshot is None:
        l2_snapshot = template_doc.get("layer2_structure", {})
        logger.info("Fallback: Extracted L2 structure from template")

    # 3. Initialize quota tracking from gate_quotas if present
    quota_tracking = {}
    if survey_in.gate_quotas:
        for gate_key, options in survey_in.gate_quotas.items():
            # Check if options is a dict (e.g., {"18-25": {"count": 6}})
            if isinstance(options, dict):
                for option_key, quota_data in options.items():
                    if isinstance(quota_data, dict) and "count" in quota_data:
                        quota_tracking[f"{gate_key}_{option_key}"] = {
                            "target": quota_data["count"],
                            "current": 0
                        }

    # 4. Upsert logic based on survey_code to prevent duplicates and allow updates
    surveys_col = db.get_collection("surveys")
    
    # Check for existing survey by survey_code
    if not survey_in.survey_code:
        raise HTTPException(status_code=400, detail="Survey code is required")

    existing_survey = await surveys_col.find_one({
        "survey_code": survey_in.survey_code,
        "is_deleted": {"$ne": True}
    })

    if existing_survey:
        logger.info(f"Existing survey detected with code: {survey_in.survey_code}. Updating ID: {existing_survey['_id']}")
        
        # Merge snapshots and config into existing document
        update_data = {
            "company_name": survey_in.company_name,
            "template_id": survey_in.template_id,
            "template_version": template_doc.get("version", 1),
            "template_snapshot_schema": schema,
            "template_snapshot_questions": questions,
            "template_snapshot_l2": l2_snapshot,
            "customizations": survey_in.customizations.model_dump() if hasattr(survey_in.customizations, "model_dump") else survey_in.customizations,
            "layer1_screening_config": survey_in.layer1_screening_config.model_dump() if hasattr(survey_in.layer1_screening_config, "model_dump") else survey_in.layer1_screening_config,
            "layer1_rules": survey_in.layer1_rules.model_dump() if hasattr(survey_in.layer1_rules, "model_dump") else survey_in.layer1_rules,
            "taste_test_config": survey_in.taste_test_config,
            "product_test_config": survey_in.product_test_config,
            "pf_config": survey_in.pf_config,
            "purchase_funnel": survey_in.purchase_funnel,
            "brand_analyzer": survey_in.brand_analyzer.model_dump() if survey_in.brand_analyzer else None,
            "brand_usage": survey_in.brand_usage,
            "brand_pricing_behavior": survey_in.brand_pricing_behavior,
            "module_snapshots": {
                **(existing_survey.get("module_snapshots") or {}),
                **(survey_in.module_snapshots or {}),
            },
            "blueprint": survey_in.blueprint.model_dump() if survey_in.blueprint else None,
            "quota_tracking": quota_tracking if not existing_survey.get("quota_tracking") else existing_survey.get("quota_tracking"),
            "gate_quotas": survey_in.gate_quotas,
            "status": existing_survey.get("status", "draft"),
            "type": survey_in.type,
            "industry": survey_in.industry,
            "survey_objective": survey_in.survey_objective,
            "survey_objective_other": survey_in.survey_objective_other,
            "voice_capture": survey_in.voice_capture.model_dump() if survey_in.voice_capture else None,
            "ai_followup": survey_in.ai_followup.model_dump() if survey_in.ai_followup else None,
            "selected_modules": survey_in.selected_modules,
            "module_sequence": survey_in.module_sequence,
            "google_form_id": survey_in.google_form_id,
            "google_form_url": survey_in.google_form_url,
            "sample_capacity": survey_in.sample_capacity,
            "respondent_target": survey_in.sample_capacity,
            "updated_at": datetime.utcnow(),
            "last_edited_by": current_user.username
        }
        
        # 3.5 Orchestrate Logic
        orchestrated_schema = await orchestration_service.compose_survey_schema(update_data)
        await _apply_orchestrated_schema(update_data, orchestrated_schema)
        overlay_blueprint_edits(
            update_data,
            survey_in.template_snapshot_schema,
            survey_in.product_test_snapshot,
        )

        await surveys_col.update_one({"_id": existing_survey["_id"]}, {"$set": update_data})
        # INVAlidate Reports: Systematic fix for labels
        await analytics_service.invalidate_survey_cache(str(existing_survey["_id"]))
        created_survey = await surveys_col.find_one({"_id": existing_survey["_id"]})
    else:
        # Create new survey
        logger.info(f"Creating new unique survey with code: {survey_in.survey_code}")
        new_survey_data = survey_in.model_dump()

        new_survey_data["module_snapshots"] = await _ensure_module_snapshots(survey_in)

        new_survey_data.update({
            "template_version": template_doc.get("version", 1),
            "template_snapshot_schema": schema,
            "template_snapshot_questions": questions,
            "template_snapshot_l2": l2_snapshot,
            "quota_tracking": quota_tracking,
            "respondent_target": survey_in.sample_capacity,
            "status": "draft",
            "created_by": current_user.username,
            "created_at": datetime.utcnow()
        })
        # 3.5 Orchestrate Logic
        orchestrated_schema = await orchestration_service.compose_survey_schema(new_survey_data)
        await _apply_orchestrated_schema(new_survey_data, orchestrated_schema)
        overlay_blueprint_edits(
            new_survey_data,
            survey_in.template_snapshot_schema,
            survey_in.product_test_snapshot,
        )

        result = await surveys_col.insert_one(new_survey_data)
        created_survey = await surveys_col.find_one({"_id": result.inserted_id})

    logger.info(f"Survey {created_survey['_id']} processed by {current_user.username}")
    
    await log_action(
        user=current_user,
        action="create_survey",
        resource_type="surveys",
        resource_id=str(created_survey["_id"]),
        details={"company": survey_in.company_name, "links": survey_in.links_count}
    )

    # 4. Automated Token Generation (Link Studio Provisioning)
    links_count = survey_in.links_count
    generated_tokens = []
    if links_count > 0:
        import uuid
        from datetime import timedelta
        token_documents = []
        batch_id = str(uuid.uuid4())[:8]
        expires_at = datetime.utcnow() + timedelta(days=30)
        
        for _ in range(links_count):
            token_str = str(uuid.uuid4())[:12].upper() # Human readable but secure enough
            generated_tokens.append(token_str)
            token_documents.append({
                "survey_id": str(created_survey["_id"]),
                "token": token_str,
                "status": "unused",
                "batch_id": batch_id,
                "created_by": current_user.username,
                "created_at": datetime.utcnow(),
                "expires_at": expires_at,
                "last_accessed": None
            })
        
        if token_documents:
            await db.get_collection("tokens").insert_many(token_documents)
            # Persist these tokens in the survey document for Link Studio consistency
            await db.get_collection("surveys").update_one(
                {"_id": created_survey["_id"]},
                {"$set": {"generated_tokens": generated_tokens}}
            )
            created_survey["generated_tokens"] = generated_tokens
            logger.info(f"Auto-generated {links_count} tokens for survey {created_survey['_id']}")

    return created_survey

#: Heavy fields left out of the survey *list*.
#:
#: A survey document carries its whole authored structure — every question,
#: every brand rotation, every generated respondent token. Across 43 surveys
#: that was most of the 3.0 MB this endpoint returned, and no list caller reads
#: any of it: the list views need names, counts and status, while cloning and
#: editing fetch a single survey by id and get the full document.
#:
#: The cost was not the query but serialising and shipping 3 MB on every call,
#: from several pages at once — which is how this endpoint came to average
#: nearly a minute under load.
#:
#: Only fields that are OPTIONAL on the `Survey` response model may appear
#: here. `template_snapshot_schema` and `template_snapshot_questions` are
#: required, so excluding them made every response fail validation with a 500
#: and the whole UI render as zeroes. Anything added below must be checked
#: against `Survey.model_fields[...].is_required()` first.
LIST_PROJECTION = {
    "template_snapshot_l2": 0,
    "module_snapshots": 0,
    "product_test_snapshot": 0,
    "generated_tokens": 0,
}


@router.get("/", response_model=List[Survey])
async def list_surveys(
    current_user: Annotated[User, Depends(get_current_user)]
):
    surveys_col = db.get_collection("surveys")

    # Global Visibility: All roles see all non-deleted surveys
    query = {"is_deleted": {"$ne": True}}

    surveys_list = (
        await surveys_col.find(query, LIST_PROJECTION)
        .sort("created_at", -1)
        .to_list(1000)
    )
    return surveys_list


#: Everything that belongs to a survey and has to go with it on a permanent
#: delete. Leaving any of these behind produces orphans that still consume
#: space and, worse, still resolve: a stray `report_shares` row keeps a client
#: URL alive after the survey it points at is gone.
#:
#: Keyed by collection, valued by the field holding the survey id, because the
#: schema is not consistent about the name.
SURVEY_OWNED_COLLECTIONS = {
    "responses": "survey_id",
    "survey_responses": "survey_id",
    "survey_reports": "survey_id",
    "report_shares": "survey_id",
    "tokens": "survey_id",
    "survey_sessions": "survey_id",
    "ai_insight_cache": "survey_id",
    "packaging_heatmap_aggregates": "survey_id",
    "packaging_heatmap_feedback": "survey_id",
    "product_test_media_assets": "survey_id",
    "voice_feedbacks": "survey_id",
    "orphan_submissions": "survey_id",
}


@router.delete("/{survey_id}")
async def delete_survey(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_active_analyst)],
    permanent: bool = False,
):
    """
    Remove a survey. Archived by default; `permanent=true` erases it.

    Archiving sets `is_deleted` and hides the survey from every list, which is
    the right default because it is reversible — an archived survey and all its
    responses can be brought back.

    A permanent delete removes the survey document and everything that belongs
    to it: responses, reports, share links, respondent tokens, cached AI
    insights, media. That is not reversible, which is why it has to be asked
    for explicitly rather than being what the delete button happens to do.

    Related records are removed *before* the survey itself, so an interruption
    part-way through leaves the survey still present with less data attached —
    recoverable and visible — rather than a vanished survey with orphaned rows
    pointing at an id that no longer exists.
    """
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")

    surveys_col = db.get_collection("surveys")
    survey = await surveys_col.find_one({"_id": ObjectId(survey_id)})

    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    if not permanent:
        await surveys_col.update_one(
            {"_id": ObjectId(survey_id)},
            {"$set": {"is_deleted": True}}
        )
        logger.info("Survey %s archived by %s", survey_id, current_user.username)
        await log_action(
            user=current_user,
            action="delete_survey",
            resource_type="surveys",
            resource_id=survey_id,
        )
        return {
            "status": "success",
            "mode": "archived",
            "message": "Survey archived. It is hidden from lists but can be restored.",
        }

    deleted: Dict[str, int] = {}
    for collection_name, field in SURVEY_OWNED_COLLECTIONS.items():
        try:
            result = await db.get_collection(collection_name).delete_many(
                {field: survey_id}
            )
            if result.deleted_count:
                deleted[collection_name] = int(result.deleted_count)
        except Exception:
            # One unreachable or absent collection must not abort the delete and
            # strand the survey half-erased; the survey stays until the end.
            logger.warning(
                "Permanent delete: could not clear %s for survey %s",
                collection_name,
                survey_id,
                exc_info=True,
            )

    await surveys_col.delete_one({"_id": ObjectId(survey_id)})

    logger.info(
        "Survey %s PERMANENTLY deleted by %s | removed=%s",
        survey_id,
        current_user.username,
        deleted,
    )
    await log_action(
        user=current_user,
        action="permanently_delete_survey",
        resource_type="surveys",
        resource_id=survey_id,
        details={"removed": deleted, "company_name": survey.get("company_name")},
    )

    return {
        "status": "success",
        "mode": "permanent",
        "message": "Survey and all its data were permanently deleted.",
        "removed": deleted,
    }

@router.get("/{survey_id}", response_model=Survey)
async def get_survey(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)]
):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")
        
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if survey is None:
        raise HTTPException(status_code=404, detail="Survey not found")
    return survey

@router.put("/{survey_id}", response_model=Survey)
async def update_survey(
    survey_id: str,
    survey_update: SurveyUpdate,
    current_user: Annotated[User, Depends(get_current_active_analyst)]
):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")
    
    surveys_col = db.get_collection("surveys")
    existing = await surveys_col.find_one({"_id": ObjectId(survey_id)})
    if not existing:
        raise HTTPException(status_code=404, detail="Survey not found")

    # 1. Enforcement: Prevent editing closed surveys (except for status changes)
    is_status_only = survey_update.model_dump(exclude_unset=True).keys() == {"status"}
    if existing["status"] == "closed" and not is_status_only:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot edit survey in '{existing['status']}' state. Only status transitions allowed."
        )

    # 2. State Machine: draft -> active -> closed
    if survey_update.status:
        allowed = {
            "draft": ["active", "closed"],
            "active": ["closed"],
            "closed": []
        }
        if survey_update.status not in allowed.get(existing["status"], []):
             raise HTTPException(
                status_code=400, 
                detail=f"Invalid transition: {existing['status']} -> {survey_update.status}"
            )

    # 3. Survey Code Uniqueness (prevent hijacking code of another survey)
    if survey_update.survey_code is not None and survey_update.survey_code != existing.get("survey_code"):
        conflict = await surveys_col.find_one({
            "survey_code": survey_update.survey_code,
            "_id": {"$ne": ObjectId(survey_id)},
            "is_deleted": {"$ne": True}
        })
        if conflict:
            raise HTTPException(status_code=409, detail=f"Survey code '{survey_update.survey_code}' is already taken by another project")

    # 4. Form ID immutability once active
    if existing["status"] in ["active", "closed"] and "google_form_id" in survey_update.model_dump(exclude_unset=True):
         if survey_update.google_form_id != existing["google_form_id"]:
             raise HTTPException(status_code=400, detail="Google Form ID is immutable once survey is active")

    update_data = survey_update.model_dump(exclude_unset=True)
    if not update_data:
        return existing

    # 4.5 Re-orchestrate if structural parameters changed
    structural_fields = {
        "taste_test_config", "product_test_config", "blueprint",
        "selected_modules", "module_sequence",
        "purchase_funnel", "brand_usage", "brand_pricing_behavior", "brand_analyzer",
        "layer1_screening_config", "type",
        "internal_brands_data", "competitor_brands_data",
    }
    if structural_fields.intersection(update_data.keys()):
        logger.info(f"Structural change detected for survey {survey_id}. Re-orchestrating logic...")
        # Create full context for orchestrator by merging existing with updates
        full_context = {**existing, **update_data}
        orchestrated_schema = await orchestration_service.compose_survey_schema(full_context)
        await _apply_orchestrated_schema(update_data, orchestrated_schema)
        # Update pf_config if it's L4
        if "layer4_structure" in orchestrated_schema:
            update_data["pf_config"] = orchestrated_schema["layer4_structure"]

    # Phase 5: lazy brand expansion on draft save when Parameters have brands but snapshot is legacy.
    if existing["status"] == "draft":
        full_context = {**existing, **update_data}
        if is_product_test_survey(full_context):
            recomposed = await ensure_brand_aware_product_test_snapshot(
                full_context,
                orchestration_service,
            )
            if recomposed is not None:
                update_data["product_test_snapshot"] = recomposed

    await surveys_col.update_one(
        {"_id": ObjectId(survey_id)},
        {"$set": update_data}
    )
    # INVAlidate Reports: Systematic fix
    await analytics_service.invalidate_survey_cache(str(survey_id))
    
    updated = await surveys_col.find_one({"_id": ObjectId(survey_id)})
    logger.info(f"Survey {survey_id} updated by {current_user.username}")
    return updated


@router.delete("/cleanup-clones")
async def cleanup_clones(
    current_user: Annotated[User, Depends(get_current_active_analyst)]
):
    """
    Remove all surveys that have '(Clone)' in their name.
    Systematic cleanup of duplicate projects to keep the registry clean.
    """
    surveys_col = db.get_collection("surveys")
    tokens_col = db.get_collection("tokens")
    responses_col = db.get_collection("responses")
    reports_col = db.get_collection("survey_reports")
    
    # 1. Identify clone surveys
    clone_query = {"company_name": {"$regex": r"\(Clone\)", "$options": "i"}}
    clones = await surveys_col.find(clone_query).to_list(1000)
    
    if not clones:
        return {"status": "success", "message": "No clone surveys found", "deleted_count": 0}
        
    clone_ids = [str(c["_id"]) for c in clones]
    
    # 2. Sequential cleanup for relational integrity
    # Delete associated tokens
    await tokens_col.delete_many({"survey_id": {"$in": clone_ids}})
    # Delete associated responses
    await responses_col.delete_many({"survey_id": {"$in": clone_ids}})
    # Delete associated reports
    await reports_col.delete_many({"survey_id": {"$in": clone_ids}})
    
    # 3. Final removal of survey documents
    result = await surveys_col.delete_many({"_id": {"$in": [ObjectId(sid) for sid in clone_ids]}})
    
    await log_action(
        user=current_user,
        action="cleanup_clones",
        resource_type="surveys",
        details={"deleted_count": result.deleted_count, "targeted_ids": clone_ids}
    )
    
    return {
        "status": "success",
        "message": f"Successfully removed {result.deleted_count} clone surveys and their associated data",
        "deleted_count": result.deleted_count
    }


@router.post("/cleanup-duplicates")
async def cleanup_duplicates(
    current_user: Annotated[User, Depends(get_current_active_analyst)]
):
    # Simplified to reuse existing analyst dependency
    surveys_col = db.get_collection("surveys")
    
    # 1. Group by company_name and find duplicates
    pipeline = [
        {"$match": {"is_deleted": {"$ne": True}}},
        {"$sort": {"created_at": 1}},
        {"$group": {
            "_id": "$company_name",
            "ids": {"$push": "$_id"},
            "count": {"$sum": 1}
        }},
        {"$match": {"count": {"$gt": 1}}}
    ]
    
    cursor = surveys_col.aggregate(pipeline)
    duplicates = await cursor.to_list(1000)
    
    deleted_count = 0
    for group in duplicates:
        ids_to_delete = group["ids"][:-1]
        await surveys_col.update_many(
            {"_id": {"$in": ids_to_delete}},
            {"$set": {"is_deleted": True}}
        )
        deleted_count += len(ids_to_delete)
        
    return {
        "message": "Deduplication complete",
        "duplicates_found": len(duplicates),
        "deleted_records": deleted_count
    }

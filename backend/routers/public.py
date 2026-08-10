from fastapi import APIRouter, HTTPException, status, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Dict, Any, List, Optional, Literal
from bson import ObjectId
from datetime import datetime, timedelta
import uuid
import logging

logger = logging.getLogger(__name__)

from backend.database import db
from backend.models import Token, Survey, Response
from backend.services.orchestration_service import orchestration_service
from backend.services.product_test_public_gateway import (
    build_respondent_survey_config,
    ensure_product_test_in_sequence,
    prepare_layer2_for_public,
    resolve_default_selected_modules,
    resolve_product_test_snapshot_for_respondent,
    resolve_respondent_language,
)
from backend.voice_feedback.upload_handler import save_voice_upload
from backend.voice_feedback.smart_followup import smart_followup_engine
from backend.voice_feedback.followup_context import FollowUpEngineContext
from backend.voice_feedback.followup_turn_persistence import (
    load_followup_previous_turns,
    persist_followup_turn,
)
from backend.voice_feedback.ai_followup_config import (
    resolve_public_ai_followup,
    resolve_runtime_ai_followup,
)
from backend.voice_feedback.followup_eligibility import (
    classify_question_category,
    evaluate_followup_question_eligibility,
    resolve_min_answer_length,
)
from backend.voice_feedback.followup_rejection import (
    FollowUpRejectionCode,
    annotate_engine_infra_failure,
    build_followup_complete_response,
    log_followup_rejection,
)
from backend.services.packaging_heatmap_asset_service import (
    PackagingHeatmapAssetError,
    get_packaging_image_from_config,
    packaging_error_to_http,
    stream_packaging_image,
    validate_packaging_image_side,
    save_voice_note,
)
from backend.services.product_test_media_asset_service import (
    ProductTestMediaAssetError,
    delete_trial_media_asset,
    media_error_to_http,
    save_trial_media_upload,
    stream_trial_media_asset,
)

router = APIRouter(prefix="/s", tags=["public"])

class Layer1Response(BaseModel):
    answers: Dict[str, Any]
    phone: str

def extract_layer1_questions(doc: dict) -> list:
    """Robustly extract questions from both legacy and structured template formats, including snapshots."""
    # 1. Start with any explicitly list questions
    questions = doc.get("layer1_questions", [])
    if not isinstance(questions, list): questions = []
    
    # Snapshot support for modern Surveys
    snapshot_qs = doc.get("template_snapshot_questions", [])
    if isinstance(snapshot_qs, list):
        for q in snapshot_qs:
            if q not in questions: questions.append(q)
    
    # 2. Try layer1_structure (top level or within snapshot_schema)
    l1_struct = doc.get("layer1_structure")
    if not l1_struct:
        l1_struct = doc.get("template_snapshot_schema", {}).get("layer1_structure", {})
        
    if isinstance(l1_struct, dict):
        # A. Try nested sections (standard for imported templates)
        sections = l1_struct.get("sections", [])
        if sections and isinstance(sections, list):
            for section in sections:
                if isinstance(section, dict):
                    qs = section.get("questions", [])
                    if isinstance(qs, list):
                        for q in qs:
                            if q not in questions: questions.append(q)
        
        # B. Try direct questions in structure
        struct_qs = l1_struct.get("questions", [])
        if struct_qs and isinstance(struct_qs, list):
            for q in struct_qs:
                if q not in questions: questions.append(q)
                
    # Deduplicate by ID to be safe
    seen = set()
    deduped = []
    for q in questions:
        if not isinstance(q, dict): continue
        qid = q.get("id") or str(q.get("label"))
        if qid not in seen:
            seen.add(qid)
            deduped.append(q)
    return deduped

def clean_doc(doc):
    """Recursively convert BSON types to JSON-serializable types."""
    if isinstance(doc, dict):
        return {k: clean_doc(v) for k, v in doc.items()}
    elif isinstance(doc, list):
        return [clean_doc(v) for v in doc]
    
    # More robust check for ObjectId to handle potential import discrepancies
    if type(doc).__name__ == 'ObjectId':
        return str(doc)
        
    # Handle datetime objects which can sometimes cause issues in complex nested structures
    if isinstance(doc, datetime):
        return doc.isoformat()
        
    return doc

from fastapi import Request

class MasterLinkRequest(BaseModel):
    device_id: Optional[str] = None

class MasterLinkResponse(BaseModel):
    token: str

@router.post("/master-link/{survey_id}/generate-token", response_model=MasterLinkResponse)
async def generate_master_link_token(survey_id: str, req: Request, payload: MasterLinkRequest = None):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")
        
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
        
    if survey.get("status") not in ["active", "draft"]:
        raise HTTPException(status_code=403, detail="Survey must be active or draft to generate tokens")

    device_id = payload.device_id if payload else None
    ip_address = req.client.host if req.client else None
    
    # Check for existing token
    query = {
        "survey_id": survey_id,
        "batch_id": "master_link"
    }
    
    if device_id:
        query["device_id"] = device_id
    elif ip_address:
        query["ip_address"] = ip_address
        
    existing_token = await db.get_collection("tokens").find_one(query)
    if existing_token:
        return {"token": existing_token["token"]}

    token_str = str(uuid.uuid4())
    expires_at = datetime.utcnow() + timedelta(days=30)
    
    token_doc = {
        "survey_id": survey_id,
        "token": token_str,
        "status": "unused",
        "batch_id": "master_link",
        "created_by": "system_master_link",
        "created_at": datetime.utcnow(),
        "expires_at": expires_at,
        "last_accessed": None,
        "device_id": device_id,
        "ip_address": ip_address,
        "user_agent": req.headers.get("user-agent")
    }
    
    await db.get_collection("tokens").insert_one(token_doc)
    
    return {"token": token_str}

@router.get("/{token}")
async def get_survey_by_token(token: str):
    token_doc = await db.get_collection("tokens").find_one({"token": token})
    
    if not token_doc:
        raise HTTPException(status_code=404, detail="Invalid token")
    
    if token_doc["status"] == "submitted":
        raise HTTPException(status_code=403, detail="Survey already completed for this link")
    
    if token_doc["status"] == "failed":
        raise HTTPException(status_code=403, detail="Validation failed for this link")
    
    survey_id = token_doc["survey_id"]
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    
    # Fetch template for fallback and name
    template_doc = await db.get_collection("templates").find_one({"_id": ObjectId(survey["template_id"])})
    
    # Robust question extraction with fallback to template
    questions = survey.get("template_snapshot_questions", [])
    if not questions and template_doc:
        from backend.utils.logging_utils import logger
        logger.info(f"Gateway fallback: extracting questions from template {template_doc.get('name')} for survey {survey_id}")
        questions = extract_layer1_questions(template_doc)
            
    schema = survey.get("template_snapshot_schema", {})
    if not schema and template_doc:
        schema = template_doc.get("layer1_question_schema", {})
        if not schema and "layer1_structure" in template_doc:
            schema = template_doc["layer1_structure"].get("schema", {})

    # Return Layer 1 configuration
    # Read screening config to serve correct question types
    screening_cfg = survey.get("layer1_screening_config") or {}
    area_mode = screening_cfg.get("area_mode", "mcq")

    # Egypt areas — excluded Red Sea and Sinai
    EGYPT_AREAS = [
        "Cairo / القاهرة",
        "Giza / الجيزة",
        "Delta / الدلتا",
        "Upper Egypt / صعيد مصر",
        "Alexandria / الإسكندرية",
    ]

    # Area question: free-text if "From Any Area" is selected, else MCQ
    area_question = (
        {"id": "area", "label": "Location / Area / المحافظة أو المنطقة", "type": "text", "required": True}
        if area_mode == "free_text"
        else {"id": "area", "label": "Location / Area / المحافظة أو المنطقة",
              "type": "mcq", "options": EGYPT_AREAS, "required": True}
    )

    # DEFAULT RESPONDENT QUESTIONS (no duplicates)
    default_qs = [
        {"id": "name", "label": "Full Name / الاسم بالكامل", "type": "text", "required": True},
        {"id": "gender_auto", "label": "Gender / النوع", "type": "mcq",
         "options": ["Male / ذكر", "Female / أنثى"], "required": True},
        {"id": "age_auto", "label": "Age Range / الفئة العمرية", "type": "mcq",
         "options": ["Under 18", "18-25", "26-35", "36-45", "46-55", "56-65", "65+"], "required": True},
        area_question,
        {"id": "education", "label": "Education Level / المستوى التعليمي", "type": "mcq",
         "options": [
             "Postgraduate (Masters / PhD) / دراسات عليا (ماجستير / دكتوراه)",
             "University / College degree / مؤهل جامعي",
             "Secondary (Thanaweyya) / ثانوي (ثانوية عامة)",
             "Primary / Preparatory / ابتدائي / إعدادي",
             "Reads & writes / Illiterate / يقرأ ويكتب / أمي"
         ], "required": False},
        {"id": "marital_status", "label": "Marital Status / الحالة الاجتماعية", "type": "mcq",
         "options": ["Single / أعزب", "Married / متزوج", "Divorced / مطلق", "Widowed / أرمل"],
         "required": False},
        {"id": "family_income", "label": "Family Monthly Income / الدخل الشهري للأسرة", "type": "mcq", 
         "options": [
             "Below 4,000 EGP / أقل من ٤٠٠٠ جنيه",
             "4,001 - 6,000 EGP / ٤٠٠١ - ٦٠٠٠ جنيه",
             "6,001 - 12,000 EGP / ٦٠٠١ - ١٢٠٠٠ جنيه",
             "12,001 - 40,000 EGP / ١٢٠٠١ - ٤٠٠٠٠ جنيه",
             "Above 40,000 EGP / أكثر من ٤٠٠٠٠ جنيه"
         ], "required": False},
        {"id": "occupation", "label": "Occupation / المهنة", "type": "mcq", "options": [
            "CEO / GM / Large company owner / Senior government official / مدير تنفيذي / مدير عام / صاحب شركة كبيرة / مسؤول حكومي رفيع",
            "Company manager / High-skill professional (doctor, engineer) / Trader / Small business owner / University professor / مدير شركة / مهني عالي المهارة (طبيب، مهندس) / تاجر / صاحب مشروع صغير / أستاذ جامعي",
            "Mid-level admin / Government mid-level / Small shop owner / Technician / Secondary school teacher / إداري متوسط / موظف حكومي متوسط / صاحب محل صغير / فني / مدرس ثانوي",
            "Supervisor / Clerk / Bank employee / Low-grade government employee / Primary school teacher / مشرف / كاتب / موظف بنك / موظف حكومي درجة منخفضة / مدرس ابتدائي",
            "Skilled labor (carpenter, electrician, plumber, salesman, cook, waiter) / عامل ماهر (نجار، كهربائي، سباك، بائع، طباخ، نادل)",
            "Unskilled labor / Unemployed / Servant / Street vendor / عامل غير ماهر / عاطل عن العمل / خادم / بائع متجول"
        ], "required": False}
    ]

    # Only inject questions whose demographic is enabled in screening config
    FIELD_MAP = {
        "name": "full_name", "gender_auto": "gender",
        "age_auto": "age", "area": "location",
        "education": "education", "marital_status": "marital_status",
        "family_income": "family_income", "occupation": "occupation"
    }

    # Phase 2: Robust Deduplication of Identity Questions
    # Standardize normalization for comparison
    def normalize_label(label: str) -> str:
        if not label: return ""
        # Remove Arabic characters, spaces, and special symbols to match core intent
        import re
        return re.sub(r'[^a-zA-Z0-9]', '', label).lower()

    for dq in reversed(default_qs):
        dq_id = dq["id"]
        screen_key = FIELD_MAP.get(dq_id)
        if screen_key and screen_key != "full_name":
            if not screening_cfg.get(screen_key, False):
                continue
        
        dq_norm = normalize_label(dq["label"])
        
        # Phase 2: Aggressive check - either ID match or Label match
        existing_idx = next((i for i, q in enumerate(questions) if 
            q.get("id") == dq_id or 
            normalize_label(q.get("label", "")) == dq_norm
        ), -1)

        if existing_idx != -1:
            # If it exists, ENFORCE the type/options of the default question but keep other properties
            # This ensures "Family Income" is always MCQ even if template has it as numeric
            existing_q = questions[existing_idx]
            if dq.get("type") == "mcq" and existing_q.get("type") != "mcq":
                existing_q["type"] = "mcq"
                existing_q["options"] = dq["options"]
        else:
            # Insert if not found anywhere
            questions.insert(0, dq)

    # FINAL SAFETY PASS: Deduplicate the entire assembled list by normalized identifier
    final_qs = []
    seen_identifiers = set()
    for q in questions:
        # Use label, text, or ID as identifier
        q_label = q.get("label") or q.get("text") or q.get("en_text") or ""
        q_id = str(q.get("id") or "")
        
        label_norm = normalize_label(q_label) if q_label else f"q_id_{q_id}"
        
        # Filter out empty or duplicate labels
        if label_norm and label_norm not in seen_identifiers:
            seen_identifiers.add(label_norm)
            final_qs.append(q)
    questions = final_qs

    # Fallback for empty labels and Layer 2 extraction
    for q in questions:
        if not q.get("label"):
            q["label"] = f"Question {q.get('id', '')}"

    l2_content = survey.get("template_snapshot_l2", {})
    if not l2_content and template_doc:
        l2_content = template_doc.get("layer2_structure", {})
    l2_content = prepare_layer2_for_public(survey, l2_content)

    product_test_snapshot = await resolve_product_test_snapshot_for_respondent(
        survey,
        orchestration_service=orchestration_service,
    )
    product_test_config = survey.get("product_test_config") or {}
    respondent_language = resolve_respondent_language(survey)

    purchase_funnel = survey.get("purchase_funnel") or {}
    if survey.get("purchase_funnel_id"):
        pf_doc = await db.get_collection("purchase_funnels").find_one(
            {"_id": ObjectId(survey["purchase_funnel_id"])}
        )
        if pf_doc:
            purchase_funnel = {**pf_doc, **purchase_funnel}

    module_snapshots = dict(survey.get("module_snapshots") or {})
    from backend.services.question_module_service import question_module_service

    # Construct a unified config object for the frontend with robust defaults
    selected_mods = resolve_default_selected_modules(survey)
    mod_sequence = survey.get("module_sequence") or selected_mods
    selected_mods, mod_sequence = ensure_product_test_in_sequence(
        selected_mods, mod_sequence, survey
    )
    modules_needing_snapshot = set(selected_mods) | set(mod_sequence)
    for module_id in ("purchase_funnel", "brand_usage", "brand_pricing_behavior", "brand_analyzer"):
        if module_id not in modules_needing_snapshot or module_id in module_snapshots:
            continue
        active_mod = await question_module_service.get_active_module(module_id)
        if active_mod:
            module_snapshots[module_id] = question_module_service.build_snapshot(active_mod)
    pf_enabled = (
        purchase_funnel.get("is_enabled")
        or survey.get("purchase_funnel_id")
        or module_snapshots.get("purchase_funnel")
    )
    if pf_enabled and "purchase_funnel" not in selected_mods:
        selected_mods.append("purchase_funnel")

    usage_enabled = bool((survey.get("brand_usage") or {}).get("is_enabled")) or "brand_usage" in modules_needing_snapshot
    if usage_enabled and "brand_usage" not in selected_mods:
        selected_mods.append("brand_usage")

    pricing_enabled = bool((survey.get("brand_pricing_behavior") or {}).get("is_enabled")) or "brand_pricing_behavior" in modules_needing_snapshot
    if pricing_enabled and "brand_pricing_behavior" not in selected_mods:
        selected_mods.append("brand_pricing_behavior")

    ba_enabled = bool((survey.get("brand_analyzer") or {}).get("is_enabled")) or "brand_analyzer" in modules_needing_snapshot
    if ba_enabled and "brand_analyzer" not in selected_mods:
        selected_mods.append("brand_analyzer")

    mod_sequence = survey.get("module_sequence") or selected_mods
    sequence_set = set(mod_sequence)
    module_snapshots = {
        module_id: snapshot
        for module_id, snapshot in module_snapshots.items()
        if module_id in sequence_set
    }

    from backend.utils.logging_utils import logger
    logger.info(f"Serving survey {survey_id} | Type: {survey.get('type')} | Selected Mods: {selected_mods} | Sequence: {mod_sequence}")
    logger.info(f"L2 Sections Count: {len(l2_content.get('sections', [])) if isinstance(l2_content, dict) else 'N/A'}")
    if product_test_snapshot:
        logger.info(
            f"Product Test Snapshot: {product_test_snapshot.get('meta', {}).get('totalQuestions', 0)} questions "
            f"in {product_test_snapshot.get('meta', {}).get('phaseCount', 0)} phases"
        )

    survey_config = build_respondent_survey_config(survey, product_test_snapshot)
    survey_config["selected_modules"] = selected_mods
    survey_config["module_sequence"] = mod_sequence

    internal_brands = survey_config.get("internal_brands_data") or survey.get("internal_brands_data") or []
    competitor_brands = survey_config.get("competitor_brands_data") or survey.get("competitor_brands_data") or []

    result = {
        "company_name": survey["company_name"],
        "customizations": survey["customizations"],
        "layer1_rules": survey.get("layer1_rules"),
        "layer1_screening_config": screening_cfg,
        "template_name": template_doc.get("name") if template_doc else "Active Study",
        "questions": questions,
        "layer2_questions": l2_content,
        "product_test_snapshot": product_test_snapshot,
        "product_test_config": product_test_config,
        "survey_type": survey.get("type"),
        "schema": schema,
        "google_form_url": survey.get("google_form_url"),
        "internal_brands_data": internal_brands,
        "competitor_brands_data": competitor_brands,
        "own_brand": survey_config.get("own_brand"),
        "purchase_funnel": purchase_funnel,
        "brand_analyzer": survey.get("brand_analyzer") or {},
        "brand_usage": survey.get("brand_usage") or {},
        "brand_pricing_behavior": survey.get("brand_pricing_behavior") or {},
        "module_snapshots": module_snapshots,
        "pf_config": survey.get("pf_config"),
        "voice_capture": survey.get("voice_capture") or {
            "is_enabled": False,
            "mode": "text_only",
            "target_questions": "after_taste_open_ends",
            "ai_analysis_enabled": False,
            "transcription_language": "auto",
        },
        "config": survey_config,
        "selected_modules": selected_mods,
        "module_sequence": mod_sequence,
        "ai_followup": resolve_public_ai_followup(survey),
        "survey_objective": survey.get("survey_objective"),
        "language": respondent_language,
    }
    
    return clean_doc(result)

@router.post("/{token}/voice-upload")
async def upload_voice_by_token(
    token: str,
    background_tasks: BackgroundTasks,
    question_id: str = Form(...),
    file: UploadFile = File(...),
    brand_name: Optional[str] = Form(None),
    question_text: Optional[str] = Form(None),
):
    token_doc = await db.get_collection("tokens").find_one({"token": token})
    if not token_doc:
        raise HTTPException(status_code=404, detail="Invalid token")

    if token_doc["status"] == "submitted":
        raise HTTPException(status_code=403, detail="Survey already completed")

    survey_id = token_doc["survey_id"]
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    voice_cfg = survey.get("voice_capture") or {}
    if not voice_cfg.get("is_enabled"):
        raise HTTPException(status_code=403, detail="Voice capture is not enabled for this survey")

    ai_analysis_enabled = bool(voice_cfg.get("ai_analysis_enabled", False))
    ai_followup_enabled = bool((survey.get("ai_followup") or {}).get("is_enabled", False))
    # Run STT pipeline when full NLP analysis OR smart follow-up needs a transcript
    run_voice_processing = ai_analysis_enabled or ai_followup_enabled
    metadata = {
        "brand_name": brand_name,
        "question_text": question_text,
        "transcription_language": voice_cfg.get("transcription_language", "auto"),
    }

    feedback_id = await save_voice_upload(
        survey_id,
        question_id,
        token,
        file,
        background_tasks,
        metadata=metadata,
        ai_analysis_enabled=run_voice_processing,
    )
    return {"message": "Upload successful, processing started.", "feedback_id": feedback_id, "id": feedback_id}


VOICE_STATUS_TERMINAL = frozenset({"completed", "failed", "stored"})


@router.get("/{token}/voice-status/{feedback_id}")
async def get_public_voice_status(token: str, feedback_id: str):
    """Poll transcription status for a respondent voice upload (token-scoped, no staff JWT)."""
    token_doc = await db.get_collection("tokens").find_one({"token": token})
    if not token_doc:
        raise HTTPException(status_code=404, detail="Invalid token")

    if not ObjectId.is_valid(feedback_id):
        raise HTTPException(status_code=400, detail="Invalid feedback ID")

    doc = await db.get_collection("voice_feedbacks").find_one({
        "_id": ObjectId(feedback_id),
        "token": token,
    })
    if not doc:
        raise HTTPException(status_code=404, detail="Voice feedback not found")

    status_value = doc.get("status", "pending")
    transcript = doc.get("transcript")
    error = doc.get("error") or doc.get("processing_error")

    return {
        "status": status_value,
        "transcript": transcript if transcript else None,
        "error": error,
        "is_terminal": status_value in VOICE_STATUS_TERMINAL,
    }


@router.post("/{token}/packaging-heatmap/voice-notes")
async def upload_heatmap_voice_note_public(
    token: str,
    file: UploadFile = File(...)
):
    """Upload a voice note for a packaging heatmap region via a public survey token."""
    token_doc = await db.get_collection("tokens").find_one({"token": token})
    if not token_doc:
        raise HTTPException(status_code=404, detail="Invalid token")

    if token_doc.get("status") == "submitted":
        raise HTTPException(status_code=403, detail="Survey already completed")

    survey_id = str(token_doc["survey_id"])
    
    try:
        result = await save_voice_note(survey_id, file)
        return result
    except PackagingHeatmapAssetError as exc:
        raise packaging_error_to_http(exc) from exc


@router.get("/{token}/packaging-image/{side}")
async def get_packaging_image_by_token(token: str, side: str):
    """
    Stream a packaging heatmap image for an active respondent session.

    Requires a valid token and a configured image for the requested side.
    """
    token_doc = await db.get_collection("tokens").find_one({"token": token})
    if not token_doc:
        raise HTTPException(status_code=404, detail="Invalid token")

    if token_doc.get("status") == "submitted":
        raise HTTPException(status_code=403, detail="Survey already completed")

    survey_id = token_doc["survey_id"]
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    try:
        normalized_side = validate_packaging_image_side(side)
    except PackagingHeatmapAssetError as exc:
        raise packaging_error_to_http(exc) from exc

    asset = get_packaging_image_from_config(survey.get("product_test_config"), normalized_side)
    if not asset:
        raise HTTPException(
            status_code=404,
            detail=f"No packaging image configured for side '{normalized_side}'",
        )

    try:
        grid_out, mime, headers = await stream_packaging_image(asset.asset_id)
    except PackagingHeatmapAssetError as exc:
        raise packaging_error_to_http(exc) from exc

    return StreamingResponse(grid_out, media_type=mime, headers=headers)


@router.post("/{token}/product-test/media/{question_id}")
async def upload_product_test_trial_media(
    token: str,
    question_id: str,
    file: UploadFile = File(...),
):
    """Upload a trial photo or short video for an active respondent session."""
    try:
        asset = await save_trial_media_upload(token, question_id, file)
        return asset.model_dump(mode="json")
    except ProductTestMediaAssetError as exc:
        raise media_error_to_http(exc) from exc


@router.delete("/{token}/product-test/media/{asset_id}")
async def delete_product_test_trial_media(token: str, asset_id: str):
    """Remove a pending trial media upload before final survey submit."""
    try:
        await delete_trial_media_asset(token, asset_id)
        return {"message": "Trial media removed.", "asset_id": asset_id}
    except ProductTestMediaAssetError as exc:
        raise media_error_to_http(exc) from exc


@router.get("/{token}/product-test/media/{asset_id}")
async def stream_product_test_trial_media(token: str, asset_id: str):
    """Stream a token-scoped trial media asset for respondent preview."""
    try:
        grid_out, mime, headers = await stream_trial_media_asset(token, asset_id)
    except ProductTestMediaAssetError as exc:
        raise media_error_to_http(exc) from exc

    return StreamingResponse(grid_out, media_type=mime, headers=headers)


class FollowUpRequest(BaseModel):
    question_id: str
    question_text: str
    answer_text: str
    current_round: int = 1
    brand_name: Optional[str] = None
    survey_objective: Optional[str] = None
    custom_instructions: Optional[str] = None
    source: Optional[Literal["text", "voice"]] = None
    question_category: Optional[str] = None
    respondent_surface: Optional[Literal[
        "taste_l2_open_end",
        "product_test_open_end",
        "product_test_heatmap_comment",
        "product_test_heatmap_point_comment",
    ]] = None

def _reject_followup(
    *,
    token: str,
    question_id: str,
    rejection_code: FollowUpRejectionCode,
    reasoning: str,
    respondent_surface: Optional[str] = None,
    source: Optional[str] = None,
    current_round: Optional[int] = None,
) -> dict[str, Any]:
    log_followup_rejection(
        token=token,
        question_id=question_id,
        rejection_code=rejection_code,
        reasoning=reasoning,
        respondent_surface=respondent_surface,
        source=source,
        current_round=current_round,
    )
    return build_followup_complete_response(
        rejection_code=rejection_code,
        reasoning=reasoning,
    )


@router.post("/{token}/followup")
async def handle_ai_followup(token: str, request: FollowUpRequest):
    token_doc = await db.get_collection("tokens").find_one({"token": token})
    if not token_doc:
        raise HTTPException(status_code=404, detail="Invalid token")
    
    survey_id = token_doc["survey_id"]
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    ai_cfg = resolve_runtime_ai_followup(survey)
    survey_for_gates = {**survey, "ai_followup": ai_cfg}

    if not ai_cfg.get("is_enabled", False):
        return _reject_followup(
            token=token,
            question_id=request.question_id,
            rejection_code=FollowUpRejectionCode.AI_DISABLED,
            reasoning="AI follow-up is disabled for this survey.",
            respondent_surface=request.respondent_surface,
            source=request.source,
            current_round=request.current_round,
        )

    if request.source == "text" and not ai_cfg.get("apply_to_text", True):
        return _reject_followup(
            token=token,
            question_id=request.question_id,
            rejection_code=FollowUpRejectionCode.TEXT_CHANNEL_DISABLED,
            reasoning="Text channel disabled for this survey.",
            respondent_surface=request.respondent_surface,
            source=request.source,
            current_round=request.current_round,
        )
    if request.source == "voice" and not ai_cfg.get("apply_to_voice", True):
        return _reject_followup(
            token=token,
            question_id=request.question_id,
            rejection_code=FollowUpRejectionCode.VOICE_CHANNEL_DISABLED,
            reasoning="Voice channel disabled for this survey.",
            respondent_surface=request.respondent_surface,
            source=request.source,
            current_round=request.current_round,
        )

    q_cat = request.question_category or classify_question_category(request.question_text)

    category_config = ai_cfg.get("category_config") or {}
    category_ai_cfg = category_config.get(q_cat) or {}
    if category_ai_cfg.get("enabled") is False:
        return _reject_followup(
            token=token,
            question_id=request.question_id,
            rejection_code=FollowUpRejectionCode.CATEGORY_DISABLED,
            reasoning=f"AI follow-up disabled for {q_cat} questions.",
            respondent_surface=request.respondent_surface,
            source=request.source,
            current_round=request.current_round,
        )

    eligibility = evaluate_followup_question_eligibility(
        survey_for_gates,
        question_id=request.question_id,
        question_text=request.question_text,
        question_category=q_cat,
        respondent_surface=request.respondent_surface,
    )
    q_cat = eligibility.category
    if not eligibility.eligible:
        return _reject_followup(
            token=token,
            question_id=request.question_id,
            rejection_code=eligibility.rejection_code or FollowUpRejectionCode.QUESTION_INELIGIBLE,
            reasoning=eligibility.rejection_reason or "Question not eligible for AI follow-up.",
            respondent_surface=request.respondent_surface or eligibility.surface,
            source=request.source,
            current_round=request.current_round,
        )

    min_answer_len = resolve_min_answer_length(survey_for_gates)
    if len((request.answer_text or "").strip()) < min_answer_len:
        return _reject_followup(
            token=token,
            question_id=request.question_id,
            rejection_code=FollowUpRejectionCode.ANSWER_TOO_SHORT,
            reasoning=f"Answer shorter than minimum length ({min_answer_len}).",
            respondent_surface=request.respondent_surface,
            source=request.source,
            current_round=request.current_round,
        )

    max_rounds = category_ai_cfg.get("max_rounds") or ai_cfg.get("max_rounds", 2)
    if request.current_round > max_rounds:
        return _reject_followup(
            token=token,
            question_id=request.question_id,
            rejection_code=FollowUpRejectionCode.MAX_ROUNDS_EXCEEDED,
            reasoning=f"Maximum follow-up rounds ({max_rounds}) exceeded.",
            respondent_surface=request.respondent_surface,
            source=request.source,
            current_round=request.current_round,
        )

    custom_instructions = request.custom_instructions or ai_cfg.get("custom_instructions", "")

    previous_turns = await load_followup_previous_turns(
        db,
        token=token,
        question_id=request.question_id,
        before_round=request.current_round,
    )

    engine_context = FollowUpEngineContext.from_survey_request(
        survey=survey_for_gates,
        survey_id=str(survey_id),
        token=token,
        question_id=request.question_id,
        current_round=request.current_round,
        source=request.source,
        question_text=request.question_text,
        answer_text=request.answer_text,
        question_category=q_cat,
        brand_name=request.brand_name,
        survey_objective=request.survey_objective,
        custom_instructions=custom_instructions,
        respondent_surface=request.respondent_surface,
        previous_turns=previous_turns,
    )

    result = await smart_followup_engine.evaluate_and_followup(context=engine_context)

    if result.get("action") == "probe" and request.current_round > max_rounds:
        result = build_followup_complete_response(
            rejection_code=FollowUpRejectionCode.MAX_ROUNDS_EXCEEDED,
            reasoning=f"Maximum follow-up rounds ({max_rounds}) exceeded.",
        )

    result = annotate_engine_infra_failure(result)

    await persist_followup_turn(
        db,
        survey_id=survey_id,
        token=token,
        question_id=request.question_id,
        current_round=request.current_round,
        answer_text=request.answer_text,
        followup_text=result.get("followup_text"),
        action=result.get("action"),
    )

    return result


def _heatmap_click_has_feedback(click: Any) -> bool:
    if not isinstance(click, dict):
        return False
    feedback = click.get("feedback")
    if isinstance(feedback, dict):
        comment = str(feedback.get("comment") or "").strip()
        voice_id = str(feedback.get("voice_note_asset_id") or "").strip()
        return bool(comment or voice_id)
    # Backward-compatible read for transitional payloads.
    return bool(str(click.get("comment") or "").strip())


def _heatmap_click_has_followup_attempt(click: Any) -> bool:
    if not isinstance(click, dict):
        return False
    feedback = click.get("feedback")
    if not isinstance(feedback, dict):
        return False
    return feedback.get("follow_up_requested") is True


def _iter_submitted_heatmap_values(answers: Dict[str, Any]):
    structured_rows = (
        (answers.get("__structured") or {})
        .get("product_test", {})
        .get("flat_evaluations", [])
    )
    if isinstance(structured_rows, list):
        for row in structured_rows:
            if not isinstance(row, dict):
                continue
            value = row.get("value")
            if (
                row.get("module") == "packaging_heatmap"
                or row.get("question_type") == "packaging-heatmap"
                or (isinstance(value, dict) and "clicks" in value and "image_side" in value)
            ):
                yield row.get("question_id") or "packaging heatmap", value

    for question_id, value in answers.items():
        if question_id == "__structured":
            continue
        if isinstance(value, dict) and "clicks" in value and "image_side" in value:
            yield question_id, value


def _validate_packaging_heatmap_feedback(
    answers: Dict[str, Any],
    *,
    require_followup_attempt: bool,
) -> Optional[str]:
    for question_id, value in _iter_submitted_heatmap_values(answers):
        if not isinstance(value, dict):
            continue
        clicks = value.get("clicks")
        if not isinstance(clicks, list) or len(clicks) == 0:
            return f"Heatmap question {question_id} requires at least one selected point."
        for idx, click in enumerate(clicks, start=1):
            if not _heatmap_click_has_feedback(click):
                return f"Heatmap question {question_id} point {idx} requires text or voice feedback."
            if require_followup_attempt and not _heatmap_click_has_followup_attempt(click):
                return f"Heatmap question {question_id} point {idx} requires AI follow-up before submission."
    return None


@router.post("/{token}/layer2")
async def submit_layer2(token: str, answers: Dict[str, Any]):
    token_doc = await db.get_collection("tokens").find_one({"token": token})
    if not token_doc:
        raise HTTPException(status_code=404, detail="Invalid token")
    
    if token_doc["status"] == "submitted":
        raise HTTPException(status_code=403, detail="Survey already completed")

    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(token_doc["survey_id"])})
    ai_cfg = survey.get("ai_followup") if survey else {}
    heatmap_validation_error = _validate_packaging_heatmap_feedback(
        answers,
        require_followup_attempt=bool((ai_cfg or {}).get("is_enabled", False)),
    )
    if heatmap_validation_error:
        raise HTTPException(status_code=422, detail=heatmap_validation_error)
        
    # Create the response document
    response_doc = {
        "survey_id": token_doc["survey_id"],
        "token": token,
        "phone": token_doc.get("phone"),
        "answers": answers,
        "source": "in_app_gateway",
        "submitted_at": datetime.utcnow()
    }
    
    await db.get_collection("responses").insert_one(response_doc)
    
    # ── Trial media lifecycle: mark referenced uploads as submitted ──
    try:
        from backend.services.product_test_media_lifecycle import finalize_trial_media_on_submit

        media_stats = await finalize_trial_media_on_submit(token, answers)
        if media_stats.get("finalized"):
            logger.info("Trial media finalized on submit token=%s stats=%s", token, media_stats)
    except Exception as e:
        logger.warning("Trial media finalize non-fatal: %s", e)

    # ── Packaging heatmap incremental aggregation ──
    try:
        from backend.services.packaging_heatmap_analytics_service import ingest_response
        from backend.services.product_test_analytics_service import extract_product_test_flat_evaluations

        hm_survey_id = str(token_doc["survey_id"])
        flat_evals = extract_product_test_flat_evaluations(answers)
        await ingest_response(hm_survey_id, flat_evals, respondent_token=token)
    except Exception as e:
        logger.warning(f"Heatmap ingest non-fatal: {e}")
        try:
            from backend.services.packaging_heatmap_analytics_service import ingest_heatmap_answers_direct
            hm_answers = {k: v for k, v in answers.items() 
                          if isinstance(v, dict) and ('regions' in v or 'clicks' in v)}
            if hm_answers:
                await ingest_heatmap_answers_direct(hm_survey_id, hm_answers, token)
        except Exception as e2:
            logger.error(f"Direct heatmap ingest also failed: {e2}")
    
    # Update token status to submitted
    from backend.services.token_service import token_service
    await token_service.update_token_status(token, "submitted")
    
    # ── Quota accounting (completed surveys) ──
    survey_id = token_doc["survey_id"]
    if survey is None:
        survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    
    if survey:
        surveys_col = db.get_collection("surveys")
        try:
            from backend.services.quota_enforcement import (
                apply_legacy_submit_increments,
                resolve_quota_buckets,
            )

            l1_response = await db.get_collection("responses").find_one(
                {"survey_id": survey_id, "token": token, "source": "layer1"}
            )
            l1_answers = l1_response.get("answers", {}) if l1_response else {}

            if token_doc.get("quota_reserved"):
                buckets = resolve_quota_buckets(l1_answers, survey.get("gate_quotas") or {})
                increments = {
                    f"gate_counts.{bucket.gate_key}.{bucket.matched_option}": 1
                    for bucket in buckets
                }
                if increments:
                    await surveys_col.update_one({"_id": ObjectId(survey_id)}, {"$inc": increments})
            else:
                await apply_legacy_submit_increments(
                    surveys_col,
                    survey_id,
                    survey,
                    l1_answers,
                )
        except Exception as e:
            logger.error(f"Quota increment error for survey {survey_id}: {e}")
            # We don't raise here as we still want to finish invalidating the report and returning success


    # ── Report Invalidation ──
    from backend.services.analytics_service import analytics_service
    await analytics_service.invalidate_report(str(survey_id))
    
    return {"status": "success", "message": "Evaluation submitted successfully"}

@router.post("/{token}/layer1")
async def submit_layer1(token: str, response: Layer1Response):
    token_doc = await db.get_collection("tokens").find_one({"token": token})
    
    if not token_doc:
        raise HTTPException(status_code=404, detail="Invalid token")
    
    if token_doc["status"] == "submitted":
        raise HTTPException(status_code=403, detail="Survey already completed")
    
    if token_doc["status"] == "failed":
        raise HTTPException(status_code=403, detail="Validation failed for this link")

    if token_doc["status"] == "passed":
        survey = await db.get_collection("surveys").find_one(
            {"_id": ObjectId(token_doc["survey_id"])}
        )
        if not survey:
            raise HTTPException(status_code=404, detail="Survey not found")
        return {
            "passed": True,
            "google_form_url": survey.get("google_form_url", ""),
            "token": token,
        }
    
    survey_id = token_doc["survey_id"]
    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    
    # Validate Layer 1 against Template "Correct Answers"
    questions = survey.get("template_snapshot_questions", [])
    answers = response.answers
    phone = response.phone
    passed = True
    fail_reason = ""
    
    from backend.utils.logging_utils import logger
    logger.info(f"--- VALIDATING LAYER 1 | Token: {token} | Answers: {answers} ---")
    
    # Iterate through all questions that have a defined correct_answer
    for q in questions:
        q_id = q.get("id")
        correct_val = q.get("correct_answer")
        
        if correct_val is not None:
            user_val = answers.get(q_id)
            # Support both single value and list of allowed values
            if isinstance(correct_val, list):
                if user_val not in correct_val:
                    passed = False
                    fail_reason = f"Question {q_id}: '{user_val}' is not in allowed list {correct_val}"
                    break
            else:
                if user_val != correct_val:
                    passed = False
                    fail_reason = f"Question {q_id}: expected '{correct_val}', got '{user_val}'"
                    break
            
    # ── Layer 1 Screening Gate ──────────────────────────────────────────────────
    # Read the screening config saved on the survey (set during survey creation)
    screening_cfg = survey.get("layer1_screening_config") or {}

    # 1. Age Gate: check if respondent's chosen age range is in the allowed list
    if screening_cfg.get("age"):
        allowed_age_ranges = screening_cfg.get("allowed_age_ranges") or []
        if allowed_age_ranges:
            # Try multiple possible answer keys (id or label variants)
            respondent_age = (
                answers.get("age_auto") or
                answers.get("Age Range") or
                answers.get("Age Range / الفئة العمرية")
            )
            if respondent_age and respondent_age not in allowed_age_ranges:
                passed = False
                fail_reason = f"Age '{respondent_age}' does not meet the study criteria."

    # 2. Gender Gate
    if passed and screening_cfg.get("gender"):
        allowed_genders = screening_cfg.get("allowed_genders") or []
        if allowed_genders:
            respondent_gender = (
                answers.get("gender_auto") or
                answers.get("Gender") or
                answers.get("Gender / النوع")
            )
            if respondent_gender:
                # Normalize: match regardless of Arabic suffix ("Male / ذكر" → "Male")
                norm_gender = respondent_gender.split("/")[0].strip().lower()
                norm_allowed = [g.split("/")[0].strip().lower() for g in allowed_genders]
                if norm_gender not in norm_allowed:
                    passed = False
                    fail_reason = f"Gender '{respondent_gender}' does not meet the study criteria."

    # 3. Area Gate
    if passed and screening_cfg.get("location"):
        area_mode = screening_cfg.get("area_mode", "mcq")
        allowed_areas = screening_cfg.get("allowed_areas") or []
        FREE_TEXT_SENTINEL = "From Any Area / من أي منطقة"
        ALL_EGYPT_SENTINEL = "All Egypt / كل مصر"
        # Skip gate if admin chose "free text" or "All Egypt" (everything qualifies)
        gate_active = (
            area_mode == "mcq" and
            bool(allowed_areas) and
            FREE_TEXT_SENTINEL not in allowed_areas and
            ALL_EGYPT_SENTINEL not in allowed_areas
        )
        if gate_active:
            respondent_area = (
                answers.get("area") or
                answers.get("Location / Area / المحافظة أو المنطقة")
            )
            if respondent_area:
                norm_resp = respondent_area.split("/")[0].strip().lower()
                norm_allowed = [a.split("/")[0].strip().lower() for a in allowed_areas]
                if norm_resp not in norm_allowed:
                    passed = False
                    fail_reason = f"Location '{respondent_area}' does not meet the study criteria."

    # 4. Education Gate
    if passed and screening_cfg.get("education"):
        allowed_education = screening_cfg.get("allowed_education") or []
        if allowed_education:
            respondent_edu = (
                answers.get("education") or
                answers.get("Education Level / المستوى التعليمي")
            )
            if respondent_edu:
                # Normalize: match regardless of Arabic suffix ("University / جامعي" → "university")
                norm_resp = respondent_edu.split("/")[0].strip().lower()
                norm_allowed = [e.split("/")[0].strip().lower() for e in allowed_education]
                if norm_resp not in norm_allowed:
                    passed = False
                    fail_reason = f"Education level '{respondent_edu}' does not meet the study criteria."

    # 5. Marital Status Gate
    if passed and screening_cfg.get("marital_status"):
        allowed_marital = screening_cfg.get("allowed_marital_status") or []
        if allowed_marital:
            respondent_marital = (
                answers.get("marital_status") or
                answers.get("Marital Status / الحالة الاجتماعية")
            )
            if respondent_marital:
                norm_resp = respondent_marital.split("/")[0].strip().lower()
                norm_allowed = [m.split("/")[0].strip().lower() for m in allowed_marital]
                if norm_resp not in norm_allowed:
                    passed = False
                    fail_reason = f"Marital status '{respondent_marital}' does not meet the study criteria."

    # 6. Social Economic Status (SES) Gate
    if passed and screening_cfg.get("ses_screening"):
        # 1. Map Education to Score (1-5)
        edu_answer = answers.get("education") or answers.get("Education Level / المستوى التعليمي")
        edu_score = 1
        if edu_answer:
            edu_lower = edu_answer.lower()
            if "postgraduate" in edu_lower: edu_score = 5
            elif "university" in edu_lower: edu_score = 4
            elif "secondary" in edu_lower: edu_score = 3
            elif "primary" in edu_lower or "preparatory" in edu_lower: edu_score = 2
            # default 1 for "reads & writes / illiterate"

        # 2. Map Occupation to Score (0-5)
        occ_answer = answers.get("occupation") or answers.get("Occupation / المهنة")
        occ_score = 0
        if occ_answer:
            occ_lower = occ_answer.lower()
            if "ceo" in occ_lower or "senior government" in occ_lower: occ_score = 5
            elif "company manager" in occ_lower or "high-skill professional" in occ_lower or "university professor" in occ_lower: occ_score = 4
            elif "mid-level" in occ_lower or "technician" in occ_lower or "secondary school" in occ_lower: occ_score = 3
            elif "supervisor" in occ_lower or "bank employee" in occ_lower or "primary school teacher" in occ_lower: occ_score = 2
            elif "skilled labor" in occ_lower: occ_score = 1
            # default 0 for "unskilled labor / unemployed"

        # 3. Map Income to Score (1-5) using new MCQ ranges
        income_answer = answers.get("family_income") or answers.get("Family Monthly Income / الدخل الشهري للأسرة")
        income_score = 1
        if income_answer:
            inc_lower = income_answer.lower()
            if "above 40,000" in inc_lower or "أكثر من ٤٠٠٠٠" in inc_lower: income_score = 5
            elif "12,001" in inc_lower or "١٢٠٠١" in inc_lower: income_score = 4
            elif "6,001" in inc_lower or "٦٠٠١" in inc_lower: income_score = 3
            elif "4,001" in inc_lower or "٤٠٠١" in inc_lower: income_score = 2
            # default 1 for "below 4,000"

        total_score = edu_score + occ_score + income_score
        
        # 4. Determine Class
        respondent_class = "DE" # 3-5
        if total_score >= 12: respondent_class = "AB" # 12-15
        elif total_score >= 9: respondent_class = "C1" # 9-11
        elif total_score >= 6: respondent_class = "C2" # 6-8
        
        allowed_ses = screening_cfg.get("allowed_ses") or []
        if allowed_ses and respondent_class not in allowed_ses:
            passed = False
            fail_reason = f"Social Economic Class '{respondent_class}' (Score: {total_score}) does not meet the study criteria."
        
        # Store score and class in answers for analytics
        answers["calculated_ses_score"] = total_score
        answers["calculated_ses_class"] = respondent_class

    if not passed:
        logger.warning(f"Validation FAILED for token {token}: {fail_reason}")
        # Mark token as failed
        await db.get_collection("tokens").update_one(
            {"_id": token_doc["_id"]},
            {"$set": {"status": "failed", "layer1_passed": False, "phone": phone}}
        )
        return {"passed": False, "message": "You do not qualify for this study."}

    # ── Quota Enforcement (atomic reservation at screening pass) ────────────────
    from backend.services.quota_enforcement import (
        resolve_quota_buckets,
        resolve_respondent_target,
        try_reserve_quota_slots,
    )

    surveys_col = db.get_collection("surveys")
    respondent_target = resolve_respondent_target(survey)
    quota_buckets = resolve_quota_buckets(answers, survey.get("gate_quotas") or {})
    reservation = await try_reserve_quota_slots(
        surveys_col,
        survey_id,
        global_target=respondent_target,
        buckets=quota_buckets,
    )

    if not reservation.ok:
        logger.info(
            "Quota reservation failed for token %s on survey %s: %s",
            token,
            survey_id,
            reservation.message,
        )
        await db.get_collection("tokens").update_one(
            {"_id": token_doc["_id"]},
            {"$set": {"status": "failed", "layer1_passed": False, "phone": phone}},
        )
        return {"passed": False, "message": reservation.message}

    logger.info(f"Validation PASSED for token {token}")
    
    # Mark token as passed (quota slots are reserved until submit or exclusion)
    from backend.services.token_service import token_service
    await token_service.update_token_status(token, "passed")
    await db.get_collection("tokens").update_one(
        {"token": token},
        {
            "$set": {
                "phone": response.phone,
                "quota_reserved": True,
                "quota_reserved_global": reservation.reserved_global,
                "quota_buckets": list(reservation.reserved_buckets),
            }
        },
    )
    
    # Construct Google Form URL with prefilled token
    # Assuming the Google Form has a prefilled entry for token
    # URL format: https://docs.google.com/forms/d/e/ID/viewform?entry.123456=TOKEN
    google_form_url = survey["google_form_url"]
    
    # --- STORE RESPONDENT DATA ---
    try:
        # Save L1 answers as a response record
        await db.get_collection("responses").insert_one({
            "survey_id": survey_id,
            "token": token,
            "phone": phone,
            "answers": answers,
            "source": "layer1",
            "submitted_at": datetime.utcnow()
        })
        
        # Upsert Respondent record
        respondent_data = {
            "phone": phone,
            "name": answers.get("name") or answers.get("Full Name"),
            "age_range": answers.get("Age Range") or answers.get("age_auto"),
            "area": answers.get("area") or answers.get("Area"),
            "gender": answers.get("gender") or answers.get("gender_auto") or answers.get("Gender"),
            "ses_score": answers.get("calculated_ses_score"),
            "ses_class": answers.get("calculated_ses_class"),
            "updated_at": datetime.utcnow()
        }
        
        # Clean None/0 values
        respondent_data = {k: v for k, v in respondent_data.items() if v is not None}
        
        await db.get_collection("respondents").update_one(
            {"phone": phone},
            {
                "$set": respondent_data,
                "$setOnInsert": {"created_at": datetime.utcnow()}
            },
            upsert=True
        )
    except Exception as e:
        logger.error(f"Failed to store respondent data: {e}")

    return {
        "passed": True,
        "google_form_url": google_form_url,
        "token": token
    }

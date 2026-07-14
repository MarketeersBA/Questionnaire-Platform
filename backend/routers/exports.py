from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from typing import Annotated, Dict, Any, List
import pandas as pd
import io
from bson import ObjectId
from datetime import datetime

from backend.database import db
from backend.models import User
from backend.routers.auth import get_current_user
from backend.utils.answer_format import format_module_answer
from backend.utils.module_answer_aliases import (
    build_analytical_context,
    normalize_module_answers,
    question_ids_for_role_lookup,
)
from backend.services.product_test_analytics_service import (
    build_trial_media_download_path,
    extract_product_test_flat_evaluations,
    filter_scalar_evaluations,
    filter_trial_media_evaluations,
    resolve_product_test_attribute_registry_for_survey,
)
from backend.services.product_test_value_classification import resolve_row_value_kind

router = APIRouter(prefix="/exports", tags=["exports"])

STAGE_EXPORT_LABELS = {
    "consideration": "Consideration",
    "bought_12m": "Trial_12m",
    "bought_3m": "Usage_3m",
    "mou": "MostRegular",
}


async def get_survey_context(survey_id: str):
    if not ObjectId.is_valid(survey_id):
        raise HTTPException(status_code=400, detail="Invalid survey ID")

    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")

    brands = []
    internal = survey.get("internal_brands_data") or []
    competitor = survey.get("competitor_brands_data") or []
    for b in internal + competitor:
        brands.append(b.get("name") if isinstance(b, dict) else b.name)

    pf_conf = survey.get("purchase_funnel") or {}
    for item in pf_conf.get("brand_list") or []:
        if isinstance(item, dict):
            name = item.get("name_en") or item.get("name")
            if name and name not in brands:
                brands.append(name)
        elif isinstance(item, str) and item not in brands:
            brands.append(item)

    return survey, brands


@router.get("/ba-pf/{survey_id}")
async def export_ba_pf(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """
    Export Brand Awareness, Purchase Funnel, Usage, and Pricing modules.
    One row per respondent; columns driven by survey module snapshots.
    """
    survey, brands = await get_survey_context(survey_id)
    ctx = build_analytical_context(survey)
    labels = ctx.get("question_labels") or {}

    responses_cursor = db.get_collection("responses").find({"survey_id": survey_id})
    responses = await responses_cursor.to_list(1000)

    if not responses:
        raise HTTPException(status_code=404, detail="No responses found to export")

    rows = []
    for resp in responses:
        raw_answers = resp.get("answers", {}) or {}
        answers = normalize_module_answers(raw_answers, survey, mode="read")
        structured = answers.get("__structured") or {}
        module_answers = structured.get("module_answers") or {}

        row = {
            "Response_ID": str(resp["_id"]),
            "Token": resp.get("token"),
            "Submitted_At": resp.get("submitted_at").isoformat() if isinstance(resp.get("submitted_at"), datetime) else "",
        }

        l1_fields = {
            "Age": ["age_auto", "Age Range / الفئة العمرية"],
            "Gender": ["gender_auto", "Gender / النوع"],
            "Area": ["area", "Location / Area / المحافظة أو المنطقة"],
            "Education": ["education", "Education Level / المستوى التعليمي"],
            "Marital_Status": ["marital_status", "Marital Status / الحالة الاجتماعية"],
            "Income": ["family_income", "Family Monthly Income / الدخل الشهري للأسرة"],
            "Occupation": ["occupation", "Occupation / المهنة"],
        }
        for col_name, keys in l1_fields.items():
            val = next((answers[k] for k in keys if k in answers), None)
            row[col_name] = val

        tom_ids = question_ids_for_role_lookup(ctx, "tom", bucket="awareness")
        other_ids = question_ids_for_role_lookup(ctx, "other_unaided", bucket="awareness")
        aided_ids = question_ids_for_role_lookup(ctx, "aided", bucket="awareness")

        tom_val = next((answers.get(k) for k in tom_ids if answers.get(k) is not None), None)
        row["TOPOFMIND"] = tom_val

        unaided_other = []
        for k in other_ids:
            v = answers.get(k)
            if isinstance(v, list):
                unaided_other.extend(v)
            elif v:
                unaided_other.append(v)

        aided_list = []
        for k in aided_ids:
            v = answers.get(k)
            if isinstance(v, list):
                aided_list.extend(v)
            elif v:
                aided_list.append(v)

        for brand in brands:
            row[f"AidedAwareness_{brand}"] = 1 if brand in aided_list else 0
            is_tom = tom_val == brand
            is_other = brand in unaided_other
            row[f"UnAidedAwareness_{brand}"] = 1 if (is_tom or is_other) else 0

        for stage_role, export_label in STAGE_EXPORT_LABELS.items():
            qids = question_ids_for_role_lookup(ctx, stage_role, bucket="stage")
            val = next((answers.get(k) for k in qids if answers.get(k) is not None), None)
            row[export_label] = format_module_answer(val)

        for module_id in ("brand_usage", "brand_pricing_behavior"):
            bucket = module_answers.get(module_id) or {}
            if not isinstance(bucket, dict):
                continue
            for qid, val in bucket.items():
                col = labels.get(qid, qid)
                row[f"{module_id}_{col}"] = format_module_answer(val)

        rows.append(row)

    df = pd.DataFrame(rows)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name="BA_PF_Modules")

    output.seek(0)

    filename = f"BA_PF_Export_{survey['company_name'].replace(' ', '_')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/product-scalers/{survey_id}")
async def export_product_scalers(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)]
):
    """Export Product Scaler data in a stacked format (one row per brand per respondent)."""
    survey, brands = await get_survey_context(survey_id)
    responses_cursor = db.get_collection("responses").find({"survey_id": survey_id})
    responses = await responses_cursor.to_list(1000)

    if not responses:
        raise HTTPException(status_code=404, detail="No responses found to export")

    rows = []
    for resp in responses:
        answers = resp.get("answers", {}) or {}

        l2_struct = survey.get("template_snapshot_l2", {}) or {}
        attr_map = {}
        for section in l2_struct.get("sections", []):
            for q in section.get("questions", []):
                qid = q.get("id")
                label = q.get("label") or q.get("text") or qid
                clean_label = label.split("/")[0].split("(")[0].strip().replace(" ", "_")
                attr_map[qid] = clean_label

        for brand in brands:
            brand_answers = {}
            found = False

            for qid, clean_label in attr_map.items():
                unique_key = f"{brand}_{qid}"
                if unique_key in answers:
                    brand_answers[clean_label] = answers[unique_key]
                    found = True

            if found:
                row = {
                    "response_id": str(resp["_id"]),
                    "token": resp.get("token"),
                    "brand": brand,
                    "submitted_at": resp.get("submitted_at").isoformat() if isinstance(resp.get("submitted_at"), datetime) else "",
                }
                row["Gender"] = answers.get("gender_auto")
                row["Age"] = answers.get("age_auto")
                row.update(brand_answers)
                rows.append(row)

    df = pd.DataFrame(rows)

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name="Product_Scalers")

    output.seek(0)

    filename = f"Product_Scalers_Export_{survey['company_name'].replace(' ', '_')}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )


@router.get("/test/ba-pf")
async def test_ba_pf():
    """Test endpoint returning a sample BA_PF structure for Postman."""
    data = [
        {"Response_ID": "65ec123", "Token": "T1", "Age": "18-25", "Gender": "Male", "TOPOFMIND": "Abu Auf", "AidedAwareness_Abu Auf": 1, "AidedAwareness_Imtenan": 0, "UnAidedAwareness_Abu Auf": 1, "Consideration": "['Abu Auf']"},
        {"Response_ID": "65ec456", "Token": "T2", "Age": "26-35", "Gender": "Female", "TOPOFMIND": "Imtenan", "AidedAwareness_Abu Auf": 1, "AidedAwareness_Imtenan": 1, "UnAidedAwareness_Abu Auf": 0, "Consideration": "['Imtenan', 'Abu Auf']"},
    ]
    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name="BA_PF_SAMPLE")
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=TEST_BA_PF_STRUCTURE.xlsx"}
    )


@router.get("/test/product-scalers")
async def test_product_scalers():
    """Test endpoint returning a sample Stacked structure for Postman."""
    data = [
        {"response_id": "65ec123", "brand": "Abu Auf", "Gender": "Male", "Age": "18-25", "Overall": 8, "Taste": 9, "AfterTaste": 7},
        {"response_id": "65ec123", "brand": "Imtenan", "Gender": "Male", "Age": "18-25", "Overall": 6, "Taste": 5, "AfterTaste": 4},
        {"response_id": "65ec456", "brand": "Abu Auf", "Gender": "Female", "Age": "26-35", "Overall": 9, "Taste": 10, "AfterTaste": 8},
    ]
    df = pd.DataFrame(data)
    output = io.BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name="SCALERS_SAMPLE")
    output.seek(0)
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=TEST_SCALERS_STRUCTURE.xlsx"}
    )


@router.get("/product-test/{survey_id}")
async def export_product_test(
    survey_id: str,
    current_user: Annotated[User, Depends(get_current_user)],
):
    """
    Export Phase 5 product test structured answers.

    Sheet 1 — scalar evaluations (numeric/text scores; excludes media references).
    Sheet 2 — trial media metadata with internal authenticated download URLs (no binary).
    """
    del current_user
    survey, _brands = await get_survey_context(survey_id)
    registry = resolve_product_test_attribute_registry_for_survey(survey)
    registry_by_qid = {entry["question_id"]: entry for entry in registry}

    responses_cursor = db.get_collection("responses").find({"survey_id": survey_id})
    responses = await responses_cursor.to_list(10000)

    if not responses:
        raise HTTPException(status_code=404, detail="No responses found to export")

    scalar_rows: List[Dict[str, Any]] = []
    media_rows: List[Dict[str, Any]] = []

    for resp in responses:
        answers = resp.get("answers", {}) or {}
        flat_rows = extract_product_test_flat_evaluations(answers)

        for row in filter_scalar_evaluations(flat_rows):
            qid = row.get("question_id") or ""
            reg = registry_by_qid.get(qid, {})
            scalar_rows.append({
                "Response_ID": str(resp["_id"]),
                "Token": resp.get("token"),
                "Submitted_At": resp.get("submitted_at").isoformat()
                if isinstance(resp.get("submitted_at"), datetime)
                else "",
                "Question_ID": qid,
                "Canonical_Question_ID": row.get("canonical_question_id") or reg.get("canonical_question_id"),
                "Question_Text": row.get("question_text") or reg.get("question_text"),
                "Question_Type": reg.get("question_type") or row.get("question_type"),
                "Value_Kind": resolve_row_value_kind(row),
                "Brand": row.get("brand"),
                "Brand_Display": row.get("brand_display"),
                "Timing": row.get("timing") or reg.get("timing"),
                "Module": row.get("module") or reg.get("module"),
                "Diagnostic_Tag": row.get("diagnostic_tag") or reg.get("diagnostic_tag"),
                "Section": row.get("section_title") or reg.get("section_title"),
                "Value": row.get("value"),
            })

        for row in filter_trial_media_evaluations(flat_rows):
            value = row.get("value")
            if not isinstance(value, dict):
                continue
            asset_id = value.get("asset_id")
            if not asset_id:
                continue

            qid = row.get("question_id") or ""
            reg = registry_by_qid.get(qid, {})
            media_rows.append({
                "Response_ID": str(resp["_id"]),
                "Token": resp.get("token"),
                "Submitted_At": resp.get("submitted_at").isoformat()
                if isinstance(resp.get("submitted_at"), datetime)
                else "",
                "Question_ID": qid,
                "Question_Text": row.get("question_text") or reg.get("question_text"),
                "Timing": row.get("timing") or reg.get("timing"),
                "Asset_ID": asset_id,
                "Media_Type": value.get("media_type"),
                "MIME": value.get("mime"),
                "Filename": value.get("filename"),
                "Size_Bytes": value.get("size_bytes"),
                "Width": value.get("width"),
                "Height": value.get("height"),
                "Duration_Seconds": value.get("duration_seconds"),
                "Uploaded_At": value.get("uploaded_at"),
                "Download_URL": build_trial_media_download_path(survey_id, str(asset_id)),
                "Stream_URL": f"/api/surveys/{survey_id}/product-test/media/{asset_id}/stream",
            })

    output = io.BytesIO()
    with pd.ExcelWriter(output, engine="openpyxl") as writer:
        pd.DataFrame(scalar_rows or [{"Message": "No scalar product test answers"}]).to_excel(
            writer, index=False, sheet_name="ProductTest_Scalars",
        )
        pd.DataFrame(media_rows or [{"Message": "No trial media uploads"}]).to_excel(
            writer, index=False, sheet_name="Trial_Media",
        )

    output.seek(0)
    company = (survey.get("company_name") or "Survey").replace(" ", "_")
    filename = f"ProductTest_Export_{company}.xlsx"
    return StreamingResponse(
        output,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )

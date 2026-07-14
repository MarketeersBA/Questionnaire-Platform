"""
Packaging heatmap analytics — incremental grid aggregation and survey summaries.

Stores pre-aggregated 32×32 click density grids in `packaging_heatmap_aggregates`.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

from bson import ObjectId

from backend.database import db
from backend.packaging_heatmap.constants import PACKAGING_HEATMAP_GRID_SIZE
from backend.packaging_heatmap.snapshot import build_packaging_heatmap_snapshot_meta
from backend.services.packaging_heatmap_asset_service import get_packaging_image_from_config
from backend.services.product_test_analytics_service import extract_product_test_flat_evaluations

logger = logging.getLogger(__name__)

COLLECTION_NAME = "packaging_heatmap_aggregates"
HEATMAP_MODULE = "packaging_heatmap"
_CANONICAL_RE = re.compile(r"^(?:pkg_hm_)?(front|back)_(attraction|dislikes|improve)$")


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def bin_click(x: float, y: float, grid_size: int = PACKAGING_HEATMAP_GRID_SIZE) -> int:
    """Map normalized coordinates to a flat grid index."""
    clamped_x = min(1.0, max(0.0, float(x)))
    clamped_y = min(1.0, max(0.0, float(y)))
    col = min(grid_size - 1, int(clamped_x * grid_size))
    row = min(grid_size - 1, int(clamped_y * grid_size))
    return row * grid_size + col


def bin_region(x1: float, y1: float, x2: float, y2: float, grid_size: int = PACKAGING_HEATMAP_GRID_SIZE) -> List[int]:
    """Map normalized standard coordinates of a region to a list of overlapping flat grid indices (area-weighted)."""
    min_x = min(1.0, max(0.0, float(min(x1, x2))))
    max_x = min(1.0, max(0.0, float(max(x1, x2))))
    min_y = min(1.0, max(0.0, float(min(y1, y2))))
    max_y = min(1.0, max(0.0, float(max(y1, y2))))

    col_start = min(grid_size - 1, int(min_x * grid_size))
    col_end = min(grid_size - 1, int(max_x * grid_size))
    row_start = min(grid_size - 1, int(min_y * grid_size))
    row_end = min(grid_size - 1, int(max_y * grid_size))

    bins = []
    for r in range(row_start, row_end + 1):
        for c in range(col_start, col_end + 1):
            bins.append(r * grid_size + c)

    return bins


def _empty_bins(grid_size: int = PACKAGING_HEATMAP_GRID_SIZE) -> List[int]:
    return [0] * (grid_size * grid_size)


def resolve_heatmap_side_intent(row: Dict[str, Any]) -> Tuple[Optional[str], Optional[str]]:
    """Resolve image side and intent from evaluation value or question id."""
    value = row.get("value")
    if isinstance(value, dict):
        side = value.get("image_side")
        intent = value.get("intent")
        if side and intent:
            return str(side), str(intent)

    for candidate in (
        row.get("canonical_question_id"),
        row.get("question_id"),
    ):
        if not candidate:
            continue
        text = str(candidate)
        if "_pkg_hm_" in text:
            text = text.split("_pkg_hm_", 1)[1]
        match = _CANONICAL_RE.match(text)
        if match:
            return match.group(1), match.group(2)

    return None, None


def filter_packaging_heatmap_evaluations(
    flat_evaluations: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    return [
        row for row in flat_evaluations
        if row.get("module") == HEATMAP_MODULE
    ]


def extract_regions_from_evaluation(row: Dict[str, Any]) -> List[Dict[str, Any]]:
    value = row.get("value")
    if not isinstance(value, dict):
        return []
    
    regions = []
    
    # Phase 4 support for new regions shape
    raw_regions = value.get("regions", [])
    if isinstance(raw_regions, list):
        for r in raw_regions:
            if isinstance(r, dict) and "x1" in r and "y1" in r and "x2" in r and "y2" in r:
                regions.append(r)
                
    # Support for simple clicks (pins)
    clicks = value.get("clicks", [])
    if isinstance(clicks, list):
        for c in clicks:
            if isinstance(c, dict) and "x" in c and "y" in c:
                # Store as point for bin_click
                regions.append({
                    "is_point": True,
                    "x": c["x"],
                    "y": c["y"],
                    "ts": c.get("ts"),
                    "feedback": c.get("feedback"),
                })

    return regions


def _aggregate_rows_in_memory(
    rows: List[Dict[str, Any]],
    grid_size: int = PACKAGING_HEATMAP_GRID_SIZE,
) -> Dict[str, Dict[str, Any]]:
    """Build aggregate docs keyed by question_id from flat evaluation rows."""
    buckets: Dict[str, Dict[str, Any]] = {}

    for row in rows:
        if row.get("module") != HEATMAP_MODULE:
            continue

        question_id = row.get("question_id")
        if not question_id:
            continue

        side, intent = resolve_heatmap_side_intent(row)
        if not side or not intent:
            continue

        clicks = extract_regions_from_evaluation(row)
        if not clicks:
            continue

        bucket = buckets.setdefault(
            question_id,
            {
                "question_id": question_id,
                "image_side": side,
                "intent": intent,
                "grid_size": grid_size,
                "bins": _empty_bins(grid_size),
                "total_clicks": 0,
                "response_count": 0,
                "sentiment_counts": {"like": 0, "dislike": 0, "recommend": 0},
            },
        )
        bucket["response_count"] += 1

        bin_increments: Dict[int, int] = {}
        for r in clicks:
            if r.get("is_point"):
                idx = bin_click(r["x"], r["y"], grid_size)
                bin_increments[idx] = bin_increments.get(idx, 0) + 1
            else:
                overlapping = bin_region(r["x1"], r["y1"], r["x2"], r["y2"], grid_size)
                for idx in overlapping:
                    bin_increments[idx] = bin_increments.get(idx, 0) + 1

            feedback = r.get("feedback")
            if feedback and isinstance(feedback, dict):
                sentiment = feedback.get("sentiment")
                if sentiment in ("like", "dislike", "recommend"):
                    bucket["sentiment_counts"][sentiment] += 1

        for idx, count in bin_increments.items():
            bucket["bins"][idx] += count
        bucket["total_clicks"] += len(clicks)

    return buckets


async def ingest_response(
    survey_id: str,
    flat_evaluations: List[Dict[str, Any]],
    *,
    grid_size: int = PACKAGING_HEATMAP_GRID_SIZE,
    respondent_token: Optional[str] = None,
) -> int:
    """
    Incrementally update aggregates from one submission's flat_evaluations.

    Returns number of heatmap questions ingested.
    """
    heatmap_rows = filter_packaging_heatmap_evaluations(flat_evaluations)
    if not heatmap_rows:
        return 0

    col = db.get_collection(COLLECTION_NAME)
    feedback_col = db.get_collection("packaging_heatmap_feedback")
    ingested = 0
    now = _utc_now()
    feedbacks_to_insert = []

    for row in heatmap_rows:
        question_id = row.get("question_id")
        if not question_id:
            continue

        side, intent = resolve_heatmap_side_intent(row)
        if not side or not intent:
            continue

        regions = extract_regions_from_evaluation(row)
        if not regions:
            continue

        bin_increments: Dict[int, int] = {}
        sentiment_increments: Dict[str, int] = {}

        for r in regions:
            if r.get("is_point"):
                idx = bin_click(r["x"], r["y"], grid_size)
                bin_increments[idx] = bin_increments.get(idx, 0) + 1
                r_db = {"x": r["x"], "y": r["y"]}
            else:
                overlapping = bin_region(r["x1"], r["y1"], r["x2"], r["y2"], grid_size)
                for idx in overlapping:
                    bin_increments[idx] = bin_increments.get(idx, 0) + 1
                r_db = {"x1": r["x1"], "y1": r["y1"], "x2": r["x2"], "y2": r["y2"]}
            
            feedback = r.get("feedback")
            if feedback and isinstance(feedback, dict):
                sentiment = feedback.get("sentiment")
                if sentiment in ("like", "dislike", "recommend"):
                    s_key = f"sentiment_counts.{sentiment}"
                    sentiment_increments[s_key] = sentiment_increments.get(s_key, 0) + 1
                
                if feedback.get("comment") or feedback.get("voice_note_asset_id"):
                    feedbacks_to_insert.append({
                        "survey_id": survey_id,
                        "question_id": question_id,
                        "respondent_token": respondent_token,
                        "region": r_db,
                        "sentiment": sentiment,
                        "comment": feedback.get("comment"),
                        "voice_note_asset_id": feedback.get("voice_note_asset_id"),
                        "created_at": now
                    })

        inc_fields: Dict[str, Any] = {
            "total_clicks": len(regions),
            "response_count": 1,
        }
        for idx, count in bin_increments.items():
            inc_fields[f"bins.{idx}"] = count
        
        for k, v in sentiment_increments.items():
            inc_fields[k] = v

        await col.update_one(
            {"survey_id": survey_id, "question_id": question_id},
            {
                "$inc": inc_fields,
                "$set": {
                    "image_side": side,
                    "intent": intent,
                    "grid_size": grid_size,
                    "updated_at": now,
                },
                "$setOnInsert": {
                    "survey_id": survey_id,
                    "question_id": question_id,
                    "bins": _empty_bins(grid_size),
                    "created_at": now,
                    "sentiment_counts": {"like": 0, "dislike": 0, "recommend": 0}
                },
            },
            upsert=True,
        )
        ingested += 1

    if feedbacks_to_insert:
        await feedback_col.insert_many(feedbacks_to_insert)

    return ingested


async def rebuild_aggregates(
    survey_id: str,
    *,
    grid_size: int = PACKAGING_HEATMAP_GRID_SIZE,
) -> Dict[str, Any]:
    """Full recompute from all non-L1 responses — repair / backfill path."""
    responses_col = db.get_collection("responses")
    agg_col = db.get_collection(COLLECTION_NAME)

    cursor = responses_col.find({
        "survey_id": survey_id,
        "source": {"$ne": "layer1"},
    })

    all_rows: List[Dict[str, Any]] = []
    response_tokens: set[str] = set()

    async for response in cursor:
        answers = response.get("answers") or {}
        rows = filter_packaging_heatmap_evaluations(
            extract_product_test_flat_evaluations(answers),
        )
        if rows:
            response_tokens.add(response.get("token") or str(response.get("_id")))
            # Also re-extract feedbacks here if we need to rebuild them, but typically rebuild aggregates 
            # might not need to drop/re-insert feedbacks. We will skip feedback rebuild to strictly focus 
            # on the aggregates matrix.
        all_rows.extend(rows)

    buckets = _aggregate_rows_in_memory(all_rows, grid_size)
    now = _utc_now()

    await agg_col.delete_many({"survey_id": survey_id})

    docs = []
    for bucket in buckets.values():
        bucket["survey_id"] = survey_id
        bucket["updated_at"] = now
        bucket["created_at"] = now
        docs.append(bucket)

    if docs:
        await agg_col.insert_many(docs)

    return {
        "survey_id": survey_id,
        "aggregate_count": len(docs),
        "responses_with_heatmap": len(response_tokens),
        "total_clicks": sum(doc["total_clicks"] for doc in docs),
    }


async def get_survey_heatmap_summary(survey_id: str) -> Dict[str, Any]:
    """Return aggregate grids plus image asset refs from survey config."""
    if not ObjectId.is_valid(survey_id):
        raise ValueError("Invalid survey ID")

    survey = await db.get_collection("surveys").find_one({"_id": ObjectId(survey_id)})
    if not survey:
        raise ValueError("Survey not found")

    pt_config = survey.get("product_test_config") or {}
    hm_meta = build_packaging_heatmap_snapshot_meta(pt_config) or {}

    agg_col = db.get_collection(COLLECTION_NAME)
    cursor = agg_col.find({"survey_id": survey_id}).sort("question_id", 1)
    aggregates: List[Dict[str, Any]] = []
    total_clicks = 0
    max_response_count = 0

    async for doc in cursor:
        doc.pop("_id", None)
        bins = doc.get("bins") or _empty_bins()
        if len(bins) < PACKAGING_HEATMAP_GRID_SIZE * PACKAGING_HEATMAP_GRID_SIZE:
            bins = bins + [0] * (PACKAGING_HEATMAP_GRID_SIZE * PACKAGING_HEATMAP_GRID_SIZE - len(bins))
        doc["bins"] = bins[: PACKAGING_HEATMAP_GRID_SIZE * PACKAGING_HEATMAP_GRID_SIZE]
        aggregates.append(doc)
        total_clicks += int(doc.get("total_clicks") or 0)
        max_response_count = max(max_response_count, int(doc.get("response_count") or 0))

    images: Dict[str, Any] = {}
    for side in ("front", "back"):
        asset = get_packaging_image_from_config(pt_config, side)
        if asset:
            images[side] = asset.model_dump(mode="json")

    return {
        "survey_id": survey_id,
        "packaging_heatmap_enabled": bool(pt_config.get("packaging_heatmap_enabled")),
        "grid_size": PACKAGING_HEATMAP_GRID_SIZE,
        "images": images,
        "meta": hm_meta,
        "aggregates": aggregates,
        "summary": {
            "question_count": len(aggregates),
            "total_clicks": total_clicks,
            "max_response_count": max_response_count,
        },
    }


async def ensure_aggregate_indexes() -> None:
    col = db.get_collection(COLLECTION_NAME)
    await col.create_index([("survey_id", 1), ("question_id", 1)], unique=True)
    await col.create_index("survey_id")


async def ingest_heatmap_answers_direct(
    survey_id: str,
    hm_answers: Dict[str, Any],
    respondent_token: str,
    grid_size: int = PACKAGING_HEATMAP_GRID_SIZE,
) -> int:
    """Directly ingest heatmap answers from a raw answers dict."""
    flat_rows = []
    for k, v in hm_answers.items():
        flat_rows.append({
            "module": HEATMAP_MODULE,
            "question_id": k,
            "value": v,
        })
    return await ingest_response(survey_id, flat_rows, grid_size=grid_size, respondent_token=respondent_token)

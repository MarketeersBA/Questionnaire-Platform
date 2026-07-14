"""
Trial media lifecycle — finalize on submit, abandoned upload cleanup.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set

from bson import ObjectId

from backend.config import settings
from backend.database import db
from backend.services.product_test_analytics_service import extract_product_test_flat_evaluations
from backend.services.product_test_value_classification import is_product_test_media_reference
from backend.trial_media_capture.constants import MEDIA_ASSETS_COLLECTION
from backend.trial_media_capture.constants import (
    LIFECYCLE_ORPHANED,
    LIFECYCLE_PENDING,
    LIFECYCLE_SUBMITTED,
)

logger = logging.getLogger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def extract_media_asset_ids_from_answers(answers: Dict[str, Any]) -> Set[str]:
    """Collect asset_id values from product test flat_evaluations."""
    asset_ids: Set[str] = set()
    for row in extract_product_test_flat_evaluations(answers):
        value = row.get("value")
        if is_product_test_media_reference(value):
            asset_ids.add(str(value["asset_id"]))
        row_asset = row.get("media_asset_id")
        if row_asset:
            asset_ids.add(str(row_asset))
    return asset_ids


async def finalize_trial_media_on_submit(token: str, answers: Dict[str, Any]) -> Dict[str, int]:
    """
    Mark media assets referenced in the final submission as submitted.

    Queues scan for assets still pending scan when enabled.
    """
    from backend.services.product_test_media_asset_service import _assets_collection
    from backend.services.product_test_media_scanner import (
        apply_scan_result_to_registry,
        scan_trial_media_asset,
    )
    from backend.trial_media_capture.constants import SCAN_PENDING

    asset_ids = extract_media_asset_ids_from_answers(answers)
    if not asset_ids:
        return {"finalized": 0, "scanned": 0}

    now = _utc_now()
    col = _assets_collection()
    finalized = 0
    scanned = 0

    for asset_id in asset_ids:
        registry = await col.find_one({"asset_id": asset_id, "token": token})
        if not registry:
            continue

        await col.update_one(
            {"asset_id": asset_id},
            {
                "$set": {
                    "lifecycle_state": LIFECYCLE_SUBMITTED,
                    "referenced_at": now,
                    "submitted_at": now,
                }
            },
        )
        finalized += 1

        if registry.get("scan_status") == SCAN_PENDING:
            result = await scan_trial_media_asset(registry, asset_id=asset_id)
            await apply_scan_result_to_registry(asset_id, result)
            scanned += 1

    return {"finalized": finalized, "scanned": scanned}


async def cleanup_abandoned_trial_media(
    *,
    dry_run: bool = True,
    abandoned_ttl_hours: Optional[int] = None,
    unreferenced_grace_hours: Optional[int] = None,
    limit: int = 500,
) -> Dict[str, Any]:
    """
    Delete token-scoped trial media not referenced by a submitted response.

    Rules:
    1. lifecycle_state=pending AND uploaded_at older than abandoned TTL
    2. Token already submitted/failed AND asset still pending (unreferenced upload)
       after grace period
    """
    from backend.services.product_test_media_asset_service import (
        _delete_gridfs_asset,
        _delete_registry_doc,
    )

    ttl_h = abandoned_ttl_hours or settings.PRODUCT_TEST_MEDIA_ABANDONED_TTL_HOURS
    grace_h = unreferenced_grace_hours or settings.PRODUCT_TEST_MEDIA_UNREFERENCED_GRACE_HOURS
    cutoff_abandoned = _utc_now() - timedelta(hours=ttl_h)
    cutoff_grace = _utc_now() - timedelta(hours=grace_h)

    col = db.get_collection(MEDIA_ASSETS_COLLECTION)
    tokens_col = db.get_collection("tokens")
    responses_col = db.get_collection("responses")

    candidates: List[Dict[str, Any]] = []

    pending_cursor = col.find({
        "lifecycle_state": LIFECYCLE_PENDING,
        "uploaded_at": {"$lt": cutoff_abandoned},
    }).limit(limit)
    candidates.extend(await pending_cursor.to_list(length=limit))

    submitted_tokens_cursor = tokens_col.find(
        {"status": {"$in": ["submitted", "failed"]}},
        {"token": 1, "status": 1},
    )
    submitted_tokens = await submitted_tokens_cursor.to_list(length=10000)
    token_set = {t["token"] for t in submitted_tokens if t.get("token")}

    if token_set and len(candidates) < limit:
        remaining = limit - len(candidates)
        stale_pending = await col.find({
            "lifecycle_state": LIFECYCLE_PENDING,
            "token": {"$in": list(token_set)},
            "uploaded_at": {"$lt": cutoff_grace},
        }).limit(remaining).to_list(length=remaining)
        seen = {c["asset_id"] for c in candidates}
        for doc in stale_pending:
            if doc.get("asset_id") not in seen:
                candidates.append(doc)

    deleted: List[str] = []
    skipped_referenced: List[str] = []

    for registry in candidates:
        asset_id = registry.get("asset_id")
        token = registry.get("token")
        if not asset_id or not token:
            continue

        if registry.get("lifecycle_state") == LIFECYCLE_SUBMITTED:
            continue

        response = await responses_col.find_one(
            {"token": token, "source": {"$ne": "layer1"}},
            sort=[("submitted_at", -1)],
        )
        if response:
            referenced = extract_media_asset_ids_from_answers(response.get("answers") or {})
            if asset_id in referenced:
                skipped_referenced.append(asset_id)
                continue

        if dry_run:
            deleted.append(asset_id)
            continue

        await _delete_gridfs_asset(asset_id)
        await col.update_one(
            {"asset_id": asset_id},
            {"$set": {"lifecycle_state": LIFECYCLE_ORPHANED, "orphaned_at": _utc_now()}},
        )
        await _delete_registry_doc(asset_id)
        deleted.append(asset_id)

    return {
        "dry_run": dry_run,
        "candidate_count": len(candidates),
        "deleted_count": len(deleted),
        "deleted_asset_ids": deleted,
        "skipped_referenced": skipped_referenced,
        "abandoned_ttl_hours": ttl_h,
        "unreferenced_grace_hours": grace_h,
    }

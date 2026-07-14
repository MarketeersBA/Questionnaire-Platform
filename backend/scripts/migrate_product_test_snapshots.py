"""
One-time / batch migration: populate or brand-expand product_test_snapshot.

Usage:
  python -m backend.scripts.migrate_product_test_snapshots
  python -m backend.scripts.migrate_product_test_snapshots --dry-run
  python -m backend.scripts.migrate_product_test_snapshots --survey-id <id>
  python -m backend.scripts.migrate_product_test_snapshots --recompose-brands
  python -m backend.scripts.migrate_product_test_snapshots --recompose-brands --force
"""

from __future__ import annotations

import argparse
import asyncio
from typing import Any, Dict

from backend.database import db
from backend.services.orchestration_service import orchestration_service
from backend.services.product_test_orchestration import (
    migrate_legacy_l2_to_product_test_snapshot,
    resolve_orchestration_language,
    strip_product_test_from_l2,
)
from backend.services.product_test_public_gateway import (
    is_product_test_survey,
    snapshot_has_content,
)
from backend.services.product_test_snapshot_migration import (
    snapshot_has_brand_context,
    snapshot_needs_brand_recompose,
)


def _snapshot_has_content(snapshot: Dict[str, Any] | None) -> bool:
    return snapshot_has_content(snapshot)


async def _compose_brand_aware_snapshot(survey: Dict[str, Any]) -> Dict[str, Any] | None:
    language = resolve_orchestration_language(survey)
    pt_config = survey.get("product_test_config") or {}
    snapshot = await orchestration_service.compose_product_test_snapshot(
        pt_config, language, survey,
    )
    return snapshot if _snapshot_has_content(snapshot) else None


async def migrate_survey(
    survey: Dict[str, Any],
    *,
    dry_run: bool,
    recompose_brands: bool,
    force_recompose: bool,
) -> str:
    survey_id = str(survey["_id"])
    existing = survey.get("product_test_snapshot")
    is_pt = is_product_test_survey(survey)

    if recompose_brands and is_pt:
        needs_recompose = force_recompose or snapshot_needs_brand_recompose(existing, survey)
        if needs_recompose and _snapshot_has_content(existing):
            snapshot = await _compose_brand_aware_snapshot(survey)
            if not snapshot:
                return "skipped_empty_recompose"
            if dry_run:
                return "would_recompose_brands"
            stripped_l2 = strip_product_test_from_l2(survey.get("template_snapshot_l2"))
            await db.get_collection("surveys").update_one(
                {"_id": survey["_id"]},
                {
                    "$set": {
                        "product_test_snapshot": snapshot,
                        "template_snapshot_l2": stripped_l2,
                    }
                },
            )
            return "recomposed_brands"

        if force_recompose and _snapshot_has_content(existing) and snapshot_has_brand_context(existing):
            snapshot = await _compose_brand_aware_snapshot(survey)
            if not snapshot:
                return "skipped_empty_recompose"
            if dry_run:
                return "would_force_recompose"
            await db.get_collection("surveys").update_one(
                {"_id": survey["_id"]},
                {"$set": {"product_test_snapshot": snapshot}},
            )
            return "force_recomposed"

        if recompose_brands:
            return "skipped_no_brand_recompose_needed"

    if _snapshot_has_content(existing):
        return "skipped_has_snapshot"

    pt_config = survey.get("product_test_config") or {}
    if not is_pt and not pt_config:
        legacy = migrate_legacy_l2_to_product_test_snapshot(
            survey.get("template_snapshot_l2"),
            resolve_orchestration_language(survey),
        )
        if not _snapshot_has_content(legacy):
            return "skipped_not_product_test"
        snapshot = legacy
        stripped_l2 = strip_product_test_from_l2(survey.get("template_snapshot_l2"))
    else:
        language = resolve_orchestration_language(survey)
        legacy = migrate_legacy_l2_to_product_test_snapshot(
            survey.get("template_snapshot_l2"),
            language,
        )
        if _snapshot_has_content(legacy):
            snapshot = legacy
            stripped_l2 = strip_product_test_from_l2(survey.get("template_snapshot_l2"))
        else:
            snapshot = await _compose_brand_aware_snapshot(survey)
            if not snapshot:
                return "skipped_empty_snapshot"
            stripped_l2 = strip_product_test_from_l2(survey.get("template_snapshot_l2"))

    if not _snapshot_has_content(snapshot):
        return "skipped_empty_snapshot"

    # Brand-expand on first migration when Parameters already define brands.
    if is_pt and not snapshot_has_brand_context(snapshot):
        expanded = await _compose_brand_aware_snapshot(survey)
        if _snapshot_has_content(expanded):
            snapshot = expanded

    if dry_run:
        return "would_migrate"

    await db.get_collection("surveys").update_one(
        {"_id": survey["_id"]},
        {
            "$set": {
                "product_test_snapshot": snapshot,
                "template_snapshot_l2": stripped_l2,
            }
        },
    )
    return "migrated"


async def run_migration(
    *,
    dry_run: bool,
    survey_id: str | None,
    recompose_brands: bool,
    force_recompose: bool,
) -> None:
    col = db.get_collection("surveys")
    query: Dict[str, Any] = {"is_deleted": {"$ne": True}}
    if survey_id:
        from bson import ObjectId
        query["_id"] = ObjectId(survey_id)

    surveys = await col.find(query).to_list(length=5000)
    counts: Dict[str, int] = {}

    for survey in surveys:
        result = await migrate_survey(
            survey,
            dry_run=dry_run,
            recompose_brands=recompose_brands,
            force_recompose=force_recompose,
        )
        counts[result] = counts.get(result, 0) + 1

    print("Migration summary:")
    for key, value in sorted(counts.items()):
        print(f"  {key}: {value}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate product_test_snapshot from legacy L2")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--survey-id", default=None)
    parser.add_argument(
        "--recompose-brands",
        action="store_true",
        help="Re-compose existing snapshots with brand loop when Parameters define brands",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="With --recompose-brands, re-compose even when brand_context already exists",
    )
    args = parser.parse_args()
    asyncio.run(
        run_migration(
            dry_run=args.dry_run,
            survey_id=args.survey_id,
            recompose_brands=args.recompose_brands,
            force_recompose=args.force,
        ),
    )


if __name__ == "__main__":
    main()

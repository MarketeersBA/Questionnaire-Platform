#!/usr/bin/env python3
"""
Cleanup duplicate survey_reports rows blocking the unique survey_id index.

Keeps the newest document per survey_id (by generated_at, then _id).
Older duplicates are moved to survey_reports_archive then removed.

Usage:
  python -m backend.scripts.cleanup_duplicate_survey_reports --dry-run
  python -m backend.scripts.cleanup_duplicate_survey_reports --apply
  python -m backend.scripts.cleanup_duplicate_survey_reports --apply --recreate-index
"""
from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List

from backend.database import db
from backend.utils.logging_utils import setup_logging

logger = logging.getLogger(__name__)

ARCHIVE_COLLECTION = "survey_reports_archive"


def _sort_key(doc: Dict[str, Any]) -> tuple:
    generated = doc.get("generated_at")
    if generated is None:
        generated = datetime.min.replace(tzinfo=timezone.utc)
    elif generated.tzinfo is None:
        generated = generated.replace(tzinfo=timezone.utc)
    oid = doc.get("_id")
    return (generated, str(oid))


async def find_duplicate_survey_ids() -> Dict[str, List[Dict[str, Any]]]:
    """Return survey_id -> all report docs (unsorted)."""
    pipeline = [
        {"$group": {"_id": "$survey_id", "count": {"$sum": 1}}},
        {"$match": {"count": {"$gt": 1}}},
    ]
    dup_ids: List[str] = []
    async for row in db.get_collection("survey_reports").aggregate(pipeline):
        sid = row.get("_id")
        if sid is not None:
            dup_ids.append(str(sid))

    groups: Dict[str, List[Dict[str, Any]]] = {}
    for survey_id in dup_ids:
        cursor = db.get_collection("survey_reports").find({"survey_id": survey_id})
        groups[survey_id] = [doc async for doc in cursor]
    return groups


async def run_cleanup(*, dry_run: bool, recreate_index: bool) -> Dict[str, Any]:
    db.connect()
    reports = db.get_collection("survey_reports")
    archive = db.get_collection(ARCHIVE_COLLECTION)

    groups = await find_duplicate_survey_ids()
    stats = {
        "duplicate_survey_ids": len(groups),
        "documents_archived": 0,
        "documents_deleted": 0,
        "kept_report_ids": [],
        "dry_run": dry_run,
    }

    if not groups:
        logger.info("No duplicate survey_id values found in survey_reports.")
    else:
        logger.warning(
            "Found %s survey_id value(s) with duplicate reports",
            len(groups),
        )

    for survey_id, docs in groups.items():
        sorted_docs = sorted(docs, key=_sort_key, reverse=True)
        keeper = sorted_docs[0]
        to_remove = sorted_docs[1:]
        stats["kept_report_ids"].append(str(keeper["_id"]))

        logger.info(
            "survey_id=%s | keep=%s | remove=%s doc(s)",
            survey_id,
            keeper["_id"],
            len(to_remove),
        )

        for doc in to_remove:
            archive_doc = {
                **doc,
                "_archived_at": datetime.now(timezone.utc),
                "_archive_reason": "duplicate_survey_id_cleanup",
                "_kept_report_id": str(keeper["_id"]),
            }
            if dry_run:
                logger.info(
                    "[dry-run] Would archive and delete report _id=%s survey_id=%s",
                    doc["_id"],
                    survey_id,
                )
                continue

            await archive.insert_one(archive_doc)
            await reports.delete_one({"_id": doc["_id"]})
            stats["documents_archived"] += 1
            stats["documents_deleted"] += 1

    if recreate_index and not dry_run:
        try:
            await reports.create_index("survey_id", unique=True)
            stats["index_recreated"] = True
            logger.info("Recreated unique index on survey_reports.survey_id")
        except Exception as exc:
            stats["index_recreated"] = False
            stats["index_error"] = str(exc)
            logger.error(
                "Failed to recreate unique index — duplicates may remain: %s",
                exc,
            )
    elif recreate_index and dry_run:
        logger.info("[dry-run] Would recreate unique index on survey_id")

    db.close()
    return stats


def main() -> None:
    setup_logging()
    parser = argparse.ArgumentParser(
        description="Archive duplicate survey_reports and optionally recreate unique index.",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="List actions without writing to MongoDB",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Archive duplicates and delete older rows",
    )
    parser.add_argument(
        "--recreate-index",
        action="store_true",
        help="After cleanup, recreate unique index on survey_id",
    )
    args = parser.parse_args()

    if not args.dry_run and not args.apply:
        parser.error("Specify --dry-run or --apply")

    stats = asyncio.run(
        run_cleanup(dry_run=args.dry_run, recreate_index=args.recreate_index)
    )
    logger.info("Cleanup finished: %s", stats)


if __name__ == "__main__":
    main()

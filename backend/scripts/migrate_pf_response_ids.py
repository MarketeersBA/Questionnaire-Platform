"""
Batch migrate historical response answers: aw_q*/pb_q* → pf_q* (+ mirror legacy).

Usage:
  python -m backend.scripts.migrate_pf_response_ids --dry-run
  python -m backend.scripts.migrate_pf_response_ids --survey-id <id>
"""
from __future__ import annotations

import argparse
import asyncio
from typing import Any, Dict, List

from bson import ObjectId

from backend.database import db
from backend.utils.module_answer_aliases import LEGACY_PF_MAP, normalize_module_answers


async def migrate_responses(
    *,
    survey_id: str | None = None,
    dry_run: bool = True,
    limit: int = 0,
) -> Dict[str, Any]:
    col = db.get_collection("responses")
    query: Dict[str, Any] = {}
    if survey_id:
        query["survey_id"] = survey_id

    cursor = col.find(query)
    if limit > 0:
        cursor = cursor.limit(limit)

    responses = await cursor.to_list(length=limit or 100_000)
    stats = {"scanned": 0, "updated": 0, "skipped": 0, "errors": 0}

    for resp in responses:
        stats["scanned"] += 1
        answers = resp.get("answers") or {}
        if not isinstance(answers, dict):
            stats["skipped"] += 1
            continue

        has_legacy = any(k in answers for k in LEGACY_PF_MAP)
        structured = answers.get("__structured") or {}
        pf = structured.get("purchase_funnel") if isinstance(structured, dict) else {}
        has_legacy = has_legacy or (
            isinstance(pf, dict) and any(k in pf for k in LEGACY_PF_MAP)
        )
        if not has_legacy:
            stats["skipped"] += 1
            continue

        survey_doc = None
        sid = resp.get("survey_id")
        if sid and ObjectId.is_valid(str(sid)):
            survey_doc = await db.get_collection("surveys").find_one(
                {"_id": ObjectId(str(sid))},
                {"module_snapshots": 1, "analytical_mapping": 1},
            )

        try:
            normalized = normalize_module_answers(answers, survey_doc, mode="both")
        except Exception:
            stats["errors"] += 1
            continue

        if normalized == answers:
            stats["skipped"] += 1
            continue

        stats["updated"] += 1
        if not dry_run:
            await col.update_one({"_id": resp["_id"]}, {"$set": {"answers": normalized}})

    return stats


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate PF response IDs to pf_q* scheme")
    parser.add_argument("--survey-id", default=None, help="Limit to a single survey_id")
    parser.add_argument("--dry-run", action="store_true", default=True)
    parser.add_argument("--apply", action="store_true", help="Persist changes (disables dry-run)")
    parser.add_argument("--limit", type=int, default=0, help="Max responses to process")
    args = parser.parse_args()

    dry_run = not args.apply
    stats = asyncio.run(
        migrate_responses(survey_id=args.survey_id, dry_run=dry_run, limit=args.limit)
    )
    mode = "DRY-RUN" if dry_run else "APPLIED"
    print(f"[{mode}] migrate_pf_response_ids: {stats}")


if __name__ == "__main__":
    main()

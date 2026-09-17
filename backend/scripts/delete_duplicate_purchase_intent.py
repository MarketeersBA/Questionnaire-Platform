"""
Delete both purchase-intent rows and re-seed a single clean one.

`tt_q15` and `tt_purchase_intent` both asked purchase intent and both were
`fixed`, so every respondent rated it twice a few questions apart. An earlier
pass retired `tt_q15` by flag and edited `tt_purchase_intent` in place; this
removes both documents outright and inserts one question built fresh from the
canonical library, so no field survives from either legacy row.

The id `tt_purchase_intent` is deliberately reused. It is not cosmetic: the
analytics pipeline finds purchase-intent rows by that id
(`DEFAULT_PI_QUESTION_IDS`) and keys the funnel bridge off
`analytical_role: purchase_intent`. Minting a new id would silently drop
purchase intent out of every report for no gain.

Already-composed surveys are unaffected. `template_snapshot_l2` embeds each
question in full — text, options, scaleMax, labels — so the 19 surveys that
reference `tt_q15` keep their own copy and keep asking exactly what their
respondents started with. Deleting the master row changes what is composed
*next*, never what is already in field.

The question text keeps the `(المنتج)` placeholder on purpose: it is what
`OrchestrationService.format_text` replaces with the brand being evaluated, so
the respondent reads "ممكن تشتري دايرة بنسبة اد ايه؟" rather than a generic
"المنتج". Hardcoding a brand here would break every other study.

Both deleted documents are archived first and `--revert` restores them.

Usage:
    python -m backend.scripts.delete_duplicate_purchase_intent --dry-run
    python -m backend.scripts.delete_duplicate_purchase_intent --apply
    python -m backend.scripts.delete_duplicate_purchase_intent --revert
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime
from typing import Any, Dict

from backend.database import db
from backend.services.taste_test_library import load_library

COLLECTION = "taste_test_questions"
ARCHIVE = "taste_test_questions_archive"
MIGRATION = "purchase_intent_dedupe_delete"

CANONICAL_ID = "tt_purchase_intent"
DELETE_IDS = ["tt_q15", "tt_purchase_intent"]


def _canonical_document() -> Dict[str, Any]:
    """The replacement row, built from the library rather than hand-typed."""
    entry = next(
        (q for q in load_library() if q.question_id == CANONICAL_ID), None
    )
    if entry is None:
        raise SystemExit(
            f"{CANONICAL_ID} is not in the attribute library — reseed it there first."
        )
    doc = entry.model_dump() if hasattr(entry, "model_dump") else entry.dict()
    return {k: v for k, v in doc.items() if v is not None}


async def run(*, apply: bool, revert: bool) -> None:
    db.connect()
    col = db.get_collection(COLLECTION)
    archive = db.get_collection(ARCHIVE)

    if revert:
        restored = 0
        async for doc in archive.find({"_migration": MIGRATION}):
            doc.pop("_migration", None)
            doc.pop("_archived_at", None)
            doc.pop("_id", None)
            await col.replace_one(
                {"question_id": doc["question_id"]}, doc, upsert=True
            )
            restored += 1
        print(f"Restored {restored} document(s) from {ARCHIVE}.")
        return

    existing = {}
    for qid in DELETE_IDS:
        existing[qid] = await col.find_one({"question_id": qid})

    replacement = _canonical_document()

    print("Delete duplicate purchase-intent questions")
    for qid in DELETE_IDS:
        doc = existing[qid]
        if doc:
            print(f"  delete {qid:20} {doc.get('question_type','?'):12} {doc.get('ar_text','')}")
        else:
            print(f"  delete {qid:20} (already absent)")
    print()
    print(f"  insert {replacement['question_id']:20} "
          f"{replacement.get('question_type'):12} {replacement.get('ar_text')}")
    print(f"         scale {replacement.get('scale_min')}-{replacement.get('scale_max')}, "
          f"{replacement.get('scale_shape')}, role={replacement.get('analytical_role')}")
    print("         (المنتج) is substituted with the brand at composition time.")

    if not apply:
        print("\nDry run — nothing written. Re-run with --apply.")
        return

    stamp = datetime.utcnow()
    archived = 0
    for qid, doc in existing.items():
        if not doc:
            continue
        snapshot = dict(doc)
        snapshot.pop("_id", None)
        snapshot["_migration"] = MIGRATION
        snapshot["_archived_at"] = stamp
        await archive.replace_one(
            {"question_id": qid, "_migration": MIGRATION}, snapshot, upsert=True
        )
        archived += 1

    result = await col.delete_many({"question_id": {"$in": DELETE_IDS}})
    await col.insert_one(replacement)

    print(f"\nArchived {archived}, deleted {result.deleted_count}, inserted 1.")
    print(f"--revert restores the archived documents from {ARCHIVE}.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--apply", action="store_true", help="write the changes")
    group.add_argument("--revert", action="store_true", help="restore archived documents")
    parser.add_argument("--dry-run", action="store_true", help="default; report only")
    args = parser.parse_args()

    asyncio.run(run(apply=args.apply, revert=args.revert))


if __name__ == "__main__":
    main()

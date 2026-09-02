"""
Seed the canonical Taste Test attribute library into `taste_test_questions`.

Idempotent: upserts by `question_id` rather than wiping the collection the way
`import_taste_test_data.py` does, so re-running is safe and any locally-added
questions survive.

Usage:
    python -m backend.scripts.seed_taste_test_library --dry-run
    python -m backend.scripts.seed_taste_test_library --apply
    python -m backend.scripts.seed_taste_test_library --apply --prune
"""

from __future__ import annotations

import argparse
import asyncio
from datetime import datetime

from backend.database import db
from backend.services.taste_test_library import load_library, library_version

COLLECTION = "taste_test_questions"


async def seed(apply: bool, prune: bool) -> int:
    questions = load_library()
    print(f"Loaded {len(questions)} attributes (library v{library_version()})")

    if not apply:
        print("\n-- dry run, nothing written --")
        for question in sorted(questions, key=lambda q: q.order):
            label = f"{question.main_att}"
            if question.supp_att:
                label += f" / {question.supp_att}"
            print(
                f"  {question.question_id:<28} {label:<34} "
                f"{question.scale_shape:<10} {question.question_status}"
            )
        return 0

    db.connect()
    collection = db.get_collection(COLLECTION)
    if collection is None:
        raise RuntimeError(
            "No database connection. Check MONGO_URI / DATABASE_NAME before --apply."
        )

    now = datetime.utcnow()
    inserted = updated = 0

    for question in questions:
        doc = question.model_dump()
        doc["updated_at"] = now
        doc["library_version"] = library_version()

        result = await collection.update_one(
            {"question_id": question.question_id},
            {"$set": doc, "$setOnInsert": {"created_at": now}},
            upsert=True,
        )
        if result.upserted_id is not None:
            inserted += 1
        elif result.modified_count:
            updated += 1

    print(f"Inserted {inserted}, updated {updated}, unchanged {len(questions) - inserted - updated}")

    if prune:
        library_ids = [q.question_id for q in questions]
        removed = await collection.delete_many(
            {"question_id": {"$nin": library_ids}, "question_id_prefix": "tt"}
        )
        print(f"Pruned {removed.deleted_count} question(s) not in the library")

    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="write to the database")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="preview only (the default when --apply is omitted)",
    )
    parser.add_argument(
        "--prune",
        action="store_true",
        help="also delete tt_* questions that are no longer in the library",
    )
    args = parser.parse_args()

    return asyncio.run(seed(apply=args.apply, prune=args.prune))


if __name__ == "__main__":
    raise SystemExit(main())

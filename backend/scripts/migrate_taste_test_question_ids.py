"""
Idempotent migration: assign tt_q1..tt_qN to taste_test_questions documents.

Preserves prior question_id values in legacy_id for analytics backward compatibility.
"""
import asyncio

from backend.database import db
from backend.utils.taste_test_question_ids import plan_tt_id_assignments


async def migrate(dry_run: bool = False) -> None:
    db.connect()
    col = db.get_collection("taste_test_questions")
    docs = await col.find({}).to_list(length=10000)

    if not docs:
        print("No taste_test_questions documents found — nothing to migrate.")
        return

    updates = plan_tt_id_assignments(docs)
    changed = 0

    for payload in updates:
        doc_id = payload.pop("_id")
        existing = next((d for d in docs if d["_id"] == doc_id), {})
        needs_update = (
            existing.get("question_id") != payload["question_id"]
            or existing.get("legacy_id") != payload.get("legacy_id")
            or existing.get("question_id_prefix") != payload.get("question_id_prefix")
        )
        if not needs_update:
            continue

        changed += 1
        print(
            f"  {existing.get('question_id')} → {payload['question_id']}"
            + (f" (legacy_id={payload.get('legacy_id')})" if payload.get("legacy_id") else "")
        )
        if not dry_run:
            await col.update_one({"_id": doc_id}, {"$set": payload})

    action = "Would update" if dry_run else "Updated"
    print(f"{action} {changed} of {len(docs)} taste_test_questions documents.")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Migrate taste test question IDs to tt_q* convention")
    parser.add_argument("--dry-run", action="store_true", help="Print changes without writing to DB")
    args = parser.parse_args()
    asyncio.run(migrate(dry_run=args.dry_run))

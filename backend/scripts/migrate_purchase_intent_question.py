"""
Collapse the duplicate purchase-intent question and move it to a 1-10 scale.

Two questions asked the same thing and both were `fixed`, so every respondent
was asked to rate their purchase intent twice, a few questions apart:

    tt_q15              "ناوي تشتري المنتج ده بعد كده؟"      (legacy, bare)
    tt_purchase_intent  "إلي أي مدى ممكن تشتري المنتج ده؟"   (canonical)

`tt_purchase_intent` is the one kept. It is what the analytics pipeline knows
about: it carries `analytical_role: purchase_intent`, a declared `scale_shape`,
and per-point labels. `tt_q15` has none of that — it was never more than a
duplicate with a different wording.

The kept question is also rewritten and moved from 1-5 to 1-10, matching
`tt_overall_liking` and the rest of the summary questions.

⚠️  The scale change is not backward compatible.

    A "5" meant "definitely would buy" on the old 1-5 scale and means roughly
    "middling" on the new 1-10 one. Metrics are computed from the question's
    declared `scale_max`, so once this runs, previously collected answers are
    read against a 1-10 ruler they were never given: a Top-2-Box threshold of 9
    scores every old respondent at 0%.

    Run with --dry-run first; it reports how many stored answers are affected.
    Reports covering data collected before this migration should be treated as
    measuring a different question, not regenerated and compared.

Usage:
    python -m backend.scripts.migrate_purchase_intent_question --dry-run
    python -m backend.scripts.migrate_purchase_intent_question --apply
    python -m backend.scripts.migrate_purchase_intent_question --revert
"""
from __future__ import annotations

import argparse
import asyncio
import logging
from datetime import datetime
from typing import Any, Dict

from backend.database import db

logger = logging.getLogger(__name__)

COLLECTION = "taste_test_questions"
ARCHIVE = "taste_test_questions_archive"

KEEP_ID = "tt_purchase_intent"
RETIRE_ID = "tt_q15"

#: 1-10 with anchor labels only, mirroring `tt_overall_liking`. Per-point labels
#: are cleared deliberately: the five old ones cannot describe ten points, and a
#: label list that does not match the scale length is dropped downstream anyway
#: (`ScaleSpec.labels_align`), which would leave the AI with no direction at all.
NEW_FIELDS: Dict[str, Any] = {
    "ar_text": "ممكن تشتري (المنتج) بنسبة اد ايه؟",
    "en_text": "How likely are you to buy (product)?",
    "question_type": "scale 1-10",
    "scale_shape": "monotonic",
    "scale_min": 1,
    "scale_max": 10,
    "point_labels_ar": [],
    "point_labels_en": [],
    "ar_min_label": "مش هاشتريه خالص",
    "ar_max_label": "أكيد هشتريه",
    "en_min_label": "Definitely would not buy",
    "en_max_label": "Definitely would buy",
}


async def _count_affected_answers() -> int:
    """Stored answers recorded against either question on the old 1-5 scale."""
    total = 0
    cursor = db.get_collection("responses").find({}, {"answers": 1})
    async for resp in cursor:
        structured = (resp.get("answers") or {}).get("__structured") or {}
        for row in structured.get("flat_evaluations") or []:
            qid = str(row.get("question_id") or "")
            if KEEP_ID in qid or RETIRE_ID in qid:
                total += 1
    return total


async def run(*, apply: bool, revert: bool) -> None:
    db.connect()
    col = db.get_collection(COLLECTION)
    archive = db.get_collection(ARCHIVE)

    if revert:
        restored = 0
        async for doc in archive.find({"_migration": "purchase_intent_1_10"}):
            doc.pop("_migration", None)
            doc.pop("_archived_at", None)
            await col.replace_one({"question_id": doc["question_id"]}, doc, upsert=True)
            restored += 1
        print(f"Restored {restored} question(s) from {ARCHIVE}.")
        return

    keep = await col.find_one({"question_id": KEEP_ID})
    retire = await col.find_one({"question_id": RETIRE_ID})
    affected = await _count_affected_answers()

    print("Purchase-intent question migration")
    print(f"  keep    : {KEEP_ID}  {'found' if keep else 'MISSING'}")
    print(f"  retire  : {RETIRE_ID}  {'found' if retire else 'already gone'}")
    if keep:
        print(f"  current : {keep.get('question_type')} "
              f"({keep.get('scale_min')}-{keep.get('scale_max')})")
    print(f"  new     : {NEW_FIELDS['question_type']} "
          f"({NEW_FIELDS['scale_min']}-{NEW_FIELDS['scale_max']}), {NEW_FIELDS['scale_shape']}")
    print(f"  text    : {NEW_FIELDS['ar_text']}")
    print()
    print(f"  ⚠  {affected} stored answer(s) were recorded on the 1-5 scale and will")
    print("     be read against the new 1-10 one. They are not comparable.")

    if not apply:
        print("\nDry run — nothing written. Re-run with --apply.")
        return

    if not keep:
        raise SystemExit(f"Cannot migrate: {KEEP_ID} not found.")

    stamp = datetime.utcnow()
    for doc in (keep, retire):
        if not doc:
            continue
        snapshot = dict(doc)
        snapshot.pop("_id", None)
        snapshot["_migration"] = "purchase_intent_1_10"
        snapshot["_archived_at"] = stamp
        await archive.replace_one(
            {"question_id": snapshot["question_id"], "_migration": "purchase_intent_1_10"},
            snapshot,
            upsert=True,
        )

    await col.update_one({"question_id": KEEP_ID}, {"$set": NEW_FIELDS})

    if retire:
        # Marked rather than deleted: composition filters on `question_status`,
        # and keeping the row means an old survey snapshot that still references
        # the id can resolve its text instead of rendering a blank question.
        await col.update_one(
            {"question_id": RETIRE_ID},
            {"$set": {
                "question_status": "retired",
                "retired_at": stamp,
                "retired_reason": f"Duplicate of {KEEP_ID}; both asked purchase intent.",
            }},
        )

    print("\nApplied. Previous definitions archived in "
          f"{ARCHIVE} (--revert restores them).")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--apply", action="store_true", help="write the changes")
    group.add_argument("--revert", action="store_true", help="restore archived definitions")
    parser.add_argument("--dry-run", action="store_true", help="default; report only")
    args = parser.parse_args()

    asyncio.run(run(apply=args.apply, revert=args.revert))


if __name__ == "__main__":
    main()

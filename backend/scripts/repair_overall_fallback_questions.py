"""
Remove the invented "Overall" question from surveys already created.

`master_data[attribute]` holds only that attribute's *optional* questions.
Anything marked `fixed` is grouped under `master_data["fixed"]` and asked once
per brand in the General Evaluation block. Overall is entirely fixed, so its
bucket is always empty — and both composers read "empty bucket" as "the bank
has nothing to ask for this attribute" and invented a stand-in:

    ما رأيك في (Overall) الخاصة بـ Obour؟

Nobody wrote that question. It was asked once per brand, on a 1-10
like/dislike scale, a few screens before the real Overall questions
(`tt_overall_liking`, `tt_purchase_intent`, the three open ends) which were
asked anyway. The attribute name was not translated either, because the
Arabic label map had entries for "Overall Taste" and "Overall Likeness" but
not for bare "Overall".

Both composers are fixed. This repairs the snapshots already written, which
are self-contained and would otherwise keep asking it forever.

What it does, per survey:
  * drops questions whose id looks like `{brand}_fallback_{attribute}_xxxx`
    where that attribute is delivered entirely through the fixed block
  * removes any section left with no questions
  * retitles sections that show an untranslated attribute name in an Arabic
    survey ("Obour: Overall" -> "Obour: التقييم العام")

Answers already collected against the invented question are left untouched in
`responses`; they are orphaned, which is the correct outcome for a question
that should never have been asked. Nothing else in the snapshot is modified.

Usage:
    python -m backend.scripts.repair_overall_fallback_questions --dry-run
    python -m backend.scripts.repair_overall_fallback_questions --apply
    python -m backend.scripts.repair_overall_fallback_questions --revert
"""
from __future__ import annotations

import argparse
import asyncio
import re
from datetime import datetime
from typing import Any, Dict, List, Set

from backend.database import db
from backend.services.orchestration_service import localize_taste_test_attribute
from backend.services.taste_test_library import load_library

ARCHIVE = "survey_snapshot_archive"
MIGRATION = "overall_fallback_removal"

FALLBACK_ID = re.compile(r"_fallback_.+_[a-z0-9]{4}$", re.IGNORECASE)


ARABIC_CHARS = re.compile(r"[؀-ۿ]")


def snapshot_is_arabic(sections: List[Dict[str, Any]]) -> bool:
    """
    Whether the snapshot's questions are actually written in Arabic.

    `taste_test_config.language` cannot be trusted for this: at least one
    survey declares Arabic while its snapshot was composed in English. Going by
    the declared value would put Arabic headings over English questions, which
    is worse than the untranslated heading it set out to fix. The text that was
    actually written to the snapshot is the only reliable signal.
    """
    texts = [
        str(q.get("text") or "")
        for section in sections
        for q in (section.get("questions") or [])
    ]
    texts = [t for t in texts if t.strip()]
    if not texts:
        return False
    arabic = sum(1 for t in texts if ARABIC_CHARS.search(t))
    return arabic > len(texts) / 2


def fixed_delivered_attributes() -> Set[str]:
    """
    Attributes whose library questions are *all* `fixed`.

    These are asked in the General Evaluation block, never per attribute, so an
    empty per-attribute bucket is expected for them and must not be read as a
    gap in the bank.
    """
    by_attribute: Dict[str, Set[str]] = {}
    for question in load_library():
        by_attribute.setdefault(question.main_att, set()).add(question.question_status)
    return {attr for attr, statuses in by_attribute.items() if statuses == {"fixed"}}


def repair_sections(
    sections: List[Dict[str, Any]],
    *,
    fixed_attrs: Set[str],
    language: str,
) -> tuple[List[Dict[str, Any]], List[str], int]:
    """Return (new_sections, removed_question_texts, retitled_count)."""
    removed: List[str] = []
    retitled = 0
    out: List[Dict[str, Any]] = []

    for section in sections:
        attribute = section.get("attribute")
        questions = section.get("questions") or []

        if attribute in fixed_attrs:
            kept = [
                q for q in questions
                if not FALLBACK_ID.search(str(q.get("id") or ""))
            ]
            if len(kept) != len(questions):
                removed.extend(
                    str(q.get("text") or q.get("id"))
                    for q in questions
                    if FALLBACK_ID.search(str(q.get("id") or ""))
                )
            # A section emptied by the removal asked nothing; drop it rather
            # than render a heading with no content.
            if not kept:
                continue
            section = {**section, "questions": kept}

        # "Obour: Overall" in an Arabic survey: the label map had no entry for
        # the bare attribute name, so the English leaked into the heading.
        title = section.get("title")
        brand = section.get("brand")
        if language == "ar" and attribute and brand and isinstance(title, str):
            localized = localize_taste_test_attribute(attribute, "ar")
            expected = f"{brand}: {localized}"
            if localized != attribute and title == f"{brand}: {attribute}":
                section = {**section, "title": expected}
                retitled += 1

        out.append(section)

    return out, removed, retitled


async def run(*, apply: bool, revert: bool) -> None:
    db.connect()
    surveys = db.get_collection("surveys")
    archive = db.get_collection(ARCHIVE)

    if revert:
        restored = 0
        async for doc in archive.find({"_migration": MIGRATION}):
            await surveys.update_one(
                {"_id": doc["survey_id"]},
                {"$set": {"template_snapshot_l2": doc["template_snapshot_l2"]}},
            )
            restored += 1
        print(f"Restored {restored} snapshot(s) from {ARCHIVE}.")
        return

    fixed_attrs = fixed_delivered_attributes()
    print(f"Attributes delivered through the fixed block: {sorted(fixed_attrs)}")
    print()

    stamp = datetime.utcnow()
    touched = total_removed = total_retitled = 0

    cursor = surveys.find(
        {"template_snapshot_l2.sections": {"$exists": True}},
        {"template_snapshot_l2": 1, "taste_test_config": 1, "created_at": 1},
    )
    async for survey in cursor:
        snapshot = survey.get("template_snapshot_l2") or {}
        sections = snapshot.get("sections") or []
        # Judged from the snapshot's own text, not the declared language.
        language = "ar" if snapshot_is_arabic(sections) else "en"

        new_sections, removed, retitled = repair_sections(
            sections, fixed_attrs=fixed_attrs, language=language
        )
        if not removed and not retitled:
            continue

        touched += 1
        total_removed += len(removed)
        total_retitled += retitled
        sid = str(survey["_id"])
        print(f"{sid[:8]}  {str(survey.get('created_at'))[:16]}  "
              f"-{len(removed)} invented, {retitled} retitled")
        for text in removed[:3]:
            print(f"      drop: {text}")

        if not apply:
            continue

        await archive.replace_one(
            {"survey_id": survey["_id"], "_migration": MIGRATION},
            {
                "survey_id": survey["_id"],
                "_migration": MIGRATION,
                "_archived_at": stamp,
                "template_snapshot_l2": snapshot,
            },
            upsert=True,
        )
        await surveys.update_one(
            {"_id": survey["_id"]},
            {"$set": {"template_snapshot_l2": {**snapshot, "sections": new_sections}}},
        )

    print()
    print(f"{touched} survey(s): {total_removed} invented question(s), "
          f"{total_retitled} heading(s) retitled.")
    if not apply:
        print("\nDry run — nothing written. Re-run with --apply.")
    else:
        print(f"Originals archived in {ARCHIVE}; --revert restores them.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--apply", action="store_true", help="write the changes")
    group.add_argument("--revert", action="store_true", help="restore archived snapshots")
    parser.add_argument("--dry-run", action="store_true", help="default; report only")
    args = parser.parse_args()

    asyncio.run(run(apply=args.apply, revert=args.revert))


if __name__ == "__main__":
    main()

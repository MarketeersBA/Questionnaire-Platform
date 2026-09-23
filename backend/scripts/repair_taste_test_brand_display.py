"""
Regenerate `template_snapshot_l2` for already-published taste-test surveys
using the now-fixed composer.

Two compounding bugs left already-stored snapshots broken in a way today's
code fix cannot reach on its own, because the respondent-facing schema is
composed once, at creation/regeneration time, and stored — `compose_survey_schema`
is never called again for an existing survey just because its code changed:

  1. A stale content bug baked the wrong brand's real name into another
     brand's section — e.g. a "KIKS: Appearance" section whose questions
     asked about "Squizz" instead.
  2. `testing_protocol: 'blind'` + `blind_codes` (a creator-facing feature)
     was never read by the composer, so a blind study's section titles and
     questions kept showing the real brand name regardless.

Both are fixed in `OrchestrationService.compose_survey_schema` /
`generateTasteTestModuleSchema`. This script re-runs the fixed composer for
already-published surveys and replaces their stored `template_snapshot_l2`
with the corrected result — the same repair shape as
`repair_overall_fallback_questions.py`.

Question ids for bank questions are canonical and deterministic
(`resolve_taste_test_question_id`), so they survive regeneration unchanged.
Ids for fallback/custom-sub questions embed a random 4-character suffix and
are NOT stable across a regeneration — so a survey that already has
responses is only regenerated with --force; by default those are reported,
not touched, to avoid silently orphaning answers already collected against
the old (random-suffixed) ids.

Usage:
    python -m backend.scripts.repair_taste_test_brand_display --dry-run
    python -m backend.scripts.repair_taste_test_brand_display --apply
    python -m backend.scripts.repair_taste_test_brand_display --apply --force
    python -m backend.scripts.repair_taste_test_brand_display --revert
"""
from __future__ import annotations

import argparse
import asyncio
from datetime import datetime
from typing import Any, Dict

from backend.database import db
from backend.services.orchestration_service import orchestration_service

ARCHIVE = "survey_snapshot_archive"
MIGRATION = "taste_test_brand_display_repair"


def _section_signature(sections: list) -> list:
    """A compact (title, brand, [question texts]) view for diffing/printing."""
    out = []
    for sec in sections:
        out.append({
            "title": sec.get("title"),
            "brand": sec.get("brand"),
            "questions": [q.get("text") for q in (sec.get("questions") or [])],
        })
    return out


async def run(*, apply: bool, revert: bool, force: bool) -> None:
    db.connect()
    surveys = db.get_collection("surveys")
    responses = db.get_collection("survey_responses")
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

    stamp = datetime.utcnow()
    touched = skipped_has_responses = unchanged = errored = 0

    cursor = surveys.find(
        {"template_snapshot_l2.sections": {"$exists": True, "$ne": []}},
        {"template_snapshot_l2": 1, "taste_test_config": 1, "config": 1,
         "module_sequence": 1, "selected_modules": 1, "created_at": 1, "title": 1},
    )
    async for survey in cursor:
        sid = survey["_id"]
        sid_str = str(sid)
        tt_config = survey.get("taste_test_config") or survey.get("config") or {}
        brand_count = len(tt_config.get("internal_brands_data") or []) + \
            len(tt_config.get("competitor_brands_data") or [])
        if brand_count < 2 and tt_config.get("testing_protocol") != "blind":
            # Single-brand, non-blind surveys can't exhibit either bug: there's
            # no second brand to leak from, and no code to fail to apply.
            continue

        old_snapshot = survey.get("template_snapshot_l2") or {}
        old_sections = old_snapshot.get("sections") or []

        try:
            composed = await orchestration_service.compose_survey_schema(survey)
        except Exception as exc:  # noqa: BLE001 - reporting, not crashing the batch
            errored += 1
            print(f"{sid_str[:8]}  ERROR composing: {exc}")
            continue

        new_sections = composed.get("layer2_structure", {}).get("sections") or []
        if _section_signature(new_sections) == _section_signature(old_sections):
            unchanged += 1
            continue

        response_count = await responses.count_documents({"survey_id": sid_str})
        touched += 1
        print(f"\n{sid_str[:8]}  {survey.get('title') or '(untitled)'}  "
              f"{str(survey.get('created_at'))[:16]}  responses={response_count}")
        for sec in old_sections[:3]:
            print(f"  - old: {sec.get('title')!r}")
        for sec in new_sections[:3]:
            print(f"  + new: {sec.get('title')!r}")

        if response_count > 0 and not force:
            skipped_has_responses += 1
            print("  SKIPPED: has responses — question ids for fallback/custom "
                  "questions are not stable across regeneration. Re-run with --force "
                  "to repair anyway (any answers against those specific ids are orphaned).")
            continue

        if not apply:
            continue

        await archive.replace_one(
            {"survey_id": sid, "_migration": MIGRATION},
            {
                "survey_id": sid,
                "_migration": MIGRATION,
                "_archived_at": stamp,
                "template_snapshot_l2": old_snapshot,
            },
            upsert=True,
        )
        await surveys.update_one(
            {"_id": sid},
            {"$set": {"template_snapshot_l2": {**old_snapshot, "sections": new_sections}}},
        )
        print("  APPLIED")

    print()
    print(f"{touched} survey(s) with a corrected snapshot, {unchanged} already correct, "
          f"{skipped_has_responses} skipped (has responses, use --force), {errored} error(s).")
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
    parser.add_argument("--force", action="store_true",
                         help="also repair surveys that already have responses")
    args = parser.parse_args()

    asyncio.run(run(apply=args.apply, revert=args.revert, force=args.force))


if __name__ == "__main__":
    main()

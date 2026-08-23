"""
Bulk-regenerate every existing survey report.

Reports are snapshots: the AI narrative, chart payloads and PPTX are all
computed once at generation time and stored. Prompt or aggregator changes
therefore only reach *new* reports — historical ones keep whatever text and
chart shape they were built with. This script re-runs generation across the
whole estate so old reports pick up the current prompt, palette and chart
contract.

Because each report costs real AI spend and takes time, the script is
deliberately conservative:

  * `--dry-run` (default) lists what *would* be regenerated and exits.
  * `--limit N` caps how many are processed in one pass.
  * `--survey-id` targets a single survey, for a smoke test before the estate.
  * Failures are collected and reported; one bad survey never aborts the run.

Usage
-----
    python -m backend.scripts.regenerate_all_reports --dry-run
    python -m backend.scripts.regenerate_all_reports --survey-id <id> --apply
    python -m backend.scripts.regenerate_all_reports --apply --limit 5
    python -m backend.scripts.regenerate_all_reports --apply          # everything
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import time
from typing import Any, Dict, List, Optional

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("regenerate")


async def _collect_targets(db, survey_id: Optional[str]) -> List[Dict[str, Any]]:
    """Surveys that already have at least one stored report."""
    reports = db.get_collection("survey_reports")

    match: Dict[str, Any] = {}
    if survey_id:
        match["survey_id"] = survey_id

    pipeline = [
        {"$match": match} if match else {"$match": {}},
        {"$sort": {"generated_at": -1}},
        {
            "$group": {
                "_id": "$survey_id",
                "project_name": {"$first": "$project_name"},
                "generated_at": {"$first": "$generated_at"},
                "status": {"$first": "$status"},
            }
        },
        {"$sort": {"generated_at": -1}},
    ]
    return await reports.aggregate(pipeline).to_list(None)


async def _regenerate_one(service, survey_id: str) -> Dict[str, Any]:
    """Force a fresh generation for one survey, bypassing the cache."""
    from fastapi import BackgroundTasks

    background = BackgroundTasks()
    result = await service.generate_survey_report(
        survey_id=survey_id,
        background_tasks=background,
        options={},
        current_user=None,
        force=True,
    )
    # generate_survey_report schedules the heavy work as background tasks; run
    # them inline so this script actually completes the regeneration.
    await background()
    return result or {}


async def main() -> int:
    parser = argparse.ArgumentParser(description="Regenerate stored survey reports.")
    parser.add_argument("--apply", action="store_true",
                        help="Actually regenerate. Without this the script only reports.")
    parser.add_argument("--dry-run", action="store_true",
                        help="Explicitly request a dry run (this is the default).")
    parser.add_argument("--limit", type=int, default=0,
                        help="Process at most N reports (0 = no limit).")
    parser.add_argument("--survey-id", type=str, default=None,
                        help="Regenerate a single survey only.")
    parser.add_argument("--pause", type=float, default=2.0,
                        help="Seconds to wait between reports, to spare AI rate limits.")
    args = parser.parse_args()

    apply_changes = args.apply and not args.dry_run

    from backend.database import db
    from backend.services.analytics_service import analytics_service

    targets = await _collect_targets(db, args.survey_id)
    if args.limit > 0:
        targets = targets[: args.limit]

    if not targets:
        logger.warning("No existing reports matched — nothing to regenerate.")
        return 0

    logger.info("Found %d report(s) to regenerate.", len(targets))
    for t in targets:
        logger.info("  - %s  %s", t["_id"], t.get("project_name") or "(unnamed)")

    if not apply_changes:
        logger.warning("")
        logger.warning("DRY RUN — nothing was changed.")
        logger.warning("Re-run with --apply to regenerate these %d report(s).", len(targets))
        logger.warning("Each regeneration makes AI calls and overwrites the stored report.")
        return 0

    succeeded: List[str] = []
    failed: List[tuple] = []

    for index, target in enumerate(targets, start=1):
        sid = target["_id"]
        name = target.get("project_name") or "(unnamed)"
        logger.info("[%d/%d] Regenerating %s — %s", index, len(targets), sid, name)
        started = time.monotonic()
        try:
            await _regenerate_one(analytics_service, sid)
            elapsed = time.monotonic() - started
            logger.info("[%d/%d] OK in %.1fs", index, len(targets), elapsed)
            succeeded.append(sid)
        except Exception as exc:  # noqa: BLE001 - one failure must not stop the estate
            logger.error("[%d/%d] FAILED %s: %s", index, len(targets), sid, exc, exc_info=True)
            failed.append((sid, str(exc)))

        if args.pause and index < len(targets):
            await asyncio.sleep(args.pause)

    logger.info("")
    logger.info("=" * 60)
    logger.info("Regenerated: %d", len(succeeded))
    logger.info("Failed:      %d", len(failed))
    for sid, err in failed:
        logger.error("  %s -> %s", sid, err)

    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))

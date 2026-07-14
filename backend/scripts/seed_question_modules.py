"""
Seed question_modules collection with the three canonical survey modules.

Modules:
  - purchase_funnel       (pf_q1–pf_q7) from purchaseFunnel.ts logic
  - brand_usage           (us_q1–us_q4) from Excel Usage sheet
  - brand_pricing_behavior (cb_q1–cb_q4) from Excel Purchase Behaveior sheet

Idempotent: re-running skips modules whose active version already matches.

Usage:
  python -m backend.scripts.seed_question_modules
  python -m backend.scripts.seed_question_modules --force
  python -m backend.scripts.seed_question_modules --xlsx "path/to/file.xlsx"
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

from backend.database import db
from backend.models import QuestionModuleCreate
from backend.scripts.question_module_definitions import (
    build_brand_pricing_behavior_module,
    build_brand_usage_module,
    build_purchase_funnel_module,
)
from backend.scripts.question_module_parsers import (
    load_workbook_sheets,
    parse_pricing_behavior_sheet,
    parse_usage_sheet,
)
from backend.services.question_module_service import question_module_service
from backend.utils.module_qa_contracts import validate_all_seed_modules

DEFAULT_XLSX = Path(__file__).resolve().parents[2] / "Usage Questionnaire for automation (1).xlsx"

SEED_ACTOR = "system_seed"


async def seed_all(*, xlsx_path: Path, force: bool = False) -> None:
    db.connect()

    try:
        results = []

        pf_payload = build_purchase_funnel_module()
        doc, changed = await question_module_service.sync_module(
            "purchase_funnel", pf_payload, username=SEED_ACTOR, force=force
        )
        results.append(_result_row("purchase_funnel", doc, changed))

        if not xlsx_path.is_file():
            raise FileNotFoundError(f"Excel workbook not found: {xlsx_path}")

        usage_ws, pricing_ws = load_workbook_sheets(xlsx_path)
        usage_section = parse_usage_sheet(usage_ws)
        pricing_section = parse_pricing_behavior_sheet(pricing_ws)

        usage_payload = build_brand_usage_module(usage_section)
        doc, changed = await question_module_service.sync_module(
            "brand_usage", usage_payload, username=SEED_ACTOR, force=force
        )
        results.append(_result_row("brand_usage", doc, changed))

        pricing_payload = build_brand_pricing_behavior_module(pricing_section)
        doc, changed = await question_module_service.sync_module(
            "brand_pricing_behavior",
            pricing_payload,
            username=SEED_ACTOR,
            force=force,
        )
        results.append(_result_row("brand_pricing_behavior", doc, changed))

        _print_summary(results)
    finally:
        db.close()


def _result_row(module_id: str, doc: dict, changed: bool) -> dict:
    return {
        "module_id": module_id,
        "version": doc.get("version"),
        "question_count": doc.get("question_count"),
        "changed": changed,
    }


def _print_summary(results: list[dict]) -> None:
    print("\n=== Question Module Seed Summary ===")
    for row in results:
        status = "UPDATED" if row["changed"] else "UNCHANGED"
        print(
            f"  [{status}] {row['module_id']}: "
            f"v{row['version']}, {row['question_count']} questions"
        )

    print(f"\nTotal modules seeded: {len(results)}")
    changed_count = sum(1 for r in results if r["changed"])
    print(f"Changed this run: {changed_count}")
    print(f"Skipped (already current): {len(results) - changed_count}")


def _validate_payloads(
    pf: QuestionModuleCreate,
    usage: QuestionModuleCreate,
    pricing: QuestionModuleCreate,
) -> dict:
    """Dry-run validation without DB writes (Phase 9 QA contracts)."""
    return validate_all_seed_modules(pf, usage, pricing)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed question_modules collection")
    parser.add_argument(
        "--xlsx",
        type=Path,
        default=DEFAULT_XLSX,
        help="Path to Usage Questionnaire Excel workbook",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Write a new version even when content is unchanged",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Parse and validate only; do not write to MongoDB",
    )
    args = parser.parse_args()

    if args.dry_run:
        pf = build_purchase_funnel_module()
        usage_ws, pricing_ws = load_workbook_sheets(args.xlsx)
        usage = build_brand_usage_module(parse_usage_sheet(usage_ws))
        pricing = build_brand_pricing_behavior_module(
            parse_pricing_behavior_sheet(pricing_ws)
        )
        summary = _validate_payloads(pf, usage, pricing)
        print("Dry run OK — Phase 9 seed contracts validated.")
        for mod_id, info in summary.items():
            print(f"  {mod_id}: {info}")
        return

    asyncio.run(seed_all(xlsx_path=args.xlsx, force=args.force))


if __name__ == "__main__":
    main()
